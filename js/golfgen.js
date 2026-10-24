// The mini-golf holes, made from a seed. This file is pure data (no THREE) and deterministic: the same seed gives the same hole on every device.
// To keep that true it uses only the seeded integer generator below and + - * / sqrt (never Math.random, sin, cos or pow in the layout), and rounds every point to half a unit.
//
// A hole is a winding corridor across the round tray: a centre line (tee to cup), walls offset from it, a few gentle hills, a couple of posts and one "hero" obstacle.
// Local coordinates: x runs left to right across the tray, z toward the viewer, the tray's centre is (0, 0), and the surface is at height 0.
export const TRAY_R = 14;
export const HOLES = 3;                                   // Stage 1: three holes (the full course will be nine)
const HALF_W = 2.3;                                       // half the corridor width
const REACH = 11.4;                                       // how far from the tray's centre the centre line may go

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** The seed of a whole course: the same for everyone in a given month (`month` is 1 to 12). */
export function courseSeed(year, month) {
  let h = Math.imul((year * 12 + month) | 0, 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return h >>> 0;
}
/** The seed of hole `i` (0 to 8) of a course. */
export function holeSeed(cs, i) {
  let h = (cs ^ Math.imul(i + 1, 0x7f4a7c15)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; return (h ^ (h >>> 16)) >>> 0;
}

const q = (v) => Math.round(v * 2) / 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Is the hero's gate shut at time `t`? The four sails sweep past the opening in turn, so it is shut about 40% of the time. */
export function heroBlocked(hero, t) {
  const Q = 1.5707963267948966;                           // a quarter turn: one sail passes every quarter turn
  const f = (((t * hero.w + hero.phase) % Q) + Q) % Q / Q;
  return (f < 0.5 ? f : 1 - f) < 0.2;
}

/** Make hole number `index` (0-based) for a course seed, trying neighbouring sub-seeds until the layout is valid. */
export function makeHole(seed, index) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const h = build((seed + Math.imul(attempt, 0x9e3779b1)) >>> 0, index);
    if (h) return h;
  }
  return build(1, index) || fallback(index);
}

function build(seed, index) {
  const r = mulberry32(seed);
  const bends = r() < 0.5 ? 1 : 2;
  const xs = bends === 1 ? [-10.5, q(-2 + r() * 4), 10.5] : [-10.5, q(-6 + r() * 2.5), q(2 + r() * 3), 10.5];
  let sign = r() < 0.5 ? 1 : -1, z = q((r() * 2 - 1) * 4.5);
  const path = [];
  for (let i = 0; i < xs.length; i++) {
    if (i > 0) { z = q(clamp(z + sign * (3.5 + r() * 3.5), -6.5, 6.5)); sign = -sign; }
    if (xs[i] * xs[i] + z * z > REACH * REACH) return null;
    path.push({ x: xs[i], z });
  }
  // every leg long enough and no turn sharper than about 80 degrees
  const dirs = [];
  let length = 0, hi = -1, hl = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x, dz = path[i + 1].z - path[i].z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 5) return null;
    dirs.push({ x: dx / l, z: dz / l, l }); length += l;
    if (l > hl) { hl = l; hi = i; }
  }
  for (let i = 0; i < dirs.length - 1; i++) if (dirs[i].x * dirs[i + 1].x + dirs[i].z * dirs[i + 1].z < 0.18) return null;
  if (hl < 8) return null;                                // room for the hero obstacle

  // the corridor's two edges, mitred at the bends so the walls join up
  const left = [], right = [];
  for (let i = 0; i < path.length; i++) {
    let nx, nz, k = 1;
    const a = dirs[i - 1], b = dirs[i];
    if (!a) { nx = -b.z; nz = b.x; }
    else if (!b) { nx = -a.z; nz = a.x; }
    else {
      nx = -(a.z + b.z); nz = a.x + b.x;
      const l = Math.sqrt(nx * nx + nz * nz) || 1; nx /= l; nz /= l;
      const dot = nx * -a.z + nz * a.x; k = 1 / Math.max(0.5, dot);
    }
    left.push({ x: path[i].x + nx * HALF_W * k, z: path[i].z + nz * HALF_W * k });
    right.push({ x: path[i].x - nx * HALF_W * k, z: path[i].z - nz * HALF_W * k });
  }
  const walls = [];                                       // [ax, az, bx, bz, visible]
  for (let i = 0; i < path.length - 1; i++) {
    walls.push([left[i].x, left[i].z, left[i + 1].x, left[i + 1].z, 1], [right[i].x, right[i].z, right[i + 1].x, right[i + 1].z, 1]);
  }
  const n = path.length - 1;
  walls.push([left[0].x, left[0].z, right[0].x, right[0].z, 1], [left[n].x, left[n].z, right[n].x, right[n].z, 1]);

  // the hero obstacle: a windmill across the middle of the longest leg, with a gap at the bottom that the sails sweep across
  const d = dirs[hi], P = path[hi];
  const mid = hl / 2, hx = P.x + d.x * mid, hz = P.z + d.z * mid, nx = -d.z, nz = d.x;
  const hero = { type: 'windmill', x: hx, z: hz, ux: d.x, uz: d.z, nx, nz, gap: 1.0, half: 1.1, w: q(1.2 + r() * 0.6 * 2) * 0.5 + 0.7, phase: r() * 1.5, hw: HALF_W };
  const lat0 = hero.gap, lat1 = HALF_W + 0.3;
  for (const s of [-1, 1]) {                              // the two solid halves of the windmill's base (drawn by the building, not as rails)
    const c0 = lat0 * s, c1 = lat1 * s;
    const p = (a, b) => [hx + d.x * a + nx * b, hz + d.z * a + nz * b];
    const A = p(-hero.half, c0), B = p(hero.half, c0), C = p(hero.half, c1), D = p(-hero.half, c1);
    walls.push([A[0], A[1], B[0], B[1], 0], [B[0], B[1], C[0], C[1], 0], [C[0], C[1], D[0], D[1], 0], [D[0], D[1], A[0], A[1], 0]);
  }
  hero.gate = [hx - d.x * (hero.half + 0.1) - nx * hero.gap, hz - d.z * (hero.half + 0.1) - nz * hero.gap, hx - d.x * (hero.half + 0.1) + nx * hero.gap, hz - d.z * (hero.half + 0.1) + nz * hero.gap];

  // gentle hills along the corridor, kept clear of the tee, the cup and the hero
  const tee = path[0], cup = path[path.length - 1], hills = [];
  for (let k = 0; k < 2; k++) {
    const li = (r() * dirs.length) | 0, t = 0.25 + r() * 0.5, lat = (r() * 2 - 1) * 0.8;
    const L = dirs[li], Q = path[li];
    const x = Q.x + L.x * L.l * t - L.z * lat, zz = Q.z + L.z * L.l * t + L.x * lat, rad = q(3 + r() * 1.5), h = 0.5 + r() * 0.4;
    const far = (a, b, m) => Math.sqrt((x - a) * (x - a) + (zz - b) * (zz - b)) > rad + m;
    if (far(tee.x, tee.z, 2.5) && far(cup.x, cup.z, 2.5) && far(hx, hz, 2.8)) hills.push({ x: q(x), z: q(zz), r: rad, h: Math.round(h * 10) / 10 });
  }
  // a post or two on the first and last legs
  const posts = [];
  for (const li of [0, dirs.length - 1]) {
    if (r() < 0.55) {
      const L = dirs[li], Q = path[li], t = 0.4 + r() * 0.2, side = r() < 0.5 ? 1 : -1;
      const x = Q.x + L.x * L.l * t - L.z * 0.95 * side, zz = Q.z + L.z * L.l * t + L.x * 0.95 * side;
      const dh = Math.sqrt((x - hx) * (x - hx) + (zz - hz) * (zz - hz));
      if (dh > 3.5) posts.push({ x: q(x), z: q(zz), r: 0.45 });
    }
  }
  const par = Math.max(2, Math.min(5, 2 + Math.floor(length / 16)));
  return { seed, index, tee: { x: tee.x, z: tee.z }, cup: { x: cup.x, z: cup.z }, path, hw: HALF_W, left, right, walls, hills, posts, hero, par, length };
}

/** A plain straight hole, used only if no valid layout turns up (it should never be needed). */
function fallback(index) {
  const path = [{ x: -10.5, z: 0 }, { x: 10.5, z: 0 }];
  const left = path.map((p) => ({ x: p.x, z: p.z + HALF_W })), right = path.map((p) => ({ x: p.x, z: p.z - HALF_W }));
  const walls = [[-10.5, HALF_W, 10.5, HALF_W, 1], [-10.5, -HALF_W, 10.5, -HALF_W, 1], [-10.5, HALF_W, -10.5, -HALF_W, 1], [10.5, HALF_W, 10.5, -HALF_W, 1]];
  return { seed: 0, index, tee: path[0], cup: path[1], path, hw: HALF_W, left, right, walls, hills: [], posts: [], hero: null, par: 3, length: 21 };
}
