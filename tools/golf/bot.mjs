// A simple putting bot: for each stroke it tries many aims, powers and timings and keeps the best (closest along the corridor to the cup), so it shows whether a hole can be holed out at all.
import { newBall, newCtx, shoot, stepBall } from '../../js/golfphys.js';
import { laneExists } from '../../js/golfgen.js';

/** The plain route round everything (the bot steers by it), or the centre line when none is found. */
export const routeOf = (h) => laneExists(h.path, h.widths, h.ball, h.cup, [...h.ponds.map((p) => p.poly), ...h.sands.map((s) => s.poly)], h.feats || [], [...h.posts, ...h.bumpers], [...h.hero.walls.map((w) => [w[0], w[1], w[2], w[3]]), ...(h.barriers || []).map((b) => [b.a[0], b.a[1], b.b[0], b.b[1]]), ...(h.doors || []).filter((d) => d.gate).map((d) => d.gate)], true) || h.path;

const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false };
function remaining(h, x, z, P) {
 let best = 1e9, rem = 0, acc = 0; const legs = [];
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
  let ball = newBall(h), t = 0, strokes = 0, nan = false; const route = routeOf(h);
  while (strokes < max && !ball.holed) {
    let best = null; const P = route; let k = P.length - 1; const remNow = remaining(h, ball.x, ball.z, P);
    for (let i = 1; i < P.length; i++) { if (remNow > remaining(h, P[i].x, P[i].z, P) + 0.3) { k = i; break; } }
    const target = P[k], base = Math.atan2(target.z - ball.z, target.x - ball.x);
    const search = (span, step, pws, tos) => { for (let da = -span; da <= span + 0.001; da += step) for (const pw of pws) for (let to = 0; to < tos; to += 0.5) {
      const a = base + da, r = sim(h, ball, t + to, Math.cos(a), Math.sin(a), pw);
      if (r.bad) { nan = true; continue; } if (r.b.sunk) continue;
      const score = r.b.holed ? -1 : remaining(h, r.b.x, r.b.z, P);
      if (!best || score < best.score) best = { score, r, to };
    } };
    search(0.35, 0.0875, [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], 3);
    if (!best || best.score > remNow - 0.2) search(1.0, 0.1, [0.2, 0.3, 0.45, 0.6, 0.8, 1], 4);          // (no progress: look wider before giving up on the stroke)
    if (!best) { strokes++; continue; }
    ball = best.r.b; ball.rest = true; t = best.r.t; strokes++;
  }
  return { strokes: ball.holed ? strokes : 99, nan };
}

/** Is a hole in one possible? One stroke from the tee, over many aims, powers and hero timings (aims nearest the plain route's first leg tried first); stops at the first that holes out. Returns { ace, tries }. */
export function aceSearch(h) {
  const route = routeOf(h), t = route[Math.min(3, route.length - 1)], base = Math.atan2(t.z - h.ball.z, t.x - h.ball.x), order = [0];
  for (let k = 1; k <= 90; k++) order.push(k, -k);
  let tries = 0;
  for (const k of order) for (const pw of [0.5, 0.7, 0.9, 0.35, 1.0]) for (const to of [0, 0.7, 1.4, 2.1]) {
    const a = base + (k * 2 * Math.PI) / 180, r = sim(h, newBall(h), to, Math.cos(a), Math.sin(a), pw); tries++;
    if (r.b.holed) return { ace: true, tries };
  }
  return { ace: false, tries };
}
