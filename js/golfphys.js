// The ball's physics for the mini-golf: pure maths, no THREE. The ball rolls on the hole's gentle hills, slows with friction, bounces off the walls, posts and the
// windmill's base, is held back by the windmill's gate while it is shut, and drops into the cup if it arrives slowly enough.
import { heroBlocked } from './golfgen.js?v=20261024095655';

export const BALL_R = 0.32, CUP_R = 0.6, MAX_V = 15;
const G = 5.0, FRICTION = 2.4, WALL_E = 0.72, POST_E = 0.92, STEP = 1 / 120;

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

export function newBall(hole) { return { x: hole.tee.x + 0.9, z: hole.tee.z, vx: 0, vz: 0, holed: false, rest: true, still: 0 }; }

/** Hit the ball: direction (any length, it is normalised) and power 0..1. */
export function shoot(ball, dx, dz, power) {
  const l = Math.sqrt(dx * dx + dz * dz) || 1, v = 2.5 + power * (MAX_V - 2.5);
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

/**
 * Move the ball on by `dt` seconds (in small fixed steps). `t` is the hole's clock (for the windmill). Fills `ev`: wall (the hardest knock this call),
 * post (the hardest knock on a post), holed (the ball dropped in the cup).
 */
export function stepBall(b, hole, t, dt, ev) {
  ev.wall = 0; ev.post = 0; ev.holed = false;
  if (b.holed) return;
  const n = Math.max(1, Math.ceil(dt / STEP)), h = dt / n, W = hole.walls, hero = hole.hero;
  for (let i = 0; i < n; i++) {
    const g = hillGrad(hole, b.x, b.z); b.vx -= G * g.x * h; b.vz -= G * g.z * h;
    let sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (sp > 0) { const ns = Math.max(0, sp - FRICTION * h), k = ns / sp; b.vx *= k; b.vz *= k; sp = ns; }
    if (sp > MAX_V) { const k = MAX_V / sp; b.vx *= k; b.vz *= k; }
    b.x += b.vx * h; b.z += b.vz * h;
    for (let j = 0; j < W.length; j++) collideSeg(b, W[j][0], W[j][1], W[j][2], W[j][3], WALL_E, ev);
    if (hero && heroBlocked(hero, t + i * h)) collideSeg(b, hero.gate[0], hero.gate[1], hero.gate[2], hero.gate[3], 0.55, ev);
    for (const p of hole.posts) {
      const dx = b.x - p.x, dz = b.z - p.z, rr = BALL_R + p.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d; b.x = p.x + nx * rr; b.z = p.z + nz * rr;
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= (1 + POST_E) * vn * nx; b.vz -= (1 + POST_E) * vn * nz; if (-vn > ev.post) ev.post = -vn; }
      }
    }
    // the cup: it takes a ball that gets there slowly enough, and gently pulls in one that is close and slow
    const cx = hole.cup.x - b.x, cz = hole.cup.z - b.z, cd = Math.sqrt(cx * cx + cz * cz), sp2 = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (cd < CUP_R && sp2 < 7.5) { b.holed = true; ev.holed = true; b.x = hole.cup.x; b.z = hole.cup.z; b.vx = b.vz = 0; return; }
    if (cd < 1.15 && sp2 < 4.5) { const f = 7 * (1 - cd / 1.15) * h / (cd || 1); b.vx += cx * f; b.vz += cz * f; }
  }
  const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz), gg = hillGrad(hole, b.x, b.z), slope = G * Math.sqrt(gg.x * gg.x + gg.z * gg.z);
  if (s < 0.07 && slope < FRICTION * 0.9) b.still += dt; else b.still = 0;
  if (b.still > 0.3) { b.rest = true; b.vx = b.vz = 0; }
}
