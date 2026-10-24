// The ball's physics for the mini-golf: pure maths, no THREE. The ball rolls on the hole's gentle hills, slows with friction (sand slows it more), is carried by rivers, bounces
// off the walls, posts and bumpers, drops into ponds, and meets the hole's hero obstacle (golfhero.js). A power-up changes how all of this works through `ctx`.
import { gateBlocked, bridgeUp } from './golfhero.js?v=20261024150417';

export const BALL_R = 0.32, CUP_R = 0.6, MAX_V = 15;
const G = 5.0, FRICTION = 2.4, WALL_E = 0.72, POST_E = 0.92, BUMPER_E = 1.3, STEP = 1 / 120;

/** Height of the ground (the hills) at a point. */
export function hillH(hole, x, z) {
  let h = 0;
  for (const k of hole.hills) { const dx = x - k.x, dz = z - k.z, u = 1 - (dx * dx + dz * dz) / (k.r * k.r); if (u > 0) h += k.h * u * u; }
  return h;
}
const _g = { x: 0, z: 0 };
/** The slope of the hills at a point (written into a shared object). */
export function hillGrad(hole, x, z) {
  let gx = 0, gz = 0;
  for (const k of hole.hills) { const dx = x - k.x, dz = z - k.z, r2 = k.r * k.r, u = 1 - (dx * dx + dz * dz) / r2; if (u > 0) { const f = (-4 * k.h * u) / r2; gx += f * dx; gz += f * dz; } }
  _g.x = gx; _g.z = gz; return _g;
}

export function newBall(hole) { return { x: hole.tee.x + 0.9, z: hole.tee.z, vx: 0, vz: 0, holed: false, sunk: false, rest: true, still: 0, loop: null, loaded: 0, tcool: 0, gk: -1, ly: 0, ax: 0, az: 0 }; }
/** What the power-ups are doing right now: `t` is the hero clock, the rest are switches. */
export function newCtx() { return { t: 0, ghost: false, bounce: false, turbo: false, homing: false, drive: false, cupR: CUP_R }; }

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
const dist2 = (b, x, z) => { const dx = b.x - x, dz = b.z - z; return dx * dx + dz * dz; };

/**
 * Move the ball on by `dt` seconds (in small fixed steps). `ctx.t` is the hero clock. Fills `ev`: wall / post (the hardest knock), holed, splash (into water),
 * fx (a special moment: 1 teleport, 2 cannon loads, 3 cannon fires, 4 loop entered, 5 geyser kick).
 */
export function stepBall(b, hole, ctx, dt, ev) {
  ev.wall = 0; ev.post = 0; ev.holed = false; ev.splash = false; ev.fx = 0;
  if (b.holed || b.sunk) return;
  const n = Math.max(1, Math.ceil(dt / STEP)), h = dt / n, W = hole.walls, hero = hole.hero, ghost = ctx.ghost;
  const fric = FRICTION * (ctx.turbo ? 0.55 : 1) * (ctx.drive ? 0.6 : 1), maxV = ctx.turbo ? MAX_V * 1.35 : ctx.drive ? 9 : MAX_V;
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
    if (b.loop) {
      const lp = b.loop, L = hero.L; lp.s += (lp.v * h) / L;
      if (lp.s >= 1) { b.loop = null; b.ly = 0; b.x = hero.x + hero.ux * (L / 2 + 0.3); b.z = hero.z + hero.uz * (L / 2 + 0.3); b.vx = hero.ux * lp.v * 0.92; b.vz = hero.uz * lp.v * 0.92; }
      else { const a = -L / 2 + lp.s * L; b.x = hero.x + hero.ux * a; b.z = hero.z + hero.uz * a; b.vx = hero.ux * lp.v; b.vz = hero.uz * lp.v; b.ly = hero.R * (1 - Math.cos(6.283185307 * lp.s)); }
      continue;
    }
    // slopes, rivers, the turntable, the power-ups
    const g = hillGrad(hole, b.x, b.z); b.vx -= G * g.x * h; b.vz -= G * g.z * h;
    for (const rv of hole.rivers) {
      const dx = rv.b.x - rv.a.x, dz = rv.b.z - rv.a.z, l2 = dx * dx + dz * dz; let t = ((b.x - rv.a.x) * dx + (b.z - rv.a.z) * dz) / l2; if (t < -0.05 || t > 1.05) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t; const px = rv.a.x + dx * t - b.x, pz = rv.a.z + dz * t - b.z;
      if (px * px + pz * pz < rv.hw * rv.hw) { const l = Math.sqrt(l2); b.vx += (dx / l) * rv.acc * h; b.vz += (dz / l) * rv.acc * h; }
    }
    if (hero && hero.type === 'turntable' && !ghost) { const dx = b.x - hero.x, dz = b.z - hero.z; if (dx * dx + dz * dz < hero.r * hero.r) { b.vx += (-dz * hero.omega * 2.2 + dx * Math.abs(hero.omega) * 0.5) * h; b.vz += (dx * hero.omega * 2.2 + dz * Math.abs(hero.omega) * 0.5) * h; } }
    if (ctx.drive) { b.vx += b.ax * h; b.vz += b.az * h; }
    let sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (ctx.homing && sp > 0.8) { const cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz); if (cd > 0.05 && cd < 6 && (b.vx * cx + b.vz * cz) / (sp * cd) > 0.5) { const k = (9 * (1 - cd / 6) * h) / cd; b.vx += cx * k; b.vz += cz * k; } }
    let f = fric; for (const s of hole.sands) if (dist2(b, s.x, s.z) < s.r * s.r) { f *= 2.8; break; }
    sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (sp > 0) { const ns = Math.max(0, sp - f * h), k = ns / sp; b.vx *= k; b.vz *= k; sp = ns; }
    if (sp > maxV) { const k = maxV / sp; b.vx *= k; b.vz *= k; }
    b.x += b.vx * h; b.z += b.vz * h;
    // walls, the gate, posts and bumpers (a ghost passes through everything but the outer rails)
    for (let j = 0; j < W.length; j++) { const w = W[j]; if (ghost && w[5]) continue; collideSeg(b, w[0], w[1], w[2], w[3], wallE, ev); }
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
    if (!ghost) for (const p of hole.ponds) if (dist2(b, p.x, p.z) < (p.r - 0.05) * (p.r - 0.05)) { b.sunk = true; ev.splash = true; return; }
    // the cup: it takes a ball that gets there slowly enough, and gently pulls in one that is close and slow
    const cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz), sp2 = Math.sqrt(b.vx * b.vx + b.vz * b.vz), cr = ctx.cupR, big = cr / CUP_R;
    if (cd < cr && sp2 < 7.5 * Math.sqrt(big)) { b.holed = true; ev.holed = true; b.x = hole.cup.x; b.z = hole.cup.z; b.vx = b.vz = 0; return; }
    if (cd < 1.15 * big && sp2 < 4.5 * big) { const k = 7 * (1 - cd / (1.15 * big)) * h / (cd || 1); b.vx += cx * k; b.vz += cz * k; }
  }
  const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz), gg = hillGrad(hole, b.x, b.z), slope = G * Math.sqrt(gg.x * gg.x + gg.z * gg.z);
  if (s < 0.07 && slope < FRICTION * 0.9 && !b.loop && b.loaded <= 0 && !ctx.drive) b.still += dt; else b.still = 0;
  if (b.still > 0.3) { b.rest = true; b.vx = b.vz = 0; }
}
