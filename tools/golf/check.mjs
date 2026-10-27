// Tests the mini-golf's procedural courses: for every hole of many months it checks the layout, that there is always a plain route to the cup, that nothing explodes in a simulated stroke,
// that the generator is deterministic and (with --bot) that a putting bot can hole out. It prints a report grouped by hero and by feature, with seeds to reproduce any failure.
//
//   node tools/golf/check.mjs                  quick: 12 months, no bot
//   node tools/golf/check.mjs --months 36 --bot
//   node tools/golf/check.mjs --only 2026-12:5   one hole (month 12, hole index 5), verbose
import { readFileSync } from 'node:fs';
import { makeHole, courseSeed, holeSeed, heroOrder, shapeOrder, SHAPES_BAKED, HOLES, laneExists } from '../../js/golfgen.js';
import { themeOrder, themeOf } from '../../js/golfthemes.js';
const extOf = (cs, i) => (SHAPES_BAKED ? { surface: themeOf(themeOrder(cs)[i]).surface } : null);
import { newBall, newCtx, shoot, stepBall } from '../../js/golfphys.js';
import { playHole, routeOf } from './bot.mjs';
import { aceSearch } from '../../js/golface.js';
import { TUNING } from '../../js/golfrecipes.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] === undefined || args[i + 1].startsWith('--') ? true : args[i + 1]; };
const seeds = JSON.parse(readFileSync(new URL('./seeds.json', import.meta.url), 'utf8')), YEAR = +opt('year', seeds.year), MONTHS = +opt('months', 12), START = +opt('start', 1), BOT = !!opt('bot', false), ACE = !!opt('ace', false), ONLY = opt('only', null);

const hashOf = (o) => { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const distCl = (h, x, z) => { let best = 1e9; for (let i = 0; i < h.path.length; i++) { const d = Math.hypot(x - h.path[i].x, z - h.path[i].z) - h.widths[i]; if (d < best) best = d; } return best; };      // (negative: inside the corridor)
const distWall = (h, x, z) => { let best = 1e9; for (const w of h.walls) { if (!w[4]) continue; const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz || 1; let t = ((x - w[0]) * dx + (z - w[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; best = Math.min(best, Math.hypot(x - w[0] - dx * t, z - w[1] - dz * t)); } return best; };

/** The structural checks of one hole: an array of problems (empty = fine). */
function structure(h) {
  const bad = [];
  if (h.walls.length < 40 || h.walls.length > 400) bad.push(`wall count ${h.walls.length}`);
  if (distWall(h, h.ball.x, h.ball.z) < 0.45) bad.push('ball starts against a wall');
  if (distWall(h, h.cup.x, h.cup.z) < 0.7) bad.push('cup too near a wall');
  if (distCl(h, h.ball.x, h.ball.z) > -0.4) bad.push('ball starts outside the corridor');
  const segDist = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  for (const rv of h.rivers) if (segDist(h.ball, rv.a, rv.b) < rv.hw + 1.8) bad.push('the ball starts next to a river');
  for (const o of [...h.ponds, ...h.sands, ...h.pads, ...h.boosts, ...h.posts, ...h.bumpers, ...(h.doors || []).map((d) => d.button)]) if (Math.hypot(o.x - h.ball.x, o.z - h.ball.z) < (o.r || 1) + 1.4) bad.push('the ball starts next to an obstacle');
  if (h.hero && Math.hypot(h.hero.x - h.ball.x, h.hero.z - h.ball.z) < 3.0) bad.push('the ball starts beside the hero obstacle');
  const inside = (list, name, m = 0.3) => { for (const p of list) if (distCl(h, p.x, p.z) > -m) bad.push(`${name} outside the corridor at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`); };
  inside(h.posts, 'post'); inside(h.bumpers, 'bumper'); inside(h.pads, 'pad'); inside(h.boosts, 'boost'); inside(h.pickups, 'pickup', 0.35); inside(h.sands, 'sand', 0); inside(h.ponds, 'pond', 0);
  if (h.cage) inside([h.cage.button], 'cage button'); inside((h.doors || []).map((d) => d.button), 'door button');
  const pts = [...h.posts, ...h.bumpers, ...h.pads, ...h.pickups.filter((p) => !p.caged)];
  const nameOf = (p) => (h.posts.includes(p) ? 'post' : h.bumpers.includes(p) ? 'bumper' : h.pads.includes(p) ? 'pad' : 'orb');
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) < 0.6) bad.push(`${nameOf(pts[i])} and ${nameOf(pts[j])} overlap`);
  for (const rc of h.recipes || []) { const l = Math.hypot(rc.F.ux, rc.F.uz); if (!(l > 0.99 && l < 1.01)) bad.push(`recipe ${rc.kind} has a degenerate frame`); }
  const polys = [...h.ponds.map((p) => p.poly), ...h.sands.map((s) => s.poly)];
  if (!laneExists(h.path, h.widths, h.ball, h.cup, polys, h.feats || [], [...h.posts, ...h.bumpers], [...h.hero.walls.map((w) => [w[0], w[1], w[2], w[3]]), ...(h.barriers || []).map((b) => [b.a[0], b.a[1], b.b[0], b.b[1]]), ...(h.doors || []).filter((d) => d.gate).map((d) => d.gate)])) bad.push('no plain route to the cup');
  return bad;
}
/** A ball that ends up inside a cage (the gate was open when it rolled in) must be able to roll out again, whatever the gate does. */
function penEscape(h) {
  if (!h.cage) return true;
  const cg = h.cage, a = cg.sides[0], b = cg.sides[1], cx = (a[0] + a[2] + b[0] + b[2]) / 4, cz = (a[1] + a[3] + b[1] + b[3]) / 4, gx = (cg.gate[0] + cg.gate[2]) / 2, gz = (cg.gate[1] + cg.gate[3]) / 2;
  const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false }, ball = newBall(h), ctx = newCtx(); ball.x = cx; ball.z = cz; const dx = gx - cx, dz = gz - cz; shoot(ball, dx, dz, 0.5, false);
  for (let n = 0; n < 300 && !ball.rest; n++) { stepBall(ball, h, ctx, 1 / 60, ev); ctx.t += 1 / 60; }
  return Math.hypot(ball.x - cx, ball.z - cz) > Math.hypot(dx, dz) + 0.2;                    // (it got past the gate)
}
/** Does a stroke from the tee in six directions and a few powers stay finite (no NaN, nothing flung out of the hole)? */
function sane(h) {
  const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false };
  for (let k = 0; k < 6; k++) for (const pw of [0.3, 0.7, 1]) {
    const b = newBall(h), ctx = newCtx(), a = (k / 6) * 6.2832 + 0.3; shoot(b, Math.cos(a), Math.sin(a), pw, false);
    for (let n = 0; n < 480 && !b.rest && !b.holed && !b.sunk; n++) { stepBall(b, h, ctx, 1 / 60, ev); ctx.t += 1 / 60; if (!Number.isFinite(b.x + b.z + b.y)) return false; if (Math.hypot(b.x, b.z) > 40) return false; }
  }
  return true;
}

const recipeStats = {}, rows = [], t0 = Date.now(), groups = { hero: {}, feat: {} };
const bump = (g, k, field) => { const o = (g[k] ||= { n: 0, bad: 0, botFail: 0, strokes: 0, botN: 0 }); o[field]++; return o; };
function runHole(year, month, i) {
  const cs = courseSeed(year, month), type = heroOrder(cs)[i], shp = shapeOrder(cs)[i], seed = holeSeed(cs, i), h = makeHole(seed, i, type, shp, extOf(cs, i)), problems = structure(h);
  if (hashOf(h) !== hashOf(makeHole(seed, i, type, shp, extOf(cs, i)))) problems.push('not deterministic');
  if (!sane(h)) problems.push('a stroke went non-finite or out of the hole');
  if (!penEscape(h)) problems.push('a ball inside the cage cannot get out');
  if (ACE) { const rt = routeOf(h), t = rt[Math.min(3, rt.length - 1)]; if (!aceSearch(h, [], Math.atan2(t.z - h.ball.z, t.x - h.ball.x), 4000)) problems.push('no hole in one found (4000 strokes tried)'); }
  let strokes = null;
  if (BOT) { const r = playHole(h); strokes = r.strokes; if (r.nan) problems.push('bot stroke non-finite'); if (strokes > 8) problems.push(`bot needs ${strokes === 99 ? 'more than 16' : strokes} strokes`); }
  const tags = [...(h.recipes || []).map((x) => `recipe:${x.kind}`), h.cage && 'cage', h.boosts.length && 'boost', h.pads.length && 'pad', (h.feats || []).some((f) => f.t === 'gap') && 'canyon', (h.feats || []).some((f) => f.t === 'plat') && 'platform', (h.feats || []).some((f) => f.t === 'berm') && 'berm', h.sands.length && 'sand', h.ponds.length && 'pond', h.rivers.length && 'river'].filter(Boolean);
  const he = bump(groups.hero, type, 'n'); if (problems.length) he.bad++; if (strokes !== null) { he.botN++; he.strokes += Math.min(strokes, 20); if (strokes > 8) he.botFail++; }
  for (const t of tags) { const o = bump(groups.feat, t, 'n'); if (problems.length) o.bad++; if (strokes !== null) { o.botN++; o.strokes += Math.min(strokes, 20); if (strokes > 8) o.botFail++; } }
  for (const l of h.recipeLog || []) { const o = (recipeStats[l.kind] ||= { placed: 0, dropped: {}, forg: [] }); o.dropped[l.out] = (o.dropped[l.out] || 0) + 1; }
  for (const x of h.recipes || []) { const o = (recipeStats[x.kind] ||= { placed: 0, dropped: {}, forg: [] }); o.placed++; o.forg.push(x.forgiveness); (o.nec ||= []).push(x.necessity); }
  rows.push({ year, month, i, type, tags, problems, strokes });
  return { h, problems, tags, strokes };
}

if (opt('tune', false)) {                                  // sweep the numbers the recipes are built from and report how each choice does (placed, forgiveness, how much the machine matters)
  const grids = { 'runup.gap': [2.0, 2.6, 3.2], 'rail.gap': [2.0, 2.8, 3.6, 4.4], 'bridge.gap': [2.4, 3.2, 4.0] }, months = +opt('months', 24);
  for (const key of Object.keys(grids)) {
    const [kind, field] = key.split('.'), keep = TUNING[kind][field]; console.log(`\n${key} (current ${keep})`);
    for (const v of grids[key]) {
      TUNING[kind][field] = v; let placed = 0, forg = 0, nec = 0, drop = 0;
      for (let m = 1; m <= months; m++) { const cs = courseSeed(YEAR, m), order = heroOrder(cs), shp = shapeOrder(cs); for (let i = 2; i < HOLES; i++) { const h = makeHole(holeSeed(cs, i), i, order[i], shp[i], extOf(cs, i)); for (const x of h.recipes) if (x.kind === kind) { placed++; forg += x.forgiveness; nec += x.necessity; } for (const l of h.recipeLog) if (l.kind === kind) drop++; } }
      console.log(`  ${field} = ${String(v).padEnd(4)} placed ${String(placed).padStart(3)}  forgiveness ${placed ? (forg / placed * 100).toFixed(0) : '-'}%  machine needed ${placed ? (nec / placed * 100).toFixed(0) : '-'}%  dropped ${drop}`);
    }
    TUNING[kind][field] = keep;
  }
  process.exit(0);
}
if (ONLY) {
  const [ym, hi] = String(ONLY).split(':'), [y, m] = ym.includes('-') ? ym.split('-').map(Number) : [YEAR, +ym], r = runHole(y, m, +hi);
  console.log(`${y}-${m} hole ${hi}: ${r.h.type} [${r.tags.join(', ')}] par ${r.h.par} bot ${r.strokes ?? 'off'} -> ${r.problems.length ? r.problems.join('; ') : 'ok'}`);
  process.exit(r.problems.length ? 1 : 0);
}
for (const s of seeds.regress) runHole(seeds.year, s.month, s.hole);
const regressN = rows.length;
for (let m = START; m < START + MONTHS; m++) for (let i = 0; i < HOLES; i++) runHole(YEAR, m, i);

const fails = rows.filter((r) => r.problems.length), pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
console.log(`checked ${rows.length} holes (${regressN} regression seeds + ${MONTHS} months from ${YEAR}-${START}) in ${((Date.now() - t0) / 1000).toFixed(1)} s${BOT ? ' with the bot' : ''}`);
const table = (title, g) => { console.log(`\n${title}`); for (const k of Object.keys(g).sort()) { const o = g[k]; console.log(`  ${k.padEnd(11)} ${String(o.n).padStart(4)} holes  problems ${pct(o.bad, o.n).padStart(6)}${BOT ? `  bot avg ${(o.strokes / (o.botN || 1)).toFixed(2)}  slow/stuck ${pct(o.botFail, o.botN)}` : ''}`); } };
table('By hero obstacle', groups.hero); table('By feature present', groups.feat);
console.log('\nMachine recipes (placed / dropped and why / average forgiveness = share of the 8 test powers that work)');
for (const k of Object.keys(recipeStats).sort()) { const o = recipeStats[k]; console.log(`  ${k.padEnd(7)} placed ${String(o.placed).padStart(3)}  forgiveness ${o.forg.length ? (o.forg.reduce((a, b) => a + b, 0) / o.forg.length * 100).toFixed(0) + '%' : '-'}  machine needed ${o.nec && o.nec.length ? (o.nec.reduce((a, b) => a + b, 0) / o.nec.length * 100).toFixed(0) + '%' : '-'}  dropped ${JSON.stringify(o.dropped)}`); }
console.log(`\n${fails.length} of ${rows.length} holes have problems`);
for (const r of fails.slice(0, 25)) console.log(`  ${r.year}-${r.month} hole ${r.i} ${r.type} [${r.tags.join(', ')}]: ${r.problems.join('; ')}   (node tools/golf/check.mjs --only ${r.year}-${r.month}:${r.i} --bot)`);
process.exit(fails.length ? 1 : 0);
