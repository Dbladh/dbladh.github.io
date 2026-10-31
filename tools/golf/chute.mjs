// Tests the secret chutes: how many holes get one, and, for each, rides a ball into the mouth from a spread of speeds and angles and counts how many leave the chute and how many drop into the cup.
//   node tools/golf/chute.mjs [--months 12]
import { readFileSync } from 'node:fs';
import { makeHole, courseSeed, holeSeed, heroOrder, shapeOrder, SHAPES_BAKED, MORE_BAKED, HOLES } from '../../js/golfgen.js';
import { themeOrder, themeOf } from '../../js/golfthemes.js';
import { newBall, newCtx, stepBall } from '../../js/golfphys.js';
const args = process.argv.slice(2), MONTHS = +(args[args.indexOf('--months') + 1] || 12);
const seeds = JSON.parse(readFileSync(new URL('./seeds.json', import.meta.url), 'utf8'));
const ext = (cs, i) => ({ surface: themeOf(themeOrder(cs)[i]).surface, theme: themeOrder(cs)[i], more: MORE_BAKED });
let holes = 0, chutes = 0, rides = 0, left = 0, holed = 0, bad = [];
for (let m = 1; m <= MONTHS; m++) {
  const cs = courseSeed(seeds.year, m), order = heroOrder(cs), shapes = shapeOrder(cs);
  for (let i = 0; i < HOLES - 1; i++) {
    const h = makeHole(holeSeed(cs, i), i, order[i], shapes[i], ext(cs, i)); holes++;
    if (!h || !h.chute) continue; chutes++;
    const C = h.chute, M = C.mouth; let ho = 0, lf = 0, n = 0;
    for (const v of [2, 3, 4.5, 6, 8]) for (const a of [-0.35, -0.15, 0, 0.15, 0.35]) for (const off of [-0.5, 0, 0.5]) {
      const b = newBall(h), ctx = newCtx(), ev = {};
      const ux = M.ux, uz = M.uz, c = Math.cos(a), s = Math.sin(a), dx = ux * c - uz * s, dz = ux * s + uz * c;
      b.x = M.x - ux * 1.2 - uz * off; b.z = M.z - uz * 1.2 + ux * off; b.vx = dx * v; b.vz = dz * v; b.rest = false; ctx.gateT = 5; n++;
      let ent = false;
      for (let t = 0; t < 40 * 60 && !b.holed && !b.sunk && !(b.rest); t++) { ctx.gateT = Math.max(ctx.gateT, 1); stepBall(b, h, ctx, 1 / 60, ev); if (b.chute) ent = true; if (ent && !b.chute && !b.air && Math.abs(b.vx) + Math.abs(b.vz) < 0.01) break; }
      if (!ent) continue; rides++;
      if (b.holed) { holed++; ho++; }
      if (!b.chute) { left++; lf++; } else bad.push(`month ${m} hole ${i}: stuck in chute at v=${v}`);
    }
    console.log(`month ${m} hole ${i}: chute len ${C.len}  rides ${n}  holed ${ho}`);
  }
}
console.log(`\n${chutes} of ${holes} holes have a chute; ${rides} rides entered, ${left} came out, ${holed} holed (${rides ? Math.round(100 * holed / rides) : 0}%)`);
for (const b of bad.slice(0, 10)) console.log(b);
