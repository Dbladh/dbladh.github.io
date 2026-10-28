// Checks every Pinball Golf table layout (and its mirror): nothing overlaps or sits against a wall, the lock saucers have a clear shot to the cup, a straight skill shot sinks in the open cup with some aim to spare,
// and each winding ramp can be climbed. Usage: node tools/golf/pbcheck.mjs
import { plainHole, courseSeed, holeSeed } from '../../js/golfgen.js';
import { newBall, newCtx, stepBall, hillH, shoot } from '../../js/golfphys.js';
import { prepareTable, LAYOUTS, TILT, PLAT_H } from '../../js/pbtable.js';

const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9; let t = ((px - ax) * dx + (pz - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (ax + dx * t), pz - (az + dz * t)); };
const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false }; let bad = 0;
for (let li = 0; li < LAYOUTS.length; li++) for (const mirror of [false, true]) {
  const cs = courseSeed(2026, 3), H = plainHole(holeSeed(cs, 8), 8); prepareTable(H, li, mirror); H.bumpers.push(...H.elevated); const notes = [];
  const things = [...H.bumpers.map((b) => ({ n: 'bumper', x: b.x, z: b.z, r: b.r })), ...H.targets.map((t) => ({ n: 'target', x: t.x, z: t.z, r: t.r })), { n: 'spinner', x: H.spinner.x, z: H.spinner.z, r: H.spinner.len + 0.1 }, ...H.saucers.map((s) => ({ n: 'saucer', x: s.x, z: s.z, r: 0.6 }))];
  for (let i = 0; i < things.length; i++) {
    const a = things[i]; for (let j = i + 1; j < things.length; j++) { const b = things[j]; if (a.n === 'bumper' && b.n === 'bumper' && Math.abs(a.x - b.x) < 0.01) continue; if (Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + 0.3) notes.push(`${a.n}/${b.n} too close at ${a.x},${a.z}`); }
    if (a.x < 5.5) for (const w of H.walls) if (segDist(a.x, a.z, w[0], w[1], w[2], w[3]) < a.r + 0.4) { notes.push(`${a.n} at ${a.x},${a.z} touches the wall ${w.slice(0, 4).map((v) => v.toFixed(1))}`); break; }
  }
  if (H.saucers.length < 1) notes.push('no lock saucer with a clear shot');
  const shot = (ang, v) => { const b = newBall(H), ctx = newCtx(); b.vx = Math.cos(ang) * v; b.vz = Math.sin(ang) * v; b.rest = false; ctx.capV = 13; ctx.fricK = 0.3; ctx.tilt = TILT; ctx.cupR = 0.6 * 1.8; ctx.homing = true; for (let t = 0; t < 6 * 240; t++) { stepBall(b, H, ctx, 1 / 240, ev); if (ev.holed) return true; } return false; };
  let hit = 0, n = 0; for (const a of [-0.08, -0.04, 0, 0.04, 0.08]) for (const v of [11, 13]) { n++; if (shot(a, v)) hit++; } if (hit / n < 0.7) notes.push(`skill shot sinks only ${hit}/${n}`);
  H.lanes.slice(2).forEach((L, k) => {
    const b = newBall(H), ctx = newCtx(), p = L.pts, d = [p[3][0] - p[0][0], p[3][1] - p[0][1]], l = Math.hypot(d[0], d[1]); b.x = p[0][0]; b.z = p[0][1]; b.vx = (d[0] / l) * 10; b.vz = (d[1] / l) * 10; b.rest = false; ctx.fricK = 0.3; ctx.tilt = TILT; let top = 0;
    for (let t = 0; t < 8 * 240; t++) { stepBall(b, H, ctx, 1 / 240, ev); if (b.y > top) top = b.y; }
    if (top < PLAT_H * 0.9) notes.push(`side ramp ${k} is not climbable at speed 10 (reached ${top.toFixed(2)})`);
  });
  console.log(`${LAYOUTS[li].name}${mirror ? ' (mirrored)' : ''}: ${notes.length ? notes.join('; ') : 'ok'} [saucers ${H.saucers.length}, skill shot ${hit}/${n}]`); bad += notes.length;
}
console.log(bad ? `${bad} problems` : 'all layouts ok');
