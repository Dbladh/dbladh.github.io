// What the mini-golf looks like: one hole's meshes (fairway, rails, cup and flag, water, the hero obstacle, power-up orbs) and the hamster ball. All of it is built from a
// handful of shared materials and boxes, in one group per hole that is thrown away when the hole is done. Coordinates are the hole's own (the same as golfphys.js).
import * as THREE from 'three';
import { BALL_R, CUP_R, hillH, hillGrad } from './golfphys.js?v=20261024160654';
import { gateBlocked, bridgeUp, mulberry32 } from './golfhero.js?v=20261024160654';
import { golfMaterials, boxGeo } from './golfmat.js?v=20261024160654';

const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
export const M = {
  grass: new THREE.MeshLambertMaterial({ vertexColors: true }), rail: mat('#c88b55'), post: mat('#e8594b'), bumper: mat('#ff9a3c'), white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  cup: new THREE.MeshBasicMaterial({ color: '#17171c' }), pole: mat('#f4f1e8'), flag: new THREE.MeshBasicMaterial({ color: '#ef5b4d', side: THREE.DoubleSide }),
  body: mat('#f1e8cf'), roof: mat('#d9534f'), sail: mat('#fffaf0'), stone: mat('#9b968c'), stone2: mat('#b9b4a8'), green: mat('#58a955'), green2: mat('#6dbf63'), dark: mat('#3a3340'), wood: mat('#a8754a'),
  metal: mat('#6c7480'), sand: new THREE.MeshLambertMaterial({ color: '#e8d49a' }), tooth: mat('#fffdf4'), red: mat('#e04a4a'),
  ball: mat('#ffffff'), shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }),
  dot: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }),
  bubble: new THREE.MeshBasicMaterial({ color: '#cfeaff', transparent: true, opacity: 0.28, depthWrite: false }),
  ghost: new THREE.MeshBasicMaterial({ color: '#d9ccff', transparent: true, opacity: 0.45 }),
};
export const G = { box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(BALL_R, 16, 12), dot: new THREE.SphereGeometry(0.1, 8, 6), sph: new THREE.SphereGeometry(1, 14, 10), cyl: new THREE.CylinderGeometry(1, 1, 1, 18), disc: new THREE.CircleGeometry(1, 28) };
G.disc.rotateX(-Math.PI / 2);

const COLOURS = { homing: '#ff5a5a', ghost: '#bda7ff', multi: '#5cc8ff', hamster: '#ffb45a', mega: '#4cd964', turbo: '#ff8a3d', bounce: '#ff63c0', freeze: '#8fe3ff', safety: '#ffd84a' };
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
const BRICKS = ['#d3694a', '#bd5a3e', '#dc7d58', '#ad5039', '#c96348', '#c9a58a'], ROCKS = ['#a39d92', '#b8b1a3', '#8c8780', '#b0a698', '#c4bba8', '#968d7f'];
const WOODS = ['#ffffff', '#f0dcc0', '#e0c49c', '#ffe9cc'];
/** The low wall round the edge of the hole: bricks, boulders or planks (by the hole's seed), in instanced meshes. */
function buildBorder(h, g, disposables) {
  const style = ['brick', 'stone', 'wood'][(h.seed >>> 4) % 3], r = mulberry32(h.seed ^ 0x5bd1e995), O = h.outline, segs = h.walls.filter((w) => w[4]);
  let area = 0; for (let i = 0; i < O.length; i++) { const a = O[i], b = O[(i + 1) % O.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1, col = new THREE.Color();
  const make = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = m.receiveShadow = true; g.add(m); disposables.push(m); return m; };
  const place = (mesh, i, w, off, y, lenK, hgt, thick, shift, palette, tilt = 0) => {
    const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.sqrt(dx * dx + dz * dz) || 1, hy = hillH(h, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2), ox = (sgn * dz) / l, oz = (-sgn * dx) / l, ux = dx / l, uz = dz / l;
    _q.setFromAxisAngle(UP, Math.atan2(-dz, dx)); if (tilt) { _q2.setFromAxisAngle(_vx, tilt); _q.multiply(_q2); }
    _m.compose(_v.set((w[0] + w[2]) / 2 + ox * (thick / 2 + off) + ux * shift, y + hy, (w[1] + w[3]) / 2 + oz * (thick / 2 + off) + uz * shift), _q, _s.set(l * lenK + 0.07, hgt, thick));
    mesh.setMatrixAt(i, _m); col.set(palette[(r() * palette.length) | 0]); col.offsetHSL(0, 0, (r() - 0.5) * 0.05); mesh.setColorAt(i, col);
  };
  if (style === 'brick') {
    const c0 = make(G.box, GM.brick, segs.length), c1 = make(G.box, GM.brick, segs.length), cap = make(G.box, GM.stone, segs.length);
    segs.forEach((w, i) => { place(c0, i, w, 0, 0.15, 1, 0.3, 0.4, 0, BRICKS); place(c1, i, w, 0, 0.45, 1, 0.3, 0.4, 0.3, BRICKS); place(cap, i, w, -0.03, 0.65, 1, 0.1, 0.5, 0, ['#e8dcc6', '#ddd0b8']); });
    for (const m of [c0, c1, cap]) m.instanceMatrix.needsUpdate = m.instanceColor.needsUpdate = true;
  } else if (style === 'stone') {
    if (!rockGeo) { rockGeo = new THREE.IcosahedronGeometry(0.5, 1); const p = rockGeo.attributes.position, rr = mulberry32(99), seen = new Map(); for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)}|${p.getY(i).toFixed(3)}|${p.getZ(i).toFixed(3)}`; let f = seen.get(k); if (!f) { f = 0.82 + rr() * 0.36; seen.set(k, f); } p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); } rockGeo.computeVertexNormals(); }
    const mat = GM.lam(GM.tex.stone, '#ffffff', { flatShading: true }); disposables.push(mat);
    const rocks = make(rockGeo, mat, segs.length), top = make(rockGeo, mat, segs.length);
    segs.forEach((w, i) => { const hgt = 0.55 + r() * 0.3; place(rocks, i, w, 0.05, hgt * 0.4, 1.7, hgt, 0.7 + r() * 0.2, (r() - 0.5) * 0.3, ROCKS, (r() - 0.5) * 0.3); place(top, i, w, 0.15, 0.62 + r() * 0.12, 1.1, 0.4 + r() * 0.2, 0.55, (r() - 0.5) * 0.5, ROCKS, (r() - 0.5) * 0.4); });
    for (const m of [rocks, top]) m.instanceMatrix.needsUpdate = m.instanceColor.needsUpdate = true;
  } else {
    const p0 = make(G.box, GM.wood, segs.length), p1 = make(G.box, GM.wood, segs.length), posts = make(G.box, GM.darkwood, Math.ceil(segs.length / 5));
    segs.forEach((w, i) => { place(p0, i, w, 0, 0.15, 1, 0.3, 0.32, 0, WOODS); place(p1, i, w, 0, 0.47, 1, 0.3, 0.32, 0, WOODS); });
    let n = 0; segs.forEach((w, i) => { if (i % 5 === 0 && n < posts.count) { _m.compose(_v.set(w[0] + ((sgn * (w[3] - w[1])) / (Math.hypot(w[2] - w[0], w[3] - w[1]) || 1)) * 0.18, 0.4, w[1] + ((-sgn * (w[2] - w[0])) / (Math.hypot(w[2] - w[0], w[3] - w[1]) || 1)) * 0.18), _q.identity(), _s.set(0.28, 0.85, 0.28)); posts.setMatrixAt(n, _m); posts.setColorAt(n++, col.set('#ffffff')); } });
    posts.count = n;
    for (const m of [p0, p1, posts]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
function signTexture(n, par) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#6b4a2c'; x.fillRect(0, 0, 256, 160); x.fillStyle = '#f4e6c3'; x.fillRect(8, 8, 240, 144);
  x.fillStyle = '#3b2a1a'; x.textAlign = 'center'; x.font = '700 64px "Outfit", system-ui, sans-serif'; x.fillText(`${n}`, 128, 78); x.font = '600 30px "Outfit", system-ui, sans-serif'; x.fillText(`PAR ${par}`, 128, 124);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const _q2 = new THREE.Quaternion(), _vx = new THREE.Vector3(1, 0, 0);

/** The meshes for hole `h`. Returns { group, update(heroT, t, dt, state), pickups, cupMesh, flag, dispose() }. */
export function buildHoleVisual(h, { lowEnd = false } = {}) {
  skin(lowEnd);
  const g = new THREE.Group(), disposables = [], updaters = [];
  const track = (geo) => { disposables.push(geo); return geo; };
  // the fairway: a ribbon of green along the corridor and round the tee and cup greens, in mown stripes, raised by the hills
  const pos = [], uvs = [], col = [], idx = [], c1 = new THREE.Color('#78e075'), c2 = new THREE.Color('#68d06b'), COLS = 16, R = h.ribbon, crest = new THREE.Color('#b6f58a'), shade = new THREE.Color('#3f9a55'), tmp = new THREE.Color();
  for (let i = 0; i < R.length; i++) {
    const row = R[i], stripe = (row[4] < 0 ? i < R.length / 2 ? -1 : 1e3 : Math.floor(row[4] / 1.5)) & 1;
    for (let c = 0; c <= COLS; c++) {
      const u = c / COLS, x = row[0] + (row[2] - row[0]) * u, z = row[1] + (row[3] - row[1]) * u;
      const hh = hillH(h, x, z), gr = hillGrad(h, x, z), sl = Math.min(1, Math.sqrt(gr.x * gr.x + gr.z * gr.z) * 1.7);      // hills read by shading: crests go lighter and warmer, the slopes darker and greener
      pos.push(x, hh + 0.03, z); uvs.push(x * 0.4, z * 0.4); const lit = Math.max(0, Math.min(1, 0.5 - (gr.x * 0.7 - gr.z * 0.7) * 1.6)), band = hh > 0.04 ? 0.5 + 0.5 * Math.cos(hh * 20.9) : 1;      // sunlit and shaded sides, plus faint contour bands every 0.3
      tmp.copy(stripe ? c1 : c2).lerp(crest, Math.min(1, hh / 0.9) * 0.7).lerp(shade, sl * 0.8).multiplyScalar(0.72 + 0.5 * lit - 0.07 * band);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    if (i > 0) for (let c = 0; c < COLS; c++) { const b0 = (i - 1) * (COLS + 1) + c, a0 = b0 + 1, d0 = b0 + COLS + 1, e0 = d0 + 1; idx.push(b0, d0, a0, a0, d0, e0); }
  }
  const fg = track(new THREE.BufferGeometry()); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); fg.setIndex(idx); fg.computeVertexNormals();
  const fair = new THREE.Mesh(fg, M.grass); fair.receiveShadow = true; g.add(fair);
  // the border: bricks, boulders or planks all the way round
  buildBorder(h, g, disposables);
  // the tee sign, on a post beside the round green at the start
  { const t0 = h.path[0], t1 = h.path[Math.min(4, h.path.length - 1)], l = Math.hypot(t1.x - t0.x, t1.z - t0.z) || 1, tx = (t1.x - t0.x) / l, tz = (t1.z - t0.z) / l;
    const sg = new THREE.Group(); sg.position.set(t0.x - tz * 0 + -tz * 3.9 - tx * 0.4, 0, t0.z + tx * 3.9 - tz * 0.4);
    const post = box(M.wood, 0.14, 1.5, 0.14, 0, 0.75, 0), tex = signTexture(h.index + 1, h.par); disposables.push(tex);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 0.08), [mat('#6b4a2c'), mat('#6b4a2c'), mat('#6b4a2c'), mat('#6b4a2c'), new THREE.MeshLambertMaterial({ map: tex }), mat('#6b4a2c')]); board.position.y = 1.35;
    disposables.push(board.geometry); sg.add(post, board); sg.rotation.y = Math.atan2(-tx, -tz) + Math.PI; sg.rotation.y = Math.atan2(-tx, -tz); g.add(sg); }
  // tee, cup and flag
  const tee = new THREE.Mesh(G.disc, M.white); tee.scale.set(0.55, 1, 0.55); tee.position.set(h.ball.x, 0.06, h.ball.z); g.add(tee);
  const cupMesh = new THREE.Mesh(G.disc, M.cup); cupMesh.position.set(h.cup.x, 0.07, h.cup.z); cupMesh.scale.set(CUP_R * 0.92, 1, CUP_R * 0.92); g.add(cupMesh);
  const flag = new THREE.Group(); flag.position.set(h.cup.x, 0, h.cup.z);
  flag.add(cyl(M.pole, 0.04, 2.4, 0, 1.2, 0)); const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), M.flag); disposables.push(fl.geometry); fl.position.set(0.48, 2.1, 0); flag.add(fl); g.add(flag);
  // posts, bumpers, sand
  for (const p of h.posts) g.add(cyl(M.post, p.r, 1.0, p.x, 0.45, p.z));
  for (const p of h.bumpers) { const b = cyl(M.bumper, p.r, 0.8, p.x, 0.4, p.z); g.add(b); g.add(cyl(M.white, p.r * 1.05, 0.12, p.x, 0.62, p.z)); }
  for (const s of h.sands) { const d = new THREE.Mesh(G.disc, M.sand); d.scale.set(s.r, 1, s.r); d.position.set(s.x, 0.075, s.z); g.add(d); }
  // water: rivers (a scrolling strip) and ponds
  const wt = water().clone(); wt.needsUpdate = true; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; disposables.push(wt);
  const wmat = new THREE.MeshBasicMaterial({ map: wt, transparent: true, opacity: 0.92 }); disposables.push(wmat);
  for (const r of h.rivers) {
    const dx = r.b.x - r.a.x, dz = r.b.z - r.a.z, len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, hw = r.hw;
    const rg = track(new THREE.BufferGeometry());
    rg.setAttribute('position', new THREE.Float32BufferAttribute([r.a.x + nx * hw, 0.09, r.a.z + nz * hw, r.a.x - nx * hw, 0.09, r.a.z - nz * hw, r.b.x + nx * hw, 0.09, r.b.z + nz * hw, r.b.x - nx * hw, 0.09, r.b.z - nz * hw], 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, len / 2, 0, len / 2, 1], 2)); rg.setIndex([0, 1, 2, 1, 3, 2]); rg.computeVertexNormals();
    g.add(new THREE.Mesh(rg, wmat));
    updaters.push((heroT, t, dt) => { wt.offset.x -= dt * 0.7; });
  }
  for (const p of h.ponds) {
    const d = new THREE.Mesh(G.disc, wmat); d.scale.set(p.r, 1, p.r); d.position.set(p.x, 0.09, p.z); g.add(d);
    const ring = new THREE.Mesh(track(new THREE.RingGeometry(p.r, p.r + 0.2, 28)), M.stone); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.1, p.z); g.add(ring);
  }
  // the hero
  if (h.hero) { const hv = heroVisual(h.hero, track, updaters); if (hv) g.add(hv); }
  // power-up orbs
  const pickups = [];
  for (const p of h.pickups) {
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
  return {
    group: g, pickups, cupMesh, flag,
    update(heroT, t, dt, st) { for (const u of updaters) u(heroT, t, dt, st); },
    dispose() { for (const d of disposables) d.dispose?.(); g.traverse((o) => { if (o.material && o.material !== M.rail && o.material.map === undefined) { /* shared materials are kept */ } }); },
  };
}

// ---------- the nine heroes ----------
function heroVisual(hr, track, updaters) {
  const w = new THREE.Group(); w.position.set(hr.x, 0, hr.z); w.rotation.y = Math.atan2(-hr.uz, hr.ux);       // local x runs along the leg, local z across it
  const hw = hr.hw;
  if (hr.type === 'windmill') {
    const lat0 = hr.gap, lat1 = hw + 0.3;
    for (const s of [-1, 1]) w.add(box(M.body, hr.half * 2, 3.6, lat1 - lat0, 0, 0.7, s * (lat0 + lat1) / 2));
    w.add(box(M.body, hr.half * 2, 1.2, lat0 * 2, 0, 1.9, 0));
    const roof = new THREE.Mesh(track(new THREE.ConeGeometry(2.7, 1.5, 4)), M.roof); roof.position.y = 3.65; roof.rotation.y = Math.PI / 4; w.add(roof);
    const rotor = new THREE.Group(); rotor.position.set(-(hr.half + 0.12), 1.7, 0); w.add(rotor);
    for (let k = 0; k < 4; k++) { const pv = new THREE.Group(); pv.rotation.x = (k * Math.PI) / 2; pv.add(box(M.sail, 0.1, 1.65, 0.3, 0, -0.82, 0)); pv.add(box(M.roof, 0.12, 0.25, 0.34, 0, -1.6, 0)); rotor.add(pv); }
    rotor.add(box(M.roof, 0.3, 0.3, 0.3, 0, 0, 0));
    updaters.push((heroT) => { rotor.rotation.x = heroT * hr.w + hr.phase; });
  } else if (hr.type === 'alligator') {
    const lat0 = hr.gap, lat1 = hw + 0.3;
    for (const s of [-1, 1]) { w.add(box(M.green, hr.half * 2, 1.9, lat1 - lat0, 0, 0.55, s * (lat0 + lat1) / 2)); w.add(box(M.green2, hr.half * 1.6, 0.35, lat1 - lat0 - 0.3, 0.1, 1.6, s * (lat0 + lat1) / 2)); w.add(sph(M.white, 0.28, 0.28, 0.28, -hr.half + 0.5, 1.95, s * (lat0 + 0.55))); w.add(sph(M.dark, 0.14, 0.14, 0.14, -hr.half + 0.28, 1.97, s * (lat0 + 0.55))); }
    w.add(box(M.green2, hr.half * 2, 0.7, lat0 * 2, 0, 1.55, 0));                                    // the upper jaw, over the opening
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) w.add(box(M.tooth, 0.16, 0.26, 0.14, -hr.half + 0.25, 1.1, s * (0.25 + k * 0.2)));
    const lower = box(M.green2, 0.7, 0.8, lat0 * 2, -hr.half + 0.35, 0.4, 0); w.add(lower);          // the lower jaw: swings up to shut the mouth
    let c = 0;
    updaters.push((heroT, t, dt) => { const target = gateBlocked(hr, heroT) ? 1 : 0; c += (target - c) * Math.min(1, dt * 10); lower.position.y = -0.55 + c * 1.1; lower.scale.y = 0.8 + 0.5 * c; });
  } else if (hr.type === 'turntable') {
    const disc = new THREE.Group(); disc.add(cyl(M.stone2, hr.r, 0.12, 0, 0.1, 0));
    for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(track(new THREE.CircleGeometry(hr.r * 0.97, 12, (k * Math.PI) / 3, Math.PI / 6)), k % 2 ? M.red : M.sail); s.rotation.x = -Math.PI / 2; s.position.y = 0.17; disc.add(s); }
    disc.add(cyl(M.dark, 0.18, 0.22, 0, 0.2, 0)); w.add(disc);
    updaters.push((heroT) => { disc.rotation.y = -hr.omega * heroT; });
  } else if (hr.type === 'pendulum') {
    w.add(box(M.metal, 0.3, 0.3, (hw + 0.5) * 2, 0, 3.5, 0)); for (const s of [-1, 1]) w.add(box(M.metal, 0.35, 3.8, 0.35, 0, 1.6, s * (hw + 0.45)));
    hr.hammers.forEach((m) => {
      const head = sph(M.red, hr.rad, hr.rad, hr.rad, m.du, 0.6, 0), rod = new THREE.Mesh(G.cyl, M.dark); rod.scale.set(0.06, 1, 0.06); w.add(head, rod);
      updaters.push((heroT) => {
        const off = hr.A * Math.sin(hr.w * heroT + m.ph); head.position.set(m.du, 0.6, off);
        _v.set(m.du, 3.4, 0); _s.copy(head.position).sub(_v); const l = _s.length(); rod.position.copy(_v).addScaledVector(_s, 0.5); rod.scale.y = l; rod.quaternion.setFromUnitVectors(UP, _s.normalize());
      });
    });
  } else if (hr.type === 'geyser') {
    w.add(cyl(M.stone, hr.r, 0.2, 0, 0.1, 0)); const pool = new THREE.Mesh(G.disc, new THREE.MeshBasicMaterial({ color: '#3f8fd8' })); pool.scale.set(hr.r * 0.82, 1, hr.r * 0.82); pool.position.y = 0.22; w.add(pool);
    const col = new THREE.Mesh(G.cyl, new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.7 })); col.scale.set(0.5, 0.01, 0.5); w.add(col);
    const bubbles = [0, 1, 2].map((k) => { const b = sph(M.white, 0.12, 0.12, 0.12, 0, 0.3, 0); w.add(b); return b; });
    updaters.push((heroT, t) => {
      const k = (heroT + hr.phase) / hr.period, fr = k - Math.floor(k), erupt = fr > 0.84 ? Math.sin(((fr - 0.84) / 0.16) * Math.PI) : 0;
      col.scale.y = Math.max(0.01, erupt * 3.2); col.position.y = erupt * 1.6; col.scale.x = col.scale.z = 0.3 + 0.35 * erupt;
      bubbles.forEach((b, i) => { const on = fr > 0.5 && fr <= 0.84 ? 1 : 0; b.visible = on > 0; b.position.set(Math.cos(t * 3 + i * 2) * 0.5, 0.3 + 0.2 * Math.abs(Math.sin(t * 5 + i)), Math.sin(t * 3 + i * 2) * 0.5); });
    });
  } else if (hr.type === 'cannon') {
    w.add(cyl(M.dark, 0.85, 0.35, 0, 0.2, 0)); const barrel = new THREE.Group(); barrel.position.y = 0.75;
    const tube = new THREE.Mesh(G.cyl, M.metal); tube.scale.set(0.38, 1.7, 0.38); tube.rotation.z = Math.PI / 2; tube.position.x = 0.7; barrel.add(tube); barrel.add(sph(M.dark, 0.5, 0.5, 0.5, -0.1, 0, 0)); w.add(barrel);
    for (const s of [-1, 1]) { const wheel = cyl(M.wood, 0.5, 0.18, -0.1, 0.5, s * 0.6); wheel.rotation.x = Math.PI / 2; w.add(wheel); }
    updaters.push((heroT) => { barrel.rotation.y = -hr.wobble * Math.sin(heroT * 1.3); });
  } else if (hr.type === 'teleport') {
    for (const [p, c] of [[hr.a, '#58b858'], [hr.b, '#4d9be0']]) { const pipe = cyl(mat(c), 0.62, 0.9, p.x - hr.x, 0.45, p.z - hr.z); w.add(pipe); const hole = new THREE.Mesh(G.disc, M.cup); hole.scale.set(0.45, 1, 0.45); hole.position.set(p.x - hr.x, 0.92, p.z - hr.z); w.add(hole); const rim = new THREE.Mesh(track(new THREE.TorusGeometry(0.62, 0.09, 6, 20)), mat(c)); rim.rotation.x = Math.PI / 2; rim.position.set(p.x - hr.x, 0.9, p.z - hr.z); w.add(rim); }
    w.rotation.y = 0; const rk = hr.rock, yaw = Math.atan2(-hr.uz, hr.ux);
    const r1 = box(M.stone, rk.half * 2, 1.5, rk.side * 2, rk.x - hr.x, 0.7, rk.z - hr.z), r2 = box(M.stone2, rk.half * 1.2, 0.8, rk.side * 1.2, rk.x - hr.x, 1.7, rk.z - hr.z); r1.rotation.y = r2.rotation.y = yaw; w.add(r1, r2);
  } else if (hr.type === 'drawbridge') {
    const moat = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: '#3f8fd8' })); moat.scale.set(hr.half * 2, 0.06, (hw + 0.3) * 2); moat.position.y = 0.1; w.add(moat);
    for (const s of [-1, 1]) for (const e of [-1, 1]) w.add(box(M.stone, 0.6, 1.8, 0.6, e * (hr.half + 0.1), 0.9, s * (hw + 0.1)));
    const pivot = new THREE.Group(); pivot.position.set(hr.half, 0.18, 0); const plank = box(M.wood, hr.half * 2, 0.14, hw * 2 - 0.2, -hr.half, 0, 0); pivot.add(plank); w.add(pivot);
    let a = 0;
    updaters.push((heroT, t, dt) => { const target = bridgeUp(hr, heroT) ? 1 : 0; a += (target - a) * Math.min(1, dt * 5); pivot.rotation.z = a * 1.2; });
  } else if (hr.type === 'loop') {
    const pts = []; for (let i = 0; i <= 48; i++) { const s = i / 48; pts.push(new THREE.Vector3(-hr.L / 2 + s * hr.L, 0.12 + hr.R * (1 - Math.cos(6.283185307 * s)), 0)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    for (const s of [-1, 1]) { const tube = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 96, 0.1, 6, false)), s > 0 ? M.red : M.sail); tube.position.z = s * 0.55; w.add(tube); }
    for (let i = 4; i < 48; i += 8) { const p = pts[i]; w.add(box(M.metal, 0.12, p.y, 1.2, p.x, p.y / 2, 0)); }
    const ramp = box(M.wood, 1.7, 0.1, hr.track * 2, -hr.L / 2 - 0.8, 0.12, 0); ramp.rotation.z = 0.2; w.add(ramp);
    for (const s of [-1, 1]) w.add(box(M.stone2, hr.L, 0.9, hw + 0.3 - hr.track, 0, 0.3, s * (hr.track + (hw + 0.3 - hr.track) / 2)));
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
