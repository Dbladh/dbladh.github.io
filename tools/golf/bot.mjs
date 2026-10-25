// A simple putting bot: for each stroke it tries many aims, powers and timings and keeps the best (closest along the corridor to the cup), so it shows whether a hole can be holed out at all.
import { newBall, newCtx, shoot, stepBall } from '../../js/golfphys.js';

const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false };
function remaining(h, x, z) {
  const P = h.path; let best = 1e9, rem = 0, acc = 0; const legs = [];
  for (let i = 0; i < P.length - 1; i++) legs.push(Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z));
  const total = legs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < P.length - 1; i++) {
    const dx = P[i + 1].x - P[i].x, dz = P[i + 1].z - P[i].z, l2 = dx * dx + dz * dz; let t = ((x - P[i].x) * dx + (z - P[i].z) * dz) / l2; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (P[i].x + dx * t), z - (P[i].z + dz * t));
    if (d < best) { best = d; rem = total - acc - t * legs[i]; }
    acc += legs[i];
  }
  return rem + best * 0.5;
}
function sim(h, ball, t0, dx, dz, power) {
  const b = { ...ball }; shoot(b, dx, dz, power, false); const ctx = newCtx(); let n = 0; ctx.t = t0;
  while (!b.rest && !b.holed && !b.sunk && n < 1800) { stepBall(b, h, ctx, 1 / 60, ev); ctx.t += 1 / 60; n++; }
  return { b, t: ctx.t, bad: !Number.isFinite(b.x) || !Number.isFinite(b.z) || !Number.isFinite(b.y) };
}
/** Strokes the bot needs to hole out (99 if it never does within `max`), and whether any simulated stroke produced a non-finite position. */
export function playHole(h, max = 16) {
  let ball = newBall(h), t = 0, strokes = 0, nan = false;
  while (strokes < max && !ball.holed) {
    let best = null; const P = h.path; let k = P.length - 1; const remNow = remaining(h, ball.x, ball.z);
    for (let i = 1; i < P.length; i++) { if (remNow > remaining(h, P[i].x, P[i].z) + 0.3) { k = i; break; } }
    const target = P[k], base = Math.atan2(target.z - ball.z, target.x - ball.x);
    for (let da = -0.35; da <= 0.351; da += 0.0875) for (let pw = 0.25; pw <= 1.001; pw += 0.125) for (let to = 0; to < 3; to += 0.5) {
      const a = base + da, r = sim(h, ball, t + to, Math.cos(a), Math.sin(a), pw);
      if (r.bad) { nan = true; continue; } if (r.b.sunk) continue;
      const score = r.b.holed ? -1 : remaining(h, r.b.x, r.b.z);
      if (!best || score < best.score) best = { score, r, to };
    }
    if (!best) { strokes++; continue; }
    ball = best.r.b; ball.rest = true; t = best.r.t; strokes++;
  }
  return { strokes: ball.holed ? strokes : 99, nan };
}
