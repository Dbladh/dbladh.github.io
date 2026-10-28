// Plays the Pinball Golf table with simple bots and reports how it feels: a skill shot (an aimed putt from the tee), then a flip bot (holds the flippers when the ball rolls down to them). Reports how long a ball stays
// in play, how often it reaches the deck (the ramp lamp), drains, and sinks in the cup (assuming the cup is open). Usage: node tools/golf/pbsim.mjs [--balls 200]
import { plainHole, courseSeed, holeSeed } from '../../js/golfgen.js';
import { newBall, newCtx, stepBall, shoot, collideFlippers, hillH } from '../../js/golfphys.js';
import { prepareTable, stepFlips, isDrained, TILT, PLAT_H, TABLE } from '../../js/pbtable.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : +args[i + 1]; }, BALLS = opt('balls', 200);
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const cs = courseSeed(2026, 3), H = plainHole(holeSeed(cs, 8), 8), fr = prepareTable(H); H.bumpers.push(...H.elevated);
const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false }, tally = { drained: 0, holed: 0, timeout: 0 }; let totalT = 0, deck = 0, sumFlips = 0;
for (let n = 0; n < BALLS; n++) {
  const b = newBall(H), ctx = newCtx(); ctx.capV = 13; ctx.fricK = 0.3; ctx.tilt = TILT; ctx.cupR = 0.6 * 1.35;
  const ang = (rnd() - 0.5) * 0.7, pw = 0.55 + rnd() * 0.45; shoot(b, Math.cos(ang), Math.sin(ang), Math.pow(pw, 1.05), false);
  for (const f of fr.flips) f.a = f.restA; let t = 0, held = false, heldT = 0, flips = 0, res = 'timeout', reached = false;
  while (t < 60) {
    const u = (b.x - fr.tee.x), lat = b.z, near = u < 1.2 && u > -2.3 && Math.abs(lat) < 2.6, vu = b.vx;
    if (!held && near && vu < 0.5) { held = true; heldT = 0; flips++; } if (held && (heldT > 0.28 || !near)) held = false; if (held) heldT += 1 / 60;
    for (let i = 0; i < 4; i++) { const h = 1 / 240; stepFlips(fr.flips, held, h); ctx.t += h; stepBall(b, H, ctx, h, ev); collideFlippers(b, fr.flips); if (ev.holed) break; if (isDrained(fr, b)) { res = 'drained'; break; } }
    t += 1 / 60; if (b.y > PLAT_H * 0.9) reached = true; if (ev.holed) { res = 'holed'; break; } if (res === 'drained') break;
    if (b.rest) { b.rest = false; b.vx += 3; }
  }
  tally[res]++; totalT += t; sumFlips += flips; if (reached) deck++;
}
const pc = (k) => `${((k / BALLS) * 100).toFixed(0)}%`;
console.log(`${BALLS} balls: average time in play ${(totalT / BALLS).toFixed(1)} s, reached the deck ${pc(deck)}, in the open cup ${pc(tally.holed)}, drained ${pc(tally.drained)}, still going after 60 s ${pc(tally.timeout)}; flips per ball ${(sumFlips / BALLS).toFixed(1)}`);
