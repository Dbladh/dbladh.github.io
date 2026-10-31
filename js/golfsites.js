// Where the nine holes of a month's course lie on the landscape around the windmill. Pure data and maths (no THREE), deterministic like golfgen.js.
// The ground is fixed (only the plants and houses are random per visit), so the candidate sites were found once by sampling it: gentle spots clear of the signs, the pond and the windmill.
// Each month picks nine of them, an order that makes a short tour, and a heading (one of eight, in 45 degree steps) for every hole; some face the windmill so that it stands in the background.
import { mulberry32 } from './golfhero.js?v=20261031002337';

export const WINDMILL = { x: -23, z: -92 };
export const SITES = [[-42, -70], [-50, -100], [0, -100], [-80, -94], [6, -144], [-72, -64], [-60, -140], [-26, -164], [-104, -76], [-92, -122], [-56, -170]];
const START = { x: -10, z: -60 };                          // the tour begins at the site nearest this (on the near side of the windmill, where the camera arrives)
const C45 = 0.7071067811865476;
/** Heading k turns the hole by k * 45 degrees about the vertical (c, s are the cosine and sine): its local +x then points along world (c, -s). */
export const YAWS = [[1, 0], [C45, C45], [0, 1], [-C45, C45], [-1, 0], [-C45, -C45], [0, -1], [C45, -C45]];
export const MARGIN = 2.2, BLEND = 5.5;                    // the lawn runs this far beyond the walls; the hillside eases back in over BLEND more

/** A point of a hole (its own coordinates) in the world. */
export function toWorld(site, x, z) { const [c, s] = YAWS[site.k]; return { x: site.x + x * c + z * s, z: site.z - x * s + z * c }; }

const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z);
const norm = (x, z) => { const l = Math.sqrt(x * x + z * z) || 1; return { x: x / l, z: z / l }; };

/** How far apart two placed holes' levelled ground is (negative: they overlap). */
function clearance(shapeA, shapeB) {
  let best = 1e9;
  for (const a of shapeA) for (const b of shapeB) {
    const dx = a[0] - b[0], dz = a[1] - b[1], d = Math.sqrt(dx * dx + dz * dz) - (a[2] + MARGIN) - (b[2] + MARGIN) - BLEND;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Lay the course out. `holes` are the nine generated holes in play order. Returns { sites: [{ x, z, k }] (one per hole, in play order), shapes: [[[wx, wz, flatRadius], ...], ...] }.
 */
export function planCourse(seed, holes) {
  const r = mulberry32((seed + 0x517cc1b7) >>> 0), n = holes.length;
  const byDist = SITES.map((p, i) => ({ x: p[0], z: p[1], i })).sort((a, b) => d2(a, WINDMILL) - d2(b, WINDMILL) || a.i - b.i);
  const keep = byDist.slice(0, 6), rest = byDist.slice(6);
  for (let i = rest.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
  const pool = keep.concat(rest.slice(0, n - keep.length));
  // a short tour: start near the camera's side and keep going to the nearest site not yet visited
  const order = []; let cur = pool.reduce((a, b) => (d2(a, START) <= d2(b, START) ? a : b));
  while (pool.length) { pool.splice(pool.indexOf(cur), 1); order.push(cur); if (pool.length) cur = pool.reduce((a, b) => (d2(a, cur) <= d2(b, cur) ? a : b)); }
  const sites = [], shapes = [];
  for (let h = 0; h < n; h++) {
    const S = order[h], nxt = order[h + 1] || WINDMILL;
    const toWind = norm(WINDMILL.x - S.x, WINDMILL.z - S.z), toNext = norm(nxt.x - S.x, nxt.z - S.z);
    const pref = h % 3 === 2 || h === n - 1 ? toWind : toNext.x * toWind.x + toNext.z * toWind.z > 0.35 ? toWind : toNext;
    const ks = YAWS.map((_, k) => k).sort((a, b) => (YAWS[b][0] * pref.x - YAWS[b][1] * pref.z) - (YAWS[a][0] * pref.x - YAWS[a][1] * pref.z) || a - b);
    let pick = null, bestClear = -1e9;
    for (const k of ks) {
      const site = { x: S.x, z: S.z, k }, shape = holes[h].shape.map((p) => { const w = toWorld(site, p[0], p[1]); return [w.x, w.z, p[2]]; });
      let clr = 1e9; for (const o of shapes) clr = Math.min(clr, clearance(shape, o));
      if (clr >= 0) { pick = { site, shape }; break; }
      if (clr > bestClear) { bestClear = clr; pick = { site, shape }; }
    }
    sites.push(pick.site); shapes.push(pick.shape);
  }
  return { sites, shapes };
}
