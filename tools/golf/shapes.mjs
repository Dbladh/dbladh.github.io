// A contact sheet of the hole shapes: for every shape family and hero it reports how often a layout attempt is valid, and prints ASCII thumbnails of holes from many seeds so the variety can be judged
// without playing. Usage: node tools/golf/shapes.mjs [--rate] [--sheet 12] [--shape hairpin]
import { SHAPES, shapeOrder, buildAttempt, courseSeed, holeSeed, heroOrder, HOLES } from '../../js/golfgen.js';
import { HERO_TYPES } from '../../js/golfhero.js';

const args = process.argv.slice(2), has = (k) => args.includes(`--${k}`), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
if (has('rate')) {
  console.log('valid layout attempts out of 200, by shape and hero:'); console.log('shape      ' + HERO_TYPES.map((h) => h.slice(0, 5).padEnd(6)).join(''));
  for (const sh of SHAPES) { let row = sh.padEnd(11); for (const hero of HERO_TYPES) { let ok = 0; for (let a = 0; a < 200; a++) if (buildAttempt(a * 7919 + 13, 4, hero, sh)) ok++; row += String(ok).padEnd(6); } console.log(row); }
}
const W = 46, Hh = 17;
function thumb(h) {
  const g = Array.from({ length: Hh }, () => Array(W).fill(' ')), O = h.outline, sx = (W - 2) / 36, sz = (Hh - 1) / 36, X = (x) => Math.round((x + 18) * sx), Z = (z) => Math.round((z + 18) * sz);
  const inside = (x, z) => { let c = false; for (let i = 0, j = O.length - 1; i < O.length; j = i++) { const a = O[i], b = O[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  for (let r = 0; r < Hh; r++) for (let c = 0; c < W; c++) if (inside(c / sx - 18, r / sz - 18)) g[r][c] = '.';
  for (const p of O) { const c = X(p[0]), r = Z(p[1]); if (g[r]?.[c] !== undefined) g[r][c] = '#'; }
  const t = h.tee, u = h.cup; if (g[Z(t.z)]) { g[Z(t.z)][X(t.x)] = 'T'; g[Z(u.z)][X(u.x)] = 'C'; const hr = h.hero; if (hr && g[Z(hr.z)]) g[Z(hr.z)][X(hr.x)] = 'H'; }
  return g.map((row) => row.join(''));
}
const n = +opt('sheet', 6), only = opt('shape', '');
if (n > 0) {
  for (let m = 1; m <= n; m++) {
    const cs = courseSeed(2026, m), order = heroOrder(cs), shapes = shapeOrder(cs, true), cells = [];
    console.log(`\nmonth 2026-${m}: ${shapes.join(', ')}`);
    for (let i = 0; i < HOLES; i++) {
      let h = null; for (let a = 0; a < 300 && !h; a++) h = buildAttempt((holeSeed(cs, i) + a * 2654435761) >>> 0, i, order[i], only || shapes[i]);
      cells.push(h ? thumb(h) : Array(Hh).fill('(no valid layout)'.padEnd(W)));
    }
    for (let row = 0; row < 3; row++) { for (let r = 0; r < Hh; r++) console.log(cells.slice(row * 3, row * 3 + 3).map((c) => c[r]).join('  |  ')); console.log('-'.repeat(W * 3 + 10)); }
  }
}
