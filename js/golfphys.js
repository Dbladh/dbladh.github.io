// The ball's physics for the mini-golf: pure maths, no THREE. The ball rolls on the hole's gentle hills, slows with friction (sand slows it more), is carried by rivers, bounces
// off the walls, posts and bumpers, drops into ponds, and meets the hole's hero obstacle (golfhero.js). A power-up changes how all of this works through `ctx`.
import { gateBlocked, bridgeUp } from './golfhero.js?v=20261030220201';

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
/** A pinball lane (a winding ramp or a raised deck): a path of samples [x, z, distance along] with a half-width; the ground rises along it by smoothstep from s0 over `ramp` to height H, and eases out over `edge` beside it. */
function laneH(L, x, z) {
  const P = L.pts, last = P.length - 2; let best = 1e9, bs = 0, bover = 0, blat = 0;
  for (let i = 0; i <= last; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, len = Math.sqrt(l2), t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2, tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (a[0] + dx * tc), ez = z - (a[1] + dz * tc), d = Math.sqrt(ex * ex + ez * ez);
    if (d < best) { best = d; bs = a[2] + tc * (b[2] - a[2]); bover = i === 0 && t < 0 ? -t * len : i === last && t > 1 ? (t - 1) * len : 0; blat = Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / len; }
  }
  if (bover > 0) best = Math.max(blat - L.w, bover) + L.w;                      // (the ends are cut square, not rounded)
  const ex = best - L.w; if (ex > L.edge) return 0;
  const k = L.ramp > 0 ? Math.min(1, Math.max(0, (bs - L.s0) / L.ramp)) : 1, kd = L.down ? Math.min(1, Math.max(0, (L.len - bs) / L.down)) : 1;       // (a bridge rises, then falls away again)
  return L.H * k * k * (3 - 2 * k) * kd * kd * (3 - 2 * kd) * (ex <= 0 ? 1 : 1 - sm(ex / L.edge));
}
function lanesH(hole, x, z) { let m = 0; for (const L of hole.lanes) { const v = laneH(L, x, z); if (v > m) m = v; } return m; }
export function hillH(hole, x, z) {
  let h = 0;
  for (const k of hole.hills) { const dx = x - k.x, dz = z - k.z, u = 1 - (dx * dx + dz * dz) / (k.r * k.r); if (u > 0) h += k.h * u * u; }
  if (hole.feats) for (const f of hole.feats) h += featH(f, x, z, hole.cover);
  for (const s of hole.sands) h += sandH(s, x, z);
  if (hole.lanes) h += lanesH(hole, x, z);
  return h;
}
const _g = { x: 0, z: 0 }, EPS = 0.07, MAX_SLOPE = 1.8;
/** The slope of the ground at a point (written into a shared object): the hills analytically, features by differences; steep cliffs are capped so they cannot fling the ball. */
export function hillGrad(hole, x, z) {
  let gx = 0, gz = 0;
  for (const k of hole.hills) { const dx = x - k.x, dz = z - k.z, r2 = k.r * k.r, u = 1 - (dx * dx + dz * dz) / r2; if (u > 0) { const f = (-4 * k.h * u) / r2; gx += f * dx; gz += f * dz; } }
  if ((hole.feats && hole.feats.length) || hole.sands.length || (hole.lanes && hole.lanes.length)) {
    let fx = 0, fz = 0;
    if (hole.lanes) { fx += lanesH(hole, x + EPS, z) - lanesH(hole, x - EPS, z); fz += lanesH(hole, x, z + EPS) - lanesH(hole, x, z - EPS); }
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

function collideSeg(b, ax, az, bx, bz, e, ev, kick = 0) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((b.x - ax) * dx + (b.z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ox = b.x - (ax + dx * t), oz = b.z - (az + dz * t), d2 = ox * ox + oz * oz;
  if (d2 >= BALL_R * BALL_R) return;
  const d = Math.sqrt(d2);
  let nx, nz;
  if (d < 1e-6) { const l = Math.sqrt(l2) || 1; nx = -dz / l; nz = dx / l; } else { nx = ox / d; nz = oz / d; }
  b.x += nx * (BALL_R - d); b.z += nz * (BALL_R - d);
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; if (-vn > ev.wall) { ev.wall = -vn; ev.sax = ax; ev.saz = az; ev.sbx = bx; ev.sbz = bz; } }
}
/** Bounce off a round thing (a post, a bumper, a hammer), which may itself be moving at (vcx, vcz). */
function collideCircle(b, cx, cz, r, e, ev, vcx, vcz) {
  const dx = b.x - cx, dz = b.z - cz, rr = BALL_R + r, d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d;
  b.x = cx + nx * rr; b.z = cz + nz * rr;
  const vn = (b.vx - vcx) * nx + (b.vz - vcz) * nz;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; if (-vn > ev.post) { ev.post = -vn; ev.hx = cx; ev.hz = cz; ev.hr = r; } }
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
/** The surface patch under the ball (ice, mud, caramel, quicksand, a conveyor belt), or null: { kind, poly, x, z, r, fric (a friction multiplier), pull (towards its centre), push, ux, uz (along it) }. */
/** The bar a floor trigger (pad, trampoline or gate button) covers: it lies across the lane (about 70% of its width) and is about a unit long along it. Worked out once from the hole's centre line and kept on the trigger. */
export function triggerBar(hole, o) {
  if (o.bar) return o.bar;
  const sh = hole.shape || []; let bi = -1, bd = 1e9; sh.forEach((p, i) => { const d = (p[0] - o.x) ** 2 + (p[1] - o.z) ** 2; if (d < bd) { bd = d; bi = i; } });
  let ux = 1, uz = 0, hw = 1.6; if (bi >= 0) { const a = sh[Math.max(0, bi - 1)], c = sh[Math.min(sh.length - 1, bi + 1)], l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > 1e-6) { ux = (c[0] - a[0]) / l; uz = (c[1] - a[1]) / l; } hw = sh[bi][2]; }
  let half = Math.max(o.r, hw * 0.7), len = Math.max(1.0, o.r * 1.4); const O = hole.outline && (hole._outFlat ||= hole.outline.flat());
  if (O && O.length) {                                     // (the bar is clipped to the course: both ends and the corners of its footprint must lie inside the outline, so it never runs under a wall or out onto the grass)
    const inside = (hf) => { for (const sx of [-1, 1]) for (const sl of [-1, 1]) { const x = o.x - uz * sx * (hf + 0.12) + ux * sl * len / 2, z = o.z + ux * sx * (hf + 0.12) + uz * sl * len / 2; if (!inPoly(O, x, z)) return false; } return true; };
    while (half > Math.max(0.35, o.r * 0.6) && !inside(half)) half -= 0.1;
  }
  return (o.bar = { ux, uz, half, len });
}
export function onTrigger(hole, o, b) { const bar = triggerBar(hole, o), rx = b.x - o.x, rz = b.z - o.z; return Math.abs(rx * bar.ux + rz * bar.uz) < bar.len / 2 && Math.abs(-rx * bar.uz + rz * bar.ux) < bar.half; }
/** A magnet switches on and off: { power (0 to 1, easing in and out over 0.3 s), warn ('on' for the last 1.2 s before it switches on, 'off' for the last 1 s before it switches off, else '') } at time t. A magnet without a period is always on. */
export function magnetState(m, t) {
  if (!m.period) return { power: 1, warn: '' };
  const per = m.period, p = (((t + m.phase) % per) + per) % per, onT = per * m.duty, RAMP = 0.3;
  if (p < onT) return { power: Math.min(1, p / RAMP, (onT - p) / RAMP), warn: onT - p < 1.0 ? 'off' : '' };
  return { power: 0, warn: per - p < 1.2 ? 'on' : '' };
}
export function patchAt(hole, b) { if (hole.patches) for (const p of hole.patches) if (dist2(b, p.x, p.z) < p.r * p.r * 1.45 && inPoly(p.poly, b.x, b.z)) return p; return null; }
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
/** The ball in the secret chute (golfchute.js): it rolls under the pull of the track's slope on slick plastic, bounces between its two walls, and at the end is dropped towards the cup. */
function stepChute(b, hole, h, ev) {
  const C = hole.chute, P = C.pts, n = P.length, k0 = Math.max(0, b.chute.k - 6), k1 = Math.min(n - 2, b.chute.k + 10);
  let best = 1e9, bk = k0, bt = 0;
  for (let k = k0; k <= k1; k++) {
    const dx = P[k + 1][0] - P[k][0], dz = P[k + 1][1] - P[k][1], l2 = dx * dx + dz * dz || 1e-9; let t = ((b.x - P[k][0]) * dx + (b.z - P[k][1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = b.x - P[k][0] - dx * t, ez = b.z - P[k][1] - dz * t, d = ex * ex + ez * ez; if (d < best) { best = d; bk = k; bt = t; }
  }
  b.chute.k = bk;
  const dx = P[bk + 1][0] - P[bk][0], dz = P[bk + 1][1] - P[bk][1], l = Math.sqrt(dx * dx + dz * dz) || 1, tx = dx / l, tz = dz / l;
  b.vx += tx * C.acc * h; b.vz += tz * C.acc * h;
  for (let q = 0; q < C.pads.length; q++) if (b.chute.pk !== q && Math.abs(bk - C.pads[q]) <= 1) { b.chute.pk = q; b.vx += tx * C.kick; b.vz += tz * C.kick; ev.fx = 8; }       // (a boost pad in the floor kicks the ball on)
  let sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz); if (sp > 0) { const ns = Math.max(0, sp - C.fric * h), k = ns / sp; b.vx *= k; b.vz *= k; sp = ns; } if (sp > C.vmax) { const k = C.vmax / sp; b.vx *= k; b.vz *= k; sp = C.vmax; }
  b.x += b.vx * h; b.z += b.vz * h;
  for (let k = Math.max(0, bk - 3); k <= Math.min(n - 2, bk + 4); k++) { collideSeg(b, C.left[k][0], C.left[k][1], C.left[k][2], C.left[k][3], C.e, ev); collideSeg(b, C.right[k][0], C.right[k][1], C.right[k][2], C.right[k][3], C.e, ev); }
  { const px = P[bk][0] + dx * bt, pz = P[bk][1] + dz * bt, ex = b.x - px, ez = b.z - pz, d = Math.sqrt(ex * ex + ez * ez);       // (never out through a wall: a ball that got past one, at the mouth or round a tight bend, is put back inside)
    if (d > C.hw - BALL_R + 0.12) { const lim = C.hw - BALL_R, k = lim / d; b.x = px + ex * k; b.z = pz + ez * k; const vn = (b.vx * ex + b.vz * ez) / d; if (vn > 0) { b.vx -= (1 + C.e) * vn * (ex / d); b.vz -= (1 + C.e) * vn * (ez / d); } } }
  const s = P[bk][2] + bt * l; b.ly = C.ly[bk] + (C.ly[bk + 1] - C.ly[bk]) * bt; b.y = hillH(hole, b.x, b.z); b.air = false; b.vy = 0;
  if (bk >= n - 2 && bt > 0.97 || s >= C.len - 0.15) {                       // the end: dropped towards the cup, a little off from where in the channel it was and how fast
    const lat = ((b.x - P[bk][0]) * -tz + (b.z - P[bk][1]) * tx) / C.hw, cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz) || 1;
    const ang = lat * C.scatter + (Math.min(sp, 7) - 5) * C.scatterV, ca = Math.cos(ang), sa = Math.sin(ang), dx2 = (cx * ca - cz * sa) / cd, dz2 = (cx * sa + cz * ca) / cd;
    const v = (-0.47 + Math.sqrt(0.2209 + 0.676 * Math.max(0.5, cd))) / 0.338;                // (the speed that carries the dropped ball just to the cup: the fall takes 0.47 s, the roll after it loses 0.19 of the speed squared)
    b.vx = dx2 * v; b.vz = dz2 * v; b.y = hillH(hole, b.x, b.z) + C.exitH; b.air = true; b.vy = 0.3; b.ly = 0; b.chute = null; b.over = true; b.tcool = 0.3; ev.fx = 12;
  }
}
/**
 * The ball over the cup, in three dimensions (the cup is a real hole, not a circle on the ground). The ball is a sphere of radius BALL_R whose centre is at height `cy` above the green; the hole is a cylinder of radius `cr`
 * with a thin rim at ground level. Where the ball overlaps the rim circle the rim pushes it away along the line from the rim to the ball's centre (so a ball that is only partly over the edge is pushed in or out and spun
 * round the rim); with its centre past the edge it has nothing under it and falls; below the rim the wall of the cylinder keeps it in. A ball that falls past the rim level is holed; one that crosses too fast drops too
 * little before the far rim and is knocked across or out. Returns true while the ball is in this state.
 */
function cupStep(b, hole, cr, h, H0, ev) {
  const cx = hole.cup.x, cz = hole.cup.z, R = BALL_R;
  if (!b.cm) { b.cm = true; b.cy = b.y - H0 + R; b.cvy = Math.max(-6, Math.min(6, b.vy || 0)); }
  b.cvy -= GA * h; b.cy += b.cvy * h;
  let dx = b.x - cx, dz = b.z - cz, d = Math.sqrt(dx * dx + dz * dz) || 1e-6, ux = dx / d, uz = dz / d;
  if (d >= cr) { if (b.cy < R) { b.cy = R; if (b.cvy < 0) b.cvy = 0; } }                 // (on the green again)
  else {
    for (let it = 0; it < 2; it++) {
      dx = b.x - cx; dz = b.z - cz; d = Math.sqrt(dx * dx + dz * dz) || 1e-6; ux = dx / d; uz = dz / d;
      const gx = d - cr, dist = Math.sqrt(gx * gx + b.cy * b.cy) || 1e-6;
      if (b.cy > 0 && dist < R) {                                                       // (resting on the rim)
        const nr = gx / dist, ny = b.cy / dist, pen = R - dist; b.x += ux * nr * pen; b.z += uz * nr * pen; b.cy += ny * pen;
        const vr = b.vx * ux + b.vz * uz, vn = vr * nr + b.cvy * ny;
        if (vn < 0) { const j = -(1 + 0.3) * vn; b.vx += j * nr * ux; b.vz += j * nr * uz; b.cvy += j * ny; }
      }
    }
    dx = b.x - cx; dz = b.z - cz; d = Math.sqrt(dx * dx + dz * dz) || 1e-6; ux = dx / d; uz = dz / d;
    if (b.cy <= 0 && d > cr - R) {                                                      // (below the rim: the wall of the hole)
      b.x = cx + ux * (cr - R); b.z = cz + uz * (cr - R); const vr = b.vx * ux + b.vz * uz; if (vr > 0) { b.vx -= 1.4 * vr * ux; b.vz -= 1.4 * vr * uz; }
    }
    if (b.cy < -0.1 && d < cr - R * 0.3) { b.capX = b.x; b.capZ = b.z; b.holed = true; ev.holed = true; b.x = cx; b.z = cz; b.vx = b.vz = 0; b.cm = false; b.y = H0 + b.cy - R; return true; }
  }
  b.y = H0 + b.cy - R;
  if (d > cr + R + 0.02 && b.cy <= R + 0.02) { b.cm = false; b.y = hillH(hole, b.x, b.z); b.vy = 0; b.air = false; return false; }
  if (d > cr + R + 0.02) { b.cm = false; b.air = true; b.vy = b.cvy; return false; }             // (knocked up and out)
  b.air = false; b.vy = 0; return true;
}
export function stepBall(b, hole, ctx, dt, ev) {
  ev.wall = 0; ev.post = 0; ev.hr = 0; ev.kick = 0; ev.holed = false; ev.splash = false; ev.fx = 0; ev.fall = false;
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
    if (b.chute) { stepChute(b, hole, h, ev); continue; }
    if (hole.chute && ctx.gateT > 0 && (!b.air || b.y - hillH(hole, b.x, b.z) < 0.8)) { const M = hole.chute.mouth, rx = b.x - M.x, rz = b.z - M.z, f = rx * M.ux + rz * M.uz, vn = b.vx * M.ux + b.vz * M.uz; if (f > 0.05 && f < 0.9 && Math.abs(rx * -M.uz + rz * M.ux) < M.hw && vn > 1.0) { b.chute = { k: 0 }; ev.fx = 11; continue; } }       // (through the open gap and into the secret chute)
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
    if (!b.air && !(b.cm && b.cy < BALL_R - 0.02)) { const g = hillGrad(hole, b.x, b.z); b.vx -= G * g.x * h; b.vz -= G * g.z * h; if (ctx.tilt && hole.tiltDir) { b.vx += hole.tiltDir.x * ctx.tilt * h; b.vz += hole.tiltDir.z * ctx.tilt * h; } }
    const pt = b.air ? null : patchAt(hole, b);                         // (a patch of ice, mud, caramel, quicksand or a conveyor under the ball)
    if (pt) { if (pt.pull) { const cx = pt.x - b.x, cz = pt.z - b.z, cd = Math.sqrt(cx * cx + cz * cz) || 1; b.vx += (cx / cd) * pt.pull * h; b.vz += (cz / cd) * pt.pull * h; } if (pt.push) { b.vx += pt.ux * pt.push * h; b.vz += pt.uz * pt.push * h; } }
    if (hole.magnets && !b.air) for (const m of hole.magnets) { const dx = m.x - b.x, dz = m.z - b.z, d2 = dx * dx + dz * dz; if (d2 < m.r * m.r && d2 > 0.04) { const pw = magnetState(m, tt).power; if (pw <= 0) continue; const d = Math.sqrt(d2), f = 1 - d / m.r, k = (m.pull * pw * f * (0.4 + 0.6 * f) * h) / d; b.vx += dx * k; b.vz += dz * k; } }        // (a magnet pulls the ball in (or, with a negative pull, pushes it away))
    if (!b.air) for (const rv of hole.rivers) {
      const dx = rv.b.x - rv.a.x, dz = rv.b.z - rv.a.z, l2 = dx * dx + dz * dz; let t = ((b.x - rv.a.x) * dx + (b.z - rv.a.z) * dz) / l2; if (t < -0.05 || t > 1.05) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t; const px = rv.a.x + dx * t - b.x, pz = rv.a.z + dz * t - b.z;
      if (px * px + pz * pz < rv.hw * rv.hw) { const l = Math.sqrt(l2); b.vx += (dx / l) * rv.acc * h; b.vz += (dz / l) * rv.acc * h; }
    }
    if (hero && hero.type === 'turntable' && !ghost) { const dx = b.x - hero.x, dz = b.z - hero.z; if (dx * dx + dz * dz < hero.r * hero.r) { b.vx += (-dz * hero.omega * 2.2 + dx * Math.abs(hero.omega) * 0.5) * h; b.vz += (dx * hero.omega * 2.2 + dz * Math.abs(hero.omega) * 0.5) * h; } }
    if (ctx.drive) { b.vx += b.ax * h; b.vz += b.az * h; }
    let sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (ctx.homing && sp > 0.8) { const cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz); if (cd > 0.05 && cd < 6 && (b.vx * cx + b.vz * cz) / (sp * cd) > 0.5) { const k = (9 * (1 - cd / 6) * h) / cd; b.vx += cx * k; b.vz += cz * k; } }
    let f = b.air || (b.cm && b.cy < BALL_R - 0.02) ? 0 : fric; if (!b.air && inSand(hole, b)) f *= 3.2; if (pt) f *= pt.fric;
    sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (sp > 0 && f > 0) { const ns = Math.max(0, sp - f * h), k = ns / sp; b.vx *= k; b.vz *= k; sp = ns; }
    if (sp > maxV) { const k = maxV / sp; b.vx *= k; b.vz *= k; }
    b.x += b.vx * h; b.z += b.vz * h;
    const cupOn = !ctx.capV && !ghost && hole.cup && (b.cm || (!b.air || b.y - hillH(hole, hole.cup.x, hole.cup.z) < 0.15) && dist2(b, hole.cup.x, hole.cup.z) < (ctx.cupR + BALL_R) * (ctx.cupR + BALL_R));
    if (cupOn && cupStep(b, hole, ctx.cupR, h, hillH(hole, hole.cup.x, hole.cup.z), ev)) { if (b.holed) return; }
    else { // up and down: on the ground the ball follows the surface; if the surface falls away faster than the ball's own path it takes off, then gravity brings it down again
      const H1 = hillH(hole, b.x, b.z);
      if (!b.air) {
        const yb = b.y + b.vy * h - 0.5 * GA * h * h;
        if (H1 < yb - 0.03) { b.air = true; b.y = yb; b.vy -= GA * h; }
        else { b.vy = Math.max(-6, Math.min(6, (H1 - b.y) / h)); b.y = H1; }
      } else {
        b.vy -= GA * h; b.y += b.vy * h;
        if (b.y <= H1) { b.y = H1; b.air = false; b.over = false; b.vy = 0; b.vx *= 0.9; b.vz *= 0.9; if (H1 < -0.7) { b.sunk = true; ev.splash = true; ev.fall = true; return; } }
      }
    }
    // walls, the gate, posts and bumpers (a ghost passes through everything but the outer rails)
    if (hole.gates1 && !ghost) for (const g of hole.gates1) {            // a one-way gate: the ball goes through forwards, but cannot come back
      const rx = b.x - g.x, rz = b.z - g.z, f = rx * g.ux + rz * g.uz, c = rx * g.nx + rz * g.nz, vf = b.vx * g.ux + b.vz * g.uz;
      if (Math.abs(c) < g.hw && f > 0 && f < BALL_R + 0.04 && vf < 0) { b.x += g.ux * (BALL_R + 0.04 - f); b.z += g.uz * (BALL_R + 0.04 - f); b.vx -= 1.4 * vf * g.ux; b.vz -= 1.4 * vf * g.uz; if (-vf > ev.wall) ev.wall = -vf; }
    }
    if (hole.rollers && !ghost) for (const m of hole.rollers) {                  // a roller (the tumbleweed): a ball-sized thing that rolls to and fro across the lane
      const ph = m.w * tt + m.ph, off = m.A * Math.sin(ph), v = m.A * m.w * Math.cos(ph);
      collideCircle(b, m.x + m.nx * off, m.z + m.nz * off, m.rad, 0.95, ev, m.nx * v, m.nz * v);
    }
    if (hole.ghosts && !ghost) for (const g of hole.ghosts) if (((tt + g.phase) % g.period) / g.period < g.duty) collideSeg(b, g.ax, g.az, g.bx, g.bz, 0.5, ev);        // (a ghost wall is solid for part of every period, then fades away)
    for (let j = 0; j < W.length; j++) { const w = W[j]; if (ghost && w[5]) continue; if (w[6] && b.air && b.y - hillH(hole, b.x, b.z) > 0.5) continue; if (b.over && w[4]) continue; collideSeg(b, w[0], w[1], w[2], w[3], wallE, ev, w[8] || 0); }
    if (hole.boosts && !b.air) for (const o of hole.boosts) { if (o.powered && ctx.gateT <= 0) continue; const rx = b.x - o.x, rz = b.z - o.z, s2 = rx * o.ux + rz * o.uz, c2 = rx * -o.uz + rz * o.ux; if (Math.abs(s2) < o.len / 2 && Math.abs(c2) < o.wid / 2) { b.vx += o.ux * 16 * h; b.vz += o.uz * 16 * h; if (b.boostK !== o) { b.boostK = o; ev.fx = 8; } } else if (b.boostK === o) b.boostK = null; }
    if (b.padCool > 0) b.padCool -= h;
    if (hole.pads && !b.air && !(b.padCool > 0)) for (const o of hole.pads) if (onTrigger(hole, o, b)) { b.air = true; b.vy = o.tramp ? 7.4 : 5.0; if (o.tramp) { b.vx += o.ux * 2.6; b.vz += o.uz * 2.6; } b.padCool = 0.6; ev.fx = 6; }
    if (ctx.gateT > 0) ctx.gateT -= h;
    hole.cover = ctx.gateT > 0 ? 1 : 0;                 // (a retractable bridge covers its canyon while the button's time lasts)
    if (hole.feats && !b.air) for (const f of hole.feats) if (f.bridge) { const rx = b.x - f.x, rz = b.z - f.z, s2 = rx * f.ux + rz * f.uz, c2 = rx * f.nx + rz * f.nz; if (Math.abs(s2) < f.len / 2 + 0.5 && c2 > f.c0 && c2 < f.c1 && ctx.gateT > 0) ctx.gateT = Math.max(ctx.gateT, 0.8); }       // (a bridge stays out while a ball is on it)
    if (hole.doors) for (const dr of hole.doors) {
      if (!b.air && onTrigger(hole, dr.button, b)) { if (ctx.gateT <= 0) ev.fx = 7; ctx.gateT = dr.secret ? 12 : 7; }
      if (dr.gate && ctx.gateT <= 0 && !ghost) collideSeg(b, dr.gate[0], dr.gate[1], dr.gate[2], dr.gate[3], 0.5, ev);
    }
    if (hole.cage) {
      const cg = hole.cage, s0 = cg.sides[0], s1 = cg.sides[1]; if (!b.air && inPoly([s0[0], s0[1], s0[2], s0[3], s1[2], s1[3], s1[0], s1[1]], b.x, b.z)) ctx.gateT = Math.max(ctx.gateT, 0.8);           // (the gate never shuts on a ball that is inside the pen)
      if (!b.air && onTrigger(hole, cg.button, b)) { if (ctx.gateT <= 0) ev.fx = 7; ctx.gateT = 7; }
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
      } else if (hero.type === 'slider') {                    // sliding walls: blocks that run across the lane (three round pieces each)
        for (const m of hero.paddles) {
          const ph = hero.w * tt + m.ph, off = hero.A * Math.sin(ph), v = hero.A * hero.w * Math.cos(ph);
          for (const k of [-0.45, 0, 0.45]) collideCircle(b, hero.x + ux * m.du + hero.nx * (off + k), hero.z + uz * m.du + hero.nz * (off + k), hero.rad, 0.9, ev, hero.nx * v, hero.nz * v);
        }
      } else if (hero.type === 'bridge') {                    // a moat under an arched deck: off the deck the ball is in the water
        const rx = b.x - hero.x, rz = b.z - hero.z, a = rx * ux + rz * uz, lat = rx * hero.nx + rz * hero.nz;
        if (!b.air && Math.abs(a) < hero.moatHalf && Math.abs(lat) < hero.hw + 0.35 && hillH(hole, b.x, b.z) < 0.2) { b.sunk = true; ev.splash = true; return; }
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
    // the cup: a ball that rolls over it is not simply caught. Its speed must be low enough for where it crosses (right over the middle it can drop at a brisk roll; near the rim it must be almost still), the rim
    // dips it towards the middle (a ball that does not drop is curved round the hole, may circle it, and can lip out), and a ball that has all but stopped inside the rim falls in. The pinball table keeps the old, generous cup.
    const cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz), sp2 = Math.sqrt(b.vx * b.vx + b.vz * b.vz), cr = ctx.cupR, big = cr / CUP_R;
    if (b.air) continue;
    if (ctx.capV) {
      if (cd < cr && sp2 < ctx.capV * Math.sqrt(big)) { b.capX = b.x; b.capZ = b.z; b.holed = true; ev.holed = true; b.x = hole.cup.x; b.z = hole.cup.z; b.vx = b.vz = 0; return; }
      if (cd < 1.15 * big && sp2 < 4.5 * big) { const k = 7 * (1 - cd / (1.15 * big)) * h / (cd || 1); b.vx += cx * k; b.vz += cz * k; }
    }
  }
  const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz), gg = hillGrad(hole, b.x, b.z), slope = G * Math.sqrt(gg.x * gg.x + gg.z * gg.z);
  _push.x = 0; _push.z = 0; b.inside = ctx.ghost && overlapPush(b, hole, _push);
  if (b.inside) { const l = Math.sqrt(_push.x * _push.x + _push.z * _push.z) || 1; b.vx += (_push.x / l) * 5 * dt; b.vz += (_push.z / l) * 5 * dt; }          // (a ghost that has stopped inside something drifts out of it)
  const ptc = patchAt(hole, b), tiltPull = ctx.tilt || 0, grip = FRICTION * (inSand(hole, b) ? 3.2 : 1) * (ptc ? ptc.fric : 1);                        // (sand holds the ball on a slope that would roll it on grass)
  const calm = !b.loop && !b.rail && !b.chute && !b.air && !b.inside && b.loaded <= 0 && !ctx.drive && !(ptc && ((ptc.push || 0) > grip * 0.9 || ((ptc.pull || 0) > grip * 0.9 && Math.hypot(b.x - ptc.x, b.z - ptc.z) > 0.3))), slow = grip > FRICTION * 1.5;       // (a ball in sand, mud or caramel is held by it: it counts as stopped sooner)
  const hold = Math.min(grip * 0.9, 1.1 * (grip / FRICTION));            // (a ball only stays put on gentle ground, about a one in five slope on turf; sand and mud hold more. On the side of a hill it keeps rolling to the bottom)
  if (s < (slow ? 0.25 : 0.07) && slope + tiltPull < grip * 0.9 && calm) b.still += dt; else b.still = 0;
  if (s < (slow ? 0.5 : 0.2) && slope < hold * 2.2 && tiltPull < grip * 0.9 && calm) b.dawdle = (b.dawdle || 0) + dt; else b.dawdle = 0;       // (barely moving for a second and a half, whatever the slope: it has stopped)
  if (b.still > (slow ? 0.12 : 0.3) || b.dawdle > (slow ? 0.45 : 1.5)) { b.rest = true; b.vx = b.vz = 0; b.dawdle = 0; }
}
