// Plays the pinball phase of Pinball Golf with a simple flip bot (holds the flippers when the ball is rolling down towards them) on many holes, from many release points, and reports what happens:
// how often the ball goes in the cup, drains, comes to rest, or gets stuck. Usage: node tools/golf/pbsim.mjs [--months 12] [--hole 3] [--releases 12]
import { makeHole, courseSeed, holeSeed, heroOrder } from '../../js/golfgen.js';
import { newBall, newCtx, stepBall, collideFlippers, hillH } from '../../js/golfphys.js';
import { prepareTable, stepFlips, isDrained, TILT_PIN, TAU_PIN } from '../../js/pbtable.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : +args[i + 1]; }, MONTHS = opt('months', 12), IDX = opt('hole', 3), REL = opt('releases', 12);
const tally = { holed: 0, drained: 0, rest: 0, stuck: 0, timeout: 0 }; let total = 0, flipsUsed = 0, holedWithFlips = 0; const bad = [];
for (let m = 1; m <= MONTHS; m++) {
  const cs = courseSeed(2026, m), type = heroOrder(cs)[IDX], H = makeHole(holeSeed(cs, IDX), IDX, type), fr = prepareTable(H), ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false };
  const path = H.path, len = path.length;
  for (let r = 0; r < REL; r++) {
    const p = path[Math.floor(len * (0.2 + 0.7 * ((r * 0.618) % 1)))], b = newBall(H); b.x = p.x; b.z = p.z; b.y = hillH(H, b.x, b.z); b.vx = H.tiltDir.x * 1.5; b.vz = H.tiltDir.z * 1.5; b.rest = false;
    const ctx = newCtx(); ctx.capV = 13; ctx.fricK = +(opt('fric', 0.2)); ctx.cupR = 0.6 * 1.35; let t = 0, held = false, heldT = 0, flips = 0, result = 'timeout'; for (const f of fr.flips) f.a = f.restA;
    while (t < 40) {
      const tilt = TILT_PIN * Math.min(1, t / 0.3) * Math.exp(-t / TAU_PIN); ctx.tilt = tilt;
      const u = (b.x - fr.tee.x) * fr.ux + (b.z - fr.tee.z) * fr.uz, lat = (b.x - fr.tee.x) * fr.nx + (b.z - fr.tee.z) * fr.nz, vu = b.vx * fr.ux + b.vz * fr.uz;
      const near = u < 1.2 && u > -2.3 && Math.abs(lat) < 2.6;
      if (!held && near && vu < 0.5 && true) { held = true; heldT = 0; flips++; } if (held && (heldT > 0.28 || !near)) held = false; if (held) heldT += 1 / 60;
      for (let i = 0; i < 4; i++) { const h = 1 / 240; stepFlips(fr.flips, held, h); ctx.t += h; stepBall(b, H, ctx, h, ev); collideFlippers(b, fr.flips); if (ev.holed) break; if (ev.splash || isDrained(fr, b)) { result = 'drained'; break; } }
      t += 1 / 60;
      if (ev.holed) { result = 'holed'; break; } if (result === 'drained') break;
      if (b.rest && t > 1) { const uu = (b.x - fr.tee.x) * fr.ux + (b.z - fr.tee.z) * fr.uz; result = uu < -0.9 ? 'stuck' : 'rest'; break; }
    }
    tally[result]++; total++; flipsUsed += flips; if (result === 'holed') holedWithFlips++;
    if (result === 'stuck') bad.push(`2026-${m} hole ${IDX} release ${r}`);
  }
}
const pc = (n) => `${((n / total) * 100).toFixed(0)}%`;
console.log(`${total} pinball balls on ${MONTHS} tables: in the cup ${pc(tally.holed)}, drained ${pc(tally.drained)}, came to rest ${pc(tally.rest)}, rest on the flippers ${pc(tally.stuck)}, still moving after 40 s ${pc(tally.timeout)}; flips per ball ${(flipsUsed / total).toFixed(1)}`);
if (bad.length) console.log('rest on the flipper area (a putt from there is fine, but check they are not wedged):', bad.slice(0, 6).join(', '));
