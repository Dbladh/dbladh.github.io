// The ball's physics for the mini-golf: pure maths, no THREE. The ball rolls on the hole's gentle hills, slows with friction (sand slows it more), is carried by rivers, bounces
// off the walls, posts and bumpers, drops into ponds, and meets the hole's hero obstacle (golfhero.js). A power-up changes how all of this works through `ctx`.
import { gateBlocked, bridgeUp } from './golfhero.js?v=20261024225424';

export const BALL_R = 0.32, CUP_R = 0.6, MAX_V = 15;
const GA = 9.0, G = 5.0, FRICTION = 2.4, WALL_E = 0.72, POST_E = 0.92, BUMPER_E = 1.3, STEP = 1 / 120;

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The height one feature (a berm, platform, jump ramp or canyon gap, see golfgen.js) adds at a point. */
function featH(f, x, z, cover) {
  if (f.t === 'berm') {                                    // a banked ridge along a segment
    const dx = f.bx - f.ax, dz = f.bz - f.az, l2 = dx * dx + dz * dz || 1; let t = ((x - f.ax) * dx + (z - f.az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (f.ax + dx * t), ez = z - (f.az + dz * t), u = 1 - (ex * ex + ez * ez) / (f.w * f.w); return u > 0 ? f.h * u * u : 0;
  }
  const rx = x - f.x, rz = z - f.z, s = rx * f.ux + rz * f.uz, c = rx * f.nx + rz * f.nz;
  if (c > f.wid || c < -f.wid) return 0;
  if (f.t === 'plat') return f.h * sm((s + f.len / 2 + f.ramp) / f.ramp) * (1 - sm((s - f.len / 2) / f.edge));      // a long ramp up, a flat top and a short steep edge down
  if (f.t === 'jump') { if (s < -f.len / 2) return 0; const k = (s + f.len / 2) / f.len; return k <= 1 ? f.h * k : f.h * (1 - sm((s - f.len / 2) / 0.25)); }     // a ramp that ends in a lip
  if (f.t === 'gap') return (f.bridge && cover ? 0 : -f.d) * (1 - sm((Math.abs(s) - f.len / 2 + 0.1) / 0.25)) * (1 - sm((Math.abs(c - (f.c0 + f.c1) / 2) - (f.c1 - f.c0) / 2 + 0.1) / 0.25));                                 // a chasm across the lane
  return 0;
}
const SAND_DEPTH = 0.24;
/** How far a sand pit dips the ground at a point: nothing outside it, easing down to SAND_DEPTH about 0.7 inside its edge. */
function sandH(s, x, z) {
  const dx = x - s.x, dz = z - s.z; if (dx * dx + dz * dz > s.r * s.r * 2.2) return 0;
  const P = s.poly, n = P.length / 2; let best = 1e9;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = P[j * 2], az = P[j * 2 + 1], bx = P[i * 2], bz = P[i * 2 + 1], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1; let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x - (ax + ex * t), pz = z - (az + ez * t), d2 = px * px + pz * pz; if (d2 < best) best = d2;
  }
  const d = Math.sqrt(best), inside = inPoly(P, x, z), u = ((inside ? d : -d) + 0.1) / 0.8;
  return u <= 0 ? 0 : -SAND_DEPTH * (u >= 1 ? 1 : u * u * (3 - 2 * u));
}
/** Height of the ground (the hills and every feature) at a point. */
export function hillH(hole, x, z) {
  let h = 0;
  for (const k of hole.hills) { const dx = x - k.x, dz = z - k.z, u = 1 - (dx * dx + dz * dz) / (k.r * k.r); if (u > 0) h += k.h * u * u; }
  if (hole.feats) for (const f of hole.feats) h += featH(f, x, z, hole.cover);
  for (const s of hole.sands) h += sandH(s, x, z);
  return h;
}
const _g = { x: 0, z: 0 }, EPS = 0.07, MAX_SLOPE = 1.8;
/** The slope of the ground at a point (written into a shared object): the hills analytically, features by differences; steep cliffs are capped so they cannot fling the ball. */
export function hillGrad(hole, x, z) {
  let gx = 0, gz = 0;
  for (const k of hole.hills) { const dx = x - k.x, dz = z - k.z, r2 = k.r * k.r, u = 1 - (dx * dx + dz * dz) / r2; if (u > 0) { const f = (-4 * k.h * u) / r2; gx += f * dx; gz += f * dz; } }
  if ((hole.feats && hole.feats.length) || hole.sands.length) {
    let fx = 0, fz = 0;
    if (hole.feats) for (const f of hole.feats) { fx += featH(f, x + EPS, z, hole.cover) - featH(f, x - EPS, z, hole.cover); fz += featH(f, x, z + EPS, hole.cover) - featH(f, x, z - EPS, hole.cover); }
    for (const s of hole.sands) { fx += sandH(s, x + EPS, z) - sandH(s, x - EPS, z); fz += sandH(s, x, z + EPS) - sandH(s, x, z - EPS); }
    gx += fx / (2 * EPS); gz += fz / (2 * EPS);
  }
  const m = Math.sqrt(gx * gx + gz * gz); if (m > MAX_SLOPE) { gx *= MAX_SLOPE / m; gz *= MAX_SLOPE / m; }
  _g.x = gx; _g.z = gz; return _g;
}

export function newBall(hole) { return { y: hillH(hole, hole.ball.x, hole.ball.z), vy: 0, air: false, x: hole.ball.x, z: hole.ball.z, vx: 0, vz: 0, holed: false, sunk: false, rest: true, still: 0, loop: null, loaded: 0, tcool: 0, gk: -1, ly: 0, ax: 0, az: 0 }; }
/** What the power-ups are doing right now: `t` is the hero clock, the rest are switches. */
export function newCtx() { return { gateT: 0, t: 0, ghost: false, bounce: false, turbo: false, homing: false, drive: false, cupR: CUP_R }; }

/** Hit the ball: direction (any length, it is normalised) and power 0..1. */
export function shoot(ball, dx, dz, power, turbo) {
  const l = Math.sqrt(dx * dx + dz * dz) || 1, v = 2.5 + power * ((turbo ? MAX_V * 1.3 : MAX_V) - 2.5);
  ball.vx = (dx / l) * v; ball.vz = (dz / l) * v; ball.rest = false; ball.still = 0;
}

function collideSeg(b, ax, az, bx, bz, e, ev) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((b.x - ax) * dx + (b.z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ox = b.x - (ax + dx * t), oz = b.z - (az + dz * t), d2 = ox * ox + oz * oz;
  if (d2 >= BALL_R * BALL_R) return;
  const d = Math.sqrt(d2);
  let nx, nz;
  if (d < 1e-6) { const l = Math.sqrt(l2) || 1; nx = -dz / l; nz = dx / l; } else { nx = ox / d; nz = oz / d; }
  b.x += nx * (BALL_R - d); b.z += nz * (BALL_R - d);
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; if (-vn > ev.wall) ev.wall = -vn; }
}
/** Bounce off a round thing (a post, a bumper, a hammer), which may itself be moving at (vcx, vcz). */
function collideCircle(b, cx, cz, r, e, ev, vcx, vcz) {
  const dx = b.x - cx, dz = b.z - cz, rr = BALL_R + r, d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d;
  b.x = cx + nx * rr; b.z = cz + nz * rr;
  const vn = (b.vx - vcx) * nx + (b.vz - vcz) * nz;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; if (-vn > ev.post) ev.post = -vn; }
}
/** Is (x, z) inside the flat polygon [x0, z0, x1, z1, ...]? */
export function inPoly(poly, x, z) {
  let inside = false; const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], zi = poly[i * 2 + 1], xj = poly[j * 2], zj = poly[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/**
 * Knock the ball about with the flippers (pinball mode): each flipper is a rounded bar from its pivot (px, pz) at angle `a` (direction cos a, sin a in the hole's own x, z) for `len`, turning at `w` radians a second.
 * The ball bounces off the bar's moving surface, so a swinging flipper gives it real speed. Returns the hardest hit.
 */
export function collideFlippers(b, flips) {
  let hard = 0;
  for (const f of flips) {
    const dx = Math.cos(f.a) * f.len, dz = Math.sin(f.a) * f.len, l2 = dx * dx + dz * dz; let t = ((b.x - f.px) * dx + (b.z - f.pz) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = f.px + dx * t, cz = f.pz + dz * t, ox = b.x - cx, oz = b.z - cz, d2 = ox * ox + oz * oz, rr = BALL_R + f.rad;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-6, nx = ox / d, nz = oz / d;
    b.x = cx + nx * rr; b.z = cz + nz * rr;
    const rx = cx - f.px, rz = cz - f.pz, sx = -f.w * rz, sz = f.w * rx;         // the bar's own velocity at the contact point
    const vn = (b.vx - sx) * nx + (b.vz - sz) * nz;
    if (vn < 0) { b.vx -= (1 + 0.45) * vn * nx; b.vz -= (1 + 0.45) * vn * nz; if (-vn > hard) hard = -vn; }
    const sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz); if (sp > 24) { b.vx *= 24 / sp; b.vz *= 24 / sp; }
    if (-vn > 0.6) { b.rest = false; b.still = 0; b.dawdle = 0; }                       // (a ball just resting on a flipper stays at rest)
  }
  return hard;
}
/** Is the ball in a sand pit? */
export function inSand(hole, b) { for (const s of hole.sands) if (dist2(b, s.x, s.z) < s.r * s.r * 1.45 && inPoly(s.poly, b.x, b.z)) return true; return false; }
/** The push needed to take the ball clear of whatever it overlaps that a ghost passes through (hero walls, posts, bumpers): adds to (out.x, out.z) and returns whether it overlaps. */
function overlapPush(b, hole, out) {
  let hit = false;
  for (const w of hole.walls) {
    if (!w[5]) continue;
    const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((b.x - w[0]) * dx + (b.z - w[1]) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ox = b.x - (w[0] + dx * t), oz = b.z - (w[1] + dz * t), d2 = ox * ox + oz * oz; if (d2 >= BALL_R * BALL_R) continue;
    const d = Math.sqrt(d2); let nx, nz; if (d < 1e-6) { const l = Math.sqrt(l2) || 1; nx = -dz / l; nz = dx / l; } else { nx = ox / d; nz = oz / d; }
    out.x += nx * (BALL_R - d + 0.02); out.z += nz * (BALL_R - d + 0.02); hit = true;
  }
  const hw = hole.hero ? hole.hero.walls : null;              // the hero's walls come as closed boxes of four: a ball whose centre is inside one is pushed out through the nearest side
  if (hw) for (let k = 0; k + 3 < hw.length; k += 4) {
    const poly = [hw[k][0], hw[k][1], hw[k + 1][0], hw[k + 1][1], hw[k + 2][0], hw[k + 2][1], hw[k + 3][0], hw[k + 3][1]]; if (!inPoly(poly, b.x, b.z)) continue;
    let best = 1e9, bx = 0, bz = 0;
    for (let e = 0; e < 4; e++) {
      const w = hw[k + e], dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz || 1; let t = ((b.x - w[0]) * dx + (b.z - w[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = w[0] + dx * t, pz = w[1] + dz * t, d2 = (b.x - px) * (b.x - px) + (b.z - pz) * (b.z - pz); if (d2 < best) { best = d2; bx = px; bz = pz; }
    }
    const d = Math.sqrt(best) || 1e-6; out.x += ((bx - b.x) / d) * (d + BALL_R + 0.03); out.z += ((bz - b.z) / d) * (d + BALL_R + 0.03); hit = true;
  }
  for (const list of [hole.posts, hole.bumpers]) for (const p of list) {
    const dx = b.x - p.x, dz = b.z - p.z, rr = BALL_R + p.r, d2 = dx * dx + dz * dz; if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-6; out.x += (dx / d) * (rr - d + 0.02); out.z += (dz / d) * (rr - d + 0.02); hit = true;
  }
  return hit;
}
const _push = { x: 0, z: 0 };
/** Move a ball that is inside an obstacle (a ghost that stopped there) out to the nearest clear spot. */
export function ejectBall(b, hole) {
  let moved = false;
  for (let i = 0; i < 12; i++) { _push.x = 0; _push.z = 0; if (!overlapPush(b, hole, _push)) break; b.x += _push.x; b.z += _push.z; moved = true; }
  if (moved) { b.vx = b.vz = 0; b.rest = true; b.still = 0; }
}
const dist2 = (b, x, z) => { const dx = b.x - x, dz = b.z - z; return dx * dx + dz * dz; };

/**
 * Move the ball on by `dt` seconds (in small fixed steps). `ctx.t` is the hero clock. Fills `ev`: wall / post (the hardest knock), holed, splash (into water),
 * fx (a special moment: 1 teleport, 2 cannon loads, 3 cannon fires, 4 loop entered, 5 geyser kick).
 */
export function stepBall(b, hole, ctx, dt, ev) {
  ev.wall = 0; ev.post = 0; ev.holed = false; ev.splash = false; ev.fx = 0; ev.fall = false;
  if (b.holed || b.sunk) return;
  const n = Math.max(1, Math.ceil(dt / STEP)), h = dt / n, W = hole.walls, hero = hole.hero, ghost = ctx.ghost;
  const fric = FRICTION * (ctx.turbo ? 0.55 : 1) * (ctx.drive ? 0.6 : 1) * (ctx.fricK === undefined ? 1 : ctx.fricK), maxV = ctx.turbo ? MAX_V * 1.35 : ctx.drive ? 9 : MAX_V;
  const wallE = ctx.bounce ? 1.02 : WALL_E, postE = ctx.bounce ? 1.35 : POST_E;
  for (let i = 0; i < n; i++) {
    const tt = ctx.t + i * h;
    if (b.tcool > 0) b.tcool -= h;
    // held in the cannon, then fired
    if (b.loaded > 0) {
      b.loaded -= h; b.vx = b.vz = 0; b.x = hero.x; b.z = hero.z;
      if (b.loaded <= 0) { const a = Math.atan2(hero.uz, hero.ux) + hero.wobble * Math.sin(tt * 1.3); b.vx = Math.cos(a) * hero.speed; b.vz = Math.sin(a) * hero.speed; b.tcool = 0.9; b.x += b.vx * 0.06; b.z += b.vz * 0.06; ev.fx = 3; }
      continue;
    }
    // riding round the loop
    if (b.rail) {                                       // riding a rail: carried along it over whatever lies below, then let go at the far end
      const R = b.rail.r; b.rail.s += (b.rail.v * h) / R.len;
      if (b.rail.s >= 1) { b.x = R.bx + R.ux * 0.3; b.z = R.bz + R.uz * 0.3; b.vx = R.ux * b.rail.v * 0.92; b.vz = R.uz * b.rail.v * 0.92; b.rail = null; b.ly = 0; b.y = hillH(hole, b.x, b.z); b.air = false; ev.fx = 9; }
      else { const s = b.rail.s; b.x = R.ax + (R.bx - R.ax) * s; b.z = R.az + (R.bz - R.az) * s; b.vx = R.ux * b.rail.v; b.vz = R.uz * b.rail.v; b.ly = R.h * Math.sin(3.14159265 * s) + 0.35; }
      continue;
    }
    if (hole.rails && !b.air && !b.loop) for (const R of hole.rails) if (dist2(b, R.ax, R.az) < R.r * R.r) { const sp0 = Math.sqrt(b.vx * b.vx + b.vz * b.vz); if (sp0 >= 2.8 && b.vx * R.ux + b.vz * R.uz > 0) { b.rail = { r: R, s: 0, v: Math.max(5.5, sp0 * 0.9) }; ev.fx = 10; break; } }
    if (b.rail) continue;
    if (b.loop) {
      const lp = b.loop, L = hero.L; lp.s += (lp.v * h) / L;
      if (lp.s >= 1) { b.loop = null; b.ly = 0; b.x = hero.x + hero.ux * (L / 2 + 0.3); b.z = hero.z + hero.uz * (L / 2 + 0.3); b.vx = hero.ux * lp.v * 0.92; b.vz = hero.uz * lp.v * 0.92; }
      else { const a = -L / 2 + lp.s * L; b.x = hero.x + hero.ux * a; b.z = hero.z + hero.uz * a; b.vx = hero.ux * lp.v; b.vz = hero.uz * lp.v; b.ly = hero.R * (1 - Math.cos(6.283185307 * lp.s)); }
      continue;
    }
    // slopes, rivers, the turntable, the power-ups
    if (!b.air) { const g = hillGrad(hole, b.x, b.z); b.vx -= G * g.x * h; b.vz -= G * g.z * h; if (ctx.tilt && hole.tiltDir) { b.vx += hole.tiltDir.x * ctx.tilt * h; b.vz += hole.tiltDir.z * ctx.tilt * h; } }
    if (!b.air) for (const rv of hole.rivers) {
      const dx = rv.b.x - rv.a.x, dz = rv.b.z - rv.a.z, l2 = dx * dx + dz * dz; let t = ((b.x - rv.a.x) * dx + (b.z - rv.a.z) * dz) / l2; if (t < -0.05 || t > 1.05) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t; const px = rv.a.x + dx * t - b.x, pz = rv.a.z + dz * t - b.z;
      if (px * px + pz * pz < rv.hw * rv.hw) { const l = Math.sqrt(l2); b.vx += (dx / l) * rv.acc * h; b.vz += (dz / l) * rv.acc * h; }
    }
    if (hero && hero.type === 'turntable' && !ghost) { const dx = b.x - hero.x, dz = b.z - hero.z; if (dx * dx + dz * dz < hero.r * hero.r) { b.vx += (-dz * hero.omega * 2.2 + dx * Math.abs(hero.omega) * 0.5) * h; b.vz += (dx * hero.omega * 2.2 + dz * Math.abs(hero.omega) * 0.5) * h; } }
    if (ctx.drive) { b.vx += b.ax * h; b.vz += b.az * h; }
    let sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (ctx.homing && sp > 0.8) { const cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz); if (cd > 0.05 && cd < 6 && (b.vx * cx + b.vz * cz) / (sp * cd) > 0.5) { const k = (9 * (1 - cd / 6) * h) / cd; b.vx += cx * k; b.vz += cz * k; } }
    let f = b.air ? 0 : fric; if (!b.air && inSand(hole, b)) f *= 3.2;
    sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (sp > 0 && f > 0) { const ns = Math.max(0, sp - f * h), k = ns / sp; b.vx *= k; b.vz *= k; sp = ns; }
    if (sp > maxV) { const k = maxV / sp; b.vx *= k; b.vz *= k; }
    b.x += b.vx * h; b.z += b.vz * h;
    { // up and down: on the ground the ball follows the surface; if the surface falls away faster than the ball's own path it takes off, then gravity brings it down again
      const H1 = hillH(hole, b.x, b.z);
      if (!b.air) {
        const yb = b.y + b.vy * h - 0.5 * GA * h * h;
        if (H1 < yb - 0.03) { b.air = true; b.y = yb; b.vy -= GA * h; }
        else { b.vy = Math.max(-6, Math.min(6, (H1 - b.y) / h)); b.y = H1; }
      } else {
        b.vy -= GA * h; b.y += b.vy * h;
        if (b.y <= H1) { b.y = H1; b.air = false; b.vy = 0; b.vx *= 0.9; b.vz *= 0.9; if (H1 < -0.7) { b.sunk = true; ev.splash = true; ev.fall = true; return; } }
      }
    }
    // walls, the gate, posts and bumpers (a ghost passes through everything but the outer rails)
    for (let j = 0; j < W.length; j++) { const w = W[j]; if (ghost && w[5]) continue; if (w[6] && b.air && b.y - hillH(hole, b.x, b.z) > 0.5) continue; collideSeg(b, w[0], w[1], w[2], w[3], wallE, ev); }
    if (hole.boosts && !b.air) for (const o of hole.boosts) { if (o.powered && ctx.gateT <= 0) continue; const rx = b.x - o.x, rz = b.z - o.z, s2 = rx * o.ux + rz * o.uz, c2 = rx * -o.uz + rz * o.ux; if (Math.abs(s2) < o.len / 2 && Math.abs(c2) < o.wid / 2) { b.vx += o.ux * 16 * h; b.vz += o.uz * 16 * h; if (b.boostK !== o) { b.boostK = o; ev.fx = 8; } } else if (b.boostK === o) b.boostK = null; }
    if (b.padCool > 0) b.padCool -= h;
    if (hole.pads && !b.air && !(b.padCool > 0)) for (const o of hole.pads) if (dist2(b, o.x, o.z) < o.r * o.r) { b.air = true; b.vy = 5.0; b.padCool = 0.6; ev.fx = 6; }
    if (ctx.gateT > 0) ctx.gateT -= h;
    hole.cover = ctx.gateT > 0 ? 1 : 0;                 // (a retractable bridge covers its canyon while the button's time lasts)
    if (hole.feats && !b.air) for (const f of hole.feats) if (f.bridge) { const rx = b.x - f.x, rz = b.z - f.z, s2 = rx * f.ux + rz * f.uz, c2 = rx * f.nx + rz * f.nz; if (Math.abs(s2) < f.len / 2 + 0.5 && c2 > f.c0 && c2 < f.c1 && ctx.gateT > 0) ctx.gateT = Math.max(ctx.gateT, 0.8); }       // (a bridge stays out while a ball is on it)
    if (hole.doors) for (const dr of hole.doors) {
      if (!b.air && dist2(b, dr.button.x, dr.button.z) < dr.button.r * dr.button.r) { if (ctx.gateT <= 0) ev.fx = 7; ctx.gateT = 7; }
      if (dr.gate && ctx.gateT <= 0 && !ghost) collideSeg(b, dr.gate[0], dr.gate[1], dr.gate[2], dr.gate[3], 0.5, ev);
    }
    if (hole.cage) {
      const cg = hole.cage, s0 = cg.sides[0], s1 = cg.sides[1]; if (!b.air && inPoly([s0[0], s0[1], s0[2], s0[3], s1[2], s1[3], s1[0], s1[1]], b.x, b.z)) ctx.gateT = Math.max(ctx.gateT, 0.8);           // (the gate never shuts on a ball that is inside the pen)
      if (!b.air && dist2(b, cg.button.x, cg.button.z) < cg.button.r * cg.button.r) { if (ctx.gateT <= 0) ev.fx = 7; ctx.gateT = 7; }
      if (ctx.gateT <= 0 && !ghost) collideSeg(b, cg.gate[0], cg.gate[1], cg.gate[2], cg.gate[3], 0.5, ev);
    }
    if (hero && hero.gate && !ghost && gateBlocked(hero, tt)) collideSeg(b, hero.gate[0], hero.gate[1], hero.gate[2], hero.gate[3], 0.55, ev);
    if (!ghost) {
      for (const p of hole.posts) collideCircle(b, p.x, p.z, p.r, postE, ev, 0, 0);
      for (const p of hole.bumpers) collideCircle(b, p.x, p.z, p.r, ctx.bounce ? 1.5 : BUMPER_E, ev, 0, 0);
    }
    // the hero
    if (hero && !ghost) {
      const ux = hero.ux, uz = hero.uz;
      if (hero.type === 'pendulum') {
        for (const m of hero.hammers) {
          const ph = hero.w * tt + m.ph, off = hero.A * Math.sin(ph), v = hero.A * hero.w * Math.cos(ph);
          collideCircle(b, hero.x + ux * m.du + hero.nx * off, hero.z + uz * m.du + hero.nz * off, hero.rad, 0.95, ev, hero.nx * v, hero.nz * v);
        }
      } else if (hero.type === 'geyser') {
        const k = (tt + hero.phase) / hero.period, idx = Math.floor(k), fr = k - idx, dx = b.x - hero.x, dz = b.z - hero.z, d2 = dx * dx + dz * dz;
        if (fr > 0.84 && d2 < hero.r * hero.r && b.gk !== idx) {
          const d = Math.sqrt(d2); b.gk = idx; ev.fx = 5;
          const ox = d < 0.1 ? hero.nx : dx / d, oz = d < 0.1 ? hero.nz : dz / d;
          b.vx += ox * hero.push + ux * 2.5; b.vz += oz * hero.push + uz * 2.5;
        }
      } else if (hero.type === 'cannon') {
        if (b.tcool <= 0 && dist2(b, hero.x, hero.z) < hero.r * hero.r * 0.55) { b.loaded = hero.hold; b.x = hero.x; b.z = hero.z; b.vx = b.vz = 0; ev.fx = 2; }
      } else if (hero.type === 'teleport') {
        if (b.tcool <= 0 && dist2(b, hero.a.x, hero.a.z) < hero.r * hero.r && sp < 10) { const s = Math.max(sp, 3.5) * 0.92; b.x = hero.b.x + ux * 0.5; b.z = hero.b.z + uz * 0.5; b.vx = ux * s; b.vz = uz * s; b.tcool = 0.7; ev.fx = 1; }
      } else if (hero.type === 'drawbridge') {
        const rx = b.x - hero.x, rz = b.z - hero.z, a = rx * ux + rz * uz, lat = rx * hero.nx + rz * hero.nz;
        if (Math.abs(a) < hero.half && Math.abs(lat) < hero.hw + 0.3 && bridgeUp(hero, tt)) { b.sunk = true; ev.splash = true; return; }
      } else if (hero.type === 'loop') {
        const L = hero.L, rx = b.x - hero.x, rz = b.z - hero.z, a = rx * ux + rz * uz, lat = rx * hero.nx + rz * hero.nz, vu = b.vx * ux + b.vz * uz;
        if (a > -L / 2 - 1.6 && a < -L / 2 + 0.05 && Math.abs(lat) < 1.4) {
          if (vu > 0.05) { b.vx -= ux * 5.5 * h; b.vz -= uz * 5.5 * h; } else { b.vx -= ux * 2.5 * h; b.vz -= uz * 2.5 * h; }     // the ramp up to the loop: too slow and it rolls back
        }
        if (a >= -L / 2 && a < -L / 2 + 0.45 && Math.abs(lat) < hero.track + 0.15 && vu >= hero.vmin) { b.loop = { s: 0, v: Math.max(vu * 0.9, 6.2) }; ev.fx = 4; }
      }
    }
    // water
    if (!ghost && !b.air) for (const p of hole.ponds) if (dist2(b, p.x, p.z) < p.r * p.r * 1.45 && inPoly(p.poly, b.x, b.z)) { b.sunk = true; ev.splash = true; return; }
    // the cup: it takes a ball that gets there slowly enough, and gently pulls in one that is close and slow
    const cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz), sp2 = Math.sqrt(b.vx * b.vx + b.vz * b.vz), cr = ctx.cupR, big = cr / CUP_R;
    if (b.air) continue;
    if (cd < cr && sp2 < (ctx.capV || 7.5) * Math.sqrt(big)) { b.holed = true; ev.holed = true; b.x = hole.cup.x; b.z = hole.cup.z; b.vx = b.vz = 0; return; }
    if (cd < 1.15 * big && sp2 < 4.5 * big) { const k = 7 * (1 - cd / (1.15 * big)) * h / (cd || 1); b.vx += cx * k; b.vz += cz * k; }
  }
  const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz), gg = hillGrad(hole, b.x, b.z), slope = G * Math.sqrt(gg.x * gg.x + gg.z * gg.z);
  _push.x = 0; _push.z = 0; b.inside = ctx.ghost && overlapPush(b, hole, _push);
  if (b.inside) { const l = Math.sqrt(_push.x * _push.x + _push.z * _push.z) || 1; b.vx += (_push.x / l) * 5 * dt; b.vz += (_push.z / l) * 5 * dt; }          // (a ghost that has stopped inside something drifts out of it)
  const tiltPull = ctx.tilt || 0, grip = FRICTION * (inSand(hole, b) ? 3.2 : 1);                        // (sand holds the ball on a slope that would roll it on grass)
  const calm = !b.loop && !b.rail && !b.air && !b.inside && b.loaded <= 0 && !ctx.drive;
  if (s < 0.07 && slope + tiltPull < grip * 0.9 && calm) b.still += dt; else b.still = 0;
  if (s < 0.2 && tiltPull < grip * 0.9 && calm) b.dawdle = (b.dawdle || 0) + dt; else b.dawdle = 0;       // (barely moving for a second and a half, whatever the slope: it has stopped)
  if (b.still > 0.3 || b.dawdle > 1.5) { b.rest = true; b.vx = b.vz = 0; b.dawdle = 0; }
}
