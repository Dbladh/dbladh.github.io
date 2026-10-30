// The scenery round and between the holes: a landmark or two for each hole's theme (a pirate ship, jungle palms, a castle, crystals, a garden fountain) and scattered pieces of the park
// (statues, fountains, benches, parasols, ponds, palms). Everything is placed with a seeded generator on the real ground, away from every corridor.
import * as THREE from 'three';
import { mulberry32 } from './golfhero.js?v=20261029221439';
import { golfMaterials } from './golfmat.js?v=20261029221439';
import { waterMaterial, pondGeometry } from './golfwater.js?v=20261029221439';
import { SITES, WINDMILL } from './golfsites.js?v=20261029221439';
import { isLow } from './golfquality.js?v=20261029221439';

import { THEMES as THEME_DATA, THEME_NAMES } from './golfthemes.js?v=20261029221439';
export const THEMES = Object.keys(THEME_DATA);
export { THEME_NAMES };

const paints = new Map();
const paint = (hex, neon) => { const k = hex + (neon || ''); let m = paints.get(k); if (!m) { m = isLow() ? new THREE.MeshLambertMaterial({ color: hex }) : new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, envMapIntensity: 0.4 }); if (neon) m.userData.neon = neon; paints.set(k, m); } return m; };
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

const glows = new Map(); const glow = (hex) => { let m = glows.get(hex); if (!m) { m = new THREE.MeshBasicMaterial({ color: hex }); glows.set(hex, m); } return m; };
Object.assign(pieces, {                                    // the small props of the newer themes (also scattered round the park)
  cactus(GM, r) { const g = new THREE.Group(), c = paint('#4f9a4a', 'bush'), h = 1.5 + r() * 1.0; part(g, geos.cyl, c, 0, h / 2, 0, 0.26, h, 0.26); part(g, geos.sph, c, 0, h, 0, 0.26, 0.26, 0.26); part(g, geos.cyl, c, 0.42, h * 0.55, 0, 0.17, 0.3, 0.17); part(g, geos.cyl, c, 0.42, h * 0.78, 0, 0.13, 0.5, 0.13); part(g, geos.cyl, c, -0.4, h * 0.4, 0, 0.17, 0.3, 0.17); part(g, geos.cyl, c, -0.4, h * 0.62, 0, 0.13, 0.45, 0.13); return g; },
  dune(GM) { const g = new THREE.Group(); part(g, geos.sph, GM.lam(GM.tex.sand, '#ffe3a0'), 0, 0, 0, 2.6, 0.9, 1.7); return g; },
  snowman(GM) { const g = new THREE.Group(), w = paint('#f6fbff'); part(g, geos.sph, w, 0, 0.55, 0, 0.62, 0.55, 0.62); part(g, geos.sph, w, 0, 1.3, 0, 0.45, 0.42, 0.45); part(g, geos.sph, w, 0, 1.85, 0, 0.32, 0.32, 0.32); part(g, geos.cone, paint('#ff8a2a'), 0, 1.85, 0.34, 0.07, 0.3, 0.07).rotation.x = Math.PI / 2; part(g, geos.cyl, paint('#2a2a33'), 0, 2.2, 0, 0.26, 0.28, 0.26); part(g, geos.sph, paint('#2a2a33'), -0.1, 1.92, 0.28, 0.04, 0.04, 0.04); part(g, geos.sph, paint('#2a2a33'), 0.1, 1.92, 0.28, 0.04, 0.04, 0.04); return g; },
  pine(GM, r) { const g = new THREE.Group(), s = 0.9 + r() * 0.5; part(g, geos.cyl, GM.lam(GM.tex.wood, '#7a5230'), 0, 0.4 * s, 0, 0.14, 0.8 * s, 0.14); for (let i = 0; i < 3; i++) { part(g, geos.cone, paint('#2f7a52', 'bush'), 0, (1.1 + i * 0.75) * s, 0, (1.1 - i * 0.28) * s, 1.3 * s, (1.1 - i * 0.28) * s); part(g, geos.cone, paint('#f6fbff'), 0, (1.55 + i * 0.75) * s, 0, (0.7 - i * 0.2) * s, 0.5 * s, (0.7 - i * 0.2) * s); } return g; },
  iceberg(GM, r) { const g = new THREE.Group(), m = paint('#bfe3ff', 'metal'); part(g, geos.oct, m, 0, 0.9, 0, 0.9, 1.4 + r() * 0.8, 0.8).rotation.y = r() * 3; part(g, geos.oct, m, 0.9, 0.5, 0.3, 0.55, 0.9, 0.5); return g; },
  lollipop(GM, r) { const g = new THREE.Group(), c = ['#ff5f9e', '#ffd23f', '#5fd0ff', '#b98cff'][(r() * 4) | 0]; part(g, geos.cyl, paint('#ffffff'), 0, 1.0, 0, 0.07, 2.0, 0.07); const d = part(g, geos.cyl, paint(c), 0, 2.2, 0, 0.7, 0.12, 0.7); d.rotation.x = Math.PI / 2; part(g, geos.torus, paint('#ffffff'), 0, 2.2, 0.08, 0.45, 0.45, 0.45); return g; },
  gumdrop(GM, r) { const g = new THREE.Group(), c = ['#ff5f9e', '#ffd23f', '#5fd0ff', '#7dff9a', '#b98cff'][(r() * 5) | 0]; part(g, geos.sph, paint(c), 0, 0.45, 0, 0.55, 0.55, 0.55); part(g, geos.cyl, paint('#ffffff'), 0, 0.02, 0, 0.5, 0.04, 0.5); return g; },
  cane(GM) { const g = new THREE.Group(); for (let i = 0; i < 6; i++) part(g, geos.cyl, paint(i % 2 ? '#ff4f6a' : '#ffffff'), 0, 0.2 + i * 0.4, 0, 0.12, 0.4, 0.12); part(g, geos.torus, paint('#ff4f6a'), 0.3, 2.5, 0, 0.32, 0.32, 0.32); return g; },
  deadtree(GM, r) { const g = new THREE.Group(), b = paint('#3a3040'); part(g, geos.cyl, b, 0, 1.2, 0, 0.18, 2.4, 0.18); for (let i = 0; i < 4; i++) { const br = part(g, geos.cyl, b, 0.5 * (i % 2 ? 1 : -1), 1.6 + i * 0.3, 0, 0.07, 1.2, 0.07); br.rotation.z = (i % 2 ? -1 : 1) * (0.9 + r() * 0.3); } return g; },
  gravestone(GM, r) { const g = new THREE.Group(), st = GM.lam(GM.tex.stone, '#9a96ad'); part(g, geos.box, st, 0, 0.45, 0, 0.7, 0.9, 0.18); part(g, geos.cyl, st, 0, 0.9, 0, 0.35, 0.18, 0.09).rotation.x = Math.PI / 2; part(g, geos.box, st, 0, 0.55, 0.1, 0.3, 0.05, 0.03); return g; },
  lamp(GM) { const g = new THREE.Group(); part(g, geos.cyl, paint('#2a2630'), 0, 1.1, 0, 0.06, 2.2, 0.06); part(g, geos.sph, glow('#ffd37a'), 0, 2.3, 0, 0.22, 0.28, 0.22); return g; },
  torch(GM) { const g = new THREE.Group(); part(g, geos.cyl, GM.lam(GM.tex.wood, '#6a4326'), 0, 0.8, 0, 0.07, 1.6, 0.07); part(g, geos.cone, glow('#ff9a2a'), 0, 1.8, 0, 0.18, 0.5, 0.18); return g; },
  banner(GM, r) { const g = new THREE.Group(); part(g, geos.cyl, paint('#d9d9e0', 'metal'), 0, 1.4, 0, 0.05, 2.8, 0.05); part(g, geos.box, paint(['#d24a45', '#4f7be0', '#e0b13f'][(r() * 3) | 0]), 0.45, 2.3, 0, 0.9, 0.9, 0.03); return g; },
  crystal(GM, r) { const g = new THREE.Group(), cols = ['#8a63ff', '#4fe3ff', '#ff4fd8']; for (let i = 0; i < 3; i++) part(g, geos.oct, paint(cols[i], 'metal'), (i - 1) * 0.5, 0.7 + i * 0.1, (r() - 0.5) * 0.4, 0.3, 0.9 + r() * 0.6, 0.3); return g; },
  rockspire(GM, r) { const g = new THREE.Group(), m = GM.lam(GM.tex.stone, '#4a4046'); part(g, geos.cone, m, 0, 1.2, 0, 0.7, 2.4 + r(), 0.7); part(g, geos.cone, m, 0.7, 0.7, 0.2, 0.45, 1.4, 0.45); return g; },
  ember(GM, r) { const g = new THREE.Group(); part(g, geos.sph, GM.lam(GM.tex.stone, '#3b3338'), 0, 0.25, 0, 0.6, 0.3, 0.5); part(g, geos.sph, glow('#ff7a2a'), 0, 0.5, 0, 0.35, 0.12, 0.3); return g; },
  fern(GM, r) { const g = new THREE.Group(), c = paint('#3f9a4a', 'bush'); for (let i = 0; i < 6; i++) { const l = part(g, geos.box, c, Math.cos(i) * 0.4, 0.3, Math.sin(i) * 0.4, 0.9, 0.04, 0.22); l.rotation.y = -i; l.rotation.z = 0.5; } return g; },
  shells(GM, r) { const g = new THREE.Group(); for (let i = 0; i < 4; i++) part(g, geos.sph, paint(['#ffd6e0', '#fff1c9', '#ffc9a8'][i % 3]), (r() - 0.5) * 1.6, 0.1, (r() - 0.5) * 1.6, 0.22, 0.12, 0.22); return g; },
  ufo(GM) { const g = new THREE.Group(); part(g, geos.sph, paint('#aab4c8', 'metal'), 0, 2.6, 0, 1.4, 0.35, 1.4); part(g, geos.sph, glow('#7df0ff'), 0, 2.95, 0, 0.7, 0.5, 0.7); for (let i = 0; i < 3; i++) part(g, geos.cyl, paint('#6c7480', 'metal'), Math.cos(i * 2.1) * 0.9, 2.1, Math.sin(i * 2.1) * 0.9, 0.06, 0.8, 0.06); return g; },
});
const baseThemed = (name) => themed[name];
const themed = {
  pirate(GM) { const g = new THREE.Group(), wd = GM.lam(GM.tex.wood, '#8a5a38'), wd2 = GM.lam(GM.tex.wood, '#c89358'); part(g, geos.hull, wd, 0, 1.1, 0, 7, 1.7, 2.4); part(g, geos.box, wd2, -0.5, 1.95, 0, 5.2, 0.15, 2.0); part(g, geos.cyl, wd2, 0.2, 3.8, 0, 0.09, 3.6, 0.09); part(g, geos.box, paint('#f4ead0'), 0.2, 4.4, 0, 0.06, 1.8, 1.9); part(g, geos.cyl, wd2, -2.0, 3.1, 0, 0.07, 2.2, 0.07); part(g, geos.box, paint('#f4ead0'), -2.0, 3.5, 0, 0.05, 1.2, 1.3); part(g, geos.box, paint('#1d1d24'), 0.2, 5.8, 0.35, 0.04, 0.5, 0.7); for (let i = 0; i < 3; i++) part(g, geos.cyl, paint('#6b4a2c'), 2.6 + i * 0.01, 2.2 + i * 0.3, 0.7 - i * 0.6, 0.3, 0.45, 0.3); return g; },
  jungle(GM, r) { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const p = pieces.palm(GM, r); p.position.set((i - 1.5) * 1.8, 0, (r() - 0.5) * 2); p.scale.setScalar(1.2 + r() * 0.4); g.add(p); } const tk = GM.lam(GM.tex.wood, '#a06a3a'); part(g, geos.cyl, tk, 4, 1.4, 0, 0.3, 2.8, 0.3); part(g, geos.box, paint('#e5483f', 'plaster'), 4, 2.6, 0, 0.9, 0.7, 0.6); part(g, geos.box, paint('#ffd23f', 'plaster'), 4, 3.3, 0, 0.7, 0.5, 0.5); return g; },
  castle(GM) { const g = new THREE.Group(), st = GM.lam(GM.tex.stone, '#c9c4d6'); for (const [x, h, c] of [[-2.6, 5, '#d24a45'], [0, 6.4, '#4f7be0'], [2.6, 5, '#e0b13f']]) { part(g, geos.cyl, st, x, h / 2, 0, 0.95, h, 0.95); part(g, geos.cone, paint(c, 'shingle'), x, h + 0.7, 0, 1.2, 1.6, 1.2); part(g, geos.cyl, paint('#ffffff'), x, h + 1.7, 0, 0.03, 0.9, 0.03); part(g, geos.box, paint(c), x + 0.35, h + 2.0, 0, 0.7, 0.35, 0.03); } part(g, geos.box, st, 0, 1.6, 0, 6.2, 3.2, 1.0); part(g, geos.box, paint('#2a2530'), 0, 0.9, 0.52, 1.1, 1.8, 0.05); for (let i = 0; i < 6; i++) part(g, geos.box, st, -2.5 + i, 3.4, 0, 0.5, 0.35, 1.0); return g; },
  space(GM, r) { const g = new THREE.Group(); const cols = ['#8a63ff', '#4fe3ff', '#ff4fd8', '#6dff9a']; for (let i = 0; i < 7; i++) { const h = 1.2 + r() * 2.8, c = cols[i % 4], o = part(g, geos.oct, paint(c, 'metal'), (r() - 0.5) * 3.6, h * 0.6, (r() - 0.5) * 2.2, 0.5 + r() * 0.3, h, 0.5 + r() * 0.3); o.rotation.z = (r() - 0.5) * 0.4; } part(g, geos.sph, paint('#cfd8ff', 'metal'), -2.8, 0.6, 1.2, 1.1, 1.1, 1.1); return g; },
  garden(GM, r, ctx) { const g = new THREE.Group(), f = pieces.fountain(GM, r, ctx); f.position.set(0, 0, 0); g.add(f); const hg = paint('#2f8a44', 'bush'); for (let k = 0; k < 8; k++) { const a = k * 0.5 + 2.6; part(g, geos.box, hg, Math.cos(a) * 3.4, 0.45, Math.sin(a) * 3.4, 1.2, 0.9, 0.6, -a + Math.PI / 2); } for (let k = 0; k < 6; k++) part(g, geos.sph, paint(['#ff6f91', '#ffd166', '#c792ea'][k % 3], 'flower'), (r() - 0.5) * 5, 0.2, 2 + r(), 0.22, 0.22, 0.22); return g; },
};

Object.assign(themed, {
  desert(GM, r) { const g = new THREE.Group(), st = GM.lam(GM.tex.stone, '#e0b878'); part(g, geos.cone, st, 0, 1.7, 0, 2.6, 3.4, 2.6, 0.78); part(g, geos.cone, st, 3.2, 1.0, 0.6, 1.6, 2.0, 1.6, 0.78); for (let i = 0; i < 3; i++) { const c = pieces.cactus(GM, r); c.position.set(-3 + i * 1.3, 0, 2 + r()); g.add(c); } const d = pieces.dune(GM); d.position.set(-1, 0, -3); g.add(d); return g; },
  ice(GM, r) { const g = new THREE.Group(); part(g, geos.sph, paint('#f6fbff'), 0, 0, 0, 2.0, 1.5, 2.0); part(g, geos.cyl, paint('#dcecfb'), 0, 0.45, 1.9, 0.7, 0.9, 0.9).rotation.x = 0; part(g, geos.box, paint('#26334a'), 0, 0.5, 2.35, 0.7, 0.8, 0.1); for (let i = 0; i < 2; i++) { const m = pieces.snowman(GM); m.position.set(3 + i * 1.3, 0, i); g.add(m); } for (let i = 0; i < 3; i++) { const p = pieces.pine(GM, r); p.position.set(-3.2 + i * 1.5, 0, -1.2 - (i % 2)); g.add(p); } return g; },
  candy(GM, r) { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const l = pieces.lollipop(GM, r); l.position.set((i - 1) * 2.2, 0, (r() - 0.5)); l.scale.setScalar(1.5); g.add(l); } part(g, geos.box, paint('#b8754a'), 3.8, 0.9, 0.5, 1.8, 1.8, 1.8); part(g, geos.cone, paint('#ff8ab8'), 3.8, 2.2, 0.5, 1.5, 1.0, 1.5, 0.78); part(g, geos.box, paint('#ffffff'), 3.8, 0.8, 1.42, 0.5, 0.9, 0.06); for (let i = 0; i < 4; i++) { const d = pieces.gumdrop(GM, r); d.position.set(-4 + i * 0.9, 0, 1.8 + (r() - 0.5)); g.add(d); } return g; },
  volcano(GM, r) { const g = new THREE.Group(), m = GM.lam(GM.tex.stone, '#3b3338'); part(g, geos.cone, m, 0, 2.6, 0, 3.4, 5.2, 3.4); part(g, geos.cyl, glow('#ff6a1a'), 0, 5.0, 0, 0.9, 0.2, 0.9); part(g, geos.cone, glow('#ff8a2a'), 0.9, 2.4, 1.6, 0.2, 3.0, 0.2).rotation.z = 0.28; for (let i = 0; i < 3; i++) part(g, geos.sph, paint('#5a5560'), -0.2 + i * 0.5, 5.7 + i * 0.7, 0, 0.7 + i * 0.2, 0.55, 0.7 + i * 0.2); for (let i = 0; i < 2; i++) { const e = pieces.ember(GM, r); e.position.set(-4 + i * 8, 0, 1.5); g.add(e); } return g; },
  haunted(GM, r) { const g = new THREE.Group(), w = paint('#4a4258'), gl = glow('#ffd86a'); part(g, geos.box, w, 0, 1.6, 0, 4.2, 3.2, 2.6); part(g, geos.cone, paint('#2d2638'), 0, 4.0, 0, 3.4, 1.8, 2.2, 0.78); part(g, geos.cyl, w, 2.4, 2.6, 0, 0.9, 5.2, 0.9); part(g, geos.cone, paint('#2d2638'), 2.4, 5.6, 0, 1.2, 1.2, 1.2); for (const [x, y] of [[-1.2, 1.8], [0.4, 1.8], [1.4, 1.8], [-0.4, 3.1]]) part(g, geos.box, gl, x, y, 1.32, 0.45, 0.6, 0.05); const t = pieces.deadtree(GM, r); t.position.set(-3.4, 0, 0.5); g.add(t); for (let i = 0; i < 3; i++) { const s = pieces.gravestone(GM, r); s.position.set(-2 + i * 1.5, 0, 2.6); s.rotation.y = (r() - 0.5) * 0.4; g.add(s); } return g; },
});
{ const baseSpace = themed.space, baseCastle = themed.castle;
  themed.space = (GM, r, ctx) => { const g = baseSpace(GM, r, ctx), u = pieces.ufo(GM); u.position.set(0, 1.2, -2.5); u.scale.setScalar(1.3); g.add(u); return g; };
  themed.castle = (GM, r, ctx) => { const g = baseCastle(GM, r, ctx); for (let i = 0; i < 4; i++) { const b = pieces.banner(GM, r), t = pieces.torch(GM); b.position.set(-4.5 + i * 3, 0, 2.2); t.position.set(-3 + i * 3, 0, 2.4); g.add(b, t); } return g; }; }

{ // high tier: extra parts on each landmark (barrels and a flag on the ship, a gate and flags on the castle, a lava glow and smoke on the volcano, lit windows on the manor, ...)
  const extra = {
    pirate: (GM, g) => { const wd = GM.lam(GM.tex.wood, '#8a5a38'); for (let i = 0; i < 3; i++) part(g, geos.cyl, wd, -3.6 + i * 0.5, 0.35, 1.9 + (i % 2) * 0.3, 0.22, 0.5, 0.22); part(g, geos.box, paint('#1b1b24'), 0.3, 4.9, 0, 0.04, 0.7, 1.0); part(g, geos.torus, paint('#6a4a2a'), 0, 1.5, 1.3, 0.3, 0.3, 0.3); },
    castle: (GM, g) => { const st = GM.lam(GM.tex.stone, '#c9c4d6'); for (let k = 0; k < 9; k++) part(g, geos.box, st, -2.6 + k * 0.65, 3.35, 0.0, 0.4, 0.4, 0.4); part(g, geos.box, paint('#3a2a1e'), 0, 0.9, 1.3, 1.1, 1.8, 0.15); part(g, geos.cyl, glow('#ffd37a'), 0, 2.6, 1.32, 0.2, 0.2, 0.1); },
    volcano: (GM, g) => { const sm = paint('#6a6068'); for (let i = 0; i < 4; i++) part(g, geos.sph, sm, 0.2 * i, 5.8 + i * 0.7, 0, 0.5 + i * 0.18, 0.4 + i * 0.12, 0.5 + i * 0.18); for (let k = 0; k < 3; k++) part(g, geos.cone, glow('#ff7a2a'), Math.cos(k * 2.1) * 1.2, 3.2, Math.sin(k * 2.1) * 1.2, 0.2, 2.2, 0.2).rotation.z = Math.cos(k * 2.1) * 0.5; },
    haunted: (GM, g) => { const gl = glow('#ffd86a'); for (let k = -1; k <= 1; k += 2) part(g, geos.box, gl, k * 1.2, 1.9, 1.33, 0.5, 0.7, 0.05); part(g, geos.sph, glow('#9dffd0'), 2.6, 1.2, 0.8, 0.25, 0.35, 0.25); for (let k = 0; k < 6; k++) part(g, geos.cone, paint('#2d2638'), -2 + k * 0.8, 0.45, 2.6, 0.06, 0.9, 0.06); },
    ice: (GM, g) => { for (let k = 0; k < 6; k++) part(g, geos.box, paint('#e6f2ff'), -0.9 + (k % 3) * 0.9, 0.3 + Math.floor(k / 3) * 0.6, 3.0, 0.8, 0.5, 0.5); },
    candy: (GM, g) => { for (let k = 0; k < 6; k++) part(g, geos.sph, paint(['#ff5f9e', '#ffd23f', '#5fd0ff'][k % 3]), -1.5 + k * 0.6, 0.2, 2.6, 0.22, 0.2, 0.22); },
    desert: (GM, g) => { const st = GM.lam(GM.tex.stone, '#e0b878'); for (let k = 0; k < 4; k++) part(g, geos.box, st, 5.0, 0.3 + k * 0.0, -1 + k * 0.9, 0.9, 0.5, 0.7); },
  };
  for (const k of Object.keys(extra)) { const base = themed[k]; themed[k] = (GM, r, ctx) => { const g = base(GM, r, ctx); if (!isLow()) extra[k](GM, g); return g; }; }
}

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
  const kinds = ['statue', 'fountain', 'pond', 'bench', 'parasol', 'palm', 'palm', 'pond', 'bench', 'statue', 'palm', 'parasol', 'fountain', 'palm', 'palm'].slice(0, lowEnd ? 5 : 9);
  for (const h of holes) for (const k of (THEME_DATA[h.theme]?.props || [])) if (pieces[k] && kinds.length < (lowEnd ? 12 : 26)) kinds.push(k);          // (and the props of the themes this course uses)
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
