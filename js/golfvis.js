// What the mini-golf looks like: one hole's meshes (fairway, rails, cup and flag, water, the hero obstacle, power-up orbs) and the hamster ball. All of it is built from a
// handful of shared materials and boxes, in one group per hole that is thrown away when the hole is done. Coordinates are the hole's own (the same as golfphys.js).
import * as THREE from 'three';
import { BALL_R, CUP_R, hillH, hillGrad, triggerBar, magnetState, inPoly } from './golfphys.js?v=20261030232841';
import { gateBlocked, bridgeUp, mulberry32 } from './golfhero.js?v=20261030232841';
import { golfMaterials, boxGeo } from './golfmat.js?v=20261030232841';
import { themeOf, BRICKS, ROCKS, WOODS } from './golfthemes.js?v=20261030232841';
import { waterMaterial, pondGeometry, riverGeometry } from './golfwater.js?v=20261030232841';
import { isLow } from './golfquality.js?v=20261030232841';

/** Round off a flat outline [x0, z0, ...] (corner cutting, each round keeps it inside the original), so sand pits and surface patches read as soft, natural shapes rather than polygons. */
function softPoly(poly, rounds = 2) {
  let p = poly; for (let r = 0; r < rounds; r++) { const n = p.length / 2, o = []; for (let i = 0; i < n; i++) { const j = (i + 1) % n, ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1]; o.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75); } p = o; }
  return p;
}
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
let clothTex = null;
function flagCloth() {                                     // the flag's cloth: red with a darker hem on the pole side, a faint weave and a white ring
  if (!clothTex) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 80; const x = c.getContext('2d');
    x.fillStyle = '#ef5b4d'; x.fillRect(0, 0, 128, 80); x.strokeStyle = 'rgba(120,20,10,0.16)'; x.lineWidth = 1; for (let i = -80; i < 128; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 80, 80); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 128; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - 80, 80); x.stroke(); }
    x.fillStyle = '#c8392e'; x.fillRect(0, 0, 12, 80); x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(70, 40, 20, 0, 7); x.fill(); x.fillStyle = '#ef5b4d'; x.beginPath(); x.arc(70, 40, 13, 0, 7); x.fill();
    clothTex = new THREE.CanvasTexture(c); clothTex.colorSpace = THREE.SRGBColorSpace; clothTex.anisotropy = 4;
  }
  return clothTex;
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
  const made = [], make = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = m.receiveShadow = true; m.userData.seg = n === segs.length; g.add(m); disposables.push(m); made.push(m); return m; };
  const place = (mesh, i, w, off, y, lenK, hgt, thick, shift, palette, tilt = 0) => {
    const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.sqrt(dx * dx + dz * dz) || 1, hy = Math.max(0, hillH(h, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2)), ox = (sgn * dz) / l, oz = (-sgn * dx) / l, ux = dx / l, uz = dz / l;
    _q.setFromAxisAngle(UP, Math.atan2(-dz, dx)); if (tilt) { _q2.setFromAxisAngle(_vx, tilt); _q.multiply(_q2); }
    _m.compose(_v.set((w[0] + w[2]) / 2 + ox * (thick / 2 + off) + ux * shift, y + hy, (w[1] + w[3]) / 2 + oz * (thick / 2 + off) + uz * shift), _q, _s.set(l * lenK + 0.07, hgt, thick));
    mesh.setMatrixAt(i, _m); col.set(palette[(r() * palette.length) | 0]); col.offsetHSL(0, 0, (r() - 0.5) * 0.05); mesh.setColorAt(i, col);
  };
  const BEV = G.box;                                                                               // (the bricks and planks keep the plain box: the normal maps carry their chamfers, and thousands of bevelled boxes would be far too heavy)
  if (style === 'brick') {
    const c0 = make(BEV, GM.brick, segs.length), c1 = make(BEV, GM.brick, segs.length), cap = make(BEV, GM.stone, segs.length);
    segs.forEach((w, i) => { place(c0, i, w, 0, 0.15, 1, 0.3, 0.4, 0, TH.pal); place(c1, i, w, 0, 0.45, 1, 0.3, 0.4, 0.3, TH.pal); place(cap, i, w, -0.03, 0.65, 1, 0.1, 0.5, 0, ['#e8dcc6', '#ddd0b8']); });
    for (const m of [c0, c1, cap]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  } else if (style === 'stone') {
    getRock();
    const mat = GM.lam(GM.tex.stone, '#ffffff', { flatShading: true }); disposables.push(mat);
    const rocks = make(rockGeo, mat, segs.length), top = make(rockGeo, mat, segs.length);
    segs.forEach((w, i) => { const hgt = 0.55 + r() * 0.3; place(rocks, i, w, 0.05, hgt * 0.4, 1.7, hgt, 0.7 + r() * 0.2, (r() - 0.5) * 0.3, TH.pal, (r() - 0.5) * 0.3); place(top, i, w, 0.15, 0.62 + r() * 0.12, 1.1, 0.4 + r() * 0.2, 0.55, (r() - 0.5) * 0.5, ROCKS, (r() - 0.5) * 0.4); });
    for (const m of [rocks, top]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  } else {
    const p0 = make(BEV, GM.wood, segs.length), p1 = make(BEV, GM.wood, segs.length), posts = make(BEV, GM.darkwood, Math.ceil(segs.length / 5));
    segs.forEach((w, i) => { place(p0, i, w, 0, 0.15, 1, 0.3, 0.32, 0, TH.pal); place(p1, i, w, 0, 0.47, 1, 0.3, 0.32, 0, TH.pal); });
    let n = 0; segs.forEach((w, i) => { if (i % 5 === 0 && n < posts.count) { _m.compose(_v.set(w[0] + ((sgn * (w[3] - w[1])) / (Math.hypot(w[2] - w[0], w[3] - w[1]) || 1)) * 0.18, 0.4, w[1] + ((-sgn * (w[2] - w[0])) / (Math.hypot(w[2] - w[0], w[3] - w[1]) || 1)) * 0.18), _q.identity(), _s.set(0.28, 0.85, 0.28)); posts.setMatrixAt(n, _m); posts.setColorAt(n++, col.set('#ffffff')); } });
    posts.count = n;
    for (const m of [p0, p1, posts]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  return { segs, meshes: made.filter((m) => m.userData.seg && m.instanceColor) };
}
function signTexture(n, par) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#6b4a2c'; x.fillRect(0, 0, 256, 160); x.fillStyle = '#fff3cf'; x.fillRect(6, 6, 244, 148);
  x.fillStyle = '#2a1a0c'; x.textAlign = 'center'; x.font = '800 112px "Outfit", system-ui, sans-serif'; x.fillText(`${n}`, 128, 102); x.font = '800 40px "Outfit", system-ui, sans-serif'; x.fillText(`PAR ${par}`, 128, 144);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** The energy of a hit of this impact speed (about 1 to 12): a graze lights its target gently (0.7), a normal tap strongly (1, what a hard hit used to be) and a hard hit flares to 3.2. */
const hitK = (strength) => 0.7 + 2.5 * Math.pow(Math.max(0, Math.min(1, (strength - 0.8) / 9)), 0.85);
/** The rough: the theme's lawn colour taken a good deal darker, so it reads against the light, mown green. */
const roughCol = (TH) => new THREE.Color(TH.fair[1]).multiplyScalar(0.3).offsetHSL(0, 0.05, -0.03);
const _hbox = new THREE.Box3(), _hp = new THREE.Vector3(), _hs = new THREE.Vector3(), _hwarm = new THREE.Color('#ffe9a0');
const _warm = new THREE.Color(), _q2 = new THREE.Quaternion(), _vx = new THREE.Vector3(1, 0, 0);

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
  const pos = [], uvs = [], col = [], idx = [], hts = [], c1 = new THREE.Color(TH0.fair[0]).lerp(new THREE.Color('#ffffff'), 0.2), c2 = new THREE.Color(TH0.fair[1]).lerp(new THREE.Color('#ffffff'), 0.04).multiplyScalar(0.9), COLS = h.cols || 24, crest = new THREE.Color(TH0.fair[2]), shade = new THREE.Color(TH0.fair[3]), tmp = new THREE.Color();
  const rock = new THREE.Color(TH0.rock), deep = new THREE.Color('#4a4239'), plank = new THREE.Color('#e0a868'), feats = h.feats || [];
  let R = h.ribbon;
  if (feats.length || h.sands.length || h.dense) { const R2 = []; for (let i = 0; i < R.length - 1; i++) for (let k = 0; k < 3; k++) { const t = k / 3, a0 = R[i], b0 = R[i + 1]; R2.push([0, 1, 2, 3, 4].map((j) => (j === 4 && (a0[4] < 0 || b0[4] < 0) ? a0[4] : a0[j] + (b0[j] - a0[j]) * t))); } R2.push(R[R.length - 1]); R = R2; }
  const nearCup = (vi) => Math.hypot(pos[vi * 3] - h.cup.x, pos[vi * 3 + 2] - h.cup.z) < 1.0;
  for (let i = 0; i < R.length; i++) {
    const row = R[i];
    for (let c = 0; c <= COLS; c++) {
      const stripe = Math.floor(Math.abs(c - COLS / 2 + 0.01) / (COLS / 12)) & 1, u = c / COLS, x = row[0] + (row[2] - row[0]) * u, z = row[1] + (row[3] - row[1]) * u;
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
  const GROUND = GM.ground(TH0.ground), fair = new THREE.Mesh(fg, GROUND); fair.receiveShadow = true; g.add(fair);
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
  const border = buildBorder(h, g, disposables), hitFlash = new Map(), wallFlash = new Map(), heroFlash = new Map(); let heroMeshes = null;
  const hitGroups = [], heroList = () => { if (heroMeshes) return; heroMeshes = []; heroRoot.traverse((o) => { if (o.userData.hitGroup) hitGroups.push(o); }); heroRoot.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.material && !Array.isArray(o.material) && o.material.emissive && !o.material.transparent && o.geometry !== G.disc) heroMeshes.push(o); }); };
  const lightHero = (o, e) => { let f = heroFlash.get(o); if (!f) { f = { k: 0, orig: o.material, clone: null }; heroFlash.set(o, f); } if (!f.clone || o.material !== f.clone) { f.orig = o.material === f.clone ? f.orig : o.material; f.clone = f.orig.clone(); disposables.push(f.clone); o.material = f.clone; } f.k = Math.max(f.k, e); };
  // the tee sign, on a post beside the round green at the start
  { const t0 = h.path[0], t1 = h.path[Math.min(4, h.path.length - 1)], l = Math.hypot(t1.x - t0.x, t1.z - t0.z) || 1, tx = (t1.x - t0.x) / l, tz = (t1.z - t0.z) / l;
    const sg = new THREE.Group(); sg.position.set(t0.x - tz * 0 + -tz * 3.9 - tx * 0.4, 0, t0.z + tx * 3.9 - tz * 0.4);
    const post = box(M.wood, 0.16, 1.9, 0.16, 0, 0.95, -0.16), tex = signTexture(h.index + 1, h.par); disposables.push(tex);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.25, 0.08), [mat('#6b4a2c'), mat('#6b4a2c'), mat('#6b4a2c'), mat('#6b4a2c'), Object.assign(new THREE.MeshLambertMaterial({ map: tex }), { userData: { neon: 'sign' } }), mat('#6b4a2c')]); board.position.y = 1.9;
    disposables.push(board.geometry); sg.add(post, board); sg.rotation.y = Math.atan2(-tx, -tz) + Math.PI; sg.rotation.y = Math.atan2(-tx, -tz); g.add(sg); }
  // tee, cup and flag
  const tee = new THREE.Mesh(G.disc, M.white); tee.scale.set(0.55, 1, 0.55); tee.position.set(h.ball.x, 0.06, h.ball.z); g.add(tee);
  { const p0 = h.path[0], p1 = h.path[Math.min(3, h.path.length - 1)], l = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1, nx = -(p1.z - p0.z) / l, nz = (p1.x - p0.x) / l;       // the tee markers: a red and a blue peg either side of the ball
    for (const [sd, col] of [[-1, '#e8594b'], [1, '#4d8fe0']]) { const px = h.ball.x + nx * 0.85 * sd, pz = h.ball.z + nz * 0.85 * sd, y = hillH(h, px, pz); g.add(cyl(paint(col), 0.06, 0.34, px, y + 0.17, pz)); g.add(sph(paint(col), 0.1, 0.1, 0.1, px, y + 0.36, pz)); g.add(cyl(paint('#ffffff'), 0.075, 0.04, px, y + 0.05, pz)); } }
  // the hole: a round opening cut in the green (a patch of turf round it, see the fairway), a steel rim, a dark shaft going down and a floor; one group so the mega-cup power-up can widen the rim
  const cupMesh = new THREE.Group(); cupMesh.position.set(h.cup.x, Math.max(0, hillH(h, h.cup.x, h.cup.z)), h.cup.z); cupMesh.scale.set(CUP_R * 0.92, 1, CUP_R * 0.92); g.add(cupMesh);
  { const RING = [1.0, 1.12, 1.4, 1.9, 2.8], SEG = 40, cx = h.cup.x, cz = h.cup.z, pp = [], pu = [], pc = [], pi = [], col0 = c1.clone().lerp(c2, 0.5);
    for (const rr of RING) for (let k = 0; k < SEG; k++) { const a = (k / SEG) * 6.2832, x = cx + Math.cos(a) * rr * CUP_R * 0.92, z = cz + Math.sin(a) * rr * CUP_R * 0.92; pp.push(x, hillH(h, x, z) + 0.032 + (rr < 1.15 ? 0.012 : 0), z); pu.push(x * 0.4, z * 0.4); pc.push(col0.r, col0.g, col0.b); }
    for (let r = 0; r < RING.length - 1; r++) for (let k = 0; k < SEG; k++) { const a0 = r * SEG + k, b0 = r * SEG + ((k + 1) % SEG), a1 = (r + 1) * SEG + k, b1 = (r + 1) * SEG + ((k + 1) % SEG); pi.push(a0, b0, a1, b0, b1, a1); }
    const pg = track(new THREE.BufferGeometry()); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2)); pg.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3)); pg.setIndex(pi); pg.computeVertexNormals();
    const patch = new THREE.Mesh(pg, GROUND); patch.receiveShadow = true; g.add(patch);
    { // the mouth the mega cup opens in the green: the hole is only cut as wide as the normal cup, so when the cup grows a dark disc with a pale lip is laid over the turf (it fades in as the cup widens)
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx2 = cv.getContext('2d'), gr = cx2.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, '#030303'); gr.addColorStop(0.55, '#0d0c0a'); gr.addColorStop(0.82, '#2e2b24'); gr.addColorStop(0.93, '#9c978a'); gr.addColorStop(1, '#e4e0d4'); cx2.fillStyle = gr; cx2.beginPath(); cx2.arc(64, 64, 64, 0, 6.2832); cx2.fill();
      const mt = new THREE.CanvasTexture(cv), mm = new THREE.MeshBasicMaterial({ map: mt, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); disposables.push(mt, mm);
      const mouth = new THREE.Mesh(G.disc, mm); mouth.position.y = 0.05; mouth.visible = false; mouth.renderOrder = 3; cupMesh.add(mouth); cupMesh.userData.mouth = mouth; }
    const rim = new THREE.Mesh(track(new THREE.TorusGeometry(1.0, 0.08, 8, 32)), metal('#d5dbe3')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; cupMesh.add(rim);
    { // the shaft: a pale plastic cup that fades to dark with depth, so looking down the hole you see its walls going down to a floor
      const wg = track(new THREE.CylinderGeometry(1.0, 0.94, 1.3, 32, 10, true)), wp = wg.attributes.position, wc = new Float32Array(wp.count * 3), top = new THREE.Color('#e4e0d4'), bot = new THREE.Color('#15140f'), cc = new THREE.Color();
      for (let i = 0; i < wp.count; i++) { const k = Math.min(1, Math.max(0, (0.65 - wp.getY(i)) / 1.3)), ring = 0.92 + 0.08 * Math.sin(wp.getY(i) * 38); cc.copy(top).lerp(bot, Math.pow(k, 0.75)).multiplyScalar(ring); wc[i * 3] = cc.r; wc[i * 3 + 1] = cc.g; wc[i * 3 + 2] = cc.b; }
      wg.setAttribute('color', new THREE.BufferAttribute(wc, 3));
      const wall = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })); wall.position.y = -0.62; cupMesh.add(wall);
      const floor = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: '#2a2823' })); floor.scale.set(0.94, 1, 0.94); floor.position.y = -1.26; cupMesh.add(floor);
      const dot = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: '#0d0c0a' })); dot.scale.set(0.5, 1, 0.5); dot.position.y = -1.255; cupMesh.add(dot); } }
  const flag = new THREE.Group(); flag.position.set(h.cup.x, 0, h.cup.z);
  flag.add(cyl(M.pole, 0.04, 3.7, 0, 0.55, 0));      // (the pole runs down to the floor of the hole) flag.add(sph(M.pole, 0.07, 0.07, 0.07, 0, 2.42, 0)); flag.add(cyl(metal('#d5dbe3'), 0.075, 0.1, 0, 0.05, 0)); flag.add(cyl(paint('#ef5b4d'), 0.047, 0.3, 0, 2.15, 0)); flag.add(cone(metal('#d5dbe3'), 0.05, 0.16, 8, 0, 2.55, 0));          // (a base ring, a red band, a ball and a spike finial)
  const flGeo = new THREE.PlaneGeometry(0.95, 0.6, 14, 5), flMat = new THREE.MeshLambertMaterial({ color: '#ffffff', map: flagCloth(), emissive: '#6a2018', side: THREE.DoubleSide }), fl = new THREE.Mesh(flGeo, flMat), flBase = flGeo.attributes.position.array.slice(); disposables.push(flGeo, flMat); fl.castShadow = true; fl.position.set(0.48, 2.1, 0); flag.add(fl); g.add(flag);
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
  { let fy = 0, fv = 0;                                        // the flag pulls up out of the cup as a ball comes near, and is gone; when the ball moves away again it comes back and drops into the hole
    updaters.push((heroT, t, dt, st) => {
      const near = !!(st && st.flagNear), top = 3.4;
      if (near) { fv = 0; fy += (top - fy) * Math.min(1, dt * 7) + dt * 0.8; if (fy > top) fy = top; }
      else if (fy > 0) { fv -= 11 * dt; fy += fv * dt; if (fy <= 0) { fy = 0; fv = fv < -2 ? -fv * 0.18 : 0; } }
      else if (fv > 0) { fv -= 11 * dt; fy += fv * dt; if (fy < 0) { fy = 0; fv = 0; } }
      flag.position.y = fy; flag.rotation.z = Math.min(1, fy / top) * 0.14; flag.visible = fy < top - 0.02;
    }); }
  // posts, bumpers, sand
  const overlay = (src, geo, key) => { const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); o.visible = false; o.renderOrder = 6; g.add(o); disposables.push(o.material); hitFlash.set(key, { o, src, k: 0 }); };      // (a lit copy of a post or bumper, exactly its own shape, shown only while it flashes)
  for (const p of h.posts) { const pm = cyl(M.post, p.r, 1.0, p.x, 0.45, p.z); g.add(pm); overlay(pm, G.cyl, `${p.x},${p.z}`); g.add(cyl(paint('#ffd23f'), p.r * 1.04, 0.14, p.x, 0.72, p.z)); g.add(cyl(paint('#ffd23f'), p.r * 1.04, 0.14, p.x, 0.2, p.z));
  }                                                                                  // (the painted warning bands: this is something the ball hits)
  const bumperParts = new Map();                              // (each bumper's body and cap: the pinball table lights them when hit)
  for (const p of h.bumpers) {
    const BL = { candy: ['#ff5f9e', 'sph'], haunted: ['#ff8a2a', 'sph'], ice: ['#7cc8ff', 'cyl'], space: ['#8a63ff', 'cyl'], volcano: ['#ff5a1a', 'cyl'], desert: ['#d98a3d', 'cyl'] }[h.theme], round = BL && BL[1] === 'sph', ph = p.x * 3 + p.z;      // (the bumpers take the theme's look: gumdrops, pumpkins, ice posts, crystal domes)
    const b = round ? new THREE.Mesh(G.sph, BL ? paint(BL[0]) : M.bumper) : cyl(BL ? paint(BL[0]) : M.bumper, p.r, 0.8, p.x, 0.4, p.z), cap = cyl(M.white, p.r * 1.05, 0.12, p.x, 0.62, p.z); if (round) { b.position.set(p.x, 0.45, p.z); cap.visible = false; } g.add(b); g.add(cap); bumperParts.set(p, { b, cap }); overlay(b, round ? G.sph : G.cyl, `${p.x},${p.z}`); g.add(torus(paint('#ffd23f'), p.r * 1.0, 0.05, p.x, 0.3, p.z, Math.PI / 2));
    updaters.push((heroT, t) => { const k = (1 + 0.05 * Math.sin(t * 4 + ph)) * (1 + (p.pop || 0)); if (round) b.scale.set(p.r * 1.05 * k, 0.7 * k, p.r * 1.05 * k); else b.scale.set(p.r * k, 0.8, p.r * k); cap.scale.set(p.r * 1.05 * k, 0.12, p.r * 1.05 * k); });          // (bumpers breathe a little: they are alive)
  }
  // boost strips (moving chevrons), bounce pads, and the cage round one orb with its button and gate
  const chev = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#12304a'; x.fillRect(0, 0, 128, 64); x.strokeStyle = '#ffe14a'; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round'; for (let i = 0; i < 2; i++) { const ox = 18 + i * 56; x.beginPath(); x.moveTo(ox, 10); x.lineTo(ox + 26, 32); x.lineTo(ox, 54); x.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  for (const o of h.boosts || []) {
    const tx = chev.clone(); tx.needsUpdate = true; tx.repeat.set(o.len / 1.6, 1); disposables.push(tx); const bm = new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.95 }); disposables.push(bm);
    const yawB = Math.atan2(-o.uz, o.ux), BF = { h, cx: o.x, cz: o.z, yaw: yawB }, baseB = hillH(h, o.x, o.z), sg = track(new THREE.PlaneGeometry(o.len, o.wid, Math.min(40, Math.ceil(o.len / 0.3)), Math.min(40, Math.ceil(o.wid / 0.3))).rotateX(-Math.PI / 2)), sp = sg.attributes.position, cB = Math.cos(yawB), sB = Math.sin(yawB);
    for (let i = 0; i < sp.count; i++) { const lx = sp.getX(i), lz = sp.getZ(i); sp.setY(i, hillH(h, o.x + lx * cB + lz * sB, o.z - lx * sB + lz * cB) - baseB + 0.06); }
    const strip = new THREE.Mesh(sg, bm); strip.position.set(o.x, baseB, o.z); strip.rotation.y = yawB; strip.renderOrder = 1; g.add(strip);
    for (const sd of [-1, 1]) { const e = slab(BF, paint('#ffe14a'), o.len + 0.1, 0.03, 0.06, 0, 0.06, sd * (o.wid / 2 + 0.03)); const eg = new THREE.Group(); eg.position.set(o.x, baseB, o.z); eg.rotation.y = yawB; eg.add(e); g.add(eg); }
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
  if (h.chute) {                                          // the secret chute: a clear channel on legs that winds round the outside of the course. Hidden (but for a glint at the mouth) until the button has opened the gate once; then it lights up in a chase, and brightens behind the ball as it rides
    const C = h.chute, P = C.pts, n = P.length, cg = new THREE.Group(); g.add(cg);
    const F = new Float32Array(n * 6), idx = [], col = new Float32Array(n * 6), trail = new Float32Array(n), grow = [];          // `grow`: [geometry, indices per sample] for each part that is drawn only as far as the reveal has come
    for (let i = 0; i < n; i++) { const a = C.left[Math.min(i, n - 2)], b = C.right[Math.min(i, n - 2)], y = C.ly[i] + 0.02; F.set([a[i < n - 1 ? 0 : 2], y, a[i < n - 1 ? 1 : 3], b[i < n - 1 ? 0 : 2], y, b[i < n - 1 ? 1 : 3]], i * 6); if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    const fg = track(new THREE.BufferGeometry()); fg.setAttribute('position', new THREE.BufferAttribute(F, 3)); fg.setAttribute('color', new THREE.BufferAttribute(col, 3)); fg.setIndex(idx); grow.push([fg, 6]);
    const fm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide }); disposables.push(fm); cg.add(new THREE.Mesh(fg, fm));
    const glass = new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false }); disposables.push(glass);
    for (const side of [C.left, C.right]) {                // a clear wall each side, and a steel rail along the top
      const W = new Float32Array(n * 6), wi = []; for (let i = 0; i < n; i++) { const e = side[Math.min(i, n - 2)], x = e[i < n - 1 ? 0 : 2], z = e[i < n - 1 ? 1 : 3]; W.set([x, C.ly[i], z, x, C.ly[i] + 0.55, z], i * 6); if (i < n - 1) wi.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
      const wg = track(new THREE.BufferGeometry()); wg.setAttribute('position', new THREE.BufferAttribute(W, 3)); wg.setIndex(wi); wg.computeVertexNormals(); cg.add(new THREE.Mesh(wg, glass)); grow.push([wg, 6]);
      const rp = []; for (let i = 0; i < n; i += 2) rp.push(new THREE.Vector3(W[i * 6 + 3], W[i * 6 + 4], W[i * 6 + 5])); const tg = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp), Math.min(120, n), 0.05, 5, false)); const rt = new THREE.Mesh(tg, metal('#d7dce4')); rt.castShadow = true; cg.add(rt); grow.push([tg, tg.index.count / (n - 1)]);
    }
    const legs = []; for (let i = 4; i < n - 2; i += 8) { const y = C.ly[i], lg = rbox(metal('#aab2bd'), 0.12, y, 0.12, P[i][0], y / 2, P[i][1], 0.02); lg.visible = false; cg.add(lg); legs.push([i, lg]); }
    const padT = chev.clone(); padT.needsUpdate = true; padT.repeat.set(1.2 / 1.6, 1); disposables.push(padT); const padM = new THREE.MeshBasicMaterial({ map: padT, transparent: true, opacity: 0.95 }); disposables.push(padM); updaters.push((heroT, t) => { padT.offset.x = -t * 0.9; });          // (the same moving chevrons as a boost strip, pointing along the channel)
    for (const i of C.pads) {                               // boost pads in the floor of the channel: a dark plate with three yellow chevrons pointing along it
      const a = P[Math.max(0, i - 1)], b2 = P[Math.min(n - 1, i + 1)], yaw = Math.atan2(-(b2[1] - a[1]), b2[0] - a[0]), pg = new THREE.Group(); pg.position.set(P[i][0], C.ly[i] + 0.03, P[i][1]); pg.rotation.y = yaw; pg.visible = false;
      pg.add(rbox(paint('#2b2b3a'), 1.3, 0.03, C.hw * 1.5, 0, 0, 0, 0.01)); const pl = new THREE.Mesh(track(new THREE.PlaneGeometry(1.2, C.hw * 1.4).rotateX(-Math.PI / 2)), padM); pl.position.y = 0.02; pg.add(pl);
      cg.add(pg); legs.push([i, pg]);
    }
    const M = C.mouth, ring = torus(paint('#7fe9ff'), 0.62, 0.07, M.x, 0.45, M.z, 0, Math.atan2(M.ux, M.uz) + Math.PI / 2, 0); ring.visible = false;
    { // the entrance: an arch of glowing posts over the gap, a soft beam, and a trail of chevrons on the green leading into it (they chase towards the gap, brighter while the gate is open)
      const gy = Math.max(0, hillH(h, M.x, M.z)), ent = new THREE.Group(), glow = new THREE.MeshBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0.9 }), beamM = new THREE.MeshBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }); disposables.push(glow, beamM);
      ent.position.set(M.x, gy, M.z); ent.rotation.y = Math.atan2(-M.uz, M.ux); g.add(ent);
      for (const sd of [-1, 1]) { ent.add(cyl(glow, 0.07, 1.5, 0, 0.75, sd * (M.hw + 0.05))); ent.add(sph(glow, 0.14, 0.14, 0.14, 0, 1.55, sd * (M.hw + 0.05))); }
      ent.add(rbox(glow, 0.1, 0.1, M.hw * 2 + 0.1, 0, 1.45, 0, 0.02));
      const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(M.hw * 0.9, M.hw * 0.9, 2.6, 16, 1, true)), beamM); beam.position.y = 1.3; ent.add(beam);
      const chevs = []; for (let k = 0; k < 4; k++) { const cm = new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.5 }); disposables.push(cm); const cv = cone(cm, 0.34, 0.3, 3, -0.7 - k * 0.7, 0.1, 0); cv.rotation.z = -Math.PI / 2; cv.scale.set(1, 1, 2.2); ent.add(cv); chevs.push(cv); }
      updaters.push((heroT, t, dt, st) => { const open = st && st.gateOpen ? 1 : 0; for (let k = 0; k < 4; k++) chevs[k].material.opacity = (0.28 + 0.5 * Math.max(0, Math.sin(t * 4.5 - k * 0.9))) * (0.7 + 0.3 * open); beamM.opacity = 0.1 + 0.08 * Math.sin(t * 3) + 0.14 * open; glow.opacity = 0.7 + 0.3 * Math.sin(t * 4); });
    }
    g.add(ring);
    const ex = torus(paint('#7fe9ff'), 0.5, 0.06, P[n - 1][0], C.ly[n - 1] + 0.3, P[n - 1][1], 0, Math.atan2(P[n - 1][0] - P[n - 2][0], P[n - 1][1] - P[n - 2][1]) + Math.PI / 2, 0); ex.visible = false; cg.add(ex);
    let front = 0;                                          // how many samples of the channel are showing: it grows just ahead of the ball while the ball is in it, and folds away again once the gate has shut
    updaters.push((heroT, t, dt, st) => {
      const k = st && st.chuteK >= 0 ? st.chuteK : -1, open = st && st.gateOpen;
      if (k >= 0) front = Math.max(front, Math.min(n - 1, k + 7)); else if (!open && front > 0) front = Math.max(0, front - dt * 40);
      const fr = Math.floor(front); cg.visible = fr > 1;
      for (const [gm, per] of grow) gm.setDrawRange(0, Math.max(0, Math.min(Math.floor(fr * per / 3) * 3, gm.index.count)));
      for (const [i, lg] of legs) lg.visible = i < fr; ex.visible = fr >= n - 2; ring.scale.setScalar(1 + 0.08 * Math.sin(t * 4));
      const kk = Math.exp(-dt * 2.2);
      for (let i = 0; i < n; i++) {
        if (k >= 0) { const d = (i - k) / 6, bump = Math.exp(-d * d) * (i >= k - 6 ? 1 : 0.55); if (bump > trail[i]) trail[i] = bump; }
        trail[i] *= kk; const chase = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.35), base = 0.2 + 0.25 * chase, tr = trail[i];
        col[i * 6] = col[i * 6 + 3] = base * 0.45 + tr * 1.0; col[i * 6 + 1] = col[i * 6 + 4] = base * 0.9 + tr * 0.95; col[i * 6 + 2] = col[i * 6 + 5] = base * 1.3 + tr * 0.8;
      }
      fg.attributes.color.needsUpdate = true; ex.scale.setScalar(1 + 0.1 * Math.sin(t * 6));
    });
  }
  for (const o of h.pads || []) {                              // a launch pad or trampoline: a wide bar across the lane (about 70% of it), easy to hit
    const bar = triggerBar(h, o), W2 = bar.half * 2, gp = new THREE.Group(); gp.position.set(o.x, hillH(h, o.x, o.z), o.z); gp.rotation.y = Math.atan2(-bar.uz, bar.ux);
    const PF = { h, cx: o.x, cz: o.z, yaw: Math.atan2(-bar.uz, bar.ux) };
    gp.add(slab(PF, paint('#2b2b3a'), bar.len + 0.2, 0.1, W2 + 0.2, 0, 0.06, 0)); const top = slab(PF, paint(o.tramp ? '#4fc3ff' : '#ff4fb3'), bar.len, 0.07, W2, 0, o.tramp ? 0.2 : 0.13, 0); gp.add(top);
    for (const sd of [-1, 1]) gp.add(slab(PF, paint('#ffe14a'), bar.len + 0.12, 0.05, 0.08, 0, 0.17, sd * (bar.half + 0.02)));
    for (let k = 0; k < 3; k++) { const ch = cone(paint('#ffffff'), 0.2, 0.12, 3, -bar.len / 2 + 0.18 + k * 0.3, o.tramp ? 0.27 : 0.2, 0); ch.rotation.z = -Math.PI / 2; ch.scale.set(1, 1, Math.min(2.2, bar.half * 0.7)); gp.add(ch); }
    if (!isLow()) for (let k = 0; k < Math.round(W2 / 0.6); k++) for (const ex of [-1, 1]) { const bz = -bar.half + 0.3 + k * 0.6, bx = ex * (bar.len / 2 + 0.08), cs = Math.cos(PF.yaw), sn = Math.sin(PF.yaw); gp.add(cyl(metal('#c9ced6'), 0.05, 0.05, bx, 0.12 + hillH(h, o.x + bx * cs + bz * sn, o.z - bx * sn + bz * cs) - hillH(h, o.x, o.z), bz)); }      // high tier: bolt heads along the ends
    g.add(gp);
    updaters.push((heroT, t) => { const k = 1 + 0.06 * Math.sin(t * 5 + o.x); top.scale.y = k; if (o.tramp) top.position.y = 0.2 + 0.05 * Math.sin(t * 6 + o.z); });
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
    const plates = []; for (const bt of buttons.values()) { const { btn, plate } = buttonBar(h, bt); g.add(btn); plates.push(plate); }
    if (gates.length) { let open = 0; updaters.push((heroT, t, dt, st) => { open += ((st && st.gateOpen ? 1 : 0) - open) * Math.min(1, dt * 6); for (const b of gates) b.position.y = 0.45 - 1.0 * open; for (const p of plates) { p.position.y = 0.06 - 0.03 * open; p.material = open > 0.5 ? paint('#6dff9a') : paint('#ffd23f'); } }); }
  }
  if (h.cage) {
    const cg = h.cage, wd = woodTint('#c89358');
    for (const sd of cg.sides) { const dx = sd[2] - sd[0], dz = sd[3] - sd[1], l = Math.hypot(dx, dz); const rail = rbox(wd, l, 0.1, 0.07, 0, 0, 0, 0.02); rail.position.set((sd[0] + sd[2]) / 2, 0.42, (sd[1] + sd[3]) / 2); rail.rotation.y = Math.atan2(-dz, dx); g.add(rail); const rail2 = rail.clone(); rail2.position.y = 0.2; g.add(rail2); g.add(rbox(wd, 0.1, 0.55, 0.1, sd[2], 0.27, sd[3], 0.02)); }
    const gdx = cg.gate[2] - cg.gate[0], gdz = cg.gate[3] - cg.gate[1], gl = Math.hypot(gdx, gdz), gate = new THREE.Group(); gate.position.set((cg.gate[0] + cg.gate[2]) / 2, 0, (cg.gate[1] + cg.gate[3]) / 2); gate.rotation.y = Math.atan2(-gdz, gdx);
    const bar = rbox(metal('#e5483f'), gl, 0.5, 0.1, 0, 0.3, 0, 0.03); gate.add(bar); for (const e of [-1, 1]) gate.add(rbox(metal('#ffffff'), 0.1, 0.6, 0.12, e * gl / 2, 0.3, 0, 0.02)); g.add(gate);
    const { btn, plate } = buttonBar(h, cg.button); g.add(btn);
    let open = 0; updaters.push((heroT, t, dt, st) => { open += ((st && st.gateOpen ? 1 : 0) - open) * Math.min(1, dt * 6); bar.position.y = 0.3 - 0.8 * open; plate.position.y = 0.06 - 0.03 * open; plate.material = open > 0.5 ? paint('#6dff9a') : paint('#ffd23f'); });
  }
  for (const s of h.sands) {                                 // a sand pit: a rough patch of sand with a darker, damp rim and a few pebbles
    const sPoly = softPoly(s.poly), sg = track(pondGeometry(sPoly, 0)), spp = sg.attributes.position; for (let i = 0; i < spp.count; i++) spp.setY(i, hillH(h, spp.getX(i), spp.getZ(i)) + 0.07); sg.computeVertexNormals(); const sm = new THREE.Mesh(sg, GM.lam(GM.tex.sand, TH0.sand, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); sm.receiveShadow = true; g.add(sm);
    const lip = track(pondGeometry(sPoly.map((v, i) => (i % 2 ? s.z : s.x) + (v - (i % 2 ? s.z : s.x)) * 1.12), 0)), lpp = lip.attributes.position; for (let i = 0; i < lpp.count; i++) lpp.setY(i, hillH(h, lpp.getX(i), lpp.getZ(i)) + 0.04); lip.computeVertexNormals(); const lm = new THREE.Mesh(lip, GM.lam(GM.tex.sand, '#c9b27a', { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); lm.receiveShadow = true; g.add(lm);
  }
  for (const pt of h.patches || []) {                          // surface patches: ice (glassy blue), mud, caramel, quicksand (a dark swirl) and conveyor belts (moving chevrons)
    const geo = track(pondGeometry(softPoly(pt.poly), 0)), pp = geo.attributes.position; for (let i = 0; i < pp.count; i++) pp.setY(i, hillH(h, pp.getX(i), pp.getZ(i)) + 0.065);
    let mat;
    if (pt.kind === 'conveyor') {
      const tx = chev.clone(); tx.needsUpdate = true; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; disposables.push(tx); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) * pt.ux + pp.getZ(i) * pt.uz) / 1.6, (-pp.getX(i) * pt.uz + pp.getZ(i) * pt.ux) / 1.6);
      mat = new THREE.MeshBasicMaterial({ map: tx, color: '#9bd4ff', transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); updaters.push((heroT, t) => { tx.offset.x = -t * 0.9; });
    } else {
      const look = { rough: [roughCol(TH0), 1], ice: ['#bfe6ff', 0.8], mud: ['#6b4a2e', 0.95], caramel: ['#d9902f', 0.92], quicksand: ['#b98b4a', 0.95] }[pt.kind] || ['#999999', 0.9];
      const opt = { color: look[0], transparent: true, opacity: look[1], polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, emissive: pt.kind === 'ice' ? '#2a4a6a' : pt.kind === 'caramel' ? '#4a2a08' : '#000000' }, pt2 = GM.patch(pt.kind);
      if (pt2) {                                              // high tier: a painted, normal-mapped, glossy patch (UVs from the ground position)
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 3, pp.getZ(i) / 3);
        mat = new THREE.MeshStandardMaterial({ ...opt, map: pt2.map, normalMap: pt2.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: pt2.rough, roughness: 1, envMapIntensity: pt.kind === 'ice' ? 1 : 0.5 });
      } else mat = new THREE.MeshLambertMaterial(opt);
    }
    disposables.push(mat); const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; m.receiveShadow = true; g.add(m);
  }
  for (const mg of h.magnets || []) {                          // a magnet: a red and white horseshoe on the ground with rings that pulse towards (or away from) it
    const gy = Math.max(0, hillH(h, mg.x, mg.z)), red = metal('#e5483f'), wht = metal('#f2f2f6'), hs = new THREE.Group(); hs.position.set(mg.x, gy, mg.z);
    const arc = new THREE.Mesh(track(new THREE.TorusGeometry(0.62, 0.17, 8, 16, Math.PI)), red); arc.rotation.x = Math.PI / 2; arc.position.y = 0.55; hs.add(arc);
    for (const sd of [-1, 1]) { hs.add(cyl(red, 0.17, 0.55, sd * 0.62, 0.28, 0)); hs.add(cyl(wht, 0.18, 0.14, sd * 0.62, 0.07, 0)); if (!isLow()) for (let k = 0; k < 3; k++) hs.add(torus(metal('#c8803a'), 0.19, 0.035, sd * 0.62, 0.22 + k * 0.1, 0, Math.PI / 2)); } g.add(hs);      // (high tier: copper coils on the legs)
    const pullIn = mg.pull > 0, onCol = new THREE.Color(pullIn ? '#ff6a5f' : '#6aa8ff'), amber = new THREE.Color('#ffc23a'), white = new THREE.Color('#ffffff'), dim = new THREE.Color('#7b7f8a');
    const outFlat = h.outline.flat(), SEG = 48;                  // (the rings and the field are drawn on the real ground: every vertex sits at the terrain's height, and the parts that would lie outside the course (over a wall or the hillside) are not drawn)
    const ringMesh = (opacity, additive) => { const geo = new THREE.BufferGeometry(), pos = new Float32Array(SEG * 4 * 3), idx = []; for (let k = 0; k < SEG; k++) { const b0 = k * 4; idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); } geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); disposables.push(geo);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: onCol, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); disposables.push(m.material); m.frustumCulled = false; m.renderOrder = additive ? 1 : 2; g.add(m); return m; };
    const fillRing = (m, R0, R1) => {                            // a band from radius R0 to R1 round the magnet, following the ground
      const pos = m.geometry.attributes.position.array, pt = (a, r) => { const x = mg.x + Math.cos(a) * r, z = mg.z + Math.sin(a) * r; return [x, Math.max(0, hillH(h, x, z)) + 0.08, z, inPoly(outFlat, x, z)]; };
      let prev = [pt(0, R0), pt(0, R1)];
      for (let k = 0; k < SEG; k++) { const a1 = ((k + 1) / SEG) * 6.2832, cur = [pt(a1, R0), pt(a1, R1)], ok = prev[0][3] && prev[1][3] && cur[0][3] && cur[1][3], o = k * 12, vs = [prev[0], prev[1], cur[0], cur[1]];
        for (let v = 0; v < 4; v++) { const p = ok ? vs[v] : [mg.x, gy, mg.z]; pos[o + v * 3] = p[0]; pos[o + v * 3 + 1] = p[1]; pos[o + v * 3 + 2] = p[2]; } prev = cur; }
      m.geometry.attributes.position.needsUpdate = true;
    };
    const rings = [0, 1, 2].map(() => ringMesh(0.5, false)), fields = [0, 1, 2, 3].map((i) => { const m = ringMesh(0, true); fillRing(m, Math.max(0.02, (mg.r * i) / 4), (mg.r * (i + 1)) / 4); return m; });          // (the field: a disc as four bands, drawn once)
    const lamp = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: dim })); disposables.push(lamp.material); lamp.scale.setScalar(0.17); lamp.position.set(mg.x, gy + 1.05, mg.z); g.add(lamp);        // (the indicator: grey when off, flashing amber just before it switches on, its own colour while on, flashing white just before it switches off)
    updaters.push((heroT) => {
      const { power, warn } = magnetState(mg, heroT), blink = Math.floor(heroT * (warn === 'on' ? 7 : 4)) % 2 === 0, col = lamp.material.color;
      if (warn === 'on') col.copy(blink ? amber : dim); else if (warn === 'off') col.copy(blink ? white : onCol); else col.copy(power > 0 ? onCol : dim);
      lamp.scale.setScalar(0.17 + (power > 0 || warn === 'on' ? 0.05 * Math.sin(heroT * 12) * (warn ? 1 : 0.4) : 0));
      for (const f of fields) { f.material.opacity = 0.16 * power * (warn === 'off' && !blink ? 0.4 : 1); f.material.color.copy(onCol); }
      rings.forEach((m, i) => {
        let k = ((heroT * (0.5 + 0.9 * power) + i / 3) % 1); if (pullIn) k = 1 - k;
        if (power <= 0) { if (m.userData.R !== mg.r) { m.userData.R = mg.r; fillRing(m, mg.r - 0.05, mg.r); } m.material.color.copy(warn === 'on' ? (blink ? amber : dim) : dim); m.material.opacity = warn === 'on' ? (blink ? 0.7 : 0.2) : 0.14; return; }
        { const R = 0.2 + k * mg.r; fillRing(m, R - 0.05 * R, R); m.userData.R = R; } m.material.color.copy(warn === 'off' && !blink ? white : onCol); m.material.opacity = 0.8 * power * Math.sin(k * Math.PI);
      });
    });
  }
  for (const tn of h.tunnels || []) {                          // a tunnel: stone arches and a see-through roof over a straight stretch, every piece standing on the ground under it
    const R = Math.min(2.0, tn.hw - 0.15), yaw = Math.atan2(-tn.uz, tn.ux), stone = stoneTint(TH0.rock, true), at = (lx) => [tn.x + tn.ux * lx, tn.z + tn.uz * lx];
    const nR = Math.max(2, Math.round(tn.len / 1.1)), rib = track(new THREE.TorusGeometry(R, 0.16, 8, 16, Math.PI)), roofMat = new THREE.MeshLambertMaterial({ color: TH0.rock, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }); disposables.push(roofMat);
    const seg = tn.len / (nR - 1), roofGeo = track(new THREE.CylinderGeometry(R, R, seg + 0.05, 16, 1, true));
    for (let i = 0; i < nR; i++) { const [x, z] = at(-tn.len / 2 + seg * i), m = new THREE.Mesh(rib, stone); m.rotation.y = yaw + Math.PI / 2; m.position.set(x, Math.max(0, hillH(h, x, z)) + 0.02, z); m.castShadow = true; g.add(m);
      if (!isLow() && i % 2 === 0) { const ks = rbox(stoneTint('#d3cdbd'), 0.3, 0.3, 0.34, 0, R + 0.1, 0, 0.03); ks.position.set(x, Math.max(0, hillH(h, x, z)) + R + 0.1, z); ks.rotation.y = yaw + Math.PI / 2; g.add(ks); }      // high tier: a keystone at the crown of every other arch
      if (i < nR - 1) { const [rx, rz] = at(-tn.len / 2 + seg * (i + 0.5)), roof = new THREE.Mesh(roofGeo, roofMat); roof.rotation.set(0, yaw, Math.PI / 2); roof.position.set(rx, Math.max(0, hillH(h, rx, rz)), rz); g.add(roof); } }
    for (const sd of [-1, 1]) { const [x, z] = at(sd * (tn.len / 2)), pm = new THREE.Mesh(track(new THREE.BoxGeometry(0.6, 1.0, 0.6)), stone); pm.position.set(x, Math.max(0, hillH(h, x, z)) + 0.5, z); pm.rotation.y = yaw; g.add(pm); }
  }
  for (const gt of h.gates1 || []) {                           // a one-way gate: two posts and a flap of arrows pointing the way
    const gh = (x, z) => Math.max(0, hillH(h, x, z)), px = [gt.x + gt.nx * (gt.hw + 0.1), gt.z + gt.nz * (gt.hw + 0.1)], qx = [gt.x - gt.nx * (gt.hw + 0.1), gt.z - gt.nz * (gt.hw + 0.1)];
    for (const [x, z] of [px, qx]) { g.add(cyl(paint('#3a62c9'), 0.12, 1.1, x, gh(x, z) + 0.55, z)); if (!isLow()) { g.add(sph(new THREE.MeshBasicMaterial({ color: '#9dffc4' }), 0.12, 0.12, 0.12, x, gh(x, z) + 1.16, z)); g.add(torus(metal('#c9ced6'), 0.14, 0.03, x, gh(x, z) + 0.2, z, Math.PI / 2)); } }
    const base = Math.max(gh(gt.x, gt.z), gh(px[0], px[1]), gh(qx[0], qx[1])), gg = new THREE.Group(); gg.position.set(gt.x, base, gt.z); gg.rotation.y = Math.atan2(-gt.uz, gt.ux);
    const fm = new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }); disposables.push(fm); const flap = new THREE.Mesh(track(new THREE.PlaneGeometry(gt.hw * 2, 0.55)), fm); flap.rotation.y = Math.PI / 2; flap.position.y = 0.5; gg.add(flap);
    for (let k = -1; k <= 1; k++) { const ar = new THREE.Mesh(track(new THREE.ConeGeometry(0.2, 0.45, 3, 1, false, Math.PI / 2)), paint('#7dffb0')); ar.rotation.z = -Math.PI / 2; ar.position.set(0.02, 0.08, k * gt.hw * 0.55); gg.add(ar); }
    g.add(gg);
  }
  for (const rl of h.rollers || []) {                          // a tumbleweed: a tangle of brown twigs that rolls across the lane
    const ball = new THREE.Mesh(track(new THREE.IcosahedronGeometry(1, 1)), new THREE.MeshLambertMaterial({ color: '#a8743a', flatShading: true })); disposables.push(ball.material); ball.scale.setScalar(rl.rad * 1.15); g.add(ball);
    if (!isLow()) { const tw = paint('#7a5428'); for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(track(new THREE.TorusGeometry(1.08, 0.05, 5, 18)), tw); r.rotation.set(k * 1.05, k * 0.7, k * 0.4); ball.add(r); } }      // high tier: twigs looping over the tangle
    updaters.push((heroT) => { const ph = rl.w * heroT + rl.ph, off = rl.A * Math.sin(ph), gy = Math.max(0, hillH(h, rl.x, rl.z)); ball.position.set(rl.x + rl.nx * off, gy + rl.rad, rl.z + rl.nz * off); ball.rotation.x = heroT * 3 * Math.sign(Math.cos(ph) || 1); ball.rotation.y = heroT; });
  }
  for (const gw of h.ghosts || []) {                           // a ghost wall: a violet curtain that is solid for part of every period and fades away between
    const len = Math.hypot(gw.bx - gw.ax, gw.bz - gw.az), mat = new THREE.MeshBasicMaterial({ color: '#b98cff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }); disposables.push(mat);
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(len, 1.4)), mat); m.position.set((gw.ax + gw.bx) / 2, Math.max(0, hillH(h, gw.ax, gw.az), hillH(h, gw.bx, gw.bz), hillH(h, (gw.ax + gw.bx) / 2, (gw.az + gw.bz) / 2)) + 0.75, (gw.az + gw.bz) / 2); m.rotation.y = Math.atan2(-(gw.bz - gw.az), gw.bx - gw.ax); g.add(m);
    for (const [x, z] of [[gw.ax, gw.az], [gw.bx, gw.bz]]) g.add(cyl(paint('#4a4258'), 0.12, 1.6, x, Math.max(0, hillH(h, x, z)) + 0.8, z));
    updaters.push((heroT) => { const on = ((heroT + gw.phase) % gw.period) / gw.period < gw.duty; mat.opacity += ((on ? 0.65 : 0.1) - mat.opacity) * 0.15; });
  }
  for (const is of h.islands || []) {                          // a fork island: a lens of boulders with a mound of lawn on top, each piece on the ground under it
    const n = is.poly.length / 2, rm = stoneTint(TH0.rock, true); let top = 0;
    for (let k = 0; k < n; k++) { const x = is.poly[k * 2], z = is.poly[k * 2 + 1], y = Math.max(0, hillH(h, x, z)); top = Math.max(top, y); const m = new THREE.Mesh(getRock(), rm); m.scale.set(0.8, 0.9, 0.8); m.position.set(x, y + 0.35, z); m.rotation.y = k * 1.7; m.castShadow = true; g.add(m); }
    top = Math.max(top, hillH(h, is.x, is.z));
    const mound = new THREE.Mesh(G.cyl, new THREE.MeshLambertMaterial({ color: TH0.fair[1] })); disposables.push(mound.material); const dx = is.poly[0] - is.x, dz = is.poly[1] - is.z; mound.scale.set(1.9, 0.3, 0.85); mound.position.set(is.x, top + 0.12, is.z); mound.rotation.y = -Math.atan2(dz, dx); g.add(mound);
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
    heroRoot, group: g, pickups, cupMesh, flag, bumperParts,
    /** The ball hit the post or bumper at (x, z): its lit copy flares. Returns whether there was one. */
    flashAt(x, z, strength = 5) { const f = hitFlash.get(`${x},${z}`); if (!f) return false; f.k = Math.max(f.k, hitK(strength)); f.o.visible = true; return true; },
    /** The ball hit something of the hero obstacle at (x, y, z) of the hole (the contact point, or the centre of the round thing): the moving piece it touched (a whole sail, a whole hammer) lights up. Returns whether a piece was there. */
    flashHero(x, y, z, strength = 5) {
      if (!heroRoot || ghostOn) return false; heroList();
      g.updateWorldMatrix(true, false); heroRoot.updateWorldMatrix(true, true); g.localToWorld(_hp.set(x, y, z));
      if (hitGroups.length) { for (const grp of hitGroups) grp.traverse((o) => { if (heroMeshes.includes(o)) lightHero(o, hitK(strength)); }); return true; }
      let best = null, bv = 1e9; for (const o of heroMeshes) { if (!o.visible) continue; _hbox.setFromObject(o); _hbox.getSize(_hs); if (Math.max(_hs.x, _hs.y, _hs.z) > 5) continue; _hbox.expandByScalar(BALL_R + 0.2); if (!_hbox.containsPoint(_hp)) continue; const v = _hs.x * _hs.y * _hs.z; if (v < bv) { bv = v; best = o; } }
      if (!best) return false;
      const e = hitK(strength), piece = best.parent && best.parent !== heroRoot && best.parent !== g ? best.parent : best;       // (the piece is the part's whole group: all of a hammer, all of a sail arm)
      piece.traverse((o) => { if (heroMeshes.includes(o)) lightHero(o, e); }); return true;
    },
    /** A gentle glow over the whole hero obstacle (the turntable that carries the ball round). */
    flashHeroAll(strength = 3) { if (!heroRoot || ghostOn) return; heroList(); const e = hitK(strength) * 0.6; for (const o of heroMeshes) lightHero(o, e); },
    /** The ball hit the wall segment (ax, az)-(bx, bz): that stretch of the border (and a little of its neighbours) lights up. Returns whether it is a border wall. */
    flashWall(ax, az, bx, bz, strength = 5) {
      const i = border.segs.findIndex((w) => (w[0] === ax && w[1] === az && w[2] === bx && w[3] === bz)); if (i < 0) return false;
      const k = hitK(strength); for (const [j, m] of [[i, 1], [i - 1, 0.55], [i + 1, 0.55]]) if (j >= 0 && j < border.segs.length) wallFlash.set(j, Math.max(wallFlash.get(j) || 0, k * m)); return true;
    },
    update(heroT, t, dt, st) {
      for (const u of updaters) u(heroT, t, dt, st);
      for (const [o, f] of heroFlash) {                      // the hero parts that were hit: each wears its own copy of its material while it glows, then gets the shared one back
        f.k = Math.max(0, f.k - dt * 3 * (f.k > 1 ? 1.6 : 1));
        if (f.k > 0) { if (o.material === f.clone) f.clone.emissive.copy(_hwarm).multiplyScalar(Math.min(1.4, f.k * 0.55)); else f.k = 0; }
        if (f.k === 0) { if (o.material === f.clone) o.material = f.orig; heroFlash.delete(o); }
      }
      for (const f of hitFlash.values()) if (f.k > 0) { f.k = Math.max(0, f.k - dt * 3.2 * (f.k > 1 ? 1.6 : 1)); f.o.position.copy(f.src.position); f.o.scale.copy(f.src.scale).multiplyScalar(1.08 + 0.05 * Math.min(f.k, 3.2)); f.o.material.opacity = Math.min(1, f.k * f.k * 1.1); if (f.k === 0) f.o.visible = false; }
      if (wallFlash.size) {                                  // the border: lit by brightening those stretches' own instance colours (so the glow is the wall itself), then settling back
        const c = new THREE.Color(); let touched = false;
        for (const [j, k0] of wallFlash) {
          const k = Math.max(0, k0 - dt * 2.6); if (k > 0) wallFlash.set(j, k); else wallFlash.delete(j); touched = true;
          for (const m of border.meshes) { m.userData.base ||= new Map(); let b = m.userData.base.get(j); if (!b) { b = new THREE.Color(); m.getColorAt(j, b); m.userData.base.set(j, b); } c.copy(b).multiplyScalar(1 + 3.2 * k).add(_warm.setRGB(0.7 * k, 0.55 * k, 0.16 * k)); m.setColorAt(j, c); if (k === 0) m.userData.base.delete(j); m.instanceColor.needsUpdate = true; }
        }
        void touched;
      }
    },
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
/** A flat slab (like `rbox`) that follows the ground: its corners are lifted or dropped to the terrain under them, so a bar laid across a hill lies on it instead of floating over it. `F` is the frame it sits in: { h, cx, cz, yaw } (a group at (cx, ground, cz) turned by `yaw`). */
function slab(F, m, sx, sy, sz, x, y, z) {
  const g = new THREE.BoxGeometry(sx, sy, sz, Math.min(40, Math.max(1, Math.ceil(sx / 0.3))), 1, Math.min(40, Math.max(1, Math.ceil(sz / 0.3)))), p = g.attributes.position, c = Math.cos(F.yaw), s2 = Math.sin(F.yaw), base = hillH(F.h, F.cx, F.cz);
  for (let i = 0; i < p.count; i++) { const lx = p.getX(i) + x, lz = p.getZ(i) + z, wx = F.cx + lx * c + lz * s2, wz = F.cz - lx * s2 + lz * c; p.setXYZ(i, lx - x, p.getY(i) + hillH(F.h, wx, wz) - base, lz - z); }
  g.computeVertexNormals(); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.receiveShadow = true; o.castShadow = false; return o;
}
const rbox = (m, sx, sy, sz, x, y, z, b = 0.05) => { const o = new THREE.Mesh(rboxGeo(sx, sy, sz, b), m); o.position.set(x, y, z); return o; };
const paint = (hex) => { let m = paintCache.get(hex); if (!m) { m = isLow() ? new THREE.MeshLambertMaterial({ color: hex }) : new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0, envMapIntensity: 0.45 }); paintCache.set(hex, m); } return m; };           // toy paint: flat on the low tier, softly glossy on the high one
const metal = (hex) => { const k = 'm' + hex; let m = paintCache.get(k); if (!m) { m = GM.lam(GM.tex.metal, hex); paintCache.set(k, m); } return m; };      // painted metal
const woodTint = (hex) => { const k = 'w' + hex; let m = paintCache.get(k); if (!m) { m = GM.lam(GM.tex.wood, hex); paintCache.set(k, m); } return m; };
const stoneTint = (hex, flat) => { const k = 's' + hex + flat; let m = paintCache.get(k); if (!m) { m = GM.lam(GM.tex.stone, hex, flat ? { flatShading: true } : {}); paintCache.set(k, m); } return m; };
let roofG = null; const roofGeo = () => roofG || (roofG = new THREE.ConeGeometry(1, 1.7, 4).translate(0, 0.85, 0).rotateY(Math.PI / 4));
const cone = (m, r, h, seg, x, y, z) => { const o = new THREE.Mesh(coneGeo(r, h, seg), m); o.position.set(x, y, z); return o; };
const coneCache = new Map(); const coneGeo = (r, h, seg) => { const k = `${r}|${h}|${seg}`; let g = coneCache.get(k); if (!g) { g = seg === 3 ? new THREE.ConeGeometry(r, h, seg, 1, false, Math.PI / 2) : new THREE.ConeGeometry(r, h, seg); coneCache.set(k, g); } return g; };
const torus = (m, R, t, x, y, z, rx = 0, ry = 0, rz = 0) => { const k = `t${R}|${t}`; let g = coneCache.get(k); if (!g) { g = new THREE.TorusGeometry(R, t, 6, 20); coneCache.set(k, g); } const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };

/** A gate button: a wide yellow bar across the lane (see `triggerBar`), with a dark frame and white arrows; `plate` is the part that sinks when it is pressed. */
function buttonBar(h, bt) {
  const bar = triggerBar(h, bt), W2 = bar.half * 2, btn = new THREE.Group(), yaw = Math.atan2(-bar.uz, bar.ux), F = { h, cx: bt.x, cz: bt.z, yaw }; btn.position.set(bt.x, hillH(h, bt.x, bt.z), bt.z); btn.rotation.y = yaw;
  const plate = slab(F, paint('#ffd23f'), bar.len, 0.08, W2, 0, 0.06, 0); btn.add(slab(F, paint('#2b2b3a'), bar.len + 0.2, 0.06, W2 + 0.2, 0, 0.04, 0), plate);
  for (let k = 0; k < Math.max(2, Math.round(W2 / 0.8)); k++) btn.add(slab(F, paint('#ffffff'), bar.len * 0.5, 0.02, 0.1, 0, 0.11, -bar.half + 0.3 + k * Math.min(0.8, (W2 - 0.6) / Math.max(1, Math.round(W2 / 0.8) - 1))));
  return { btn, plate };
}

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
    if (!isLow()) for (const s of [-1, 1]) {                                          // high tier: a stone foundation, shutters, a window box and a lantern
      w.add(rbox(stoneTint('#b9b4a8'), H * 2 + 0.3, 0.3, wd + 0.3, 0, 0.1, s * mid, 0.06));
      for (const sd of [-1, 1]) w.add(rbox(red, 0.06, 0.8, 0.22, -H - 0.05, 2.0, s * mid + sd * 0.46, 0.02));
      w.add(rbox(woodTint('#8a5a38'), 0.14, 0.2, 0.7, -H - 0.1, 1.5, s * mid, 0.03));
      for (let k = 0; k < 3; k++) w.add(sph(paint(['#ff6fa3', '#ffd23f', '#ffffff'][k]), 0.09, 0.09, 0.09, -H - 0.12, 1.66, s * mid + (k - 1) * 0.22));
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
    rotor.userData.hitGroup = true;                      // (the sails: what lights up when the ball is stopped at the opening)
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
    if (!isLow()) for (const s of [-1, 1]) {                                          // high tier: nostrils, a row of scale bumps and claws on the front
      w.add(sph(paint('#2f6b2a'), 0.07, 0.05, 0.09, -H - 0.02, 1.62, s * 0.35));
      for (let k = 0; k < 6; k++) w.add(sph(green2, 0.17, 0.1, 0.17, -H + 1.2 + k * 0.45, 1.5, s * (lat0 + 0.4 + (k % 2) * 0.35)));
      for (let k = 0; k < 3; k++) { const cw = cone(toothM, 0.05, 0.2, 4, -H - 0.1, 0.12, s * (lat0 + 0.4 + k * 0.28)); cw.rotation.z = Math.PI / 2; w.add(cw); }
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
    if (!isLow()) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; disc.add(cyl(metal('#c9ced6'), 0.07, 0.06, Math.cos(a) * R * 0.9, 0.2, Math.sin(a) * R * 0.9)); }      // high tier: bolt heads round the rim
    disc.add(cyl(metal('#9aa3ad'), 0.22, 0.3, 0, 0.3, 0)); disc.add(sph(paint('#ffd44a'), 0.12, 0.12, 0.12, 0, 0.5, 0)); w.add(disc);
    const rim = torus(stoneTint('#a9a396', true), R + 0.05, 0.13, 0, 0.17, 0, Math.PI / 2); rim.castShadow = true; w.add(rim);
    updaters.push((heroT) => { disc.rotation.y = -hr.omega * heroT; });
  } else if (hr.type === 'pendulum') {                     // a blue painted gantry with hammers on yellow chains
    const blue = metal('#3c6fd8'), yel = paint('#ffd23f'), padM = paint('#3a62c9');
    hr.hammers.forEach((m) => {
      w.add(rbox(blue, 0.3, 0.3, (hw + 0.5) * 2, m.du, 3.5, 0, 0.06));                                   // an arch over each hammer: a bar across the lane on two legs, the chain hangs from a ring on the bar
      for (const sd of [-1, 1]) { w.add(rbox(blue, 0.3, 3.6, 0.3, m.du, 1.75, sd * (hw + 0.45), 0.06)); w.add(rbox(blue, 0.9, 0.16, 0.55, m.du, 0.1, sd * (hw + 0.45), 0.04)); }
      if (!isLow()) for (const sd of [-1, 1]) { const br = rbox(blue, 0.18, 1.1, 0.12, m.du, 3.0, sd * (hw + 0.2), 0.03); br.rotation.x = sd * 0.8; w.add(br); w.add(cyl(metal('#c9ced6'), 0.09, 0.08, m.du, 3.5, sd * (hw + 0.45))); }       // high tier: corner braces and bolt heads
      const ring = torus(yel, 0.13, 0.05, 0, 0, 0, 0, Math.PI / 2), trolley = rbox(blue, 0.34, 0.2, 0.5, 0, 0, 0, 0.03); w.add(ring, trolley);        // (the chain hangs from a trolley that runs along the bar, so the whole hammer slides across the lane)
      const head = new THREE.Group(), body = cyl(padM, hr.rad, 0.9, 0, 0, 0); head.add(body); head.add(cyl(yel, hr.rad * 1.02, 0.14, 0, 0.18, 0)); head.add(cyl(yel, hr.rad * 1.02, 0.14, 0, -0.2, 0)); head.add(torus(blue, 0.12, 0.05, 0, 0.5, 0, Math.PI / 2)); w.add(head);
      const links = []; for (let i = 0; i < 9; i++) { const lk = torus(yel, 0.11, 0.035, 0, 0, 0); lk.scale.set(1, 1.5, 1); w.add(lk); links.push(lk); }
      updaters.push((heroT) => {
        const ph = hr.w * heroT + m.ph, off = hr.A * Math.sin(ph), sw = 0.2 * Math.sin(ph) + 0.05 * Math.sin(ph * 2.7 + 1), topY = 3.3, hx = m.du, hy = 1.12;      // (the trolley slides with the hammer; the hammer lags a little behind it and swings under it)
        ring.position.set(hx, topY + 0.02, off); trolley.position.set(hx, topY + 0.2, off); head.position.set(m.du, 0.6, off + sw); head.rotation.x = -Math.atan2(sw, topY - hy) * 0.8;
        links.forEach((lk, i) => { const u = (i + 0.5) / links.length; lk.position.set(hx, topY + (hy - topY) * u, off + sw * u); lk.rotation.set(-Math.atan2(sw, topY - hy), i % 2 ? Math.PI / 2 : 0, 0); });
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
    if (!isLow()) {                                         // high tier: a muzzle flare, a lit fuse and a pyramid of cannonballs
      barrel.add(torus(iron, 0.46, 0.09, 1.78, 0, 0, 0, Math.PI / 2)); barrel.add(torus(brass, 0.41, 0.05, 0.9, 0, 0, 0, Math.PI / 2));
      barrel.add(sph(new THREE.MeshBasicMaterial({ color: '#ff9a2a' }), 0.05, 0.05, 0.05, -0.62, 0.46, 0));
      for (const [bx, bz, by] of [[-0.9, 0.55, 0.12], [-0.9, 0.85, 0.12], [-0.9, 0.7, 0.3]]) w.add(sph(iron, 0.12, 0.12, 0.12, bx, by, bz));
    }
    updaters.push((heroT) => { barrel.rotation.y = -hr.wobble * Math.sin(heroT * 1.3); });
  } else if (hr.type === 'teleport') {                     // a warp zone: two swirling portals either side of a rockery
    const swirl = (c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.translate(64, 64); const gr = x.createRadialGradient(0, 0, 0, 0, 0, 62); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 62, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 6; x.lineCap = 'round'; for (let k = 0; k < 4; k++) { x.beginPath(); for (let t = 0; t < 1; t += 0.04) { const a = k * 1.5708 + t * 4.2, r = 6 + t * 50; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.stroke(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; (ctx.disposables || []).push(t); return t; };
    for (const [p, c] of [[hr.a, '#ff9a2a'], [hr.b, '#4fe3ff']]) {
      const gp = new THREE.Group(); gp.position.set(p.x - hr.x, 0, p.z - hr.z); gp.add(cyl(stoneTint('#6c7480'), 0.8, 0.14, 0, 0.07, 0));
      const dm = new THREE.MeshBasicMaterial({ map: swirl(c), transparent: true, depthWrite: false }); (ctx.disposables || []).push(dm); const disc = new THREE.Mesh(G.disc, dm); disc.scale.set(0.68, 1, 0.68); disc.position.y = 0.17; gp.add(disc);
      gp.add(torus(new THREE.MeshBasicMaterial({ color: c }), 0.7, 0.07, 0, 0.17, 0, Math.PI / 2));
      if (!isLow()) for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.2832; gp.add(rbox(stoneTint('#8a93a0'), 0.16, 0.22, 0.16, Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95, 0.02)); }      // high tier: standing stones round the portal
      const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.62, 0.62, 1.7, 20, 1, true)), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); (ctx.disposables || []).push(beam.material); beam.position.y = 0.95; gp.add(beam);
      updaters.push((heroT) => { disc.rotation.y = heroT * (c === '#ff9a2a' ? 2.4 : -2.4); beam.material.opacity = 0.16 + 0.08 * Math.sin(heroT * 4); }); w.add(gp);
    }
    w.rotation.y = 0; const rk = hr.rock, yaw = Math.atan2(-hr.uz, hr.ux), cl = new THREE.Group(); cl.position.set(rk.x - hr.x, 0, rk.z - hr.z); cl.rotation.y = yaw; w.add(cl);
    const rg = mulberry32(21), spots = [[0, 0, 1.0, 1.0, 1], [0.55, 0.45, 0.65, 0.6, 0.8], [-0.55, -0.4, 0.7, 0.65, 0.9], [0.5, -0.5, 0.55, 0.5, 0.7], [-0.5, 0.5, 0.55, 0.55, 0.7], [0.0, 0.05, 0.6, 0.6, 1.5]];
    spots.forEach(([x, z, sx, sz, hh], i) => { const rm = new THREE.Mesh(getRock(), stoneTint(ROCKS[i % ROCKS.length], true)); rm.scale.set(rk.half * sx * 1.5, 1.1 * hh, rk.side * sz * 1.5); rm.position.set(x * rk.half, 0.5 * hh, z * rk.side); rm.rotation.y = rg() * 6; rm.castShadow = true; cl.add(rm); });
    for (let k = 0; k < 3; k++) cl.add(cone(paint('#5fb455'), 0.1, 0.5, 4, (rg() - 0.5) * rk.half, 1.5, (rg() - 0.5) * rk.side));
  } else if (hr.type === 'slider') {                       // sliding walls: a steel track across the lane with red and white blocks that run along it
    for (const m of hr.paddles) {
      w.add(rbox(metal('#6c7480'), 0.28, 0.08, (hw + 0.25) * 2, m.du, 0.04, 0, 0.02));
      for (const sd of [-1, 1]) w.add(rbox(metal('#3c6fd8'), 0.4, 0.9, 0.4, m.du, 0.45, sd * (hw + 0.4), 0.06));
      const blk = new THREE.Group(); blk.add(rbox(paint('#e5483f'), 0.6, 0.85, 1.8, 0, 0, 0, 0.1)); blk.add(rbox(paint('#ffffff'), 0.62, 0.2, 1.82, 0, 0.18, 0, 0.04)); blk.add(rbox(paint('#ffffff'), 0.62, 0.2, 1.82, 0, -0.18, 0, 0.04)); blk.children.forEach((c) => { c.castShadow = true; }); w.add(blk);
      if (!isLow()) {                                       // high tier: yellow hazard stripes on the block ends and a rivet row on the posts
        for (const sd of [-1, 1]) blk.add(rbox(paint('#ffd23f'), 0.64, 0.5, 0.16, 0, 0, sd * 0.82, 0.01));
        for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) w.add(sph(metal('#c9ced6'), 0.05, 0.05, 0.05, m.du + 0.2, 0.2 + k * 0.25, sd * (hw + 0.4)));
      }
      updaters.push((heroT) => { blk.position.set(m.du, 0.45, hr.A * Math.sin(hr.w * heroT + m.ph)); });
    }
  } else if (hr.type === 'bridge') {                       // a moat under a wooden arched bridge with rails
    const smt = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)), yAt = (a) => 0.42 * smt((a + 3) / 1.1) * smt((3 - a) / 1.1), wood = GM.lam(GM.tex.wood, '#c89358'), dark = GM.lam(GM.tex.wood, '#8a5a38');
    const pg = track(pondGeometry([-1.7, hw + 0.3, 1.7, hw + 0.3, 1.7, -(hw + 0.3), -1.7, -(hw + 0.3)], 0.09)), wm = waterMaterial(ctx.look, 0, 0, 0, 0); (ctx.disposables || []).push(wm); const pool = new THREE.Mesh(pg, wm); pool.renderOrder = 2; w.add(pool);
    for (let k = 0; k < 15; k++) {
      const a0 = -3 + k * 0.4, a1 = a0 + 0.4, y0 = yAt(a0), y1 = yAt(a1), pl = rbox(wood, 0.44, 0.09, 1.8, (a0 + a1) / 2, (y0 + y1) / 2 + 0.07, 0, 0.02); pl.rotation.z = Math.atan2(y1 - y0, 0.4); pl.receiveShadow = true; w.add(pl);
      if (!isLow() && k % 7 === 0) for (const sd of [-1, 1]) w.add(sph(new THREE.MeshBasicMaterial({ color: '#ffe9a8' }), 0.1, 0.12, 0.1, a0, yAt(a0) + 0.68, sd * 0.9));      // high tier: a glowing lantern on the end posts
      if (a0 > -1.75 && a1 < 1.75) for (const sd of [-1, 1]) { const rl = rbox(dark, 0.44, 0.1, 0.1, (a0 + a1) / 2, (y0 + y1) / 2 + 0.5, sd * 0.9, 0.02); rl.rotation.z = Math.atan2(y1 - y0, 0.4); w.add(rl); if (k % 2 === 0) w.add(rbox(dark, 0.12, 0.5, 0.12, a0, y0 + 0.3, sd * 0.9, 0.02)); }
    }
  } else if (hr.type === 'drawbridge') {                   // a little castle gate: a moat, round towers and a wooden bridge that lifts
    const H = hr.half, W = hw + 0.3, wr = new THREE.BufferGeometry(), pos = [], dep = [], idx = [], XS = [[-1, 0], [-0.6, 0.7], [0, 1], [0.6, 0.7], [1, 0]], ZS = [-1, 0, 1];
    for (const [xx, dd] of XS) for (const zz of ZS) { pos.push(xx * H, 0.1, zz * W); dep.push(zz === 0 ? dd : dd * 0.8); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 1, c = a + 3, d = c + 1; idx.push(a, c, b, b, c, d); }
    wr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wr.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); wr.setIndex(idx); track(wr);
    const wm = waterMaterial(ctx.look, 0, 0, 0); ctx.disposables?.push(wm); const moat = new THREE.Mesh(wr, wm); moat.renderOrder = 2; w.add(moat);
    const stone = stoneTint('#b9b4a8'), roofM = paint('#d24a45');
    for (const e of [-1, 1]) w.add(rbox(stone, 0.5, 0.05, W * 2, e * (H + 0.35), 0.03, 0, 0.01));        // (flat paving at each end of the moat: nothing stands in the lane)
    for (const s of [-1, 1]) for (const e of [-1, 1]) { const tx = e * (H + 0.2), tz = s * (hw + 0.95); w.add(cyl(stone, 0.55, 2.3, tx, 1.15, tz)); w.add(cone(roofM, 0.75, 0.9, 8, tx, 2.75, tz)); w.add(rbox(paint('#2a2a33'), 0.1, 0.4, 0.2, tx, 1.5, tz - s * 0.5, 0.02)); w.add(cone(paint('#ffd23f'), 0.05, 0.3, 4, tx, 3.35, tz)); }
    if (!isLow()) for (const s of [-1, 1]) for (const e of [-1, 1]) {                    // high tier: battlement teeth and a banner on each tower
      const tx = e * (H + 0.2), tz = s * (hw + 0.95); for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.2832; w.add(rbox(stone, 0.2, 0.22, 0.2, tx + Math.cos(a) * 0.5, 2.4, tz + Math.sin(a) * 0.5, 0.02)); }
      w.add(rbox(paint(e > 0 ? '#e5483f' : '#3c6fd8'), 0.04, 0.5, 0.3, tx, 3.2, tz + 0.18, 0.01));
    }
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
    if (!isLow()) for (let k = 0; k < 3; k++) { const ch = cone(paint('#ffd23f'), 0.2, 0.14, 3, -hr.L / 2 - 1.3 + k * 0.45, 0.24 + k * 0.09, 0); ch.rotation.z = -Math.PI / 2; ch.scale.set(1, 1, 1); w.add(ch); }      // high tier: arrows on the ramp
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
