// Is a hole in one possible? One stroke from the tee, over many aims, powers and hero timings, that holes out (and, when `need` lists bonus points, passes within reach of every one of them).
// The generator uses it so that no hole, and no bonus on a hole, ever needs an extra stroke.
import { newBall, newCtx, shoot, stepBall } from './golfphys.js?v=20261031002621';

const POWERS = [0.5, 0.7, 0.9, 0.35, 1.0], TIMES = [0, 0.9, 1.8];
/** Returns the successful shot { angle, power, t } or null. `base` is the angle to try first (radians); `budget` the most simulated strokes. */
export function aceSearch(H, need, base, budget) {
  const step = need.length ? 1.6 : 3, ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false };
  let tries = 0;
  for (let k = 0; k <= 180 / step; k++) for (const sgn of k === 0 ? [1] : [1, -1]) {
    const a = base + (sgn * k * step * Math.PI) / 180;
    for (const pw of POWERS) for (const t0 of TIMES) {
      if (++tries > budget) return null;
      const b = newBall(H), ctx = newCtx(), got = need.map(() => false); ctx.t = t0; shoot(b, Math.cos(a), Math.sin(a), pw, false);
      for (let n = 0; n < 360 && !b.rest && !b.holed && !b.sunk; n++) {
        stepBall(b, H, ctx, 1 / 60, ev); ctx.t += 1 / 60;
        for (let i = 0; i < need.length; i++) if (!got[i] && (b.x - need[i].x) * (b.x - need[i].x) + (b.z - need[i].z) * (b.z - need[i].z) < 0.3) got[i] = true;
      }
      if (b.holed && got.every(Boolean)) return { angle: a, power: pw, t: t0 };
    }
  }
  return null;
}
