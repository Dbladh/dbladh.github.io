// What the mini-golf looks like: one hole's meshes (fairway, rails, cup and flag, water, the hero obstacle, power-up orbs) and the hamster ball. All of it is built from a
// handful of shared materials and boxes, in one group per hole that is thrown away when the hole is done. Coordinates are the hole's own (the same as golfphys.js).
import * as THREE from 'three';
import { BALL_R, CUP_R, hillH, hillGrad } from './golfphys.js?v=20261026212905';
import { gateBlocked, bridgeUp, mulberry32 } from './golfhero.js?v=20261026212905';
import { golfMaterials, boxGeo } from './golfmat.js?v=20261026212905';
import { themeOf, BRICKS, ROCKS, WOODS } from './golfthemes.js?v=20261026212905';
import { waterMaterial, pondGeometry, riverGeometry } from './golfwater.js?v=20261026212905';

const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
export const M = {
  grass: new THREE.MeshLambertMaterial({ vertexColors: true }), rail: mat('#c88b55'), post: mat('#e8594b'), bumper: mat('#ff9a3c'), white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  cup: new THREE.MeshBasicMaterial({ color: '#17171c' }), pole: mat('#f4f1e8'), flag: new THREE.MeshBasicMaterial({ color: '#ef5b4d', side: THREE.DoubleSide }),
  body: mat('#f1e8cf'), roof: mat('#d9534f'), sail: mat('#fffaf0'), stone: mat('#9b968c'), stone2: mat('#b9b4a8'), green: mat('#58a955'), green2: mat('#6dbf63'), dark: mat('#3a3340'), wood: mat('#a8754a'),
  metal: mat('#6c7480'), sand: new THREE.MeshLambertMaterial({ color: '#e8d49a' }), tooth: mat('#fffdf4'), red: mat('#e04a4a'),
  ball: Object.assign(mat('#ffffff'), { userData: { neon: 'ball' } }), shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }),
  dot: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
  bubble: new THREE.MeshBasicMaterial({ color: '#cfeaff', transparent: true, opacity: 0.28, depthWrite: false }),
  ghost: new THREE.MeshBasicMaterial({ color: '#d9ccff', transparent: true, opacity: 0.45 }),
};
export const G = { box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(BALL_R, 16, 12), dot: new THREE.SphereGeometry(0.1, 8, 6), sph: new THREE.SphereGeometry(1, 14, 10), cyl: new THREE.CylinderGeometry(1, 1, 1, 18), disc: new THREE.CircleGeometry(1, 28) };
G.disc.rotateX(-Math.PI / 2);

export const COLOURS = { coin: '#ffd23f', homing: '#ff5a5a', ghost: '#bda7ff', multi: '#5cc8ff', hamster: '#ffb45a', mega: '#4cd964', turbo: '#ff8a3d', bounce: '#ff63c0', freeze: '#8fe3ff', safety: '#ffd84a' };
export const EMOJI = { homing: '\u{1F3AF}', ghost: '\u{1F47B}', multi: '\u{1F3B1}', hamster: '\u{1F439}', mega: '⭕', turbo: '\u{1F680}', bounce: '\u{1F3C0}', freeze: '❄️', safety: '\u{1F6DF}' };
export const NAMES = { homing: 'Homing', ghost: 'Ghost', multi: 'Multi-ball', hamster: 'Hamster ball', mega: 'Mega cup', turbo: 'Turbo', bounce: 'Super bounce', freeze: 'Freeze', safety: 'Safety net' };
const emojiTex = {};
function emojiSprite(type) {
  if (!emojiTex[type]) {
    const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
    x.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(EMOJI[type], 48, 54);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojiTex[type] = t;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex[type], transparent: true, depthWrite: false })); s.scale.setScalar(1.15); return s;
}
let waterTex = null;
function water() {                                         // a soft striped texture that is scrolled to make the water flow
  if (!waterTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#4aa8e8'; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(8 + i * 16, 16 + (i % 2) * 28, 9, 3, 0, 0, 6.3); x.fill(); }
    waterTex = new THREE.CanvasTexture(c); waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.colorSpace = THREE.SRGBColorSpace;
  }
  return waterTex;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const box = (m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(boxGeo(sx, sy, sz), m); o.position.set(x, y, z); return o; };
const cyl = (m, r, h, x, y, z) => { const o = new THREE.Mesh(G.cyl, m); o.scale.set(r, h, r); o.position.set(x, y, z); return o; };
const sph = (m, rx, ry, rz, x, y, z) => { const o = new THREE.Mesh(G.sph, m); o.scale.set(rx, ry, rz); o.position.set(x, y, z); return o; };

let skinned = false, GM = null;
/** Swap the plain materials for the textured ones (once, the first time a hole is built). */
function skin(lowEnd) {
  if (skinned) return; skinned = true; GM = golfMaterials(lowEnd);
  Object.assign(M, { grass: GM.turf, rail: GM.wood, body: GM.plaster, roof: GM.shingle, stone: GM.stone, stone2: GM.stone, wood: GM.wood, metal: GM.metal, red: GM.red, sail: GM.cream });
}
let rockGeo = null;
function getRock() {
  if (!rockGeo) { rockGeo = new THREE.IcosahedronGeometry(0.5, 1); const p = rockGeo.attributes.position, rr = mulberry32(99), seen = new Map(); for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)}|${p.getY(i).toFixed(3)}|${p.getZ(i).toFixed(3)}`; let f = seen.get(k); if (!f) { f = 0.82 + rr() * 0.36; seen.set(k, f); } p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); } rockGeo.computeVertexNormals(); }
  return rockGeo;
}
/** The low wall round the edge of the hole: bricks, boulders or planks (by the hole's seed), in instanced meshes. */
function buildBorder(h, g, disposables) {
  const TH = themeOf(h.theme), style = TH.border, r = mulberry32(h.seed ^ 0x5bd1e995), O = h.outline, segs = h.walls.filter((w) => w[4]);
  let area = 0; for (let i = 0; i < O.length; i++) { const a = O[i], b = O[(i + 1) % O.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1, col = new THREE.Color();
  const make = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = m.receiveShadow = true; g.add(m); disposables.push(m); return m; };
  const place = (mesh, i, w, off, y, lenK, hgt, thick, shift, palette, tilt = 0) => {
    const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.sqrt(dx * dx + dz * dz) || 1, hy = Math.max(0, hillH(h, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2)), ox = (sgn * dz) / l, oz = (-sgn * dx) / l, ux = dx / l, uz = dz / l;
    _q.setFromAxisAngle(UP, Math.atan2(-dz, dx)); if (tilt) { _q2.setFromAxisAngle(_vx, tilt); _q.multiply(_q2); }
    _m.compose(_v.set((w[0] + w[2]) / 2 + ox * (thick / 2 + off) + ux * shift, y + hy, (w[1] + w[3]) / 2 + oz * (thick / 2 + off) + uz * shift), _q, _s.set(l * lenK + 0.07, hgt, thick));
    mesh.setMatrixAt(i, _m); col.set(palette[(r() * palette.length) | 0]); col.offsetHSL(0, 0, (r() - 0.5) * 0.05); mesh.setColorAt(i, col);
  };
  if (style === 'brick') {
    const c0 = make(G.box, GM.brick, segs.length), c1 = make(G.box, GM.brick, segs.length), cap = make(G.box, GM.stone, segs.length);
    segs.forEach((w, i) => { place(c0, i, w, 0, 0.15, 1, 0.3, 0.4, 0, TH.pal); place(c1, i, w, 0, 0.45, 1, 0.3, 0.4, 0.3, TH.pal); place(cap, i, w, -0.03, 0.65, 1, 0.1, 0.5, 0, ['#e8dcc6', '#ddd0b8']); });
    for (const m of [c0, c1, cap]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  } else if (style === 'stone') {
    getRock();
    const mat = GM.lam(GM.tex.stone, '#ffffff', { flatShading: true }); disposables.push(mat);
    const rocks = make(rockGeo, mat, segs.length), top = make(rockGeo, mat, segs.length);
    segs.forEach((w, i) => { const hgt = 0.55 + r() * 0.3; place(rocks, i, w, 0.05, hgt * 0.4, 1.7, hgt, 0.7 + r() * 0.2, (r() - 0.5) * 0.3, TH.pal, (r() - 0.5) * 0.3); place(top, i, w, 0.15, 0.62 + r() * 0.12, 1.1, 0.4 + r() * 0.2, 0.55, (r() - 0.5) * 0.5, ROCKS, (r() - 0.5) * 0.4); });
    for (const m of [rocks, top]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  } else {
    const p0 = make(G.box, GM.wood, segs.length), p1 = make(G.box, GM.wood, segs.length), posts = make(G.box, GM.darkwood, Math.ceil(segs.length / 5));
    segs.forEach((w, i) => { place(p0, i, w, 0, 0.15, 1, 0.3, 0.32, 0, TH.pal); place(p1, i, w, 0, 0.47, 1, 0.3, 0.32, 0, TH.pal); });
    let n = 0; segs.forEach((w, i) => { if (i % 5 === 0 && n < posts.count) { _m.compose(_v.set(w[0] + ((sgn * (w[3] - w[1])) / (Math.hypot(w[2] - w[0], w[3] - w[1]) || 1)) * 0.18, 0.4, w[1] + ((-sgn * (w[2] - w[0])) / (Math.hypot(w[2] - w[0], w[3] - w[1]) || 1)) * 0.18), _q.identity(), _s.set(0.28, 0.85, 0.28)); posts.setMatrixAt(n, _m); posts.setColorAt(n++, col.set('#ffffff')); } });
    posts.count = n;
    for (const m of [p0, p1, posts]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
function signTexture(n, par) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#6b4a2c'; x.fillRect(0, 0, 256, 160); x.fillStyle = '#fff3cf'; x.fillRect(6, 6, 244, 148);
  x.fillStyle = '#2a1a0c'; x.textAlign = 'center'; x.font = '800 112px "Outfit", system-ui, sans-serif'; x.fillText(`${n}`, 128, 102); x.font = '800 40px "Outfit", system-ui, sans-serif'; x.fillText(`PAR ${par}`, 128, 144);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const _q2 = new THREE.Quaternion(), _vx = new THREE.Vector3(1, 0, 0);

let wireTex = null;
/** A glowing wire on the ground from a to b with pulses running along it; it brightens while the machine it feeds is switched on (st.gateOpen). */
function wireVisual(h, g, a, b, updaters, disposables) {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); if (l < 0.6) return;
  if (!wireTex) { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d'); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, 6, 64, 4); x.fillStyle = '#ffffff'; x.fillRect(6, 4, 14, 8); wireTex = new THREE.CanvasTexture(c); wireTex.wrapS = THREE.RepeatWrapping; wireTex.colorSpace = THREE.SRGBColorSpace; }
  const tx = wireTex.clone(); tx.needsUpdate = true; tx.repeat.set(l / 1.6, 1); const mat = new THREE.MeshBasicMaterial({ map: tx, color: '#6dff9a', transparent: true, opacity: 0.5, depthWrite: false });
  const geo = new THREE.PlaneGeometry(l, 0.16).rotateX(-Math.PI / 2), m = new THREE.Mesh(geo, mat); m.position.set((a.x + b.x) / 2, Math.max(0, hillH(h, (a.x + b.x) / 2, (a.z + b.z) / 2)) + 0.07, (a.z + b.z) / 2); m.rotation.y = Math.atan2(-dz, dx); m.renderOrder = 1; g.add(m); disposables.push(geo, tx, mat);
  let open = 0; updaters.push((heroT, t, dt, st) => { open += ((st && st.gateOpen ? 1 : 0) - open) * Math.min(1, dt * 6); tx.offset.x -= dt * (0.6 + 2.2 * open); mat.opacity = 0.4 + 0.55 * open; });
}
/** The meshes for hole `h`. Returns { group, update(heroT, t, dt, state), pickups, cupMesh, flag, dispose() }. */
export function buildHoleVisual(h, { lowEnd = false, look, fx } = {}) {
  skin(lowEnd); const TH0 = themeOf(h.theme);
  const g = new THREE.Group(), disposables = [], updaters = [];
  const track = (geo) => { disposables.push(geo); return geo; };
  // the fairway: a ribbon of green along the corridor and round the tee and cup greens, in mown stripes, raised and lowered by the terrain (hills, berms, platforms, ramps, canyons)
  const pos = [], uvs = [], col = [], idx = [], hts = [], c1 = new THREE.Color(TH0.fair[0]), c2 = new THREE.Color(TH0.fair[1]), COLS = h.cols || 16, crest = new THREE.Color(TH0.fair[2]), shade = new THREE.Color(TH0.fair[3]), tmp = new THREE.Color();
  const rock = new THREE.Color(TH0.rock), deep = new THREE.Color('#4a4239'), plank = new THREE.Color('#e0a868'), feats = h.feats || [];
  let R = h.ribbon;
  if (feats.length || h.sands.length || h.dense) { const R2 = []; for (let i = 0; i < R.length - 1; i++) for (let k = 0; k < 3; k++) { const t = k / 3, a0 = R[i], b0 = R[i + 1]; R2.push([0, 1, 2, 3, 4].map((j) => (j === 4 && (a0[4] < 0 || b0[4] < 0) ? a0[4] : a0[j] + (b0[j] - a0[j]) * t))); } R2.push(R[R.length - 1]); R = R2; }
  const nearCup = (vi) => Math.hypot(pos[vi * 3] - h.cup.x, pos[vi * 3 + 2] - h.cup.z) < 1.0;
  for (let i = 0; i < R.length; i++) {
    const row = R[i], stripe = (row[4] < 0 ? i < R.length / 2 ? -1 : 1e3 : Math.floor(row[4] / 1.5)) & 1;
    for (let c = 0; c <= COLS; c++) {
      const u = c / COLS, x = row[0] + (row[2] - row[0]) * u, z = row[1] + (row[3] - row[1]) * u;
      const hh = hillH(h, x, z), gr = hillGrad(h, x, z), gm = Math.sqrt(gr.x * gr.x + gr.z * gr.z), sl = Math.min(1, gm * 1.7), up = Math.max(0, hh);      // slopes read by shading: crests go lighter and warmer, the slopes darker and greener
      pos.push(x, hh + 0.03, z); uvs.push(x * 0.4, z * 0.4); hts.push(hh); const lit = Math.max(0, Math.min(1, 0.5 - (gr.x * 0.7 - gr.z * 0.7) * 1.6)), band = up > 0.04 ? 0.5 + 0.5 * Math.cos(up * 20.9) : 1;      // sunlit and shaded sides, plus faint contour bands every 0.3
      tmp.copy(stripe ? c1 : c2).lerp(crest, Math.min(1, up / 0.9) * 0.7).lerp(shade, sl * 0.8).multiplyScalar(0.72 + 0.5 * lit - 0.07 * band);
      const rk = Math.max(0, Math.min(1, (gm - 0.55) / 0.65)); if (rk > 0) tmp.lerp(hh < -0.2 ? deep : rock, rk);                          // steep faces turn to rock
      for (const f of feats) if (f.t === 'jump') { const rx = x - f.x, rz = z - f.z, s2 = rx * f.ux + rz * f.uz; if (s2 > -f.len / 2 - 0.05 && s2 < f.len / 2 + 0.05 && Math.abs(rx * f.nx + rz * f.nz) < f.wid) tmp.lerp(plank, 0.85).multiplyScalar(0.92 + 0.08 * Math.sin(s2 * 14)); }
      col.push(tmp.r, tmp.g, tmp.b);
    }
    if (i > 0) for (let c = 0; c < COLS; c++) {
      const b0 = (i - 1) * (COLS + 1) + c, a0 = b0 + 1, d0 = b0 + COLS + 1, e0 = d0 + 1;
      if ((hts[b0] + hts[a0] + hts[d0] + hts[e0]) / 4 < -0.6 && Math.max(hts[b0], hts[a0], hts[d0], hts[e0]) < -0.3) continue;                    // (nothing to draw over a chasm)
      if (nearCup(b0) || nearCup(a0) || nearCup(d0) || nearCup(e0)) continue;                                                   // (the hole is cut out of the green: a round patch fills in round it)
      idx.push(b0, d0, a0, a0, d0, e0);
    }
  }
  const fg = track(new THREE.BufferGeometry()); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); fg.setIndex(idx); fg.computeVertexNormals();
  const fair = new THREE.Mesh(fg, M.grass); fair.receiveShadow = true; g.add(fair);
  for (const f of feats) if (f.t === 'gap') {                // the chasm: a dark floor and rock walls down both sides, under the border
    const yaw = Math.atan2(-f.uz, f.ux), cm = (f.c0 + f.c1) / 2, wide = f.c1 - f.c0 + 0.1, dk = stoneTint('#4a4239'), grp = new THREE.Group(); grp.position.set(f.x + f.nx * cm, 0, f.z + f.nz * cm); grp.rotation.y = yaw; g.add(grp);
    grp.add(rbox(paint('#241d18'), f.len + 0.2, 0.1, wide, 0, -f.d - 0.02, 0, 0.02));
    for (const sd of [-1, 1]) { grp.add(rbox(dk, f.len + 0.3, f.d + 0.1, 0.3, 0, -f.d / 2 + 0.03, sd * (wide / 2 + 0.05), 0.04)); }
    for (const e of [-1, 1]) grp.add(rbox(dk, 0.3, f.d + 0.1, wide, e * (f.len / 2 + 0.05), -f.d / 2 + 0.03, 0, 0.04));
    if (f.bridge) {                                          // a bridge that slides out over the chasm while the button's time lasts
      const deck = new THREE.Group(); for (let k = 0; k < Math.ceil(f.len / 0.45); k++) deck.add(rbox(woodTint(k % 2 ? '#d9b87a' : '#c89358'), 0.4, 0.1, wide - 0.1, -f.len / 2 + 0.25 + k * 0.45, 0, 0, 0.02)); for (const sd of [-1, 1]) deck.add(rbox(metal('#e5483f'), f.len + 0.2, 0.08, 0.08, 0, 0.1, sd * (wide / 2 - 0.1), 0.02)); grp.add(deck);
      let open = 0; updaters.push((heroT, t, dt, st) => { open += ((st && st.gateOpen ? 1 : 0) - open) * Math.min(1, dt * 5); deck.position.set(0, 0.04 - 0.5 * (1 - open), 0); deck.scale.set(0.1 + 0.9 * open, 1, 1); });
    }
  }
  // the border: bricks, boulders or planks all the way round
  buildBorder(h, g, disposables);
  // the tee sign, on a post beside the round green at the start
  { const t0 = h.path[0], t1 = h.path[Math.min(4, h.path.length - 1)], l = Math.hypot(t1.x - t0.x, t1.z - t0.z) || 1, tx = (t1.x - t0.x) / l, tz = (t1.z - t0.z) / l;
    const sg = new THREE.Group(); sg.position.set(t0.x - tz * 0 + -tz * 3.9 - tx * 0.4, 0, t0.z + tx * 3.9 - tz * 0.4);
    const post = box(M.wood, 0.16, 1.9, 0.16, 0, 0.95, -0.16), tex = signTexture(h.index + 1, h.par); disposables.push(tex);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.25, 0.08), [mat('#6b4a2c'), mat('#6b4a2c'), mat('#6b4a2c'), mat('#6b4a2c'), Object.assign(new THREE.MeshLambertMaterial({ map: tex }), { userData: { neon: 'sign' } }), mat('#6b4a2c')]); board.position.y = 1.9;
    disposables.push(board.geometry); sg.add(post, board); sg.rotation.y = Math.atan2(-tx, -tz) + Math.PI; sg.rotation.y = Math.atan2(-tx, -tz); g.add(sg); }
  // tee, cup and flag
  const tee = new THREE.Mesh(G.disc, M.white); tee.scale.set(0.55, 1, 0.55); tee.position.set(h.ball.x, 0.06, h.ball.z); g.add(tee);
  // the hole: a round opening cut in the green (a patch of turf round it, see the fairway), a steel rim, a dark shaft going down and a floor; one group so the mega-cup power-up can widen the rim
  const cupMesh = new THREE.Group(); cupMesh.position.set(h.cup.x, Math.max(0, hillH(h, h.cup.x, h.cup.z)), h.cup.z); cupMesh.scale.set(CUP_R * 0.92, 1, CUP_R * 0.92); g.add(cupMesh);
  { const RING = [1.0, 1.12, 1.4, 1.9, 2.8], SEG = 40, cx = h.cup.x, cz = h.cup.z, pp = [], pu = [], pc = [], pi = [], col0 = c1.clone().lerp(c2, 0.5);
    for (const rr of RING) for (let k = 0; k < SEG; k++) { const a = (k / SEG) * 6.2832, x = cx + Math.cos(a) * rr * CUP_R * 0.92, z = cz + Math.sin(a) * rr * CUP_R * 0.92; pp.push(x, hillH(h, x, z) + 0.032 + (rr < 1.15 ? 0.012 : 0), z); pu.push(x * 0.4, z * 0.4); pc.push(col0.r, col0.g, col0.b); }
    for (let r = 0; r < RING.length - 1; r++) for (let k = 0; k < SEG; k++) { const a0 = r * SEG + k, b0 = r * SEG + ((k + 1) % SEG), a1 = (r + 1) * SEG + k, b1 = (r + 1) * SEG + ((k + 1) % SEG); pi.push(a0, b0, a1, b0, b1, a1); }
    const pg = track(new THREE.BufferGeometry()); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2)); pg.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3)); pg.setIndex(pi); pg.computeVertexNormals();
    const patch = new THREE.Mesh(pg, M.grass); patch.receiveShadow = true; patch.material = M.grass; g.add(patch);
    const rim = new THREE.Mesh(track(new THREE.TorusGeometry(1.0, 0.08, 8, 32)), metal('#d5dbe3')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; cupMesh.add(rim);
    const wall = new THREE.Mesh(track(new THREE.CylinderGeometry(1.0, 0.96, 1.0, 28, 1, true)), new THREE.MeshBasicMaterial({ color: '#0b0d10', side: THREE.BackSide })); wall.position.y = -0.46; cupMesh.add(wall);
    const floor = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: '#020304' })); floor.scale.set(0.96, 1, 0.96); floor.position.y = -0.95; cupMesh.add(floor); }
  const flag = new THREE.Group(); flag.position.set(h.cup.x, 0, h.cup.z);
  flag.add(cyl(M.pole, 0.04, 2.4, 0, 1.2, 0)); flag.add(sph(M.pole, 0.07, 0.07, 0.07, 0, 2.42, 0));
  const flGeo = new THREE.PlaneGeometry(0.95, 0.6, 14, 5), flMat = new THREE.MeshLambertMaterial({ color: '#ef5b4d', emissive: '#6a2018', side: THREE.DoubleSide }), fl = new THREE.Mesh(flGeo, flMat), flBase = flGeo.attributes.position.array.slice(); disposables.push(flGeo, flMat); fl.castShadow = true; fl.position.set(0.48, 2.1, 0); flag.add(fl); g.add(flag);
  const fph = h.cup.x * 1.3 + h.cup.z;                       // the flag ripples in the wind: a wave runs along it from the pole, bigger towards the free end, with gusts that lift it
  updaters.push((heroT, t) => {
    const p = flGeo.attributes.position, gust = 0.7 + 0.3 * Math.sin(t * 0.45 + fph) + 0.25 * Math.sin(t * 1.3);
    for (let i = 0; i < p.count; i++) {
      const bx = flBase[i * 3], by = flBase[i * 3 + 1], k = (bx + 0.475) / 0.95, amp = 0.2 * k * gust;
      p.setZ(i, amp * Math.sin(k * 6.5 - t * 5.2 + fph) + 0.05 * k * Math.sin(by * 9 + t * 3.3));
      p.setY(i, by - 0.09 * k * k * gust + 0.03 * k * Math.sin(k * 5 - t * 4 + fph));
      p.setX(i, bx - 0.05 * k * k * gust);
    }
    p.needsUpdate = true; flGeo.computeVertexNormals();
  });
  // posts, bumpers, sand
  for (const p of h.posts) { g.add(cyl(M.post, p.r, 1.0, p.x, 0.45, p.z)); g.add(cyl(paint('#ffd23f'), p.r * 1.04, 0.14, p.x, 0.72, p.z)); g.add(cyl(paint('#ffd23f'), p.r * 1.04, 0.14, p.x, 0.2, p.z)); }                    // (painted warning bands: this is something the ball hits)
  for (const p of h.bumpers) {
    const b = cyl(M.bumper, p.r, 0.8, p.x, 0.4, p.z), cap = cyl(M.white, p.r * 1.05, 0.12, p.x, 0.62, p.z), ph = p.x * 3 + p.z; g.add(b); g.add(cap); g.add(torus(paint('#ffd23f'), p.r * 1.0, 0.05, p.x, 0.3, p.z, Math.PI / 2));
    updaters.push((heroT, t) => { const k = 1 + 0.05 * Math.sin(t * 4 + ph); b.scale.set(p.r * k, 0.8, p.r * k); cap.scale.set(p.r * 1.05 * k, 0.12, p.r * 1.05 * k); });          // (bumpers breathe a little: they are alive)
  }
  // boost strips (moving chevrons), bounce pads, and the cage round one orb with its button and gate
  const chev = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#12304a'; x.fillRect(0, 0, 128, 64); x.strokeStyle = '#ffe14a'; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round'; for (let i = 0; i < 2; i++) { const ox = 18 + i * 56; x.beginPath(); x.moveTo(ox, 10); x.lineTo(ox + 26, 32); x.lineTo(ox, 54); x.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (const o of h.boosts || []) {
    const tx = chev.clone(); tx.needsUpdate = true; tx.repeat.set(o.len / 1.6, 1); disposables.push(tx); const bm = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.95 }); disposables.push(bm);
    const strip = new THREE.Mesh(track(new THREE.PlaneGeometry(o.len, o.wid).rotateX(-Math.PI / 2)), bm); strip.position.set(o.x, hillH(h, o.x, o.z) + 0.06, o.z); strip.rotation.y = Math.atan2(-o.uz, o.ux); strip.renderOrder = 1; g.add(strip);
    g.add((() => { const e = rbox(paint('#ffe14a'), o.len + 0.1, 0.03, 0.06, 0, 0, 0, 0.01); e.position.set(o.x - (-o.uz) * (o.wid / 2 + 0.03), hillH(h, o.x, o.z) + 0.06, o.z - o.ux * (o.wid / 2 + 0.03)); e.rotation.y = Math.atan2(-o.uz, o.ux); return e; })());
    if (o.powered) { let on = 0; updaters.push((heroT, t, dt, st) => { on += ((st && st.gateOpen ? 1 : 0) - on) * Math.min(1, dt * 6); tx.offset.x = -t * 0.9 * (0.1 + 0.9 * on); bm.opacity = 0.35 + 0.6 * on; bm.color.setScalar(0.45 + 0.55 * on); }); }
    else updaters.push((heroT, t) => { tx.offset.x = -t * 0.9; });
  }
  for (const R of h.rails || []) {                        // a rail: a mouth ring, an arched tube on legs, and an exit ring
    const rm = metal('#3fd8ff'), cyan = paint('#7fe9ff'), pts = []; for (let i = 0; i <= 16; i++) { const s = i / 16; pts.push(new THREE.Vector3(R.ax + (R.bx - R.ax) * s, 0.45 + R.h * Math.sin(Math.PI * s) + Math.max(0, hillH(h, R.ax + (R.bx - R.ax) * s, R.az + (R.bz - R.az) * s)), R.az + (R.bz - R.az) * s)); }
    const curve = new THREE.CatmullRomCurve3(pts), side = new THREE.Vector3(-R.uz, 0, R.ux);
    for (const sd of [-0.18, 0.18]) { const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 40, 0.07, 6, false)), rm); tube.position.copy(side).multiplyScalar(sd); tube.castShadow = true; g.add(tube); }
    for (let i = 3; i <= 13; i += 5) { const p = pts[i]; g.add(rbox(rm, 0.1, p.y, 0.1, p.x, p.y / 2, p.z, 0.02)); }
    for (const [x, z, y] of [[R.ax, R.az, 0.45], [R.bx, R.bz, 0.45]]) { const ring = torus(cyan, 0.55, 0.07, x, y, z, 0, Math.atan2(R.ux, R.uz) + Math.PI / 2, 0); g.add(ring); const pad = cyl(paint('#16405a'), 0.6, 0.05, x, 0.04, z); g.add(pad); updaters.push((heroT, t) => { ring.scale.setScalar(1 + 0.06 * Math.sin(t * 5 + x)); }); }
  }
  for (const o of h.pads || []) {
    const gp = new THREE.Group(); gp.position.set(o.x, hillH(h, o.x, o.z), o.z); gp.add(cyl(paint('#2b2b3a'), o.r * 1.1, 0.1, 0, 0.06, 0)); const top = cyl(paint('#ff4fb3'), o.r * 0.8, 0.06, 0, 0.13, 0); gp.add(top); gp.add(torus(paint('#ffe14a'), o.r * 0.95, 0.04, 0, 0.14, 0, Math.PI / 2)); g.add(gp);
    updaters.push((heroT, t) => { const k = 1 + 0.08 * Math.sin(t * 5 + o.x); top.scale.set(o.r * 0.8 * k, 0.06, o.r * 0.8 * k); });
  }
  // the walls and gates of the machines: low fences (the ball can be vaulted over them), tall walls, gates that sink when the button is pressed, and the buttons
  for (const b of h.barriers || []) {
    const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], l = Math.hypot(dx, dz) || 1, mx = (b.a[0] + b.b[0]) / 2, mz = (b.a[1] + b.b[1]) / 2, hy = Math.max(0, hillH(h, mx, mz)), yaw = Math.atan2(-dz, dx);
    if (b.low) {
      const rail = rbox(woodTint('#f1e0b4'), l, 0.12, 0.1, 0, 0, 0, 0.02), rail2 = rbox(woodTint('#d9b87a'), l, 0.12, 0.1, 0, 0, 0, 0.02);
      rail.position.set(mx, hy + 0.36, mz); rail.rotation.y = yaw; rail2.position.set(mx, hy + 0.16, mz); rail2.rotation.y = yaw; g.add(rail, rail2);
      for (const e of [0, 1]) g.add(rbox(woodTint('#a87040'), 0.1, 0.5, 0.1, e ? b.b[0] : b.a[0], hy + 0.25, e ? b.b[1] : b.a[1], 0.02));
      const cl = Math.floor(l / 0.9); for (let k = 1; k < cl; k++) g.add(rbox(woodTint('#a87040'), 0.08, 0.46, 0.08, b.a[0] + (dx / cl) * k, hy + 0.23, b.a[1] + (dz / cl) * k, 0.02));
    } else {
      const wall = rbox(GM.brick, l, 0.9, 0.28, 0, 0, 0, 0.04), cap = rbox(GM.stone, l + 0.06, 0.1, 0.38, 0, 0, 0, 0.02);
      wall.material = GM.lam(GM.tex.stone, '#c9bfd9'); disposables.push(wall.material); wall.position.set(mx, hy + 0.45, mz); wall.rotation.y = yaw; cap.position.set(mx, hy + 0.95, mz); cap.rotation.y = yaw; g.add(wall, cap);
    }
  }
  { const gates = [], buttons = new Map();
    for (const dr of (h.doors || []).filter((d) => d.gate)) {
      const gdx = dr.gate[2] - dr.gate[0], gdz = dr.gate[3] - dr.gate[1], gl = Math.hypot(gdx, gdz), gate = new THREE.Group(); gate.position.set((dr.gate[0] + dr.gate[2]) / 2, 0, (dr.gate[1] + dr.gate[3]) / 2); gate.rotation.y = Math.atan2(-gdz, gdx);
      const bar = rbox(metal('#e5483f'), gl, 0.8, 0.1, 0, 0.45, 0, 0.03); gate.add(bar); for (const e of [-1, 1]) gate.add(rbox(metal('#ffffff'), 0.1, 0.95, 0.12, e * gl / 2, 0.47, 0, 0.02)); g.add(gate); gates.push(bar);
      const kb = `${dr.button.x}|${dr.button.z}`; if (!buttons.has(kb)) buttons.set(kb, dr.button);
      wireVisual(h, g, dr.button, { x: (dr.gate[0] + dr.gate[2]) / 2, z: (dr.gate[1] + dr.gate[3]) / 2 }, updaters, disposables);
    }
    for (const dr of (h.doors || []).filter((d) => !d.gate)) { const kb = `${dr.button.x}|${dr.button.z}`; if (!buttons.has(kb)) buttons.set(kb, dr.button); if (dr.wireTo) wireVisual(h, g, dr.button, dr.wireTo, updaters, disposables); }
    const plates = []; for (const bt of buttons.values()) { const btn = new THREE.Group(); btn.position.set(bt.x, hillH(h, bt.x, bt.z), bt.z); const plate = cyl(paint('#ffd23f'), bt.r, 0.08, 0, 0.06, 0); btn.add(cyl(paint('#2b2b3a'), bt.r * 1.15, 0.06, 0, 0.04, 0), plate, torus(paint('#ffffff'), bt.r * 0.55, 0.04, 0, 0.11, 0, Math.PI / 2)); g.add(btn); plates.push(plate); }
    if (gates.length) { let open = 0; updaters.push((heroT, t, dt, st) => { open += ((st && st.gateOpen ? 1 : 0) - open) * Math.min(1, dt * 6); for (const b of gates) b.position.y = 0.45 - 1.0 * open; for (const p of plates) { p.position.y = 0.06 - 0.03 * open; p.material = open > 0.5 ? paint('#6dff9a') : paint('#ffd23f'); } }); }
  }
  if (h.cage) {
    const cg = h.cage, wd = woodTint('#c89358');
    for (const sd of cg.sides) { const dx = sd[2] - sd[0], dz = sd[3] - sd[1], l = Math.hypot(dx, dz); const rail = rbox(wd, l, 0.1, 0.07, 0, 0, 0, 0.02); rail.position.set((sd[0] + sd[2]) / 2, 0.42, (sd[1] + sd[3]) / 2); rail.rotation.y = Math.atan2(-dz, dx); g.add(rail); const rail2 = rail.clone(); rail2.position.y = 0.2; g.add(rail2); g.add(rbox(wd, 0.1, 0.55, 0.1, sd[2], 0.27, sd[3], 0.02)); }
    const gdx = cg.gate[2] - cg.gate[0], gdz = cg.gate[3] - cg.gate[1], gl = Math.hypot(gdx, gdz), gate = new THREE.Group(); gate.position.set((cg.gate[0] + cg.gate[2]) / 2, 0, (cg.gate[1] + cg.gate[3]) / 2); gate.rotation.y = Math.atan2(-gdz, gdx);
    const bar = rbox(metal('#e5483f'), gl, 0.5, 0.1, 0, 0.3, 0, 0.03); gate.add(bar); for (const e of [-1, 1]) gate.add(rbox(metal('#ffffff'), 0.1, 0.6, 0.12, e * gl / 2, 0.3, 0, 0.02)); g.add(gate);
    const btn = new THREE.Group(); btn.position.set(cg.button.x, hillH(h, cg.button.x, cg.button.z), cg.button.z); const plate = cyl(paint('#ffd23f'), cg.button.r, 0.08, 0, 0.06, 0); btn.add(cyl(paint('#2b2b3a'), cg.button.r * 1.15, 0.06, 0, 0.04, 0), plate, torus(paint('#ffffff'), cg.button.r * 0.55, 0.04, 0, 0.11, 0, Math.PI / 2)); g.add(btn);
    let open = 0; updaters.push((heroT, t, dt, st) => { open += ((st && st.gateOpen ? 1 : 0) - open) * Math.min(1, dt * 6); bar.position.y = 0.3 - 0.8 * open; plate.position.y = 0.06 - 0.03 * open; plate.material = open > 0.5 ? paint('#6dff9a') : paint('#ffd23f'); });
  }
  for (const s of h.sands) {                                 // a sand pit: a rough patch of sand with a darker, damp rim and a few pebbles
    const sg = track(pondGeometry(s.poly, 0)), spp = sg.attributes.position; for (let i = 0; i < spp.count; i++) spp.setY(i, hillH(h, spp.getX(i), spp.getZ(i)) + 0.07); sg.computeVertexNormals(); const sm = new THREE.Mesh(sg, GM.lam(GM.tex.sand, TH0.sand, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); sm.receiveShadow = true; g.add(sm);
    const lip = track(pondGeometry(s.poly.map((v, i) => (i % 2 ? s.z : s.x) + (v - (i % 2 ? s.z : s.x)) * 1.12), 0)), lpp = lip.attributes.position; for (let i = 0; i < lpp.count; i++) lpp.setY(i, hillH(h, lpp.getX(i), lpp.getZ(i)) + 0.04); lip.computeVertexNormals(); const lm = new THREE.Mesh(lip, GM.lam(GM.tex.sand, '#c9b27a', { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); lm.receiveShadow = true; g.add(lm);
  }
  for (const pt of h.patches || []) {                          // surface patches: ice (glassy blue), mud, caramel, quicksand (a dark swirl) and conveyor belts (moving chevrons)
    const geo = track(pondGeometry(pt.poly, 0)), pp = geo.attributes.position; for (let i = 0; i < pp.count; i++) pp.setY(i, hillH(h, pp.getX(i), pp.getZ(i)) + 0.065);
    let mat;
    if (pt.kind === 'conveyor') {
      const tx = chev.clone(); tx.needsUpdate = true; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; disposables.push(tx); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) * pt.ux + pp.getZ(i) * pt.uz) / 1.6, (-pp.getX(i) * pt.uz + pp.getZ(i) * pt.ux) / 1.6);
      mat = new THREE.MeshBasicMaterial({ map: tx, color: '#9bd4ff', transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); updaters.push((heroT, t) => { tx.offset.x = -t * 0.9; });
    } else {
      const look = { ice: ['#bfe6ff', 0.8], mud: ['#6b4a2e', 0.95], caramel: ['#d9902f', 0.92], quicksand: ['#b98b4a', 0.95] }[pt.kind] || ['#999999', 0.9];
      mat = new THREE.MeshLambertMaterial({ color: look[0], transparent: true, opacity: look[1], polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, emissive: pt.kind === 'ice' ? '#2a4a6a' : pt.kind === 'caramel' ? '#4a2a08' : '#000000' });
    }
    disposables.push(mat); const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; m.receiveShadow = true; g.add(m);
  }
  for (const mg of h.magnets || []) {                          // a magnet: a red and white horseshoe on the ground with rings that pulse towards (or away from) it
    const gy = Math.max(0, hillH(h, mg.x, mg.z)), red = metal('#e5483f'), wht = metal('#f2f2f6'), hs = new THREE.Group(); hs.position.set(mg.x, gy, mg.z);
    const arc = new THREE.Mesh(track(new THREE.TorusGeometry(0.62, 0.17, 8, 16, Math.PI)), red); arc.rotation.x = Math.PI / 2; arc.position.y = 0.55; hs.add(arc);
    for (const sd of [-1, 1]) { hs.add(cyl(red, 0.17, 0.55, sd * 0.62, 0.28, 0)); hs.add(cyl(wht, 0.18, 0.14, sd * 0.62, 0.07, 0)); } g.add(hs);
    const rings = [0, 1, 2].map((i) => { const m = new THREE.Mesh(track(new THREE.RingGeometry(0.95, 1.0, 40).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: mg.pull > 0 ? '#ff6a5f' : '#6aa8ff', transparent: true, opacity: 0.5, depthWrite: false })); disposables.push(m.material); m.position.set(mg.x, gy + 0.08, mg.z); g.add(m); return m; });
    updaters.push((heroT) => { rings.forEach((m, i) => { let k = ((heroT * 0.5 + i / 3) % 1); if (mg.pull > 0) k = 1 - k; m.scale.setScalar(0.2 + k * mg.r); m.material.opacity = 0.55 * Math.sin(k * Math.PI); }); });
  }
  for (const tn of h.tunnels || []) {                          // a tunnel: stone arches and a see-through roof over a straight stretch
    const gy = Math.max(0, hillH(h, tn.x, tn.z)), R = Math.min(2.0, tn.hw - 0.15), tg = new THREE.Group(); tg.position.set(tn.x, gy, tn.z); tg.rotation.y = Math.atan2(-tn.uz, tn.ux); const stone = stoneTint(TH0.rock, true);
    const nR = Math.max(2, Math.round(tn.len / 1.1)), rib = track(new THREE.TorusGeometry(R, 0.16, 8, 16, Math.PI)); for (let i = 0; i < nR; i++) { const m = new THREE.Mesh(rib, stone); m.rotation.y = Math.PI / 2; m.position.set(-tn.len / 2 + (tn.len * i) / (nR - 1), 0.02, 0); m.castShadow = true; tg.add(m); }
    for (const sd of [-1, 1]) { const pm = new THREE.Mesh(track(new THREE.BoxGeometry(0.6, 1.0, 0.6)), stone); pm.position.set(sd * (tn.len / 2), 0.5, 0); tg.add(pm); }
    const roofMat = new THREE.MeshLambertMaterial({ color: TH0.rock, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }); disposables.push(roofMat);
    const roof = new THREE.Mesh(track(new THREE.CylinderGeometry(R, R, tn.len, 16, 1, true)), roofMat); roof.rotation.z = Math.PI / 2; tg.add(roof); g.add(tg);        // (the lower half is under the lawn)
  }
  // water: ponds (irregular, with boulders round the bank and a pebbly bed) and rivers (winding, flowing, with boulder banks), all in the village pond's own water look
  const wr = mulberry32(h.seed ^ 0x9e3779b1), bed = GM.lam(GM.tex.stone, '#c4b48f'); disposables.push(bed);
  const rockMat = GM.lam(GM.tex.stone, '#ffffff', { flatShading: true }); disposables.push(rockMat);
  const rocks = [];                                           // boulders on the banks: [x, z, size]
  const addBank = (x, z, sz) => rocks.push([x, z, sz, wr() * 6.28]);
  for (const r of h.rivers) {
    const rv = riverGeometry(r.a, r.b, r.hw, h.seed ^ 0x51, 0.09), flowLen = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z) || 1;
    track(rv.geo); const wm = waterMaterial(look, (r.b.x - r.a.x) / flowLen, (r.b.z - r.a.z) / flowLen, 1.1, TH0.hazard === 'lava' ? 1 : 0); disposables.push(wm);
    const m = new THREE.Mesh(rv.geo, wm); m.renderOrder = 2; g.add(m);
    const bg = track(rv.geo.clone()); const bp = bg.attributes.position; for (let i = 0; i < bp.count; i++) bp.setY(i, 0.07);
    g.add(new THREE.Mesh(bg, bed));
    for (const side of [rv.left, rv.right]) for (let i = 0; i < side.length; i++) for (let k = 0; k < 2; k++) { const j = Math.min(side.length - 1, i + k * 0.5), p0 = side[i], p1 = side[Math.min(side.length - 1, i + 1)], t = k * 0.5; addBank(p0[0] + (p1[0] - p0[0]) * t + (wr() - 0.5) * 0.1, p0[1] + (p1[1] - p0[1]) * t + (wr() - 0.5) * 0.1, 0.26 + wr() * 0.2); }
  }
  for (const p of h.ponds) {
    const pg = track(pondGeometry(p.poly, 0.09)), wm = waterMaterial(look, 0, 0, 0, TH0.hazard === 'lava' ? 1 : 0); disposables.push(wm);
    const m = new THREE.Mesh(pg, wm); m.renderOrder = 2; g.add(m);
    const bg = track(pondGeometry(p.poly, 0.07)); g.add(new THREE.Mesh(bg, bed));
    const n = p.poly.length / 2; for (let i = 0; i < n; i++) { const x = p.poly[i * 2], z = p.poly[i * 2 + 1], dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz) || 1; for (let k = 0; k < 2; k++) addBank(x + (dx / l) * (0.05 + k * 0.1) + (wr() - 0.5) * 0.14, z + (dz / l) * (0.05 + k * 0.1) + (wr() - 0.5) * 0.14, 0.3 + wr() * 0.22); }
  }
  if (rocks.length) {
    const im = new THREE.InstancedMesh(getRock(), rockMat, rocks.length); im.castShadow = im.receiveShadow = true; const c = new THREE.Color();
    rocks.forEach((rk, i) => { _q.setFromAxisAngle(UP, rk[3]); _m.compose(_v.set(rk[0], 0.075, rk[1]), _q, _s.set(rk[2] * 1.7, rk[2] * 0.36, rk[2] * 1.4)); im.setMatrixAt(i, _m); c.set(ROCKS[(wr() * ROCKS.length) | 0]); im.setColorAt(i, c); });
    im.instanceMatrix.needsUpdate = im.instanceColor.needsUpdate = true; g.add(im); disposables.push(im);
  }
  // the hero
  let heroRoot = null; if (h.hero) { const hv = heroVisual(h.hero, track, updaters, { look, fx, disposables }); if (hv) { g.add(hv); heroRoot = hv; } }
  // power-up orbs
  const pickups = [];
  for (const p of h.pickups) {
    if (p.type === 'coin') {                                 // a secret coin: gold, spinning, with a glow
      const o = new THREE.Group(), gold = paint('#ffd23f'), coin = cyl(gold, 0.34, 0.07, 0, 0, 0); coin.rotation.x = Math.PI / 2; o.add(coin); o.add(torus(paint('#fff3a8'), 0.34, 0.04, 0, 0, 0)); const ring = torus(paint('#ffe27a'), 0.52, 0.03, 0, 0, 0, Math.PI / 2); o.add(ring);
      const y0 = Math.max(0, hillH(h, p.x, p.z)) + 0.85; o.position.set(p.x, y0, p.z); g.add(o); const rec = { x: p.x, z: p.z, type: 'coin', mesh: o, taken: false, ph: p.x };
      pickups.push(rec); updaters.push((heroT, t) => { if (rec.taken) return; o.position.y = y0 + 0.1 * Math.sin(t * 2.6 + rec.ph); o.rotation.y = t * 2.2; ring.rotation.z = t; }); continue;
    }
    const o = new THREE.Group(), colr = COLOURS[p.type];
    const orb = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: colr })); orb.scale.setScalar(0.3); o.add(orb);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.52, 0.05, 6, 24)), new THREE.MeshBasicMaterial({ color: colr, transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; o.add(ring);
    const sp = emojiSprite(p.type); sp.position.y = 0.95; o.add(sp);
    o.position.set(p.x, 0.75, p.z); g.add(o);
    const rec = { x: p.x, z: p.z, type: p.type, mesh: o, taken: false, ph: p.x * 1.7 + p.z };
    pickups.push(rec);
    updaters.push((heroT, t) => { if (rec.taken) return; o.position.y = 0.78 + 0.14 * Math.sin(t * 2.4 + rec.ph); ring.rotation.z = t * 1.4; });
  }
  g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry !== G.disc && o.material !== M.shadow && o !== fair) o.castShadow = true; if (o.isMesh && o.material !== M.shadow && o.material !== M.bubble) o.receiveShadow = true; });
  // the ghost power-up: the obstacles (and posts and bumpers) turn see-through while it lasts
  const ghosted = [], ghostMats = new Map(); let ghostOn = false;
  const ghostOf = (m) => { let c = ghostMats.get(m); if (!c) { c = m.clone(); c.transparent = true; c.opacity = 0.3; c.depthWrite = false; if (c.color) c.color.lerp(new THREE.Color('#c9bdff'), 0.35); ghostMats.set(m, c); disposables.push(c); } return c; };
  const collect = (root) => root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.material && (o.material.isMeshLambertMaterial || o.material.isMeshBasicMaterial) && o.material !== M.cup) ghosted.push([o, o.material]); });
  if (heroRoot) collect(heroRoot);
  g.children.forEach((o) => { if (o.isMesh && (o.material === M.post || o.material === M.bumper || o.material === M.white)) ghosted.push([o, o.material]); });
  return {
    setGhost(on) { if (on === ghostOn) return; ghostOn = on; for (const [o, m] of ghosted) { o.material = on ? ghostOf(m) : m; o.castShadow = !on; } },
    heroRoot, group: g, pickups, cupMesh, flag,
    update(heroT, t, dt, st) { for (const u of updaters) u(heroT, t, dt, st); },
    dispose() { for (const d of disposables) d.dispose?.(); g.traverse((o) => { if (o.material && o.material !== M.rail && o.material.map === undefined) { /* shared materials are kept */ } }); },
  };
}

// ---------- the nine heroes ----------
// ---------- model-making helpers (chunky, bevelled shapes in toy paint) ----------
const rboxCache = new Map(), paintCache = new Map();
function rboxGeo(sx, sy, sz, b = 0.05) {                   // a box with softly rounded edges
  const key = `${Math.round(sx * 50)}|${Math.round(sy * 50)}|${Math.round(sz * 50)}|${b}`; let g = rboxCache.get(key); if (g) return g;
  const bb = Math.min(b, sx / 2 - 0.002, sy / 2 - 0.002, sz / 2 - 0.002), W = sx - 2 * bb, H = sy - 2 * bb, sh = new THREE.Shape();
  sh.moveTo(-W / 2, -H / 2); sh.lineTo(W / 2, -H / 2); sh.lineTo(W / 2, H / 2); sh.lineTo(-W / 2, H / 2); sh.closePath();
  g = new THREE.ExtrudeGeometry(sh, { depth: sz - 2 * bb, bevelEnabled: true, bevelThickness: bb, bevelSize: bb, bevelSegments: 2, curveSegments: 2 }); g.translate(0, 0, -(sz - 2 * bb) / 2);
  rboxCache.set(key, g); return g;
}
const rbox = (m, sx, sy, sz, x, y, z, b = 0.05) => { const o = new THREE.Mesh(rboxGeo(sx, sy, sz, b), m); o.position.set(x, y, z); return o; };
const paint = (hex) => { let m = paintCache.get(hex); if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); paintCache.set(hex, m); } return m; };           // flat toy paint
const metal = (hex) => { const k = 'm' + hex; let m = paintCache.get(k); if (!m) { m = GM.lam(GM.tex.metal, hex); paintCache.set(k, m); } return m; };      // painted metal
const woodTint = (hex) => { const k = 'w' + hex; let m = paintCache.get(k); if (!m) { m = GM.lam(GM.tex.wood, hex); paintCache.set(k, m); } return m; };
const stoneTint = (hex, flat) => { const k = 's' + hex + flat; let m = paintCache.get(k); if (!m) { m = GM.lam(GM.tex.stone, hex, flat ? { flatShading: true } : {}); paintCache.set(k, m); } return m; };
let roofG = null; const roofGeo = () => roofG || (roofG = new THREE.ConeGeometry(1, 1.7, 4).translate(0, 0.85, 0).rotateY(Math.PI / 4));
const cone = (m, r, h, seg, x, y, z) => { const o = new THREE.Mesh(coneGeo(r, h, seg), m); o.position.set(x, y, z); return o; };
const coneCache = new Map(); const coneGeo = (r, h, seg) => { const k = `${r}|${h}|${seg}`; let g = coneCache.get(k); if (!g) { g = new THREE.ConeGeometry(r, h, seg); coneCache.set(k, g); } return g; };
const torus = (m, R, t, x, y, z, rx = 0, ry = 0, rz = 0) => { const k = `t${R}|${t}`; let g = coneCache.get(k); if (!g) { g = new THREE.TorusGeometry(R, t, 6, 20); coneCache.set(k, g); } const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };

function heroVisual(hr, track, updaters, ctx = {}) {
  const w = new THREE.Group(); w.position.set(hr.x, 0, hr.z); w.rotation.y = Math.atan2(-hr.uz, hr.ux);       // local x runs along the leg, local z across it
  const hw = hr.hw;
  if (hr.type === 'windmill') {                            // a painted wooden mill: blue boards, shingle roof, red and white striped sails
    const lat0 = hr.gap, lat1 = hw + 0.3, H = hr.half, mid = (lat0 + lat1) / 2, wd = lat1 - lat0, blue = metal('#6aa9ea'), white = paint('#ffffff'), red = paint('#e5483f');
    for (const s of [-1, 1]) {
      w.add(rbox(blue, H * 2, 3.3, wd, 0, 1.5, s * mid, 0.07));
      w.add(rbox(white, H * 2 + 0.12, 0.16, wd + 0.12, 0, 0.1, s * mid, 0.04)); w.add(rbox(white, H * 2 + 0.12, 0.16, wd + 0.12, 0, 3.1, s * mid, 0.04));
      for (let k = 0; k < 4; k++) w.add(rbox(white, 0.04, 3.0, 0.04, -H - 0.01, 1.55, s * (lat0 + 0.2 + k * (wd - 0.4) / 3), 0.01));                    // board lines on the front
      w.add(rbox(paint('#fff6d6'), 0.07, 0.8, 0.7, -H - 0.03, 2.0, s * mid, 0.03)); w.add(rbox(white, 0.09, 0.9, 0.08, -H - 0.04, 2.0, s * mid, 0.02)); w.add(rbox(white, 0.09, 0.08, 0.8, -H - 0.04, 2.0, s * mid, 0.02));
    }
    w.add(rbox(blue, H * 2, 1.3, lat0 * 2 + 0.2, 0, 1.95, 0, 0.07)); w.add(rbox(white, H * 2 + 0.12, 0.14, lat0 * 2 + 0.3, 0, 1.3, 0, 0.04));
    const roof = new THREE.Mesh(roofGeo(), woodTint('#7d8aa0')); roof.position.y = 3.1; roof.scale.set((H + 0.5) * 1.4142, 1.2, (lat1 + 0.7) * 1.4142); roof.castShadow = true; w.add(roof);
    w.add(cone(red, 0.16, 0.5, 6, 0, 4.5, 0)); w.add(rbox(white, 0.05, 0.9, 0.05, 0, 4.7, 0, 0.01));
    const rotor = new THREE.Group(); rotor.position.set(-(H + 1.35), 2.45, 0); w.add(rotor); w.add(rbox(paint('#ffffff'), 1.4, 0.12, 0.12, -(H + 0.65), 2.45, 0, 0.02));
    for (let k = 0; k < 4; k++) {
      const pv = new THREE.Group(); pv.rotation.x = (k * Math.PI) / 2; pv.add(rbox(white, 0.1, 1.8, 0.1, 0, -0.9, 0, 0.02));
      for (let j = 0; j < 4; j++) pv.add(rbox(j % 2 ? white : red, 0.08, 0.2, 0.46, 0.02, -(0.5 + j * 0.33), 0.26, 0.02));
      pv.add(rbox(red, 0.1, 0.3, 0.5, 0.02, -1.82, 0.26, 0.03)); rotor.add(pv);
    }
    rotor.add(new THREE.Mesh(G.sph, red)); rotor.children[rotor.children.length - 1].scale.setScalar(0.3); rotor.add(cone(red, 0.2, 0.4, 8, -0.28, 0, 0)); rotor.children[rotor.children.length - 1].rotation.z = Math.PI / 2;
    updaters.push((heroT) => { rotor.rotation.x = heroT * hr.w + hr.phase; });
  } else if (hr.type === 'alligator') {                    // a chunky toy gator: big eyes, a mouth full of teeth, and jaws that shut across the lane
    const lat0 = hr.gap, lat1 = hw + 0.3, H = hr.half, mid = (lat0 + lat1) / 2, wd = lat1 - lat0, green = paint('#74c653'), green2 = paint('#5db041'), belly = paint('#b5e07e'), toothM = paint('#fffdf0'), redM = paint('#d9394a');
    for (const s of [-1, 1]) {
      w.add(rbox(green, H * 2, 1.9, wd, 0, 0.55, s * mid, 0.18)); w.add(rbox(belly, H * 2 - 0.3, 0.7, wd - 0.1, 0.03, -0.05, s * mid, 0.1));
      for (let k = 0; k < 5; k++) w.add(cone(green2, 0.2, 0.34, 4, -H + 0.9 + k * 0.5, 1.65, s * (mid + 0.35)));
      const ez = s * (lat0 + 0.55), ex = -H + 0.55;
      w.add(sph(paint('#ffffff'), 0.46, 0.46, 0.46, ex, 2.0, ez)); w.add(sph(paint('#1b1320'), 0.22, 0.24, 0.22, ex - 0.33, 2.02, ez - s * 0.04)); w.add(sph(paint('#ffffff'), 0.07, 0.07, 0.07, ex - 0.43, 2.12, ez - s * 0.1));
      w.add(sph(green, 0.48, 0.2, 0.48, ex + 0.04, 2.36, ez)); w.add(sph(green2, 0.09, 0.07, 0.09, -H + 0.12, 1.45, s * (lat0 + 1.0)));
    }
    w.add(rbox(green, H * 2, 0.7, lat0 * 2 + 0.1, 0, 1.55, 0, 0.12)); w.add(rbox(redM, H * 2 - 0.2, 0.05, lat0 * 2 - 0.1, 0.02, 1.17, 0, 0.01));
    for (let k = 0; k < 7; k++) { const t = cone(toothM, 0.085, 0.3, 4, -H + 0.16, 1.03, -0.84 + k * 0.28); t.rotation.x = Math.PI; w.add(t); }
    const lower = new THREE.Group(); lower.position.set(-H + 0.35, 0.4, 0); lower.add(rbox(green2, 0.7, 0.8, lat0 * 2 + 0.1, 0, 0, 0, 0.1)); lower.add(rbox(redM, 0.5, 0.05, lat0 * 2 - 0.1, 0, 0.42, 0, 0.01));
    for (let k = 0; k < 7; k++) lower.add(cone(toothM, 0.085, 0.3, 4, -0.28, 0.58, -0.84 + k * 0.28)); w.add(lower);
    let c = 0; const gp = new THREE.Vector3();
    updaters.push((heroT, t, dt) => { const target = gateBlocked(hr, heroT) ? 1 : 0; const prev = c; c += (target - c) * Math.min(1, dt * 10); if (prev < 0.85 && c >= 0.85 && ctx.fx) { w.getWorldPosition(gp); ctx.fx.puff(gp.x, gp.y + 1.0, gp.z, 6); ctx.fx.sparks(gp.x, gp.y + 1.0, gp.z, '#fffbe0', 8, 2.5, 2, 0.4, 0.04); } lower.position.y = -0.55 + c * 1.1; lower.scale.y = 0.8 + 0.5 * c; });
  } else if (hr.type === 'turntable') {                    // a stone-rimmed painted disc
    const disc = new THREE.Group(), R = hr.r; disc.add(cyl(stoneTint('#b9b4a8'), R, 0.14, 0, 0.1, 0));
    for (let k = 0; k < 6; k++) { const sc = new THREE.Mesh(track(new THREE.CircleGeometry(R * 0.97, 12, (k * Math.PI) / 3, Math.PI / 6)), k % 2 ? paint('#e5483f') : paint('#fff8e8')); sc.rotation.x = -Math.PI / 2; sc.position.y = 0.18; disc.add(sc); }
    for (let k = 0; k < 3; k++) { const ln = rbox(paint('#ffd44a'), R * 2 * 0.96, 0.02, 0.06, 0, 0.2, 0, 0.005); ln.rotation.y = (k * Math.PI) / 3; disc.add(ln); }
    disc.add(cyl(metal('#9aa3ad'), 0.22, 0.3, 0, 0.3, 0)); disc.add(sph(paint('#ffd44a'), 0.12, 0.12, 0.12, 0, 0.5, 0)); w.add(disc);
    const rim = torus(stoneTint('#a9a396', true), R + 0.05, 0.13, 0, 0.17, 0, Math.PI / 2); rim.castShadow = true; w.add(rim);
    updaters.push((heroT) => { disc.rotation.y = -hr.omega * heroT; });
  } else if (hr.type === 'pendulum') {                     // a blue painted gantry with hammers on yellow chains
    const blue = metal('#3c6fd8'), yel = paint('#ffd23f'), padM = paint('#3a62c9');
    hr.hammers.forEach((m) => {
      w.add(rbox(blue, 0.3, 0.3, (hw + 0.5) * 2, m.du, 3.5, 0, 0.06));                                   // an arch over each hammer: a bar across the lane on two legs, the chain hangs from a ring on the bar
      for (const sd of [-1, 1]) { w.add(rbox(blue, 0.3, 3.6, 0.3, m.du, 1.75, sd * (hw + 0.45), 0.06)); w.add(rbox(blue, 0.9, 0.16, 0.55, m.du, 0.1, sd * (hw + 0.45), 0.04)); }
      w.add(torus(yel, 0.13, 0.05, m.du, 3.32, 0, 0, Math.PI / 2)); w.add(rbox(blue, 0.12, 0.2, 0.12, m.du, 3.36, 0, 0.02));
      const head = new THREE.Group(), body = cyl(padM, hr.rad, 0.9, 0, 0, 0); head.add(body); head.add(cyl(yel, hr.rad * 1.02, 0.14, 0, 0.18, 0)); head.add(cyl(yel, hr.rad * 1.02, 0.14, 0, -0.2, 0)); head.add(torus(blue, 0.12, 0.05, 0, 0.5, 0, Math.PI / 2)); w.add(head);
      const links = []; for (let i = 0; i < 9; i++) { const lk = torus(yel, 0.11, 0.035, 0, 0, 0); lk.scale.set(1, 1.5, 1); w.add(lk); links.push(lk); }
      updaters.push((heroT) => {
        const off = hr.A * Math.sin(hr.w * heroT + m.ph); head.position.set(m.du, 0.6, off);
        const topY = 3.3, hx = m.du, hy = 1.12, hz = off;
        links.forEach((lk, i) => { const u = (i + 0.5) / links.length; lk.position.set(hx, topY + (hy - topY) * u, hz * u); lk.rotation.set(-Math.atan2(hz, topY - hy), i % 2 ? Math.PI / 2 : 0, 0); });
      });
    });
  } else if (hr.type === 'geyser') {                       // a stone-ringed pool that bubbles, swells and then throws up a column of water
    const R = hr.r, ring = [], N = 14, poly = []; for (let i = 0; i < 16; i++) poly.push(Math.cos((i / 16) * 6.2832) * R * 0.98, Math.sin((i / 16) * 6.2832) * R * 0.98);
    const wm = waterMaterial(ctx.look, 0, 0, 0); ctx.disposables?.push(wm); const pg = track(pondGeometry(poly, 0.22)), pool = new THREE.Mesh(pg, wm); pool.renderOrder = 2; w.add(pool);
    const bedG = track(pondGeometry(poly, 0.12)); w.add(new THREE.Mesh(bedG, GM.lam(GM.tex.stone, '#9fa7ad')));
    const rockMat2 = GM.lam(GM.tex.stone, '#ffffff', { flatShading: true }); ctx.disposables?.push(rockMat2);
    const rr = new THREE.InstancedMesh(getRock(), rockMat2, N * 2); rr.castShadow = rr.receiveShadow = true; const rc = new THREE.Color(), rg = mulberry32(7);
    for (let i = 0; i < N * 2; i++) { const a = (i / (N * 2)) * 6.2832, rad = R + 0.1 + (i % 2) * 0.12, sz = 0.42 + rg() * 0.25; _q.setFromAxisAngle(UP, rg() * 6); _m.compose(_v.set(Math.cos(a) * rad, 0.1, Math.sin(a) * rad), _q, _s.set(sz * 1.4, sz * 0.4, sz * 1.2)); rr.setMatrixAt(i, _m); rc.set(ROCKS[(rg() * ROCKS.length) | 0]); rr.setColorAt(i, rc); }
    rr.instanceMatrix.needsUpdate = rr.instanceColor.needsUpdate = true; w.add(rr); ctx.disposables?.push(rr);
    const dome = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: '#a8e0ff', transparent: true, opacity: 0.55, depthWrite: false })); dome.scale.set(R * 0.6, 0.01, R * 0.6); dome.position.y = 0.22; w.add(dome);
    const jetGeo = track(new THREE.CylinderGeometry(0.17, 0.5, 1, 14, 10, true).translate(0, 0.5, 0));
    const jetMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uT, uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { float f = abs(dot(normalize(vN), normalize(vV))); float edge = smoothstep(0.0, 0.7, f); float n = 0.5 + 0.5 * sin(vUv.y * 14.0 - uT * 9.0 + vUv.x * 18.0) * sin(vUv.y * 5.0 - uT * 6.0); float a = uA * (0.26 + 0.4 * n) * (0.3 + 0.7 * edge) * (1.0 - smoothstep(0.7, 1.0, vUv.y) * 0.75); vec3 c = mix(vec3(0.55, 0.82, 1.0), vec3(1.0), n * 0.6 + vUv.y * 0.3); gl_FragColor = vec4(c, a); }',
    });
    ctx.disposables?.push(jetMat); const jet = new THREE.Mesh(jetGeo, jetMat); jet.position.y = 0.22; jet.visible = false; jet.renderOrder = 3; w.add(jet);
    const bubbles = [0, 1, 2, 3, 4, 5].map(() => { const b = sph(M.white, 0.1, 0.1, 0.1, 0, 0.3, 0); b.material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }); w.add(b); return b; });
    const wp = new THREE.Vector3();
    updaters.push((heroT, t, dt) => {
      const k = (heroT + hr.phase) / hr.period, fr = k - Math.floor(k), erupt = fr > 0.84 ? Math.sin(((fr - 0.84) / 0.16) * Math.PI) : 0, build = fr > 0.5 && fr <= 0.84 ? (fr - 0.5) / 0.34 : 0;
      jetMat.uniforms.uT.value = t; jetMat.uniforms.uA.value = Math.min(1, erupt * 1.6);
      const H = 0.4 + erupt * 3.4; jet.visible = erupt > 0.02; jet.scale.set(0.75 + 0.55 * erupt, H, 0.75 + 0.55 * erupt);
      dome.scale.y = 0.01 + (build * build * 0.32) * (erupt > 0 ? 0.3 : 1); pool.position.y = build * 0.04;
      bubbles.forEach((b, i) => { const on = build > 0.05 && erupt <= 0, ph = (t * (0.8 + i * 0.13) + i * 0.4) % 1; b.visible = on; b.position.set(Math.cos(i * 1.7 + t) * R * 0.5 * (0.3 + build), 0.2 + ph * 0.28 * (0.5 + build), Math.sin(i * 1.7 + t) * R * 0.5 * (0.3 + build)); b.scale.setScalar(0.06 + 0.06 * build); });
      if (erupt > 0.02 && ctx.fx) { w.getWorldPosition(wp); ctx.fx.jet(wp.x, wp.y + 0.22, wp.z, erupt, dt, H); }
    });
  } else if (hr.type === 'cannon') {                      // an iron cannon on a wooden carriage with spoked wheels
    const iron = metal('#4a4f5a'), brass = metal('#c9a24a'), barrel = new THREE.Group(); barrel.position.y = 0.8;
    w.add(rbox(woodTint('#a87040'), 1.7, 0.3, 1.0, -0.1, 0.35, 0, 0.06)); w.add(rbox(woodTint('#8a5a30'), 1.0, 0.45, 0.2, -0.1, 0.55, 0.42, 0.05)); w.add(rbox(woodTint('#8a5a30'), 1.0, 0.45, 0.2, -0.1, 0.55, -0.42, 0.05));
    const tube = new THREE.Mesh(G.cyl, iron); tube.scale.set(0.38, 1.9, 0.38); tube.rotation.z = Math.PI / 2; tube.position.x = 0.75; tube.castShadow = true; barrel.add(tube);
    barrel.add(torus(brass, 0.4, 0.07, 1.65, 0, 0, 0, Math.PI / 2)); barrel.add(torus(brass, 0.42, 0.07, 0.1, 0, 0, 0, Math.PI / 2)); barrel.add(sph(iron, 0.46, 0.46, 0.46, -0.2, 0, 0)); barrel.add(cone(brass, 0.07, 0.25, 6, -0.62, 0.2, 0)); w.add(barrel);
    for (const s of [-1, 1]) {
      const wheel = new THREE.Group(); wheel.position.set(-0.1, 0.5, s * 0.66); wheel.add(torus(woodTint('#8a5a30'), 0.46, 0.07, 0, 0, 0)); wheel.add(torus(iron, 0.52, 0.03, 0, 0, 0)); { const hub = cyl(brass, 0.12, 0.14, 0, 0, 0); hub.rotation.x = Math.PI / 2; wheel.add(hub); }
      for (let k = 0; k < 6; k++) { const sp = rbox(woodTint('#a87040'), 0.07, 0.9, 0.07, 0, 0, 0, 0.015); sp.rotation.z = (k * Math.PI) / 6; wheel.add(sp); } w.add(wheel);
    }
    updaters.push((heroT) => { barrel.rotation.y = -hr.wobble * Math.sin(heroT * 1.3); });
  } else if (hr.type === 'teleport') {                     // a warp zone: two swirling portals either side of a rockery
    const swirl = (c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.translate(64, 64); const gr = x.createRadialGradient(0, 0, 0, 0, 0, 62); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 62, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 6; x.lineCap = 'round'; for (let k = 0; k < 4; k++) { x.beginPath(); for (let t = 0; t < 1; t += 0.04) { const a = k * 1.5708 + t * 4.2, r = 6 + t * 50; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.stroke(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; (ctx.disposables || []).push(t); return t; };
    for (const [p, c] of [[hr.a, '#ff9a2a'], [hr.b, '#4fe3ff']]) {
      const gp = new THREE.Group(); gp.position.set(p.x - hr.x, 0, p.z - hr.z); gp.add(cyl(stoneTint('#6c7480'), 0.8, 0.14, 0, 0.07, 0));
      const dm = new THREE.MeshBasicMaterial({ map: swirl(c), transparent: true, depthWrite: false }); (ctx.disposables || []).push(dm); const disc = new THREE.Mesh(G.disc, dm); disc.scale.set(0.68, 1, 0.68); disc.position.y = 0.17; gp.add(disc);
      gp.add(torus(new THREE.MeshBasicMaterial({ color: c }), 0.7, 0.07, 0, 0.17, 0, Math.PI / 2));
      const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.62, 0.62, 1.7, 20, 1, true)), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); (ctx.disposables || []).push(beam.material); beam.position.y = 0.95; gp.add(beam);
      updaters.push((heroT) => { disc.rotation.y = heroT * (c === '#ff9a2a' ? 2.4 : -2.4); beam.material.opacity = 0.16 + 0.08 * Math.sin(heroT * 4); }); w.add(gp);
    }
    w.rotation.y = 0; const rk = hr.rock, yaw = Math.atan2(-hr.uz, hr.ux), cl = new THREE.Group(); cl.position.set(rk.x - hr.x, 0, rk.z - hr.z); cl.rotation.y = yaw; w.add(cl);
    const rg = mulberry32(21), spots = [[0, 0, 1.0, 1.0, 1], [0.55, 0.45, 0.65, 0.6, 0.8], [-0.55, -0.4, 0.7, 0.65, 0.9], [0.5, -0.5, 0.55, 0.5, 0.7], [-0.5, 0.5, 0.55, 0.55, 0.7], [0.0, 0.05, 0.6, 0.6, 1.5]];
    spots.forEach(([x, z, sx, sz, hh], i) => { const rm = new THREE.Mesh(getRock(), stoneTint(ROCKS[i % ROCKS.length], true)); rm.scale.set(rk.half * sx * 1.5, 1.1 * hh, rk.side * sz * 1.5); rm.position.set(x * rk.half, 0.5 * hh, z * rk.side); rm.rotation.y = rg() * 6; rm.castShadow = true; cl.add(rm); });
    for (let k = 0; k < 3; k++) cl.add(cone(paint('#5fb455'), 0.1, 0.5, 4, (rg() - 0.5) * rk.half, 1.5, (rg() - 0.5) * rk.side));
  } else if (hr.type === 'drawbridge') {                   // a little castle gate: a moat, round towers and a wooden bridge that lifts
    const H = hr.half, W = hw + 0.3, wr = new THREE.BufferGeometry(), pos = [], dep = [], idx = [], XS = [[-1, 0], [-0.6, 0.7], [0, 1], [0.6, 0.7], [1, 0]], ZS = [-1, 0, 1];
    for (const [xx, dd] of XS) for (const zz of ZS) { pos.push(xx * H, 0.1, zz * W); dep.push(zz === 0 ? dd : dd * 0.8); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 1, c = a + 3, d = c + 1; idx.push(a, c, b, b, c, d); }
    wr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wr.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); wr.setIndex(idx); track(wr);
    const wm = waterMaterial(ctx.look, 0, 0, 0); ctx.disposables?.push(wm); const moat = new THREE.Mesh(wr, wm); moat.renderOrder = 2; w.add(moat);
    const stone = stoneTint('#b9b4a8'), roofM = paint('#d24a45');
    for (const e of [-1, 1]) w.add(rbox(stone, 0.5, 0.05, W * 2, e * (H + 0.35), 0.03, 0, 0.01));        // (flat paving at each end of the moat: nothing stands in the lane)
    for (const s of [-1, 1]) for (const e of [-1, 1]) { const tx = e * (H + 0.2), tz = s * (hw + 0.95); w.add(cyl(stone, 0.55, 2.3, tx, 1.15, tz)); w.add(cone(roofM, 0.75, 0.9, 8, tx, 2.75, tz)); w.add(rbox(paint('#2a2a33'), 0.1, 0.4, 0.2, tx, 1.5, tz - s * 0.5, 0.02)); w.add(cone(paint('#ffd23f'), 0.05, 0.3, 4, tx, 3.35, tz)); }
    const pivot = new THREE.Group(); pivot.position.set(H, 0.18, 0); pivot.add(rbox(woodTint('#ffffff'), H * 2, 0.14, hw * 2 - 0.2, -H, 0, 0, 0.03));
    for (const s of [-1, 1]) pivot.add(rbox(woodTint('#8a5a30'), H * 2, 0.22, 0.1, -H, 0.16, s * (hw - 0.15), 0.02));
    for (let k = 0; k < 6; k++) pivot.add(rbox(woodTint('#8a5a30'), 0.06, 0.04, hw * 2 - 0.3, -0.15 - k * (H * 2 - 0.3) / 5, 0.09, 0, 0.01)); w.add(pivot);
    let a = 0;
    updaters.push((heroT, t, dt) => { const target = bridgeUp(hr, heroT) ? 1 : 0; a += (target - a) * Math.min(1, dt * 5); pivot.rotation.z = a * 1.2; });
  } else if (hr.type === 'loop') {                         // a painted loop-the-loop on steel legs between red and white curbs
    const pts = []; for (let i = 0; i <= 48; i++) { const s = i / 48; pts.push(new THREE.Vector3(-hr.L / 2 + s * hr.L, 0.12 + hr.R * (1 - Math.cos(6.283185307 * s)), 0)); }
    const curve = new THREE.CatmullRomCurve3(pts), redM = metal('#e5483f'), whiteM = metal('#ffffff'), steel = metal('#8d97a3');
    for (const s of [-1, 1]) { const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 96, 0.11, 8, false)), s > 0 ? redM : whiteM); tube.position.z = s * 0.55; tube.castShadow = true; w.add(tube); }
    for (let i = 2; i < 48; i += 3) { const p = pts[i], q2 = pts[Math.min(48, i + 1)], strut = rbox(steel, 0.07, 0.07, 1.2, p.x, p.y, 0, 0.015); strut.rotation.z = Math.atan2(q2.y - p.y, q2.x - p.x); w.add(strut); }
    for (let i = 4; i < 48; i += 8) { const p = pts[i]; if (p.y > 0.3) { w.add(rbox(steel, 0.12, p.y, 0.12, p.x, p.y / 2, 0.55, 0.02)); w.add(rbox(steel, 0.12, p.y, 0.12, p.x, p.y / 2, -0.55, 0.02)); } w.add(rbox(steel, 0.3, 0.08, 1.4, p.x, 0.04, 0, 0.02)); }
    const ramp = rbox(woodTint('#ffe0b0'), 1.7, 0.1, hr.track * 2, -hr.L / 2 - 0.8, 0.12, 0, 0.03); ramp.rotation.z = 0.2; w.add(ramp);
    for (const s of [-1, 1]) { const lw = hw + 0.3 - hr.track, zc = s * (hr.track + lw / 2); w.add(rbox(paint('#e5483f'), hr.L, 0.6, lw, 0, 0.3, zc, 0.07)); w.add(rbox(paint('#ffffff'), hr.L + 0.04, 0.12, lw + 0.04, 0, 0.64, zc, 0.03)); }
  }
  return w;
}

/** The hamster in its ball. */
export function buildHamster() {
  const g = new THREE.Group(), tan = mat('#d9a066'), cream = mat('#f4dcb8');
  const bubble = new THREE.Mesh(G.sph, M.bubble); bubble.scale.setScalar(BALL_R * 1.75); g.add(bubble);
  const hm = new THREE.Group(); g.add(hm);
  hm.add(sph(tan, 0.2, 0.15, 0.24, 0, 0, 0), sph(cream, 0.16, 0.1, 0.18, 0, -0.04, 0.02), sph(tan, 0.13, 0.12, 0.13, 0, 0.04, 0.24), sph(cream, 0.07, 0.06, 0.06, 0, 0.0, 0.34), sph(M.dark, 0.025, 0.025, 0.025, 0, 0.02, 0.4));
  for (const s of [-1, 1]) { hm.add(sph(tan, 0.045, 0.06, 0.03, s * 0.09, 0.15, 0.2), sph(M.dark, 0.022, 0.022, 0.022, s * 0.06, 0.09, 0.34)); }
  const feet = [-1, 1].flatMap((s) => [-1, 1].map((f) => { const p = sph(cream, 0.05, 0.04, 0.07, s * 0.1, -0.12, f * 0.13); hm.add(p); return { p, f, s }; }));
  g.userData.run = (t, speed) => { feet.forEach(({ p, f, s }) => { p.position.z = f * 0.13 + 0.07 * Math.sin(t * (6 + speed) + (s > 0 ? 0 : 3.1)); p.position.y = -0.12 + 0.03 * Math.abs(Math.sin(t * (6 + speed) + (s > 0 ? 0 : 3.1))); }); hm.rotation.z = 0.06 * Math.sin(t * (6 + speed)); };
  g.userData.hm = hm;
  return g;
}
