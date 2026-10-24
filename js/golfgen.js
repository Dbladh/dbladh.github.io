// The mini-golf holes, made from a seed. This file is pure data (no THREE) and deterministic: the same seed gives the same hole on every device.
// To keep that true it uses only the seeded integer generator and + - * / sqrt (never Math.random, sin, cos or pow in the layout), and rounds every point to half a unit.
//
// A hole is a winding corridor across the lawn: straight legs joined by rounded bends (the hero obstacle sits on a straight run), a round tee green and a round cup green, chambers
// where the corridor swells, walls offset from the centre line, gentle hills, water (a river that carries the ball, or a pond), posts, bumpers, sand, and a couple of power-up orbs placed off the best line.
// Local coordinates: x runs left to right, z toward the viewer, the course's centre is (0, 0), and the lawn is at height 0.
import { mulberry32, heroOrder, buildHero, NEED } from './golfhero.js?v=20261024160140';
export { mulberry32, heroOrder };

export const HOLES = 9;
export const POWERUPS = ['homing', 'ghost', 'multi', 'hamster', 'mega', 'turbo', 'bounce', 'freeze', 'safety'];
const POWER_WEIGHTS = [3, 2, 2, 1.5, 2, 2, 2, 2, 2];
const HALF_W = 2.3;                                       // half the corridor width
const PAD_R = 2.9;                                        // the round tee and cup greens
const END_X = 10.5, REACH = 11.4;                         // where the centre line starts and ends, and how far from the centre it may go
const WALL_REACH = 15.2;                                  // nothing of the hole may be further than this from its centre
const SPACING = 0.6, CUT_MAX = 2.6;                       // distance between centre-line points; the most a bend cuts off a leg
const C15 = 0.9659258262890683, S15 = 0.25881904510252074;     // cos and sin of 15 degrees: arcs are built by turning by this a fixed number of times, so no trig is needed
const CAP_STEPS = 6;
const smoothstep01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

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
  for (let attempt = 0; attempt < 120; attempt++) {
    const h = build((seed + Math.imul(attempt, 0x9e3779b1)) >>> 0, index, type, false);
    if (h) return h;
  }
  for (let attempt = 0; attempt < 40; attempt++) {         // (it should never come to this) a plain straight hole
    const h = build((seed + Math.imul(attempt, 0x9e3779b1)) >>> 0, index, type, true);
    if (h) return h;
  }
  throw new Error('no valid mini-golf hole');
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

function build(seed, index, type, force) {
  const r = mulberry32(seed);
  const bends = force ? 0 : index < 2 ? 1 + (r() < 0.4 ? 1 : 0) : 1 + ((r() * 3) | 0);
  const xs = [-END_X];
  for (let k = 1; k <= bends; k++) xs.push(q(-END_X + ((2 * END_X) * k) / (bends + 1) + (r() - 0.5) * (bends === 1 ? 4 : 2.2)));
  xs.push(END_X);
  let sign = r() < 0.5 ? 1 : -1, z = force ? 0 : q((r() * 2 - 1) * 4.5);
  const path = [];
  for (let i = 0; i < xs.length; i++) {
    if (i > 0 && !force) { z = q(clamp(z + sign * (3.5 + r() * 3.5), -6.5, 6.5)); sign = -sign; }
    if (xs[i] * xs[i] + z * z > REACH * REACH) return null;
    path.push({ x: xs[i], z });
  }
  const dirs = [], nLegs = path.length - 1;
  let length = 0;
  for (let i = 0; i < nLegs; i++) {
    const dx = path[i + 1].x - path[i].x, dz = path[i + 1].z - path[i].z, l = Math.sqrt(dx * dx + dz * dz);
    if (l < 5.5) return null;
    dirs.push({ x: dx / l, z: dz / l, l });
  }
  for (let i = 0; i < dirs.length - 1; i++) if (dirs[i].x * dirs[i + 1].x + dirs[i].z * dirs[i + 1].z < 0.18) return null;
  // each bend is rounded: it cuts `cut` off both of the legs that meet there and a curve is drawn through the corner
  const cut = [0];
  for (let i = 1; i < nLegs; i++) cut.push(Math.min(CUT_MAX, 0.4 * Math.min(dirs[i - 1].l, dirs[i].l)));
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
  const tee = cl[0], cup = cl[N - 1], ball = { x: tee.x + tx[0] * 1.3, z: tee.z + tz[0] * 1.3 };
  const keep = [{ x: hero.x, z: hero.z, r: type === 'teleport' ? hl * 0.4 : type === 'loop' ? hl * 0.5 : 3.2 }];       // places the other features keep clear of
  keep.push({ x: ball.x, z: ball.z, r: 1.7 }, { x: cup.x, z: cup.z, r: 1.8 });
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
    rivers.push({ a: fwd ? a : b, b: fwd ? b : a, hw: 1.0, acc: 6.5 });
    keep.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: len / 2 });
  }
  if (wantPond && others.length) {
    const li = others[((r() * others.length) | 0)], side = r() < 0.5 ? 1 : -1, p = onLeg(li, 0.5, 0.85 * side);
    if (free(p.x, p.z, 1.3)) { ponds.push({ x: q(p.x), z: q(p.z), r: 1.15 }); keep.push({ x: p.x, z: p.z, r: 2.2 }); }
  }
  // gentle hills along the corridor, kept clear of the tee, the cup and the hero (they only bump up, so the fairway sits flush on the lawn)
  const nHills = type === 'loop' ? 0 : 2 + (index > 2 ? 1 : 0) + (index > 5 ? 1 : 0);
  const hillOk = (x, zz, rad) => { for (const k of keep) { const dx = x - k.x, dz = zz - k.z; if (Math.sqrt(dx * dx + dz * dz) < rad * 0.9 + k.r * 0.4) return false; } return true; };
  for (let k = 0; k < nHills; k++) {
    for (let tries = 0; tries < 8; tries++) {
      const ci = 6 + ((r() * (N - 12)) | 0), lat = (r() * 2 - 1) * 0.9, p = { x: cl[ci].x - tz[ci] * lat, z: cl[ci].z + tx[ci] * lat }, rad = q(3 + r() * 2), h = 0.6 + r() * 0.55;
      if (!hillOk(p.x, p.z, rad)) continue;
      hills.push({ x: q(p.x), z: q(p.z), r: rad, h: Math.round(h * 10) / 10 }); keep.push({ x: p.x, z: p.z, r: rad * 0.8 }); break;
    }
  }
  // posts, bumpers and sand
  for (const li of [0, legs.length - 1]) {
    if (r() < 0.5) { const p = onLeg(li, 0.4 + r() * 0.2, (r() < 0.5 ? 1 : -1) * 0.95); if (free(p.x, p.z, 1.0)) { posts.push({ x: q(p.x), z: q(p.z), r: 0.45 }); keep.push({ x: p.x, z: p.z, r: 0.6 }); } }
  }
  const nb = index > 2 ? (r() < 0.6 ? 1 : 0) + (r() < 0.3 ? 1 : 0) : 0;
  for (let k = 0; k < nb; k++) { const li = (r() * legs.length) | 0, p = onLeg(li, 0.3 + r() * 0.4, (r() < 0.5 ? 1 : -1) * 1.15); if (free(p.x, p.z, 1.1)) { bumpers.push({ x: q(p.x), z: q(p.z), r: 0.5 }); keep.push({ x: p.x, z: p.z, r: 0.7 }); } }
  if (index > 1 && r() < 0.55) { const li = (r() * legs.length) | 0, p = onLeg(li, 0.3 + r() * 0.4, 0); if (free(p.x, p.z, 2.0)) { sands.push({ x: q(p.x), z: q(p.z), r: 1.5 }); keep.push({ x: p.x, z: p.z, r: 1.6 }); } }

  // power-up orbs, off the best line: near a wall
  const pickups = [], np = index === 0 ? 1 : 2, totalW = POWER_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let k = 0; k < np; k++) {
    for (let tries = 0; tries < 12; tries++) {
      const li = (r() * legs.length) | 0, side = r() < 0.5 ? 1 : -1, p = onLeg(li, 0.15 + r() * 0.7, side * (HALF_W - 0.75));
      if (!free(p.x, p.z, 0.9)) continue;
      let pick = r() * totalW, ti = 0;
      for (; ti < POWERUPS.length - 1; ti++) { pick -= POWER_WEIGHTS[ti]; if (pick <= 0) break; }
      pickups.push({ x: q(p.x), z: q(p.z), type: POWERUPS[ti] }); keep.push({ x: p.x, z: p.z, r: 0.9 }); break;
    }
  }
  const par = Math.max(2, Math.min(5, 2 + Math.floor(length / 16)));
  const bounds = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2 };
  const shape = cl.map((p, i) => [p.x, p.z, w[i]]);       // the centre line with the half-width at each point (for levelling the ground and for keeping holes apart)
  return { seed, index, type, tee: { x: tee.x, z: tee.z }, cup: { x: cup.x, z: cup.z }, ball, path: cl, left, right, ribbon, outline, bounds, shape, widths: w, hw: HALF_W, walls, hills, posts, bumpers, sands, rivers, ponds, hero, pickups, par, length };
}
