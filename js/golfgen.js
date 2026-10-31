// The mini-golf holes, made from a seed. This file is pure data (no THREE) and deterministic: the same seed gives the same hole on every device.
// To keep that true it uses only the seeded integer generator and + - * / sqrt (never Math.random, sin, cos or pow in the layout), and rounds every point to half a unit.
//
// A hole is a winding corridor across the lawn: straight legs joined by rounded bends (the hero obstacle sits on a straight run), a round tee green and a round cup green, chambers
// where the corridor swells, walls offset from the centre line, gentle hills, water (a river that carries the ball, or a pond), posts, bumpers, sand, and a couple of power-up orbs placed off the best line.
// Local coordinates: x runs left to right, z toward the viewer, the course's centre is (0, 0), and the lawn is at height 0.
import { mulberry32, heroOrder, buildHero, NEED } from './golfhero.js?v=20261030220955';
import { placeRecipes, removeRecipe, proveRecipe, necessityOf } from './golfrecipes.js?v=20261030220955';
import { aceSearch } from './golface.js?v=20261030220955';
import { makeChute } from './golfchute.js?v=20261030220955';
import { hillH } from './golfphys.js?v=20261030220955';
import { BAKED } from './golfbake.js?v=20261030220955';
export { mulberry32, heroOrder };

export const HOLES = 9;
export const POWERUPS = ['homing', 'ghost', 'multi', 'hamster', 'mega', 'turbo', 'bounce', 'freeze', 'safety'];
const POWER_WEIGHTS = [3, 2, 2, 1.5, 2, 2, 2, 2, 2];
const HALF_W = 2.3;                                       // half the corridor width
const PAD_R = 2.9;                                        // the round tee and cup greens
const END_X = 11.5, REACH = 12.4;                         // where the centre line starts and ends, and how far from the centre it may go
const WALL_REACH = 16.2;                                  // nothing of the hole may be further than this from its centre
const SPACING = 0.6, CUT_MAX = 2.6;                       // distance between centre-line points; the most a bend cuts off a leg
const C15 = 0.9659258262890683, S15 = 0.25881904510252074;     // cos and sin of 15 degrees: arcs are built by turning by this a fixed number of times, so no trig is needed
const CAP_STEPS = 6;
const smoothstep01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---- the shapes of a hole's centre line ----
// A hole's corridor follows one of a few shape families (so a course is not nine Ls): a straight run, a dogleg, an S, a zigzag across the lawn, a hairpin, a sweeping arc, a staircase and a ring round an
// island. Each family is a list of legs (a turn in 15 degree steps, then a length) walked from the start; the rounded bends, the widths, the walls and everything else are built from that as before.
export const SHAPES = ['straight', 'dogleg', 'wide', 'sbend', 'chicane', 'zigzag', 'arc'];
const SHAPE_POOLS = [['straight', 'dogleg', 'sbend', 'arc', 'zigzag'], ['dogleg', 'sbend', 'zigzag', 'arc', 'chicane', 'wide'], ['chicane', 'wide', 'zigzag', 'arc', 'straight', 'dogleg']];   // (holes 1-3, 4-6, 7-9)
/** Which shape each of the nine holes has this month: drawn without repeats from a pool per tier, shuffled with the course seed. */
export const SHAPES_BAKED = true;
export const MORE_BAKED = true;                            // (the sliding-wall and bridge heroes, ghost walls and fork islands: random courses only until golfbake.js has been worked out with them)
export function shapeOrder(cs, all = SHAPES_BAKED) {
  if (!all) return Array(9).fill('zigzag');
  const r = mulberry32((cs + 0x2f1d3a7) >>> 0), out = [];
  for (let t = 0; t < 3; t++) {
    const pool = SHAPE_POOLS[t].filter((s) => !out.includes(s)), all = SHAPE_POOLS[t].slice();
    for (let k = 0; k < 3; k++) { const from = pool.length ? pool : all.filter((s) => !out.slice(-2).includes(s)); const i = (r() * from.length) | 0, pick = from[i]; out.push(pick); if (pool.length) pool.splice(i, 1); }
  }
  return out;
}
const DIRS = (() => { const d = []; let c = 1, s = 0; for (let i = 0; i < 24; i++) { d.push([c, s]); const nc = c * C15 - s * S15; s = s * C15 + c * S15; c = nc; } return d; })();      // (24 headings, 15 degrees apart, by repeated turning: no trig)
const CUT_BY = { straight: 0, dogleg: 2.8, wide: 3.6, sbend: 1.6, chicane: 2.4, zigzag: CUT_MAX, arc: 1.5 };
const MIN_DOT = { dogleg: 0.0, wide: -0.1 };       // (a gentle bend has the legs' directions close; the sharpest allowed is about 90 degrees)
/** Walk legs [[turn, length], ...] from the origin at heading `k0` and centre the result. Returns the path ([{ x, z }]) or null if it strays too far from the middle. */
function walkLegs(k0, legs) {
  let k = k0, x = 0, z = 0; const pts = [{ x, z }];
  for (const [turn, len] of legs) { k = (k + turn + 48) % 24; x += DIRS[k][0] * len; z += DIRS[k][1] * len; pts.push({ x, z }); }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, out = pts.map((p) => ({ x: q(p.x - cx), z: q(p.z - cz) }));
  for (const p of out) if (p.x * p.x + p.z * p.z > REACH * REACH) return null;
  return out;
}
/** The centre line for `shape`: { path, minDot, cutMax }. `need` is the straight run the hero wants. */
function makePath(r, index, type, shape, force) {
  if (force) return { path: [{ x: -END_X, z: 0 }, { x: END_X, z: 0 }], minDot: 0.18, cutMax: CUT_MAX };
  const need = NEED[type] || 8, cutMax = CUT_BY[shape] ?? CUT_MAX, minDot = MIN_DOT[shape] ?? 0.18, long = need + 2 * cutMax + 0.6;
  if (shape === 'zigzag') {                                // the first kind of hole, across the lawn with one to three bends (drawn in exactly the old order, so the baked months still hold)
    const bends = index < 2 ? 1 + (r() < 0.4 ? 1 : 0) : 1 + (r() < 0.5 ? 1 : 0) + (index > 5 && r() < 0.2 ? 1 : 0), xs = [-END_X];
    for (let k = 1; k <= bends; k++) xs.push(q(-END_X + ((2 * END_X) * k) / (bends + 1) + (r() - 0.5) * (bends === 1 ? 4 : 2.2)));
    xs.push(END_X);
    let sign = r() < 0.5 ? 1 : -1, z = q((r() * 2 - 1) * 4.5); const path = [];
    for (let i = 0; i < xs.length; i++) { if (i > 0) { z = q(clamp(z + sign * (3.5 + r() * 3.5), -6.5, 6.5)); sign = -sign; } if (xs[i] * xs[i] + z * z > REACH * REACH) return null; path.push({ x: xs[i], z }); }
    return { path, minDot, cutMax };
  }
  const sgn = r() < 0.5 ? 1 : -1, k0 = (r() * 24) | 0, rng = (a, b) => a + r() * (b - a), L = (a, b) => Math.max(a, Math.min(b, rng(a, b)));
  let legs;
  if (shape === 'straight') legs = [[0, Math.min(23, Math.max(rng(16, 22.5), need + 3))]];
  else if (shape === 'dogleg') { legs = [[0, rng(7, 12)], [sgn * (3 + ((r() * 2) | 0)), rng(7, 12)]]; const i = r() < 0.5 ? 0 : 1; legs[i][1] = Math.max(long, legs[i][1]); }
  else if (shape === 'sbend') { const t = 1 + ((r() * 2) | 0); legs = [[0, rng(5.8, 7)], [sgn * t, long + r() * 1.5], [-sgn * t, rng(5.8, 7)]]; }
  else if (shape === 'wide') { legs = [[0, rng(7, 12)], [sgn * 5, rng(7, 12)]]; const i = r() < 0.5 ? 0 : 1; legs[i][1] = Math.max(long, legs[i][1]); }
  else if (shape === 'chicane') { legs = [[0, rng(6, 8)], [sgn * 3, long + r()], [-sgn * 3, rng(6, 8)]]; }
  else if (shape === 'arc') { const t = 1 + ((r() * 2) | 0); legs = [[0, rng(5.8, 7)], [sgn * t, long + r() * 1.5], [sgn * t, rng(5.8, 7)]]; }
  const path = walkLegs(k0, legs); return path ? { path, minDot, cutMax } : null;
}

/** The seed of a whole course: the same for everyone in a given month (`month` is 1 to 12). */
export function courseSeed(year, month) {
  let h = Math.imul((year * 12 + month) | 0, 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return h >>> 0;
}
/** The seed of hole `i` (0 to 8) of a course. */
export function holeSeed(cs, i) {
  let h = (cs ^ Math.imul(i + 1, 0x7f4a7c15)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; return (h ^ (h >>> 16)) >>> 0;
}

/** An irregular pond outline round (x, z) as a flat list [x0, z0, ...]: 16 points whose radius wanders between r and 1.18 r. Only + - * and the seeded generator, so it is the same everywhere. */
function blobPoly(x, z, r, seed) {
  const rng = mulberry32(seed), n = 16, raw = []; for (let i = 0; i < n; i++) raw.push(rng());
  const poly = []; let c = 1, s = 0; const C = 0.9238795325112867, S = 0.3826834323650898;      // turn by 22.5 degrees each step
  for (let i = 0; i < n; i++) {
    const rad = r * (1 + 0.18 * ((raw[(i + n - 1) % n] + 2 * raw[i] + raw[(i + 1) % n]) / 4));
    poly.push(x + c * rad, z + s * rad);
    const nc = c * C - s * S; s = s * C + c * S; c = nc;
  }
  return poly;
}
/** An outline for a sand pit round (x, z), flat [x0, z0, ...] (24 points): an oval, a peanut, a banana, a rounded triangle or a lumpy blob, turned to face (ox, oz). Only + - * and sqrt-free polynomials. */
function sandPoly(kind, x, z, rad, ox, oz, seed) {
  const rng = mulberry32(seed), pts = []; let c = 1, s = 0; const C = 0.9659258262890683, S = 0.25881904510252074, lump = []; for (let i = 0; i < 24; i++) lump.push(rng());
  for (let i = 0; i < 24; i++) {
    let px, py; const bump = 1 + 0.26 * (lump[i] - 0.5);
    if (kind === 0) { px = c * rad * 1.2; py = s * rad * 1.0; }                                  // a plump rounded blob
    else if (kind === 1) { px = c * rad * 1.3; py = s * rad * (0.75 + 0.3 * c * c); }             // a fat peanut
    else if (kind === 2) { px = c * rad * 1.35; py = s * rad * 0.85 + 0.08 * (px * px) / rad - 0.3 * rad; }   // a kidney
    else if (kind === 3) { const rr = rad * (1 + 0.28 * (4 * c * c * c - 3 * c)); px = c * rr; py = s * rr; }   // a rounded triangle
    else { const rr = rad * (1 + 0.45 * lump[i]); px = c * rr; py = s * rr; }                       // a lumpy blob
    pts.push(x + (px * ox - py * oz) * bump, z + (px * oz + py * ox) * bump);
    const nc = c * C - s * S; s = s * C + c * S; c = nc;
  }
  return pts;
}
/** Is (x, z) inside the flat polygon [x0, z0, ...]? */
function inPolyG(poly, x, z) {
  let inside = false; const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) { const xi = poly[i * 2], zi = poly[i * 2 + 1], xj = poly[j * 2], zj = poly[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; }
  return inside;
}
/** What the ball cannot roll through when going round everything (with room to spare): outside the corridor, pits, ponds, posts and bumpers, canyons, and the barrier walls of a chicane. */
function makeBlocked(cl, w, polys, feats, discs, segs) {
  const off = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]];
  return (x, z) => {
    let best = 1e9; for (let i = 0; i < cl.length; i++) { const d = Math.sqrt((x - cl[i].x) * (x - cl[i].x) + (z - cl[i].z) * (z - cl[i].z)) - w[i]; if (d < best) best = d; }
    if (best > -0.55) return true;
    for (const p of polys) for (const [a, b] of off) if (inPolyG(p, x + a, z + b)) return true;
    for (const d of discs) if ((x - d.x) * (x - d.x) + (z - d.z) * (z - d.z) < (d.r + 0.4) * (d.r + 0.4)) return true;
    for (const f of feats) if (f.t === 'gap') { const rx = x - f.x, rz = z - f.z, s2 = rx * f.ux + rz * f.uz, c = rx * f.nx + rz * f.nz; if (Math.abs(s2) < f.len / 2 + 0.35 && c > f.c0 - 0.35 && c < f.c1 + 0.35) return true; }
    for (const g of segs) { const dx = g[2] - g[0], dz = g[3] - g[1], l2 = dx * dx + dz * dz || 1; let t = ((x - g[0]) * dx + (z - g[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = x - g[0] - dx * t, ez = z - g[1] - dz * t; if (ex * ex + ez * ez < 0.2025) return true; }
    return false;
  };
}
/**
 * Is there a clear way from the ball to the cup that goes round every pit, pond, canyon and barrier (with room for the ball to roll)? A flood fill over a grid (the plain route).
 * With `wantPath`, returns the route instead ({ x, z } waypoints about a unit apart, or null).
 */
export function laneExists(cl, w, ball, cup, polys, feats, discs = [], segs = [], wantPath = false) {
  const D = 0.2, blocked = makeBlocked(cl, w, polys, feats, discs, segs);
  const key = (x, z) => Math.round(x / D) * 4096 + Math.round(z / D), sx = Math.round(ball.x / D) * D + 0.0001, sz = Math.round(ball.z / D) * D + 0.0001, seen = new Map([[key(sx, sz), null]]); let st = [[sx, sz]];
  while (st.length) {                                       // (breadth first, so the route found is a shortest one)
    const next = [];
    for (const [x, z] of st) {
      if ((x - cup.x) * (x - cup.x) + (z - cup.z) * (z - cup.z) < 0.25) {
        if (!wantPath) return true;
        const out = []; let c = [x, z]; while (c) { out.push({ x: c[0], z: c[1] }); c = seen.get(key(c[0], c[1])); }
        out.reverse(); const path = [out[0]]; for (let i = 1; i < out.length; i++) if (Math.hypot(out[i].x - path[path.length - 1].x, out[i].z - path[path.length - 1].z) >= 1.0) path.push(out[i]); path.push({ x: cup.x, z: cup.z }); return path;
      }
      for (const [a, b] of [[D, 0], [-D, 0], [0, D], [0, -D]]) { const nx = x + a, nz = z + b, k = key(nx, nz); if (seen.has(k) || blocked(nx, nz)) continue; seen.set(k, [x, z]); next.push([nx, nz]); }
    }
    st = next;
  }
  return wantPath ? null : false;
}
const q = (v) => Math.round(v * 2) / 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The seed of attempt number `a` for a hole. */
const attemptSeed = (seed, a) => (seed + Math.imul(a, 0x9e3779b1)) >>> 0;
/** The shape tried at attempt `a`: the one the course asked for for the first 40 attempts, then simpler ones that the hero is sure to fit (so every hole is always found). */
const FALLBACK = { straight: ['zigzag'], dogleg: ['zigzag', 'straight'], zigzag: ['dogleg', 'straight'] };
const attemptShape = (shape, a) => { const chain = [shape, ...(FALLBACK[shape] || ['dogleg', 'zigzag', 'straight'])]; return chain[Math.min(chain.length - 1, (a / 40) | 0)]; };
/**
 * Find the layout of hole `index` the slow way: try neighbouring sub-seeds until one is valid and has a hole in one (see holeInOnePossible). Returns { h, attempt, drop } where `drop` says
 * whether the bonuses had to be taken off. The results for the coming years are worked out ahead of time (tools/golf/bake.mjs) and kept in golfbake.js, so the game does not have to search.
 */
export function findHole(seed, index, type = 'windmill', shape = 'zigzag', ext = null) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const h = build(attemptSeed(seed, attempt), index, type, false, attemptShape(shape, attempt), ext); if (!h) continue;
    const res = holeInOnePossible(h); if (res) return { h, attempt, drop: res === 2 };
  }
  for (let attempt = 0; attempt < 40; attempt++) {         // (it should never come to this) a plain straight hole
    const h = build(attemptSeed(seed, attempt), index, type, true); if (h) return { h, attempt: 1000 + attempt, drop: false };
  }
  throw new Error('no valid mini-golf hole');
}
/** Just build one attempt (for the shape sheet and tests): a hole or null. */
export const buildAttempt = (seed, index, type, shape) => build(seed, index, type, false, shape);
/** A plain straight hole, found at once (no hole-in-one search): for things that only want a hole's defaults, like the pinball table. */
export function plainHole(seed, index, type = 'windmill') { for (let a = 0; a < 60; a++) { const h = build(attemptSeed(seed, a), index, type, true); if (h) return h; } throw new Error('no plain hole'); }
/** Make hole number `index` (0-based) with hero `type` (from the baked answer when there is one, else by searching). */
export function makeHole(seed, index, type = 'windmill', shape = 'zigzag', ext = null) {
  const baked = BAKED[`${seed}.${index}`];
  let h = null;
  if (baked !== undefined) { h = build(attemptSeed(seed, baked >> 1), index, type, false, attemptShape(shape, baked >> 1), ext); if (h && baked & 1) dropBonuses(h); }
  if (!h) h = findHole(seed, index, type, shape, ext).h;
  if (ext) makeChute(h, mulberry32((seed ^ 0x6a09e667) >>> 0));          // (a secret chute on about one hole in three: added last, once the hole is known to be good)
  return h;
}

/** Take the bonuses that need a trick (the secret coin, the caged orb) off a hole: they stay only where one stroke can collect them and still hole out. */
function dropBonuses(H) {
  for (const rc of H.recipes.filter((r) => r.kind === 'secret' || r.kind === 'pocket')) { removeRecipe(H, rc.rid); H.recipes.splice(H.recipes.indexOf(rc), 1); }
  if (H.cage) { H.cage = null; for (let i = H.walls.length - 1; i >= 0; i--) if (H.walls[i][7] === 'cage') H.walls.splice(i, 1); for (const p of H.pickups) p.caged = false; }
}
/** The start area (the ball, the two pegs either side and the mat) must be flat open ground on the course: inside the outline with room to spare, level, and clear of sand, water, posts, bumpers, machines, magnets and surface patches. */
function teeClear(H) {
  const O = H.outline.flat(), b = H.ball, polys = [...H.sands.map((s) => s.poly), ...H.ponds.map((p) => p.poly), ...(H.patches || []).map((p) => p.poly)];
  const pts = [[b.x, b.z]]; for (const r of [0.6, 1.2]) for (let k = 0; k < 12; k++) pts.push([b.x + Math.cos(k * 0.5236) * r, b.z + Math.sin(k * 0.5236) * r]);
  for (const [x, z] of pts) { if (!inPolyG(O, x, z)) return false; if (Math.abs(hillH(H, x, z)) > 0.1) return false; if (polys.some((pl) => inPolyG(pl, x, z))) return false; }
  for (const o of [...H.posts, ...H.bumpers, ...H.pads, ...H.boosts, ...(H.doors || []).map((d) => d.button), ...(H.magnets || [])]) if (o && Math.hypot(o.x - b.x, o.z - b.z) < (o.r || 1) + 1.6) return false;
  for (const w of H.walls) { const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz || 1; let t = ((b.x - w[0]) * dx + (b.z - w[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; if (Math.hypot(b.x - w[0] - dx * t, b.z - w[1] - dz * t) < 1.05) return false; }
  return true;
}
/** The floor triggers (boost strips, bounce pads, buttons) must lie wholly on the course and clear of sand, water, posts and bumpers: a strip is made narrower until its corners are inside the outline, and a trigger that still touches something goes (with its whole machine). */
function tidyTriggers(H) {
  const O = H.outline.flat(), polys = [...H.sands.map((s) => s.poly), ...H.ponds.map((p) => p.poly)], solid = [...H.posts, ...H.bumpers];
  const bad = (x, z, m) => polys.some((pl) => inPolyG(pl, x, z)) || solid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + m);
  const rect = (o, wid) => { const pts = [], nx = -o.uz, nz = o.ux; for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, 0, 1]) pts.push([o.x + o.ux * a * o.len / 2 + nx * b * wid / 2, o.z + o.uz * a * o.len / 2 + nz * b * wid / 2]); return pts; };
  const disc = (o, r) => { const pts = [[o.x, o.z]]; for (let k = 0; k < 8; k++) pts.push([o.x + Math.cos(k * 0.7854) * r, o.z + Math.sin(k * 0.7854) * r]); return pts; };
  const drop = new Set(), dropCage = [];
  for (const b of H.boosts) { let wid = b.wid; while (wid > 0.5 && !rect(b, wid + 0.25).every((p) => inPolyG(O, p[0], p[1]))) wid -= 0.1; b.wid = Math.round(wid * 10) / 10; if (!rect(b, b.wid + 0.25).every((p) => inPolyG(O, p[0], p[1])) || rect(b, b.wid).some((p) => bad(p[0], p[1], 0.25))) drop.add(b); }
  for (const pd of H.pads) if (!disc(pd, pd.r + 0.1).every((p) => inPolyG(O, p[0], p[1])) || disc(pd, pd.r + 0.1).some((p) => bad(p[0], p[1], 0.2))) drop.add(pd);
  for (const d of H.doors) if (d.button && (!disc(d.button, d.button.r + 0.1).every((p) => inPolyG(O, p[0], p[1])) || disc(d.button, d.button.r + 0.1).some((p) => bad(p[0], p[1], 0.2)))) drop.add(d);
  if (H.cage && (!disc(H.cage.button, 0.65).every((p) => inPolyG(O, p[0], p[1])) || disc(H.cage.button, 0.65).some((p) => bad(p[0], p[1], 0.2)))) dropCage.push(1);
  for (const o of drop) { if (o.rid) { removeRecipe(H, o.rid); const i = H.recipes.findIndex((r) => r.rid === o.rid); if (i >= 0) H.recipes.splice(i, 1); H.recipeLog.push({ kind: 'trigger', out: 'overlaps the course edge or an obstacle' }); } else for (const k of ['boosts', 'pads', 'doors']) { const i = H[k].indexOf(o); if (i >= 0) H[k].splice(i, 1); } }
  if (dropCage.length) { H.cage = null; for (let i = H.walls.length - 1; i >= 0; i--) if (H.walls[i][7] === 'cage') H.walls.splice(i, 1); for (const p of H.pickups) p.caged = false; }
}
/** A hole in one must always be possible, with every bonus collected on the way: bonuses that would need extra strokes are removed, and a hole with no ace at all is rejected (a new layout is tried). */
function holeInOnePossible(H) {
  const route = laneExists(H.path, H.widths, H.ball, H.cup, [...H.ponds.map((p) => p.poly), ...H.sands.map((s) => s.poly)], H.feats, [...H.posts, ...H.bumpers], [...H.hero.walls.map((w) => [w[0], w[1], w[2], w[3]]), ...H.barriers.map((b) => [b.a[0], b.a[1], b.b[0], b.b[1]]), ...H.doors.filter((d) => d.gate).map((d) => d.gate)], true);
  const toward = (p) => Math.atan2(p.z - H.ball.z, p.x - H.ball.x), need = H.pickups.filter((p) => p.type === 'coin' || p.caged).map((p) => ({ x: p.x, z: p.z }));
  let dropped = false; if (need.length && !aceSearch(H, need, toward(need[0]), 400)) { dropBonuses(H); dropped = true; }
  return aceSearch(H, [], toward(route ? route[Math.min(3, route.length - 1)] : H.cup), 500) ? (dropped ? 2 : 1) : 0;
}
/** The arc round the end of a corridor: rows of [leftX, leftZ, rightX, rightZ], from the corridor outwards to the tip. `dir` is -1 behind the start, 1 beyond the end. */
function capRows(c, tx, tz, hw, dir) {
  const rows = []; let ca = 1, sa = 0;
  for (let k = 0; k < CAP_STEPS; k++) {
    const nca = ca * C15 - sa * S15, nsa = sa * C15 + ca * S15; ca = nca; sa = nsa;
    const px = c.x + tx * hw * sa * dir, pz = c.z + tz * hw * sa * dir, lx = -tz * hw * ca, lz = tx * hw * ca;
    rows.push([px + lx, pz + lz, px - lx, pz - lz]);
  }
  return rows;
}

/** The roughs: a band of long grass (deep snow, loose sand, ash... by theme) along the foot of the walls, on both sides, touching them: nearly the whole wall. A ball in the rough is slowed a fair bit (friction x1.5, a sand pit is x3.2); the middle of the lane, the green, rolls normally. The band stops short of the tee and the cup and breaks only where something else really stands (a machine, a post, a pit, a magnet, the hero, a canyon). It is 0.3 to 0.7 wide (times `scale`) so the green keeps a lane of its own. */
function addRoughs(out, S, X, scale = 1) {
  if (S.index < 1) return; const { cl, w, N, sAt, tx, tz } = S, ph = ((S.seed >>> 4) % 628) / 100, runs = [], pts = [...X.posts, ...X.bumpers, ...X.magnets.map((m) => ({ x: m.x, z: m.z, r: 1.0 })), ...X.pads.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.6 })), ...X.boosts.map((b) => ({ x: b.x, z: b.z, r: b.len / 2 + 0.8 })), ...X.doors.flatMap((d) => [d.button && { x: d.button.x, z: d.button.z, r: 1.2 }, d.gate && { x: (d.gate[0] + d.gate[2]) / 2, z: (d.gate[1] + d.gate[3]) / 2, r: Math.hypot(d.gate[2] - d.gate[0], d.gate[3] - d.gate[1]) / 2 + 0.8 }].filter(Boolean)), ...X.tunnels.map((t) => ({ x: t.x, z: t.z, r: t.len / 2 + 0.8 })), ...X.feats.filter((f) => f.x !== undefined).map((f) => ({ x: f.x, z: f.z, r: (f.len || 2) / 2 + 1.2 })), ];
  const polys = [...X.sands.map((o) => o.poly), ...X.ponds.map((o) => o.poly)], heroSpan = [S.sHero - Math.max(1.3, S.heroHalf * 0.42), S.sHero + Math.max(1.3, S.heroHalf * 0.42)], recSpans = X.recipes.map((rc) => { let bi = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = Math.hypot(cl[i].x - rc.F.o.x, cl[i].z - rc.F.o.z); if (d < bd) { bd = d; bi = i; } } return [sAt[bi] - 0.3, sAt[bi] + rc.len + 0.3]; });
  const blocked = (x, z, m) => pts.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + m) || polys.some((pl) => inPolyG(pl, x, z));
  for (const side of [1, -1]) {
    let run = null;
    for (let i = 0; i < N; i++) {
      const bw = Math.min(0.7, Math.max(0, w[i] - 1.15)) * scale * (0.88 + 0.2 * Math.sin(sAt[i] * 0.8 + ph + side)), nx = -tz[i] * side, nz = tx[i] * side, mx = cl[i].x + nx * (w[i] - bw / 2), mz = cl[i].z + nz * (w[i] - bw / 2);
      const ok = bw > 0.22 && sAt[i] > 0.5 && sAt[i] < S.length - 0.5 && !(sAt[i] > heroSpan[0] && sAt[i] < heroSpan[1]) && !recSpans.some((r) => sAt[i] > r[0] && sAt[i] < r[1]) && !blocked(mx, mz, bw / 2 + 0.1);
      if (ok) (run ||= []).push({ ox: cl[i].x + nx * (w[i] - 0.04), oz: cl[i].z + nz * (w[i] - 0.04), ix: cl[i].x + nx * (w[i] - bw), iz: cl[i].z + nz * (w[i] - bw) });
      else if (run) { runs.push(run); run = null; }
    }
    if (run) runs.push(run);
  }
  for (const run of runs) {
    if (run.length < 4) continue; const poly = []; for (const p of run) poly.push(p.ox, p.oz); for (let k = run.length - 1; k >= 0; k--) poly.push(run[k].ix, run[k].iz);
    let cx = 0, cz = 0; for (let i = 0; i < poly.length; i += 2) { cx += poly[i]; cz += poly[i + 1]; } cx /= poly.length / 2; cz /= poly.length / 2; let r2 = 0; for (let i = 0; i < poly.length; i += 2) r2 = Math.max(r2, Math.hypot(poly[i] - cx, poly[i + 1] - cz));
    out.push({ kind: 'rough', poly, x: q(cx), z: q(cz), r: r2 + 0.3, ux: 0, uz: 0, ...SURFACE.rough });
  }
}
/** Surface patches of a hole (ice, mud, caramel, quicksand, a conveyor belt): strips across the corridor or an oval pit, placed on a straight stretch clear of everything else, drawn with their own generator so they never change the rest of a hole. */
const SURFACE = { rough: { fric: 1.5 }, ice: { fric: 0.1 }, mud: { fric: 2.2 }, caramel: { fric: 2.8 }, quicksand: { fric: 1.8, pull: 2.4 }, conveyor: { fric: 0.8, push: 3.2 } };
function addPatches(out, rr, surface, S, magnets = [], tunnels = []) {
  const { cl, w, tx, tz, N, sAt, length, free, keep } = S, want = [];
  if (S.index >= 1 && surface && SURFACE[surface]) want.push(surface);
  if (S.index >= 3 && rr() < 0.35) want.push('conveyor');
  if (surface === 'ice' && S.index >= 4 && rr() < 0.5) want.push('ice');
  for (const kind of want) {
    for (let tries = 0; tries < 80; tries++) {
      const ci = 7 + ((rr() * (N - 16)) | 0), len = 2.4 + rr() * 1.8, i1 = Math.min(N - 8, ci + Math.round(len / SPACING)), mid = (ci + i1) >> 1;
      if (sAt[ci] < 4.5 || sAt[i1] > length - 4.5) continue;
      if (tx[ci] * tx[i1] + tz[ci] * tz[i1] < 0.94) continue;                 // (a straight stretch)
      if (![ci, mid, i1].every((i) => free(cl[i].x, cl[i].z, 0.1))) continue;
      let poly = [], cx = cl[mid].x, cz = cl[mid].z, rad = 0;
      if (kind === 'quicksand') { const lat = (rr() - 0.5) * 0.9; cx = cl[mid].x - tz[mid] * lat; cz = cl[mid].z + tx[mid] * lat; poly = sandPoly(0, q(cx), q(cz), 1.35, tx[mid], tz[mid], S.seed ^ 0x6b43a9b5); }
      else { const L = [], R = []; for (let i = ci; i <= i1; i++) { const t = (i - ci) / Math.max(1, i1 - ci), ww = w[i] - 0.2, fat = kind === 'conveyor' ? 1 : Math.sqrt(Math.sin(Math.PI * (0.06 + 0.88 * t))) * 0.82 + 0.18, sh = kind === 'conveyor' ? 0 : 0.16 * ww * Math.sin(6.2832 * t + ci), a = Math.max(0.3, ww * fat + sh), b = Math.max(0.3, ww * fat - sh); L.push(cl[i].x - tz[i] * a, cl[i].z + tx[i] * a); R.unshift(cl[i].x + tz[i] * b, cl[i].z - tx[i] * b); } poly = [...L, ...R]; }      // (ice, mud and caramel are lens-shaped, wider in the middle and a little off-centre, not strips; a conveyor stays a belt)
      for (let i = 0; i < poly.length; i += 2) rad = Math.max(rad, Math.hypot(poly[i] - cx, poly[i + 1] - cz));
      const fwd = rr() < 0.7 ? 1 : -1, P = { kind, poly, x: cx, z: cz, r: rad + 0.3, ux: tx[mid] * fwd, uz: tz[mid] * fwd, ...SURFACE[kind] };
      out.push(P); keep.push({ x: cx, z: cz, r: rad + 0.8 }); break;
    }
  }
  if (S.index >= 1 && rr() < 0.4) {                                           // a tunnel: an arched roof over a straight stretch (the ball rolls under it)
    for (let tries = 0; tries < 100; tries++) {
      const ci = 8 + ((rr() * (N - 20)) | 0), i1 = Math.min(N - 8, ci + 7), mid = (ci + i1) >> 1;
      if (sAt[ci] < 5 || sAt[i1] > length - 5 || tx[ci] * tx[i1] + tz[ci] * tz[i1] < 0.95 || Math.hypot(cl[mid].x - S.hero.x, cl[mid].z - S.hero.z) < 5.6 || ![ci, mid, i1].every((i) => free(cl[i].x, cl[i].z, -1.3))) continue;
      tunnels.push({ x: q(cl[mid].x), z: q(cl[mid].z), ux: tx[mid], uz: tz[mid], len: Math.hypot(cl[i1].x - cl[ci].x, cl[i1].z - cl[ci].z), hw: w[mid] }); keep.push({ x: cl[mid].x, z: cl[mid].z, r: 3.2 }); break;
    }
  }
  for (let k = 0; k < 2; k++) if (S.index >= 2 + 2 * k && rr() < (k ? 0.4 : 0.6)) {      // magnets beside the lane: some pull the ball in, some push it away, and they switch on and off (the second one only on the later holes)
    for (let tries = 0; tries < 60; tries++) {
      const ci = 8 + ((rr() * (N - 17)) | 0), side = rr() < 0.5 ? 1 : -1, lat = side * (w[ci] - 0.55), x = cl[ci].x - tz[ci] * lat, z = cl[ci].z + tx[ci] * lat;
      if (sAt[ci] < 5 || sAt[ci] > length - 5 || Math.hypot(x - S.hero.x, z - S.hero.z) < 4.2 || !free(x, z, 0.2) || magnets.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
      const first = ((S.index + (S.seed >>> 5)) & 1) === 0, pullIn = k ? !(magnets.length ? magnets[0].pull > 0 : first) : first;                // (a second magnet is the opposite kind of the first)
      magnets.push({ x: q(x), z: q(z), r: 3.3, pull: pullIn ? 9 : -9, period: q(5.5 + rr() * 2.5), duty: Math.round((0.5 + rr() * 0.15) * 100) / 100, phase: Math.round(rr() * 800) / 100 }); keep.push({ x, z, r: 2.4 }); break;
    }
  }
}
function build(seed, index, type, force, family = 'zigzag', ext = null) {
  const r = mulberry32(seed), PP = makePath(r, index, type, family, force); if (!PP) return null;
  const path = PP.path, MIN_DOT_ = PP.minDot, CUT_ = PP.cutMax;
  const dirs = [], nLegs = path.length - 1;
  let length = 0;
  for (let i = 0; i < nLegs; i++) {
    const dx = path[i + 1].x - path[i].x, dz = path[i + 1].z - path[i].z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 5.5) return null;
    dirs.push({ x: dx / l, z: dz / l, l });
  }
  for (let i = 0; i < dirs.length - 1; i++) if (dirs[i].x * dirs[i + 1].x + dirs[i].z * dirs[i + 1].z < MIN_DOT_) return null;
  // each bend is rounded: it cuts `cut` off both of the legs that meet there and a curve is drawn through the corner
  const cut = [0];
  for (let i = 1; i < nLegs; i++) cut.push(Math.min(CUT_, 0.4 * Math.min(dirs[i - 1].l, dirs[i].l)));
  cut.push(0);
  const legs = dirs.map((d, i) => { const s = { x: path[i].x + d.x * cut[i], z: path[i].z + d.z * cut[i] }, l = d.l - cut[i] - cut[i + 1]; return { sx: s.x, sz: s.z, ex: s.x + d.x * l, ez: s.z + d.z * l, x: d.x, z: d.z, l }; });
  let hi = 0; for (let i = 1; i < legs.length; i++) if (legs[i].l > legs[hi].l) hi = i;
  const hl = legs[hi].l;
  if (hl < (NEED[type] || 8)) return null;                // room for the hero obstacle

  // the centre line: points about 0.6 apart along the straight runs and through the rounded bends (quadratic curves)
  const cl = [], apex = [];
  let heroLo = 0, heroHi = 0;
  for (let i = 0; i < nLegs; i++) {
    const L = legs[i], n = Math.max(1, Math.ceil(L.l / SPACING));
    if (i === hi) heroLo = cl.length;
    for (let k = 0; k <= n; k++) cl.push({ x: L.sx + (L.ex - L.sx) * (k / n), z: L.sz + (L.ez - L.sz) * (k / n) });
    if (i === hi) heroHi = cl.length - 1;
    if (i < nLegs - 1) {
      const c = cut[i + 1], P1 = path[i + 1], N = legs[i + 1], m = Math.max(2, Math.ceil((c * 2) / 0.5));
      for (let k = 1; k < m; k++) {
        const t = k / m, u = 1 - t, a = u * u, b = 2 * u * t, d = t * t;
        if (k === (m >> 1)) apex[i + 1] = cl.length;
        cl.push({ x: a * L.ex + b * P1.x + d * N.sx, z: a * L.ez + b * P1.z + d * N.sz });
      }
    }
  }
  const N = cl.length, sAt = [0];
  for (let i = 1; i < N; i++) sAt.push(sAt[i - 1] + Math.hypot(cl[i].x - cl[i - 1].x, cl[i].z - cl[i - 1].z));
  length = sAt[N - 1];

  // how wide the corridor is: round greens at both ends, chambers where it swells at some bends, and plain where the hero stands
  const bulges = [];
  for (let v = 1; v < nLegs; v++) if (r() < 0.5) bulges.push({ s: sAt[apex[v]], amt: 0.7 + r() * 0.6, sp: cut[v] * 0.95 });
  const sHero = (sAt[heroLo] + sAt[heroHi]) / 2, heroHalf = (NEED[type] || 8) / 2 + 0.5;
  let islandI = -1;                                                         // a fork island (ext.more): the corridor swells on a straight stretch and a lens of rock splits the way (its own generator, so the rest of the hole is unchanged)
  if (ext && ext.more && index >= 3) {
    const r3 = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    if (r3() < 0.3) for (let t = 0; t < 40; t++) {
      const ci = 9 + ((r3() * (N - 18)) | 0), s0 = sAt[ci]; if (Math.abs(s0 - sHero) < heroHalf + 4.5 || s0 < 7 || s0 > length - 7) continue;
      const dx = cl[ci + 4].x - cl[ci - 4].x, dz = cl[ci + 4].z - cl[ci - 4].z, l = Math.hypot(dx, dz) || 1; if (l < (sAt[ci + 4] - sAt[ci - 4]) * 0.985) continue;
      bulges.push({ s: s0, amt: 1.8, sp: 3.4 }); islandI = ci; break;
    }
  }
  const w = [];
  for (let i = 0; i < N; i++) {
    const s = sAt[i], e = Math.min(s, length - s);
    let wi = HALF_W + (PAD_R - HALF_W) * (1 - smoothstep01(e / 3.6));
    for (const b of bulges) wi += b.amt * (1 - smoothstep01(Math.abs(s - b.s) / b.sp));
    wi = HALF_W + (wi - HALF_W) * smoothstep01((Math.abs(s - sHero) - heroHalf) / 1.5);
    w.push(wi);
  }
  w[0] = w[N - 1] = PAD_R;

  // the two edges
  const tx = [], tz = [], left = [], right = [];
  for (let i = 0; i < N; i++) {
    const a = cl[i > 0 ? i - 1 : 0], b = cl[i < N - 1 ? i + 1 : N - 1], l = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)) || 1;
    tx.push((b.x - a.x) / l); tz.push((b.z - a.z) / l);
    left.push({ x: cl[i].x - tz[i] * w[i], z: cl[i].z + tx[i] * w[i] }); right.push({ x: cl[i].x + tz[i] * w[i], z: cl[i].z - tx[i] * w[i] });
  }
  for (let i = 1; i < N - 1; i++) {                       // a bend tighter than the corridor is wide would fold the inside edge over
    const turn = Math.abs(tx[i] * tz[i + 1] - tz[i] * tx[i + 1]);
    if (turn > 1e-6 && (sAt[i + 1] - sAt[i]) / turn < w[i] * 1.15) return null;
  }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {   // two parts of the corridor must not come close
    if (sAt[j] - sAt[i] < (w[i] + w[j]) * 1.6 + 2) continue;
    const dx = cl[i].x - cl[j].x, dz = cl[i].z - cl[j].z, m = w[i] + w[j] + 0.9;
    if (dx * dx + dz * dz < m * m) return null;
  }
  const capS = capRows(cl[0], tx[0], tz[0], w[0], -1), capE = capRows(cl[N - 1], tx[N - 1], tz[N - 1], w[N - 1], 1);
  const outline = [];                                     // the whole edge, once round
  for (let k = CAP_STEPS - 1; k >= 0; k--) outline.push([capS[k][0], capS[k][1]]);
  for (let i = 0; i < N; i++) outline.push([left[i].x, left[i].z]);
  for (let k = 0; k < CAP_STEPS; k++) outline.push([capE[k][0], capE[k][1]]);
  for (let k = CAP_STEPS - 2; k >= 0; k--) outline.push([capE[k][2], capE[k][3]]);
  for (let i = N - 1; i >= 0; i--) outline.push([right[i].x, right[i].z]);
  for (let k = 0; k < CAP_STEPS - 1; k++) outline.push([capS[k][2], capS[k][3]]);
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of outline) {
    if (p[0] * p[0] + p[1] * p[1] > WALL_REACH * WALL_REACH) return null;
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
  }
  const walls = [];                                       // [ax, az, bx, bz, visible, ghostable]
  for (let j = 0; j < outline.length; j++) { const a = outline[j], b = outline[(j + 1) % outline.length]; if (a[0] !== b[0] || a[1] !== b[1]) walls.push([a[0], a[1], b[0], b[1], 1, 0]); }
  const ribbon = [];                                      // rows of [leftX, leftZ, rightX, rightZ, distance along] for the green
  for (let k = CAP_STEPS - 1; k >= 0; k--) ribbon.push([capS[k][0], capS[k][1], capS[k][2], capS[k][3], -1]);
  for (let i = 0; i < N; i++) ribbon.push([left[i].x, left[i].z, right[i].x, right[i].z, sAt[i]]);
  for (let k = 0; k < CAP_STEPS; k++) ribbon.push([capE[k][0], capE[k][1], capE[k][2], capE[k][3], -1]);

  // the hero obstacle, on the longest straight run
  const d = legs[hi];
  const hero = buildHero(type, { x: d.sx, z: d.sz, ux: d.x, uz: d.z, nx: -d.z, nz: d.x, len: hl, hw: HALF_W }, r);
  for (const wl of hero.walls) walls.push(wl);
  const heroSegs = hero.walls.map((wl) => [wl[0], wl[1], wl[2], wl[3]]);
  const tee = cl[0], cup = cl[N - 1], ball = { x: tee.x + tx[0] * 0.8, z: tee.z + tz[0] * 0.8 };
  const REACH_OF = { windmill: 1.8, alligator: 2.1, turntable: 2.0, pendulum: 2.4, geyser: 1.6, cannon: 1.4, teleport: 1.2, drawbridge: 2.0, loop: 4.4, slider: 2.2, bridge: 2.4 };      // (how far a hero's parts reach from its centre)
  { const hx = type === 'teleport' ? hero.a.x : hero.x, hz = type === 'teleport' ? hero.a.z : hero.z, reach = type === 'teleport' ? 0.9 : REACH_OF[type] || 2; if (Math.hypot(hx - ball.x, hz - ball.z) < reach + 1.7) return null; }      // (the ball never starts beside the obstacle)
  const keep = [{ x: hero.x, z: hero.z, r: type === 'teleport' ? hl * 0.4 : type === 'loop' ? hl * 0.5 : 3.2 }];       // places the other features keep clear of
  keep.push({ x: ball.x, z: ball.z, r: 2.6 }, { x: cup.x, z: cup.z, r: 1.8 });
  const free = (x, zz, m) => { for (const k of keep) { const dx = x - k.x, dz = zz - k.z; if (Math.sqrt(dx * dx + dz * dz) < k.r + m) return false; } return true; };
  const onLeg = (li, t, lat) => { const L = legs[li]; return { x: L.sx + L.x * L.l * t - L.z * lat, z: L.sz + L.z * L.l * t + L.x * lat }; };
  const others = []; for (let i = 0; i < legs.length; i++) if (i !== hi && legs[i].l >= 6.5) others.push(i);

  // water: a river that carries the ball along (holes 2, 5, 8 and sometimes later ones), or a pond to steer round (holes 3, 6, 9 and sometimes later ones)
  const rivers = [], ponds = [], sands = [], bumpers = [], posts = [], hills = [];
  const wantRiver = index % 3 === 1 || (index > 5 && r() < 0.3), wantPond = (index % 3 === 2 || (index > 5 && r() < 0.3)) && type !== 'drawbridge' && type !== 'loop' && type !== 'teleport';
  if (wantRiver && others.length) {
    const li = others[(r() * others.length) | 0], L = legs[li], t0 = 0.18 + r() * 0.18, len = Math.min(L.l * 0.55, 6.5);
    const a = onLeg(li, t0, 0), fwd = r() < 0.78;
    const b = { x: a.x + L.x * len, z: a.z + L.z * len };
    const clearOf = (pt, m) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; let t = ((pt.x - a.x) * dx + (pt.z - a.z) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(pt.x - a.x - dx * t, pt.z - a.z - dz * t) > m; };
    if (clearOf(ball, 3.0) && clearOf(cup, 2.6)) {                                    // (a river never starts at the tee: the ball must be well clear of it, since it would be carried away before the first putt)
      rivers.push({ a: fwd ? a : b, b: fwd ? b : a, hw: 1.0, acc: 6.5 });
      keep.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: len / 2 });
    }
  }
  if (wantPond && others.length) {
    const li = others[((r() * others.length) | 0)], side = r() < 0.5 ? 1 : -1, p = onLeg(li, 0.5, 0.85 * side);
    if (free(p.x, p.z, 1.3)) { ponds.push({ x: q(p.x), z: q(p.z), r: 1.15, poly: blobPoly(q(p.x), q(p.z), 1.15, seed ^ 0x3c6ef372) }); keep.push({ x: p.x, z: p.z, r: 2.2 }); }
  }
  const feats = [], boosts = [], pads = [], barriers = [], doors = [], rails = [], recipes = [], recipeLog = [], secrets = [];
  const segsAll = () => [...heroSegs, ...barriers.map((b) => [b.a[0], b.a[1], b.b[0], b.b[1]]), ...doors.filter((d) => d.gate).map((d) => d.gate)];
  placeRecipes({ index, type, r, cl, w, tx, tz, sAt, N, length, sHero, heroHalf, free, keep, walls, feats, boosts, pads, barriers, doors, rails, recipes, secrets, log: recipeLog, used: [] },
    () => laneExists(cl, w, ball, cup, [...ponds.map((o) => o.poly)], feats, [...posts, ...bumpers], segsAll()));            // (the machines of the hole: each is a designed chain; see golfrecipes.js)
  for (let k = 0; k < 2; k++) {                            // sand pits (irregular patches that slow the ball a lot)
    if (!(k === 0 ? index > 0 && r() < 0.75 : index > 3 && r() < 0.4)) continue;
    for (let tries = 0; tries < 30; tries++) {
      // a pit is a punishment for over-shooting or misjudging an angle, so it lies off to the side: on the outside of a bend (where a ball that runs on will go) or beside the last stretch, never on the line to the cup
      const bends = apex.filter((v) => v !== undefined && v > 7 && v < N - 8), ci0 = bends.length && r() < 0.8 ? bends[(r() * bends.length) | 0] + (((r() * 5) | 0) - 2) : Math.floor(N * (0.55 + 0.35 * r())), ci = Math.max(7, Math.min(N - 8, ci0));
      const cross = tx[ci - 3] * tz[ci + 3] - tz[ci - 3] * tx[ci + 3], side = Math.abs(cross) > 0.15 ? (cross > 0 ? -1 : 1) : (r() < 0.5 ? 1 : -1), lat = side * (w[ci] - 0.75 - r() * 0.1);                                    // (hugging the wall)
      const p = { x: cl[ci].x - tz[ci] * lat, z: cl[ci].z + tx[ci] * lat }, rad = 0.8 + r() * 0.25, kind = [0, 0, 1, 2, 3][(r() * 5) | 0], turn = r() * 0.5;
      if (!free(p.x, p.z, 0.1)) continue;
      const C45 = 0.7071067811865476, ox0 = turn < 0.5 ? tx[ci] : turn < 0.75 ? (tx[ci] - tz[ci]) * C45 : (tx[ci] + tz[ci]) * C45, oz0 = turn < 0.5 ? tz[ci] : turn < 0.75 ? (tz[ci] + tx[ci]) * C45 : (tz[ci] - tx[ci]) * C45;
      const poly = sandPoly(kind, q(p.x), q(p.z), rad, ox0, oz0, seed ^ (0x7f4a7c15 + k));
      let lo = 1e9, hi = -1e9, far = 0; for (let i = 0; i < poly.length; i += 2) { const dx = poly[i] - cl[ci].x, dz = poly[i + 1] - cl[ci].z, l2 = dx * (-tz[ci]) + dz * tx[ci]; if (l2 < lo) lo = l2; if (l2 > hi) hi = l2; far = Math.max(far, Math.hypot(poly[i] - q(p.x), poly[i + 1] - q(p.z))); }
      if (side > 0 ? lo < 0.9 || hi > w[ci] - 0.1 : hi > -0.9 || lo < -w[ci] + 0.1) continue;      // the middle of the corridor (0.9 either side of the centre line) is always clear of sand
      let onTerrain = false;                                                  // a pit sits on flat ground: not on a hill, berm, platform or ramp
      for (let i = 0; i < poly.length && !onTerrain; i += 2) {
        const px = poly[i], pz = poly[i + 1];
        for (const hk of hills) if ((px - hk.x) * (px - hk.x) + (pz - hk.z) * (pz - hk.z) < hk.r * hk.r * 0.85) { onTerrain = true; break; }
        for (const f of feats) {
          if (f.t === 'berm') { const dx = f.bx - f.ax, dz = f.bz - f.az, l2 = dx * dx + dz * dz || 1; let t = ((px - f.ax) * dx + (pz - f.az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = px - f.ax - dx * t, ez = pz - f.az - dz * t; if (ex * ex + ez * ez < (f.w + 0.4) * (f.w + 0.4)) { onTerrain = true; break; } }
          else { const rx = px - f.x, rz = pz - f.z, s2 = rx * f.ux + rz * f.uz; if (s2 > -f.len / 2 - (f.ramp || 0) - 0.6 && s2 < f.len / 2 + 0.8) { onTerrain = true; break; } }
        }
      }
      if (onTerrain) continue;
      if (!laneExists(cl, w, ball, cup, [...ponds.map((o) => o.poly), ...sands.map((o) => o.poly), poly], feats, [...posts, ...bumpers], segsAll())) continue;
      sands.push({ x: q(p.x), z: q(p.z), r: far / 1.19, poly }); keep.push({ x: p.x, z: p.z, r: far * 0.8 }); break;
    }
  }

  // terrain features beyond the hills (not on the first holes): a banked berm on a bend, a raised platform, and a jump ramp that clears a canyon gap
  if (index >= 1) {
    const longs = others.filter((i) => legs[i].l >= 7.0);
    const place = (kind) => {
      for (let tries = 0; tries < 4 && longs.length; tries++) {
        const li = longs[(r() * longs.length) | 0], L = legs[li], t = 0.46 + r() * 0.14, c = onLeg(li, t, 0);
        const f = { x: c.x, z: c.z, ux: L.x, uz: L.z, nx: -L.z, nz: L.x, wid: 4 };
        if (kind === 'plat') { if (!free(c.x, c.z, 0.7)) continue; feats.push({ t: 'plat', ...f, len: 3.2 + r() * 1.0, h: 0.5 + r() * 0.25, ramp: 2.4, edge: 0.5 }); keep.push({ x: c.x, z: c.z, r: 5.2 }); return true; }
        if (!free(c.x, c.z, 0.7)) continue;                                       // a jump: the ramp ends at the lip, the canyon starts there
        const ledge = r() < 0.5 ? 1 : -1, lipX = c.x, lipZ = c.z, ramp = 2.2, gap = 1.9 + r() * 0.5;
        feats.push({ t: 'jump', ...f, x: lipX - L.x * ramp / 2, z: lipZ - L.z * ramp / 2, len: ramp, h: 0.8 }, { t: 'gap', ...f, x: lipX + L.x * gap / 2, z: lipZ + L.z * gap / 2, len: gap, d: 1.4, c0: ledge > 0 ? -HALF_W - 0.05 : -HALF_W + 1.85, c1: ledge > 0 ? HALF_W - 1.85 : HALF_W + 0.05 });
        keep.push({ x: lipX, z: lipZ, r: 5.4 }); return true;
      }
      return false;
    };
    if (index >= 2 && r() < 0.5) place('plat');
    if (r() < 0.55) {                                                              // a berm on the outside of a bend
      for (let v = 1; v < nLegs; v++) {
        const ia = apex[v]; if (ia === undefined || ia < 5 || ia > N - 6 || r() < 0.4) continue;
        const a = cl[ia - 4], b = cl[ia + 4], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ox = cl[ia].x - mx, oz = cl[ia].z - mz, ol = Math.sqrt(ox * ox + oz * oz) || 1, off = w[ia] - 0.5;
        const p0 = cl[ia - 4], p1 = cl[ia + 4], px = ox / ol, pz = oz / ol;
        if (!free(cl[ia].x, cl[ia].z, 1.0)) continue;
        feats.push({ t: 'berm', ax: p0.x + px * off, az: p0.z + pz * off, bx: p1.x + px * off, bz: p1.z + pz * off, w: 1.7, h: 0.5 + r() * 0.2 }); keep.push({ x: cl[ia].x, z: cl[ia].z, r: 2.4 }); break;
      }
    }
  }
  if (feats.some((f) => f.t === 'gap') && !laneExists(cl, w, ball, cup, [...ponds.map((o) => o.poly), ...sands.map((o) => o.poly)], feats, [], segsAll())) { for (let i = feats.length - 1; i >= 0; i--) if (feats[i].t === 'gap' || feats[i].t === 'jump') feats.splice(i, 1); }      // (a canyon never leaves the pits as the only way past)
  // gentle hills along the corridor, kept clear of the tee, the cup and the hero (they only bump up, so the fairway sits flush on the lawn)
  const hillsFrom = keep.length;                                            // (the gentle hills reserve a lot of room but do not matter to what the extras need)
  const nHills = type === 'loop' ? 0 : 2 + (index > 1 ? 1 : 0) + (index > 4 ? 1 : 0);
  const hillOk = (x, zz, rad) => { for (const k of keep) { const dx = x - k.x, dz = zz - k.z; if (Math.sqrt(dx * dx + dz * dz) < rad * 0.9 + k.r * 0.4) return false; } return true; };
  for (let k = 0; k < nHills; k++) {
    for (let tries = 0; tries < 8; tries++) {
      const ci = 6 + ((r() * (N - 12)) | 0), lat = (r() * 2 - 1) * 0.9, p = { x: cl[ci].x - tz[ci] * lat, z: cl[ci].z + tx[ci] * lat }, rad = q(3 + r() * 2), h = 0.9 + r() * 0.8;
      if (!hillOk(p.x, p.z, rad)) continue;
      hills.push({ x: q(p.x), z: q(p.z), r: rad, h: Math.round(h * 10) / 10 }); keep.push({ x: p.x, z: p.z, r: rad * 0.8 }); break;
    }
  }
  const hillsTo = keep.length;
  const freeX = (x, zz, m) => { for (let k = 0; k < keep.length; k++) { if (k >= hillsFrom && k < hillsTo) continue; const kk = keep[k], dx = x - kk.x, dz = zz - kk.z; if (Math.sqrt(dx * dx + dz * dz) < kk.r + m) return false; } return true; };
  // posts, bumpers and sand
  for (const li of [0, legs.length - 1]) {
    if (r() < 0.5) { const p = onLeg(li, 0.4 + r() * 0.2, (r() < 0.5 ? 1 : -1) * 0.95); if (free(p.x, p.z, 1.0)) { posts.push({ x: q(p.x), z: q(p.z), r: 0.45 }); keep.push({ x: p.x, z: p.z, r: 0.6 }); } }
  }
  const nb = index > 2 ? (r() < 0.6 ? 1 : 0) + (r() < 0.3 ? 1 : 0) : 0;
  for (let k = 0; k < nb; k++) { const li = (r() * legs.length) | 0, p = onLeg(li, 0.3 + r() * 0.4, (r() < 0.5 ? 1 : -1) * 1.15); if (free(p.x, p.z, 1.1)) { bumpers.push({ x: q(p.x), z: q(p.z), r: 0.5 }); keep.push({ x: p.x, z: p.z, r: 0.7 }); } }
  // power-up orbs, off the best line: near a wall
  const pickups = [], np = index === 0 ? 1 : 2, totalW = POWER_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let k = 0; k < np; k++) {
    for (let tries = 0; tries < 12; tries++) {
      const li = (r() * legs.length) | 0, side = r() < 0.5 ? 1 : -1, p = onLeg(li, 0.15 + r() * 0.7, side * (HALF_W - 0.75));
      if (!free(p.x, p.z, 0.9)) continue;
      let pick = r() * totalW, ti = 0;
      for (; ti < POWERUPS.length - 1; ti++) { pick -= POWER_WEIGHTS[ti]; if (pick <= 0) break; }
      pickups.push({ x: q(p.x), z: q(p.z), type: POWERUPS[ti], li, side }); keep.push({ x: p.x, z: p.z, r: 0.9 }); break;
    }
  }
  // interactive extras: boost strips and bounce pads on the floor, and a cage round one orb whose gate opens for a few seconds when the ball rolls over a button
  let cage = null;
  // (the old caged orb is gone: the 'pocket' machine in golfrecipes.js does the same job on a straight stretch, with a gate, a lane through it and a way out that one stroke can take)
  const lane = () => laneExists(cl, w, ball, cup, [...ponds.map((o) => o.poly), ...sands.map((o) => o.poly)], feats, [...posts, ...bumpers], segsAll());
  while (!lane() && (sands.length || posts.length || bumpers.length)) { if (sands.length) sands.pop(); else if (bumpers.length) bumpers.pop(); else posts.pop(); }      // (a last check: something that blocks the only way through goes)
  for (const sc of secrets) pickups.push(sc);                // (the secret coins of the machines)
  const patches = [], magnets = [], tunnels = [];
  if (ext) addPatches(patches, mulberry32((seed ^ 0x51ed270b) >>> 0), ext.surface, { seed, index, cl, w, tx, tz, N, sAt, length, free: freeX, keep, hero }, magnets, tunnels);
  if (ext) {                                              // the roughs along the walls: if they would shut the way to the cup they are made thinner, and if that is still not enough they go
    const X = { sands, ponds, posts, bumpers, recipes, boosts, pads, doors, magnets, tunnels, feats }, SR = { seed, index, cl, w, tx, tz, N, sAt, length, sHero, heroHalf };
    for (const scale of [1, 0.6, 0]) {
      for (let k = patches.length - 1; k >= 0; k--) if (patches[k].kind === 'rough') patches.splice(k, 1);
      if (!scale) break; addRoughs(patches, SR, X, scale);
      if (!patches.some((p) => p.kind === 'rough') || laneExists(cl, w, ball, cup, [...ponds.map((o) => o.poly), ...sands.map((o) => o.poly), ...patches.filter((p) => p.kind === 'rough').map((p) => p.poly)], feats, [...posts, ...bumpers], segsAll())) break;
    }
  }

  // the second set of extras (ext.more): ghost walls and (see the widths above) a fork island, each drawn from their own generator
  const ghosts = [], islands = [], gates1 = [], rollers = [];
  if (ext && ext.more) {
    const r2 = mulberry32((seed ^ 0x2b7e1516) >>> 0);
    const stretch = (n, margin, tries = 400) => {                          // a straight stretch of n centre-line points, clear of everything
      for (let t = 0; t < tries; t++) {
        const ci = 8 + ((r2() * (N - 16 - n)) | 0), i1 = ci + n, mid = (ci + i1) >> 1; if (i1 > N - 8 || sAt[ci] < 5 || sAt[i1] > length - 5) continue;
        if (tx[ci] * tx[i1] + tz[ci] * tz[i1] < 0.94 || ![ci, mid, i1].every((i) => freeX(cl[i].x, cl[i].z, margin))) continue;
        return { ci, i1, mid };
      }
      return null;
    };
    if (index >= 1 && r2() < (ext.theme === 'haunted' ? 0.85 : 0.1)) {     // a ghost wall: solid for part of every period
      const st = stretch(4, -0.2); if (st) { const m = st.mid, period = 3 + r2() * 1.5; ghosts.push({ ax: cl[m].x + tz[m] * (w[m] + 0.05), az: cl[m].z - tx[m] * (w[m] + 0.05), bx: cl[m].x - tz[m] * (w[m] + 0.05), bz: cl[m].z + tx[m] * (w[m] + 0.05), period, phase: r2() * period, duty: 0.55 }); keep.push({ x: cl[m].x, z: cl[m].z, r: 2.0 }); }
    }
    if (index >= 1 && r2() < 0.25) {                                       // a one-way gate across the lane: forwards only
      const st = stretch(3, -0.2); if (st) { const m = st.mid; gates1.push({ x: q(cl[m].x), z: q(cl[m].z), ux: tx[m], uz: tz[m], nx: -tz[m], nz: tx[m], hw: w[m] }); keep.push({ x: cl[m].x, z: cl[m].z, r: 1.6 }); }
    }
    if (index >= 2 && r2() < 0.25) {                                       // a trampoline pad: it launches the ball up and on along the lane
      const st = stretch(3, 0.3); if (st) { const m = st.mid; pads.push({ x: q(cl[m].x), z: q(cl[m].z), r: 0.8, tramp: true, ux: tx[m], uz: tz[m] }); keep.push({ x: cl[m].x, z: cl[m].z, r: 2.4 }); }
    }
    if (index >= 1 && r2() < (ext.theme === 'desert' ? 0.7 : 0.08)) {      // a tumbleweed rolling to and fro across the lane
      const st = stretch(5, 0.2); if (st) { const m = st.mid; rollers.push({ x: q(cl[m].x), z: q(cl[m].z), ux: tx[m], uz: tz[m], nx: -tz[m], nz: tx[m], A: w[m] - 0.95, w: 1.1 + r2() * 0.5, ph: r2() * 6, rad: 0.45 }); keep.push({ x: cl[m].x, z: cl[m].z, r: 2.6 }); }
    }
    if (islandI >= 0) {                                                    // the lens of rock in the swollen stretch
      const c = islandI, n = 14, poly = []; for (let k = 0; k < n; k++) { const t = (k / n) * 6.2832, lx = 2.0 * Math.cos(t), lz = 0.9 * Math.sin(t); poly.push(cl[c].x + tx[c] * lx - tz[c] * lz, cl[c].z + tz[c] * lx + tx[c] * lz); }
      for (let k = 0; k < n; k++) walls.push([poly[k * 2], poly[k * 2 + 1], poly[((k + 1) % n) * 2], poly[((k + 1) % n) * 2 + 1], 0, 0]); islands.push({ x: cl[c].x, z: cl[c].z, poly }); keep.push({ x: cl[c].x, z: cl[c].z, r: 3.6 });
    }
  }
  const par = Math.max(2, Math.min(5, 2 + Math.floor(length / 16)));
  const bounds = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2 };
  const shape = cl.map((p, i) => [p.x, p.z, w[i]]);       // the centre line with the half-width at each point (for levelling the ground and for keeping holes apart)
  const H = { recipeLog, rails, barriers, doors, recipes, patches, magnets, tunnels, ghosts, islands, gates1, rollers, lanes: hero.lane ? [hero.lane] : [], dense: !!hero.lane, theme: ['pirate', 'jungle', 'castle', 'space', 'garden'][(seed >>> 9) % 5], cage, boosts, pads, feats, seed, index, type, tee: { x: tee.x, z: tee.z }, cup: { x: cup.x, z: cup.z }, ball, path: cl, left, right, ribbon, outline, bounds, shape, widths: w, hw: HALF_W, walls, hills, posts, bumpers, sands, rivers, ponds, hero, pickups, par, length };
  tidyTriggers(H);
  if (!teeClear(H)) return null;                          // (a start that would run into a wall, a hill, sand or an obstacle is not allowed: another layout is tried)
  for (const rec of recipes.slice()) {                    // every machine is proved on the finished hole: a recipe whose intended shot does not work (for a band of powers) is taken out again
    const res = proveRecipe(H, rec);
    if (res.pass < (rec.minPass || 3)) { removeRecipe(H, rec.rid); recipes.splice(recipes.indexOf(rec), 1); recipeLog.push({ kind: rec.kind, out: `proof failed (${res.pass}/8)` }); } else { rec.forgiveness = res.forgiveness; rec.necessity = necessityOf(H, rec); }
  }
  H.cover = 0;                                            // (the proof shots may have left a bridge out)
  return H;
}
