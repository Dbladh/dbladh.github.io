// The scenery round and between the holes: a landmark or two for each hole's theme (a pirate ship, jungle palms, a castle, crystals, a garden fountain) and scattered pieces of the park
// (statues, fountains, benches, parasols, ponds, palms). Everything is placed with a seeded generator on the real ground, away from every corridor.
import * as THREE from 'three';
import { mulberry32 } from './golfhero.js?v=20261026204121';
import { golfMaterials } from './golfmat.js?v=20261026204121';
import { waterMaterial, pondGeometry } from './golfwater.js?v=20261026204121';
import { SITES, WINDMILL } from './golfsites.js?v=20261026204121';

export const THEMES = ['pirate', 'jungle', 'castle', 'space', 'garden'];
export const THEME_NAMES = { pirate: 'Pirate Cove', jungle: 'Jungle', castle: 'Castle', space: 'Crystal Cave', garden: 'Garden' };
export const THEME_BORDER = { pirate: 'wood', jungle: 'stone', castle: 'brick', space: 'stone', garden: 'brick' };

const paints = new Map();
const paint = (hex, neon) => { const k = hex + (neon || ''); let m = paints.get(k); if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); if (neon) m.userData.neon = neon; paints.set(k, m); } return m; };
const geos = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 12), cone: new THREE.ConeGeometry(1, 1, 8), sph: new THREE.SphereGeometry(1, 12, 9), oct: new THREE.OctahedronGeometry(1, 0), torus: new THREE.TorusGeometry(1, 0.12, 6, 18),
  hull: (() => { const g = new THREE.BoxGeometry(1, 1, 1, 4, 1, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); if (y < 0) p.setZ(i, p.getZ(i) * (0.55 + 0.45 * (1 - Math.abs(x) * 1.0))); if (x > 0.2) p.setZ(i, p.getZ(i) * (1 - (x - 0.2) * 1.0)); if (x > 0.3 && y > 0) p.setY(i, y + (x - 0.3) * 0.7); } g.computeVertexNormals(); return g; })(),
};
const part = (g, geo, mat, x, y, z, sx, sy, sz, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; g.add(o); return o; };

const pieces = {
  statue(GM) { const g = new THREE.Group(), st = GM.lam(GM.tex.stone, '#cfcfd6'); part(g, geos.box, st, 0, 0.35, 0, 1.0, 0.7, 1.0); part(g, geos.box, st, 0, 0.8, 0, 0.75, 0.2, 0.75); part(g, geos.cyl, st, 0, 1.6, 0, 0.26, 1.2, 0.2); part(g, geos.sph, st, 0, 2.4, 0, 0.3, 0.32, 0.3); part(g, geos.box, st, 0.55, 1.9, 0, 0.7, 0.14, 0.14).rotation.z = 0.5; part(g, geos.box, st, -0.5, 1.9, 0, 0.6, 0.14, 0.14).rotation.z = -0.4; return g; },
  bench(GM) { const g = new THREE.Group(), w = GM.lam(GM.tex.wood, '#c89358'), d = paint('#33343c', 'metal'); part(g, geos.box, w, 0, 0.5, 0, 1.6, 0.1, 0.55); part(g, geos.box, w, 0, 0.9, -0.25, 1.6, 0.45, 0.08); for (const x of [-0.7, 0.7]) part(g, geos.box, d, x, 0.25, 0, 0.1, 0.5, 0.5); return g; },
  parasol(GM, r) { const g = new THREE.Group(), col = ['#ff6f91', '#4fc3f7', '#ffd166', '#7ed957'][(r() * 4) | 0]; part(g, geos.cyl, paint('#e8e8ee', 'metal'), 0, 1.2, 0, 0.05, 2.4, 0.05); part(g, geos.cone, paint(col, 'flower'), 0, 2.45, 0, 1.4, 0.55, 1.4); part(g, geos.cyl, paint('#ffffff'), 0, 0.05, 0, 0.3, 0.1, 0.3); return g; },
  palm(GM, r) { const g = new THREE.Group(), tr = GM.lam(GM.tex.wood, '#b88a5a'), h = 3 + r() * 1.6; for (let i = 0; i < 4; i++) part(g, geos.cyl, tr, Math.sin(i) * 0.05 * i, 0.5 + i * h / 4.6, 0, 0.18 - i * 0.015, h / 4, 0.18 - i * 0.015).rotation.z = 0.04 * i; for (let k = 0; k < 7; k++) { const f = part(g, geos.cone, paint('#3fae5a', 'conifer'), Math.cos(k * 0.9) * 0.9, h + 0.35, Math.sin(k * 0.9) * 0.9, 0.22, 1.5, 0.5, -k * 0.9); f.rotation.z = 1.25; f.rotation.y = -k * 0.9; f.position.y = h + 0.3 - Math.abs(Math.sin(k)) * 0.1; } part(g, geos.sph, paint('#7a5a2a'), 0.15, h - 0.1, 0.1, 0.17, 0.17, 0.17); return g; },
  fountain(GM, r, ctx) {
    const g = new THREE.Group(), st = GM.lam(GM.tex.stone, '#d9d9e0'), poly = []; for (let i = 0; i < 16; i++) poly.push(Math.cos((i / 16) * 6.2832) * 1.9, Math.sin((i / 16) * 6.2832) * 1.9);
    part(g, geos.cyl, st, 0, 0.3, 0, 2.2, 0.6, 2.2); const wm = waterMaterial(ctx.look, 0, 0, 0); ctx.mats.push(wm); const pg = pondGeometry(poly, 0.62), wmesh = new THREE.Mesh(pg, wm); wmesh.renderOrder = 2; g.add(wmesh); ctx.geos.push(pg);
    part(g, geos.cyl, st, 0, 1.0, 0, 0.3, 1.0, 0.3); part(g, geos.cyl, st, 0, 1.6, 0, 0.9, 0.18, 0.9); part(g, geos.sph, st, 0, 1.85, 0, 0.3, 0.3, 0.3); ctx.jets.push(g); return g;
  },
  pond(GM, r, ctx) { const g = new THREE.Group(), poly = [], rr = 1.8 + r() * 1.4, rng = mulberry32((r() * 1e9) | 0); for (let i = 0; i < 16; i++) { const k = 1 + 0.25 * rng(); poly.push(Math.cos((i / 16) * 6.2832) * rr * k, Math.sin((i / 16) * 6.2832) * rr * k * 0.75); } const wm = waterMaterial(ctx.look, 0, 0, 0); ctx.mats.push(wm); const pg = pondGeometry(poly, 0.09), m = new THREE.Mesh(pg, wm); m.renderOrder = 2; g.add(m); ctx.geos.push(pg); const rk = GM.lam(GM.tex.stone, '#a8a39a'); for (let i = 0; i < 16; i++) part(g, geos.sph, rk, poly[i * 2] * 1.04, 0.1, poly[i * 2 + 1] * 1.04, 0.3 + rng() * 0.22, 0.14, 0.26 + rng() * 0.2, rng() * 3); for (let i = 0; i < 4; i++) { const a = rng() * 6.28, d = rr * 0.9; part(g, geos.cyl, paint('#6fa84a', 'tuft'), Math.cos(a) * d, 0.5, Math.sin(a) * d * 0.7, 0.04, 1.0, 0.04); } return g; },
};
const themed = {
  pirate(GM) { const g = new THREE.Group(), wd = GM.lam(GM.tex.wood, '#8a5a38'), wd2 = GM.lam(GM.tex.wood, '#c89358'); part(g, geos.hull, wd, 0, 1.1, 0, 7, 1.7, 2.4); part(g, geos.box, wd2, -0.5, 1.95, 0, 5.2, 0.15, 2.0); part(g, geos.cyl, wd2, 0.2, 3.8, 0, 0.09, 3.6, 0.09); part(g, geos.box, paint('#f4ead0'), 0.2, 4.4, 0, 0.06, 1.8, 1.9); part(g, geos.cyl, wd2, -2.0, 3.1, 0, 0.07, 2.2, 0.07); part(g, geos.box, paint('#f4ead0'), -2.0, 3.5, 0, 0.05, 1.2, 1.3); part(g, geos.box, paint('#1d1d24'), 0.2, 5.8, 0.35, 0.04, 0.5, 0.7); for (let i = 0; i < 3; i++) part(g, geos.cyl, paint('#6b4a2c'), 2.6 + i * 0.01, 2.2 + i * 0.3, 0.7 - i * 0.6, 0.3, 0.45, 0.3); return g; },
  jungle(GM, r) { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const p = pieces.palm(GM, r); p.position.set((i - 1.5) * 1.8, 0, (r() - 0.5) * 2); p.scale.setScalar(1.2 + r() * 0.4); g.add(p); } const tk = GM.lam(GM.tex.wood, '#a06a3a'); part(g, geos.cyl, tk, 4, 1.4, 0, 0.3, 2.8, 0.3); part(g, geos.box, paint('#e5483f', 'plaster'), 4, 2.6, 0, 0.9, 0.7, 0.6); part(g, geos.box, paint('#ffd23f', 'plaster'), 4, 3.3, 0, 0.7, 0.5, 0.5); return g; },
  castle(GM) { const g = new THREE.Group(), st = GM.lam(GM.tex.stone, '#c9c4d6'); for (const [x, h, c] of [[-2.6, 5, '#d24a45'], [0, 6.4, '#4f7be0'], [2.6, 5, '#e0b13f']]) { part(g, geos.cyl, st, x, h / 2, 0, 0.95, h, 0.95); part(g, geos.cone, paint(c, 'shingle'), x, h + 0.7, 0, 1.2, 1.6, 1.2); part(g, geos.cyl, paint('#ffffff'), x, h + 1.7, 0, 0.03, 0.9, 0.03); part(g, geos.box, paint(c), x + 0.35, h + 2.0, 0, 0.7, 0.35, 0.03); } part(g, geos.box, st, 0, 1.6, 0, 6.2, 3.2, 1.0); part(g, geos.box, paint('#2a2530'), 0, 0.9, 0.52, 1.1, 1.8, 0.05); for (let i = 0; i < 6; i++) part(g, geos.box, st, -2.5 + i, 3.4, 0, 0.5, 0.35, 1.0); return g; },
  space(GM, r) { const g = new THREE.Group(); const cols = ['#8a63ff', '#4fe3ff', '#ff4fd8', '#6dff9a']; for (let i = 0; i < 7; i++) { const h = 1.2 + r() * 2.8, c = cols[i % 4], o = part(g, geos.oct, paint(c, 'metal'), (r() - 0.5) * 3.6, h * 0.6, (r() - 0.5) * 2.2, 0.5 + r() * 0.3, h, 0.5 + r() * 0.3); o.rotation.z = (r() - 0.5) * 0.4; } part(g, geos.sph, paint('#cfd8ff', 'metal'), -2.8, 0.6, 1.2, 1.1, 1.1, 1.1); return g; },
  garden(GM, r, ctx) { const g = new THREE.Group(), f = pieces.fountain(GM, r, ctx); f.position.set(0, 0, 0); g.add(f); const hg = paint('#2f8a44', 'bush'); for (let k = 0; k < 8; k++) { const a = k * 0.5 + 2.6; part(g, geos.box, hg, Math.cos(a) * 3.4, 0.45, Math.sin(a) * 3.4, 1.2, 0.9, 0.6, -a + Math.PI / 2); } for (let k = 0; k < 6; k++) part(g, geos.sph, paint(['#ff6f91', '#ffd166', '#c792ea'][k % 3], 'flower'), (r() - 0.5) * 5, 0.2, 2 + r(), 0.22, 0.22, 0.22); return g; },
};

/**
 * Build all the scenery. `plan` is [{ site, hole, theme }] per hole; `shapes` the world-space outlines ([x, z, w] points) of every hole, `ground(x, z)` the real height, `look` the pond's water look.
 * Returns { group, update(dt, fx), dispose() }.
 */
export function buildScenery(holes, sites, shapes, ground, look, seed, lowEnd, toWorld) {
  const GM = golfMaterials(lowEnd), r = mulberry32((seed ^ 0x5ce9e4) >>> 0), group = new THREE.Group(), ctx = { look, mats: [], geos: [], jets: [] };
  const spots = [], blocked = (x, z, m) => { for (const sh of shapes) for (const p of sh) if (Math.hypot(x - p[0], z - p[1]) < p[2] + m) return true; for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < s.r + m * 0.6) return true; return Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 16; };
  const flatAt = (x, z) => { const y = ground(x, z); return Math.abs(ground(x + 1.5, z) - y) < 0.9 && Math.abs(ground(x, z + 1.5) - y) < 0.9; };
  const place = (obj, x, z, rot, rad) => { obj.position.set(x, ground(x, z), z); obj.rotation.y = rot; group.add(obj); spots.push({ x, z, r: rad }); };
  holes.forEach((h, i) => {                                // the hole's theme landmark: just outside its walls, off to one side
    const S = sites[i], th = h.theme, b = h.bounds; if (!themed[th]) return;
    for (let t = 0; t < 14; t++) {
      const side = r() < 0.5 ? 1 : -1, lx = b.cx + (r() - 0.5) * b.hx * 1.2, lz = b.cz + side * (b.hz + 6.5 + r() * 2), p = toWorld(S, lx, lz);
      if (blocked(p.x, p.z, 5) || !flatAt(p.x, p.z)) continue;
      const obj = themed[th](GM, r, ctx); obj.scale.setScalar(th === 'pirate' ? 0.8 : 0.9); place(obj, p.x, p.z, Math.atan2(-(S.x - p.x), -(S.z - p.z)), 4.5); break;
    }
  });
  const kinds = ['statue', 'fountain', 'pond', 'bench', 'parasol', 'palm', 'palm', 'pond', 'bench', 'statue', 'palm', 'parasol', 'fountain', 'palm', 'palm'].slice(0, lowEnd ? 8 : 15);
  for (const kind of kinds) {                              // the park: scattered round the whole course
    for (let t = 0; t < 60; t++) {
      const base = SITES[(r() * SITES.length) | 0], x = base[0] + (r() - 0.5) * 70, z = base[1] + (r() - 0.5) * 70;
      if (blocked(x, z, kind === 'pond' || kind === 'fountain' ? 5 : 3.6) || !flatAt(x, z)) continue;
      const obj = pieces[kind](GM, r, ctx); place(obj, x, z, r() * 6.28, kind === 'pond' || kind === 'fountain' ? 3 : 1.5); break;
    }
  }
  const jets = ctx.jets, wv = new THREE.Vector3(); let tt = 0;
  return {
    group,
    update(dt, fx) { tt += dt; if (fx && group.visible) for (const j of jets) { j.getWorldPosition(wv); fx.jet(wv.x, wv.y + 2.1, wv.z, 0.28, dt, 1.6); } },
    dispose() { for (const g of ctx.geos) g.dispose(); for (const m of ctx.mats) m.dispose(); },
  };
}
