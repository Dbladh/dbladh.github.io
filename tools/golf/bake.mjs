// Works out, for the coming months, the layout attempt of every hole that has a hole in one (with its bonuses collectable in that same stroke), and writes js/golfbake.js.
//   node tools/golf/bake.mjs                      2026-1 to 2031-12
//   node tools/golf/bake.mjs --from 2026-1 --months 72
import { writeFileSync } from 'node:fs';
import { findHole, courseSeed, holeSeed, heroOrder, shapeOrder, HOLES } from '../../js/golfgen.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const [fy, fm] = String(opt('from', '2026-1')).split('-').map(Number), N = +opt('months', 72), out = {}; let slow = 0;
for (let k = 0; k < N; k++) {
  const month0 = fy * 12 + (fm - 1) + k, year = Math.floor(month0 / 12), month = (month0 % 12) + 1, cs = courseSeed(year, month), order = heroOrder(cs), shapes = shapeOrder(cs, true);
  for (let i = 0; i < HOLES; i++) { const seed = holeSeed(cs, i), r = findHole(seed, i, order[i], shapes[i]); out[`${seed}.${i}`] = r.attempt * 2 + (r.drop ? 1 : 0); if (r.attempt > 0) slow++; }
  process.stdout.write(`\r${year}-${month} `);
}
const lines = Object.entries(out).map(([k, v]) => `  '${k}': ${v},`).join('\n');
writeFileSync(new URL('../../js/golfbake.js', import.meta.url), `// Worked out ahead of time by \`node tools/golf/bake.mjs\`: for each hole of ${N} months from ${fy}-${fm}, which layout attempt has a hole in one (and whether its bonuses were taken off), so the game need not search.\n// Key: \`\${holeSeed}.\${holeIndex}\`, value: attempt * 2 + (bonuses dropped ? 1 : 0).\nexport const BAKED = {\n${lines}\n};\n`);
console.log(`\nbaked ${Object.keys(out).length} holes (${slow} needed a later attempt)`);
