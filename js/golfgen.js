// The mini-golf holes, made from a seed. This file is pure data (no THREE) and deterministic: the same seed gives the same hole on every device.
// To keep that true it uses only the seeded integer generator and + - * / sqrt (never Math.random, sin, cos or pow in the layout), and rounds every point to half a unit.
//
// A hole is a winding corridor across the lawn: a centre line (tee to cup), walls offset from it, gentle hills, one hero obstacle (golfhero.js), water (a river that
// carries the ball, or a pond), posts, bumpers, sand, and a couple of power-up orbs placed off the best line.
// Local coordinates: x runs left to right, z toward the viewer, the course's centre is (0, 0), and the lawn is at height 0.
import { mulberry32, heroOrder, buildHero, NEED } from './golfhero.js?v=20261024150417';
export { mulberry32, heroOrder };

export const TRAY_R = 14;
export const HOLES = 9;
export const POWERUPS = ['homing', 'ghost', 'multi', 'hamster', 'mega', 'turbo', 'bounce', 'freeze', 'safety'];
const POWER_WEIGHTS = [3, 2, 2, 1.5, 2, 2, 2, 2, 2];
const HALF_W = 2.3;                                       // half the corridor width
const REACH = 11.4;                                       // how far from the centre the centre line may go

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

/** Make hole number `index` (0-based) with hero `type`, trying neighbouring sub-seeds until the layout is valid. */
export function makeHole(seed, index, type = 'windmill') {
  for (let attempt = 0; attempt < 80; attempt++) {
    const h = build((seed + Math.imul(attempt, 0x9e3779b1)) >>> 0, index, type);
    if (h) return h;
  }
  return fallback(index);
}

function build(seed, index, type) {
  const r = mulberry32(seed);
  const bends = index < 2 ? 1 + (r() < 0.4 ? 1 : 0) : 1 + ((r() * 3) | 0);
  const xs = [-10.5];
  for (let k = 1; k <= bends; k++) xs.push(q(-10.5 + (21 * k) / (bends + 1) + (r() - 0.5) * (bends === 1 ? 4 : 2.2)));
  xs.push(10.5);
  let sign = r() < 0.5 ? 1 : -1, z = q((r() * 2 - 1) * 4.5);
  const path = [];
  for (let i = 0; i < xs.length; i++) {
    if (i > 0) { z = q(clamp(z + sign * (3.5 + r() * 3.5), -6.5, 6.5)); sign = -sign; }
    if (xs[i] * xs[i] + z * z > REACH * REACH) return null;
    path.push({ x: xs[i], z });
  }
  const dirs = [];
  let length = 0, hi = -1, hl = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x, dz = path[i + 1].z - path[i].z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 4.5) return null;
    dirs.push({ x: dx / l, z: dz / l, l }); length += l;
    if (l > hl) { hl = l; hi = i; }
  }
  for (let i = 0; i < dirs.length - 1; i++) if (dirs[i].x * dirs[i + 1].x + dirs[i].z * dirs[i + 1].z < 0.18) return null;
  if (hl < (NEED[type] || 8)) return null;                // room for the hero obstacle

  // the corridor's two edges, mitred at the bends so the walls join up
  const left = [], right = [];
  for (let i = 0; i < path.length; i++) {
    let nx, nz, k = 1;
    const a = dirs[i - 1], b = dirs[i];
    if (!a) { nx = -b.z; nz = b.x; } else if (!b) { nx = -a.z; nz = a.x; }
    else { nx = -(a.z + b.z); nz = a.x + b.x; const l = Math.sqrt(nx * nx + nz * nz) || 1; nx /= l; nz /= l; k = 1 / Math.max(0.5, nx * -a.z + nz * a.x); }
    left.push({ x: path[i].x + nx * HALF_W * k, z: path[i].z + nz * HALF_W * k });
    right.push({ x: path[i].x - nx * HALF_W * k, z: path[i].z - nz * HALF_W * k });
  }
  const walls = [];                                       // [ax, az, bx, bz, visible, ghostable]
  for (let i = 0; i < path.length - 1; i++) walls.push([left[i].x, left[i].z, left[i + 1].x, left[i + 1].z, 1, 0], [right[i].x, right[i].z, right[i + 1].x, right[i + 1].z, 1, 0]);
  const n = path.length - 1;
  walls.push([left[0].x, left[0].z, right[0].x, right[0].z, 1, 0], [left[n].x, left[n].z, right[n].x, right[n].z, 1, 0]);

  // the hero obstacle, on the longest leg
  const d = dirs[hi], P = path[hi];
  const hero = buildHero(type, { x: P.x, z: P.z, ux: d.x, uz: d.z, nx: -d.z, nz: d.x, len: hl, hw: HALF_W }, r);
  for (const w of hero.walls) walls.push(w);
  const keep = [{ x: hero.x, z: hero.z, r: type === 'teleport' ? hl * 0.4 : 3.2 }];       // places the other features keep clear of
  const tee = path[0], cup = path[path.length - 1];
  keep.push({ x: tee.x + 0.9, z: tee.z, r: 1.6 }, { x: cup.x, z: cup.z, r: 1.8 });
  const free = (x, zz, m) => { for (const k of keep) { const dx = x - k.x, dz = zz - k.z; if (Math.sqrt(dx * dx + dz * dz) < k.r + m) return false; } return true; };
  const onLeg = (li, t, lat) => { const L = dirs[li], Q = path[li]; return { x: Q.x + L.x * L.l * t - L.z * lat, z: Q.z + L.z * L.l * t + L.x * lat }; };
  const others = []; for (let i = 0; i < dirs.length; i++) if (i !== hi && dirs[i].l >= 6.5) others.push(i);

  // water: a river that carries the ball along (holes 2, 5, 8 and sometimes later ones), or a pond to steer round (holes 3, 6, 9 and sometimes later ones)
  const rivers = [], ponds = [], sands = [], bumpers = [], posts = [], hills = [];
  const wantRiver = index % 3 === 1 || (index > 5 && r() < 0.3), wantPond = (index % 3 === 2 || (index > 5 && r() < 0.3)) && type !== 'drawbridge';
  if (wantRiver && others.length) {
    const li = others[(r() * others.length) | 0], L = dirs[li], t0 = 0.18 + r() * 0.18, len = Math.min(L.l * 0.55, 6.5);
    const a = onLeg(li, t0, 0), fwd = r() < 0.78;
    const b = { x: a.x + L.x * len, z: a.z + L.z * len };
    rivers.push({ a: fwd ? a : b, b: fwd ? b : a, hw: 1.0, acc: 6.5 });
    keep.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: len / 2 });
  }
  if (wantPond && others.length) {
    const li = others[((r() * others.length) | 0)], side = r() < 0.5 ? 1 : -1, p = onLeg(li, 0.5, 0.85 * side);
    if (free(p.x, p.z, 1.3)) { ponds.push({ x: q(p.x), z: q(p.z), r: 1.15 }); keep.push({ x: p.x, z: p.z, r: 2.2 }); }
  }
  // gentle hills along the corridor, kept clear of the tee, the cup and the hero (they only bump up, so the fairway sits flush on the lawn)
  for (let k = 0; k < 2; k++) {
    const li = (r() * dirs.length) | 0, p = onLeg(li, 0.25 + r() * 0.5, (r() * 2 - 1) * 0.8), rad = q(3 + r() * 1.5), h = 0.5 + r() * 0.4;
    if (free(p.x, p.z, rad + 0.3)) hills.push({ x: q(p.x), z: q(p.z), r: rad, h: Math.round(h * 10) / 10 });
  }
  // posts, bumpers and sand
  for (const li of [0, dirs.length - 1]) {
    if (r() < 0.5) { const p = onLeg(li, 0.4 + r() * 0.2, (r() < 0.5 ? 1 : -1) * 0.95); if (free(p.x, p.z, 1.0)) { posts.push({ x: q(p.x), z: q(p.z), r: 0.45 }); keep.push({ x: p.x, z: p.z, r: 0.6 }); } }
  }
  const nb = index > 2 ? (r() < 0.6 ? 1 : 0) + (r() < 0.3 ? 1 : 0) : 0;
  for (let k = 0; k < nb; k++) { const li = (r() * dirs.length) | 0, p = onLeg(li, 0.3 + r() * 0.4, (r() < 0.5 ? 1 : -1) * 1.15); if (free(p.x, p.z, 1.1)) { bumpers.push({ x: q(p.x), z: q(p.z), r: 0.5 }); keep.push({ x: p.x, z: p.z, r: 0.7 }); } }
  if (index > 1 && r() < 0.55) { const li = (r() * dirs.length) | 0, p = onLeg(li, 0.3 + r() * 0.4, 0); if (free(p.x, p.z, 2.0)) { sands.push({ x: q(p.x), z: q(p.z), r: 1.5 }); keep.push({ x: p.x, z: p.z, r: 1.6 }); } }

  // power-up orbs, off the best line: near a wall
  const pickups = [], np = index === 0 ? 1 : 2, totalW = POWER_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let k = 0; k < np; k++) {
    for (let tries = 0; tries < 12; tries++) {
      const li = (r() * dirs.length) | 0, side = r() < 0.5 ? 1 : -1, p = onLeg(li, 0.15 + r() * 0.7, side * (HALF_W - 0.75));
      if (!free(p.x, p.z, 0.9)) continue;
      let pick = r() * totalW, ti = 0;
      for (; ti < POWERUPS.length - 1; ti++) { pick -= POWER_WEIGHTS[ti]; if (pick <= 0) break; }
      pickups.push({ x: q(p.x), z: q(p.z), type: POWERUPS[ti] }); keep.push({ x: p.x, z: p.z, r: 0.9 }); break;
    }
  }
  const par = Math.max(2, Math.min(5, 2 + Math.floor(length / 16)));
  return { seed, index, type, tee: { x: tee.x, z: tee.z }, cup: { x: cup.x, z: cup.z }, path, hw: HALF_W, left, right, walls, hills, posts, bumpers, sands, rivers, ponds, hero, pickups, par, length };
}

/** A plain straight hole, used only if no valid layout turns up (it should never be needed). */
function fallback(index) {
  const path = [{ x: -10.5, z: 0 }, { x: 10.5, z: 0 }];
  const left = path.map((p) => ({ x: p.x, z: p.z + HALF_W })), right = path.map((p) => ({ x: p.x, z: p.z - HALF_W }));
  const walls = [[-10.5, HALF_W, 10.5, HALF_W, 1, 0], [-10.5, -HALF_W, 10.5, -HALF_W, 1, 0], [-10.5, HALF_W, -10.5, -HALF_W, 1, 0], [10.5, HALF_W, 10.5, -HALF_W, 1, 0]];
  return { seed: 0, index, type: 'none', tee: path[0], cup: path[1], path, hw: HALF_W, left, right, walls, hills: [], posts: [], bumpers: [], sands: [], rivers: [], ponds: [], hero: null, pickups: [], par: 3, length: 21 };
}
