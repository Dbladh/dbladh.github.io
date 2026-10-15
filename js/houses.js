// Procedural houses: village themes, wall/roof materials, roof shapes, windows and their dressing,
// chimneys, doors, porches and small extras. Everything here is driven by a random function passed in,
// so the same seed always builds the same village. `mergeByMaterial` then collapses each house into a
// handful of draw calls.
import * as THREE from 'three';

// ---------------------------------------------------------------- small helpers

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }

export function rngFrom(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const matCache = new Map();
export function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color: hex, ...opts }));
  return matCache.get(key);
}

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT_BOX, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}
const cyl = (r, h, material, x, y, z, seg = 10) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
  m.position.set(x, y, z);
  return m;
};

// ---------------------------------------------------------------- soft blobs (contact shadows)

let _blob = null;
export function blobTexture() {
  if (_blob) return _blob;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _blob = new THREE.CanvasTexture(c);
  return _blob;
}
const CONTACT_MAT = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x14200c, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
const EAVE_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });

// ---------------------------------------------------------------- procedural surface textures

function canvasTex(size, draw, { repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const shadeHex = (hex, k) => {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
  return '#' + c.getHexString();
};

/** Wall textures in full colour. `tile` (world units per repeat) is set by the caller's UVs. */
const WALL_TEX = {
  brick(g, S, hex) {
    g.fillStyle = shadeHex(hex, 1.55); g.fillRect(0, 0, S, S);                        // light mortar
    const cols = 6, rows = 14, bw = S / cols, bh = S / rows;
    for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
      g.fillStyle = shadeHex(hex, 0.82 + hash(k + 7, r) * 0.32);
      g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  },
  stone(g, S, hex) {
    g.fillStyle = shadeHex(hex, 0.55); g.fillRect(0, 0, S, S);                        // dark joints
    let y = 0, row = 0;
    while (y < S) {
      const bh = 26 + hash(row, 3) * 22; let x = -hash(row, 9) * 40;
      while (x < S) {
        const bw = 34 + hash(row, Math.floor(x)) * 44;
        g.fillStyle = shadeHex(hex, 0.78 + hash(Math.floor(x) + 3, row) * 0.42);
        g.beginPath(); g.roundRect(x + 2, y + 2, bw - 4, bh - 4, 6); g.fill();
        x += bw;
      }
      y += bh; row++;
    }
  },
  plaster(g, S, hex) {
    g.fillStyle = hex; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = shadeHex(hex, 0.93 + hash(i, 5) * 0.12);
      g.globalAlpha = 0.5;
      g.fillRect(hash(i, 1) * S, hash(i, 2) * S, 2 + hash(i, 3) * 5, 2 + hash(i, 4) * 5);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {                                                    // soft stains
      const x = hash(i, 11) * S, y = hash(i, 12) * S, rr = 20 + hash(i, 13) * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  },
  clap(g, S, hex) {
    const rows = 10, bh = S / rows;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = shadeHex(hex, 0.9 + hash(r, 6) * 0.2); g.fillRect(0, r * bh, S, bh);
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, r * bh + bh - 3, S, 3);        // shadow under each board
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, r * bh, S, 2);          // highlight on its top edge
    }
  },
  timber(g, S, hex) {                                                               // half-timber: plaster + dark frame
    WALL_TEX.plaster(g, S, hex);
    g.fillStyle = '#4a3322';
    const t = 16;
    g.fillRect(0, 0, S, t); g.fillRect(0, S - t, S, t);                              // sill and head
    g.fillRect(0, 0, t, S); g.fillRect(S - t, 0, t, S);                              // posts
    g.fillRect(S / 2 - t / 2, 0, t, S);                                              // centre post
    g.save(); g.translate(S / 4, S / 2); g.rotate(Math.PI / 4);                       // braces
    g.fillRect(-S * 0.33, -t / 2, S * 0.66, t); g.rotate(Math.PI / 2); g.fillRect(-S * 0.33, -t / 2, S * 0.66, t);
    g.restore();
  },
};
const WALL_TILE = { brick: 1.7, stone: 2.4, plaster: 3.2, clap: 1.5, timber: 2.4 };
const WALL_BUMP = { brick: 1.6, stone: 2.2, plaster: 0.5, clap: 1.4, timber: 0.8 };
const wallTexCache = new Map(), wallMatCache = new Map();

/** A wall material. `vc` adds the baked darker-toward-the-ground ramp (needs a 'color' attribute). */
export function wallMaterial(kind, hex, vc = true) {
  const key = `${kind}|${hex}|${vc}`;
  if (wallMatCache.has(key)) return wallMatCache.get(key);
  const tk = `${kind}|${hex}`;
  if (!wallTexCache.has(tk)) wallTexCache.set(tk, canvasTex(256, (g, S) => WALL_TEX[kind](g, S, hex)));
  const tex = wallTexCache.get(tk);
  const m = new THREE.MeshStandardMaterial({
    map: tex, bumpMap: tex, bumpScale: WALL_BUMP[kind], roughness: 0.92, metalness: 0, vertexColors: vc, envMapIntensity: 0.15,
  });
  wallMatCache.set(key, m);
  return m;
}
export const wallTile = (kind) => WALL_TILE[kind];

/** A wall box whose UVs follow its real size (constant texture density) and darkens toward the ground. */
function wallGeometry(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, pos = g.attributes.position;
  const ext = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const j = f * 4 + i;
    uv.setXY(j, uv.getX(j) * ext[f][0] / tile, uv.getY(j) * ext[f][1] / tile);
  }
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.7 + 0.3 * (pos.getY(i) / h + 0.5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Roof textures in grey (tinted by the material colour). */
const ROOF_TEX = {
  tile(g, S) {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
    const cols = 8, rows = 10, tw = S / cols, th = S / rows;
    for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th;
      const v = 190 + Math.floor(((r * 7 + k * 13) % 5) * 9);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + tw - 1, y); g.lineTo(x + tw - 1, y + th * 0.62);
      g.quadraticCurveTo(x + tw / 2, y + th * 1.18, x + 1, y + th * 0.62); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,30,30,0.55)'; g.lineWidth = 1.6; g.stroke();
    }
  },
  slate(g, S) {
    g.fillStyle = '#6f6f6f'; g.fillRect(0, 0, S, S);
    const cols = 7, rows = 12, tw = S / cols, th = S / rows;
    for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th;
      const v = 176 + Math.floor(hash(k + 4, r) * 62);
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 1.5, y + 1, tw - 3, th - 1.5);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1.5, y + th - 3, tw - 3, 2.5);
    }
  },
  shingle(g, S) {
    g.fillStyle = '#707070'; g.fillRect(0, 0, S, S);
    const cols = 6, rows = 9, tw = S / cols, th = S / rows;
    for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th;
      const v = 175 + Math.floor(hash(k + 2, r + 5) * 55);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + tw - 1, y); g.lineTo(x + tw - 1, y + th * 0.78);
      g.quadraticCurveTo(x + tw / 2, y + th * 1.12, x + 1, y + th * 0.78); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.4; g.stroke();
    }
  },
  thatch(g, S) {
    g.fillStyle = '#9d9d9d'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1100; i++) {
      const x = hash(i, 21) * S, y = hash(i, 22) * S, l = 14 + hash(i, 23) * 40, v = 120 + hash(i, 24) * 115;
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1 + hash(i, 25) * 2.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(i, 26) - 0.5) * 6, y + l); g.stroke();
    }
    for (let r = 0; r < 6; r++) {                                                    // bound courses
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, r * (S / 6), S, 3);
    }
  },
};
const ROOF_TILE = { tile: 1.7, slate: 1.3, shingle: 1.5, thatch: 2.2 };
const ROOF_BUMP = { tile: 2.2, slate: 1.6, shingle: 2.0, thatch: 3.0 };
const roofTexCache = new Map(), roofMatCache = new Map();
export function roofMaterial(kind, hex) {
  if (typeof hex === 'undefined') { hex = kind; kind = 'tile'; }           // legacy call roofMaterial('#hex')
  const key = kind + '|' + hex;
  if (!roofMatCache.has(key)) {
    if (!roofTexCache.has(kind)) roofTexCache.set(kind, canvasTex(256, (g, S) => ROOF_TEX[kind](g, S)));
    const tex = roofTexCache.get(kind);
    roofMatCache.set(key, new THREE.MeshStandardMaterial({
      color: hex, map: tex, bumpMap: tex, bumpScale: ROOF_BUMP[kind], roughness: kind === 'slate' ? 0.55 : 0.82, metalness: 0, envMapIntensity: 0.35,
    }));
  }
  return roofMatCache.get(key);
}

/** A roof slab whose top-face UVs follow its real size, so the texture keeps a constant scale. */
function slabGeometry(len, thick, span, tile = 1.7) {
  const g = new THREE.BoxGeometry(len, thick, span);
  const uv = g.attributes.uv;
  for (let i = 8; i < 16; i++) uv.setXY(i, uv.getX(i) * (len / tile), uv.getY(i) * (span / tile)); // +y and -y faces
  return g;
}

// ---------------------------------------------------------------- glass and the night-light kit

let _glassTex = null, _glassGlow = null;
function glassTextures() {
  if (_glassTex) return { map: _glassTex, glow: _glassGlow };
  const S = 128;
  const make = (draw) => canvasTex(S, draw, { repeat: false });
  _glassTex = make((g) => {
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, '#b9dcf3'); grad.addColorStop(1, '#5f8fb4');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath(); g.moveTo(10, S); g.lineTo(46, S); g.lineTo(S, 36); g.lineTo(S, 0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.moveTo(58, S); g.lineTo(78, S); g.lineTo(S, 82); g.lineTo(S, 62); g.closePath(); g.fill();
    g.strokeStyle = '#27323d'; g.lineWidth = 7;
    g.strokeRect(0, 0, S, S);
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  });
  _glassGlow = make((g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const grad = g.createRadialGradient(S / 2, S * 0.65, 4, S / 2, S / 2, S * 0.75);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#a8741f');
    g.fillStyle = grad; g.fillRect(5, 5, S - 10, S - 10);
    g.fillStyle = '#000'; g.fillRect(S / 2 - 4, 0, 8, S); g.fillRect(0, S / 2 - 4, S, 8);
  });
  return { map: _glassTex, glow: _glassGlow };
}

/** One glass material per house, so all its windows light up together. */
export function glassMaterial() {
  const { map, glow } = glassTextures();
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, map, metalness: 0.45, roughness: 0.1, envMapIntensity: 1.6,
    emissive: 0xffb84a, emissiveMap: glow, emissiveIntensity: 0,
  });
}

let _glow = null;
function glowKit() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.shadowColor = '#fff'; g.shadowBlur = 4; g.fillStyle = '#fff';
  const xAt = (y, t) => lerp(lerp(34, 10, (y - 12) / 228), lerp(94, 118, (y - 12) / 228), t);
  for (const [ya, yb] of [[14, 106], [140, 238]]) {
    for (const [t0, t1] of [[0, 0.42], [0.58, 1]]) {
      g.beginPath();
      g.moveTo(xAt(ya, t0), ya); g.lineTo(xAt(ya, t1), ya);
      g.lineTo(xAt(yb, t1), yb); g.lineTo(xAt(yb, t0), yb);
      g.closePath(); g.fill();
    }
  }
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(1, 'rgba(255,255,255,0.18)');
  g.fillStyle = fade; g.fillRect(0, 0, 128, 256);
  const gobo = new THREE.CanvasTexture(c);
  gobo.colorSpace = THREE.SRGBColorSpace;
  const add = { transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false };
  _glow = {
    gobo,
    decalMat: new THREE.MeshBasicMaterial({ map: gobo, color: 0xffb25a, polygonOffset: true, polygonOffsetFactor: -2, ...add }),
    shaftMat: new THREE.MeshBasicMaterial({ color: 0xffa646, vertexColors: true, side: THREE.DoubleSide, ...add }),
    decalGeo: new THREE.PlaneGeometry(1.5, 3.2).rotateX(-Math.PI / 2),
  };
  return _glow;
}
/** Window glow materials the world switches on at night (shared by every house). */
export const glowMats = () => { const k = glowKit(); return { decalMat: k.decalMat, shaftMat: k.shaftMat }; };

function shaftGeometry(h) {
  const gy = -h + 0.26;
  const P = [
    [-0.37, 0.37, 0.06], [0.37, 0.37, 0.06], [0.37, -0.37, 0.06], [-0.37, -0.37, 0.06],
    [-0.75, gy, 3.5], [0.75, gy, 3.5], [0.55, gy, 1.1], [-0.55, gy, 1.1],
  ];
  const B = [1, 1, 1, 1, 0.1, 0.1, 0.32, 0.32];
  const idx = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(B.flatMap((b) => [b, b, b]), 3));
  geo.setIndex(idx);
  return geo;
}

/** Wall lanterns glow at night; one shared material, driven by the world's setNight. */
export const lanternMat = new THREE.MeshBasicMaterial({ color: 0x8a7a55 });
export function setLanterns(night) { lanternMat.color.setRGB(0.55 + 0.45 * night, 0.46 + 0.5 * night, 0.28 + 0.18 * night); }

// ---------------------------------------------------------------- roofs

/**
 * Gable roof: a wall-material triangle fills each gable end, two overhanging slabs form the roof.
 * Built with the ridge along local x, then yawed.
 */
export function addGable(group, o) {
  const { cx, cz, len, span, base, rh, ov, ends = [ov, ov], yaw, wallMat, roofMat, tile = 1.7, wallTileSize = 2.4, thick = 0.16, ridge = '#b8451f' } = o;
  const g = new THREE.Group();
  g.position.set(cx, base, cz);
  g.rotation.y = yaw;
  if (wallMat) {
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(0, rh); shape.closePath();
    const tri = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    const uv = tri.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / wallTileSize, uv.getY(i) / wallTileSize);
    tri.rotateY(-Math.PI / 2);
    tri.translate(len / 2, 0, 0);
    g.add(new THREE.Mesh(tri, wallMat));
  }
  const half = span / 2 + ov;
  const slope = Math.hypot(half, rh);
  const ang = Math.atan2(rh, half);
  const L = len + ends[0] + ends[1];
  const shift = (ends[1] - ends[0]) / 2;
  for (const s of [1, -1]) {
    const slab = new THREE.Mesh(slabGeometry(L, thick, slope + 0.05, tile), roofMat);
    slab.position.set(shift, rh / 2 + 0.06, s * half / 2);
    slab.rotation.x = s * ang;
    g.add(slab);
  }
  g.add(box(L, 0.14, 0.26, mat(ridge), shift, rh + 0.1, 0));
  group.add(g);
}

/** Hip roof: slopes on all four sides (a pyramid when the plan is square). */
export function addHip(group, { cx, cz, len, span, base, rh, ov, yaw = 0, roofMat, tile = 1.7, ridge = '#b8451f' }) {
  const ex = len / 2 + ov, ez = span / 2 + ov;
  const rx = Math.max(0.05, len / 2 - span / 2);
  const P = {
    A: [-ex, 0, -ez], B: [ex, 0, -ez], C: [ex, 0, ez], D: [-ex, 0, ez], R1: [-rx, rh, 0], R2: [rx, rh, 0],
  };
  const tris = [['D', 'C', 'R2'], ['D', 'R2', 'R1'], ['B', 'A', 'R1'], ['B', 'R1', 'R2'], ['A', 'D', 'R1'], ['C', 'B', 'R2']];
  const pos = [], uv = [];
  for (const t of tris) {
    let [a, b, c] = t.map((k) => P[k]);
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
    if (n.y < 0) [b, c] = [c, b];                       // make every face point up and out
    for (const v of [a, b, c]) {
      pos.push(v[0], v[1], v[2]);
      uv.push(v[0] / tile, (Math.sign(v[2]) * Math.hypot(v[2], v[1] * 1.2)) / tile);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.position.set(cx, base, cz);
  g.rotation.y = yaw;
  g.add(new THREE.Mesh(geo, roofMat));
  g.add(box(rx * 2 + 0.2, 0.13, 0.24, mat(ridge), 0, rh + 0.06, 0));
  group.add(g);
}

// ---------------------------------------------------------------- windows

/**
 * A window with a recessed pane inside a proud frame. `o`: { box, shutters: 'open'|'closed'|'none',
 * dress: 'shade'|'curtain'|'blind'|null, awning: hex|null, flowers: hex[] }.
 */
export function addWindow(group, x, y, z, yaw, glassMat, trim, shutterMat, o = {}) {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.rotation.y = yaw;
  w.add(box(0.76, 0.76, 0.05, glassMat, 0, 0, -0.01));
  const T = 0.13, F = 0.14, out = 0.06;
  w.add(box(0.98, T, F, trim, 0, 0.5 - T / 2, out));
  w.add(box(0.98, T, F, trim, 0, -0.5 + T / 2, out));
  w.add(box(T, 0.98, F, trim, -0.5 + T / 2, 0, out));
  w.add(box(T, 0.98, F, trim, 0.5 - T / 2, 0, out));
  w.add(box(0.05, 0.76, 0.06, trim, 0, 0, out));
  w.add(box(0.76, 0.05, 0.06, trim, 0, 0, out));
  w.add(box(1.18, 0.1, 0.3, trim, 0, -0.56, 0.1));

  // Behind the muntins: what is hanging in the window.
  if (o.dress === 'shade') {                                   // roll-down shade, part way down
    const h = 0.22 + (o.shadeAmt ?? 0.4) * 0.45;
    w.add(box(0.72, h, 0.03, mat('#efe6cf'), 0, 0.36 - h / 2, 0.02));
    w.add(box(0.72, 0.04, 0.045, mat('#8a7a5a'), 0, 0.36 - h, 0.03));
  } else if (o.dress === 'curtain') {
    const c = mat(o.curtain || '#c85a5a');
    w.add(box(0.2, 0.72, 0.04, c, -0.26, 0, 0.02));
    w.add(box(0.2, 0.72, 0.04, c, 0.26, 0, 0.02));
    w.add(box(0.72, 0.05, 0.05, mat('#6a5030'), 0, 0.36, 0.03));
  } else if (o.dress === 'blind') {
    const sl = mat('#d9d2c0');
    for (let k = 0; k < 5; k++) w.add(box(0.72, 0.045, 0.03, sl, 0, 0.33 - k * 0.075, 0.02));
  }

  const sh = o.shutters ?? 'open';
  if (sh === 'open') for (const s of [-1, 1]) w.add(box(0.3, 0.98, 0.07, shutterMat, s * 0.68, 0, 0.03));
  else if (sh === 'closed') for (const s of [-1, 1]) w.add(box(0.5, 0.98, 0.07, shutterMat, s * 0.26, 0, 0.1));
  if (o.box) {
    w.add(box(0.9, 0.2, 0.2, mat('#7a4a2c'), 0, -0.74, 0.14));
    const fc = o.flowers || ['#ff6f91', '#ffd23f', '#ffffff'];
    for (let k = 0; k < 5; k++) w.add(box(0.1, 0.1, 0.1, mat(fc[k % fc.length]), -0.34 + k * 0.17, -0.58, 0.14));
  }
  if (o.awning) {
    const a = box(1.2, 0.05, 0.5, mat(o.awning), 0, 0.62, 0.3);
    a.rotation.x = 0.5;
    w.add(a);
    w.add(box(1.2, 0.08, 0.04, mat('#fff8ea'), 0, 0.5, 0.52));
  }
  group.add(w);

  // Night light: a shaft out of the glass and the window's panes projected on the ground.
  const kit = glowKit();
  const lg = new THREE.Group();
  lg.position.set(x, y, z);
  lg.rotation.y = yaw;
  const shaft = new THREE.Mesh(shaftGeometry(y), kit.shaftMat);
  const decal = new THREE.Mesh(kit.decalGeo, kit.decalMat);
  decal.position.set(0, -y + 0.26, 2.2);
  shaft.renderOrder = decal.renderOrder = 2;
  shaft.userData.noShadow = decal.userData.noShadow = true;
  lg.add(shaft, decal);
  group.add(lg);
}

// ---------------------------------------------------------------- village themes

/**
 * A theme is one village's look: weighted wall materials with colours, roof materials, and the trims,
 * shutters, doors and chimneys that go with them. One theme is picked per load, so a village is cohesive.
 */
export const THEMES = [
  {
    name: 'Brick & terracotta',
    walls: [{ kind: 'brick', hex: '#b5543a', w: 3 }, { kind: 'brick', hex: '#9c4a38', w: 2 }, { kind: 'plaster', hex: '#f1e2c4', w: 3 }, { kind: 'stone', hex: '#b9ae98', w: 1 }],
    roofs: [{ kind: 'tile', hex: '#c8512b', w: 4 }, { kind: 'tile', hex: '#a8442a', w: 2 }, { kind: 'slate', hex: '#59616b', w: 1 }],
    trims: ['#fff8ea', '#f3e6cc'], shutters: ['#3e7d5c', '#2f5d8a', '#7a3b3b', '#d8b34a'], doors: ['#6a3a22', '#2f5d8a', '#3e7d5c', '#8a2f2f'],
    chimneys: [['brick', 4], ['corbel', 2], ['pots', 2], ['double', 1]], plinth: '#b8b0a0', ridge: '#8a3a22',
  },
  {
    name: 'Cool stone & slate',
    walls: [{ kind: 'stone', hex: '#9b9a93', w: 4 }, { kind: 'stone', hex: '#8c8f93', w: 2 }, { kind: 'plaster', hex: '#d9d6cc', w: 2 }, { kind: 'clap', hex: '#7f8b94', w: 1 }],
    roofs: [{ kind: 'slate', hex: '#4a5560', w: 4 }, { kind: 'slate', hex: '#5d6a74', w: 3 }, { kind: 'shingle', hex: '#5b4a40', w: 1 }],
    trims: ['#f4f4ef', '#dfe3e6'], shutters: ['#2d4a6b', '#4a5560', '#7a2f35', '#3e6a5a'], doors: ['#2d4a6b', '#6a2f35', '#3a4a3a', '#1f2a36'],
    chimneys: [['stone', 4], ['tall', 2], ['pots', 1]], plinth: '#8d8c85', ridge: '#2f3740',
  },
  {
    name: 'Whitewash & blue',
    walls: [{ kind: 'plaster', hex: '#f6f3ea', w: 5 }, { kind: 'plaster', hex: '#efe9d9', w: 2 }, { kind: 'plaster', hex: '#e8f0f4', w: 1 }],
    roofs: [{ kind: 'tile', hex: '#d9622e', w: 4 }, { kind: 'tile', hex: '#c24a28', w: 2 }, { kind: 'tile', hex: '#e08a4a', w: 1 }],
    trims: ['#ffffff', '#e8f0f8'], shutters: ['#2f6fb0', '#2aa5b5', '#1f4f8a', '#3a9d8f'], doors: ['#2f6fb0', '#2aa5b5', '#c0502f', '#f2c14a'],
    chimneys: [['brick', 3], ['pots', 3], ['tall', 1]], plinth: '#cfc9bb', ridge: '#8a3a22',
  },
  {
    name: 'Timber & thatch',
    walls: [{ kind: 'timber', hex: '#efe3c2', w: 4 }, { kind: 'clap', hex: '#b99b6a', w: 2 }, { kind: 'plaster', hex: '#e6d9b8', w: 2 }, { kind: 'stone', hex: '#a39a84', w: 1 }],
    roofs: [{ kind: 'thatch', hex: '#c9ab62', w: 4 }, { kind: 'thatch', hex: '#b39455', w: 3 }, { kind: 'shingle', hex: '#6a4a38', w: 1 }],
    trims: ['#5a3f28', '#6a4a30'], shutters: ['#3f6a3a', '#7a3b2a', '#4a5a7a', '#6a4a30'], doors: ['#5a3a22', '#3f6a3a', '#7a3b2a', '#2f2f3a'],
    chimneys: [['stone', 4], ['corbel', 2], ['none', 1]], plinth: '#8f8574', ridge: '#7a6535',
  },
  {
    name: 'Pastel storybook',
    walls: [{ kind: 'plaster', hex: '#f4c9d4', w: 2 }, { kind: 'plaster', hex: '#cfe8d5', w: 2 }, { kind: 'plaster', hex: '#f7e7a6', w: 2 }, { kind: 'plaster', hex: '#c9def2', w: 2 }, { kind: 'plaster', hex: '#e8d4f2', w: 1 }],
    roofs: [{ kind: 'shingle', hex: '#4f9a9a', w: 2 }, { kind: 'shingle', hex: '#8a5a8a', w: 2 }, { kind: 'tile', hex: '#d9622e', w: 2 }, { kind: 'slate', hex: '#6a7a9a', w: 1 }],
    trims: ['#ffffff', '#fff8ea'], shutters: ['#ffffff', '#6aa0c8', '#d98a9a', '#7bb88a'], doors: ['#d98a9a', '#6aa0c8', '#7bb88a', '#e0b84a'],
    chimneys: [['brick', 3], ['pots', 2], ['double', 2], ['tall', 1]], plinth: '#d6cfc0', ridge: '#5a4a6a',
  },
  {
    name: 'Autumn cottage',
    walls: [{ kind: 'clap', hex: '#b86a3c', w: 3 }, { kind: 'plaster', hex: '#e2b86a', w: 3 }, { kind: 'brick', hex: '#a85a3a', w: 2 }, { kind: 'stone', hex: '#a89a7a', w: 1 }],
    roofs: [{ kind: 'shingle', hex: '#6a4a38', w: 3 }, { kind: 'slate', hex: '#4a5a4a', w: 2 }, { kind: 'tile', hex: '#8a3a22', w: 2 }],
    trims: ['#f6ecd2', '#e8d9b0'], shutters: ['#d8a72a', '#3f5a3a', '#7a2f25', '#4a3a2a'], doors: ['#3f5a3a', '#7a2f25', '#d8a72a', '#4a3a2a'],
    chimneys: [['brick', 3], ['stone', 2], ['corbel', 2]], plinth: '#a09882', ridge: '#4a3322',
  },
];

function weighted(R, list) {
  let tot = 0;
  for (const it of list) tot += Array.isArray(it) ? it[1] : it.w;
  let r = R() * tot;
  for (const it of list) { r -= Array.isArray(it) ? it[1] : it.w; if (r <= 0) return Array.isArray(it) ? it[0] : it; }
  const it = list[list.length - 1];
  return Array.isArray(it) ? it[0] : it;
}
export const pickTheme = (R) => THEMES[Math.floor(R() * THEMES.length)];

// ---------------------------------------------------------------- the house

const FLOWERS = [['#ff6f91', '#ffd23f', '#ffffff'], ['#c59bff', '#ffffff', '#ff9fc2'], ['#ff8a3c', '#ffd23f', '#e8402f']];

/**
 * @param {() => number} R   random function (seeded per village)
 * @param {object} theme     one of THEMES
 * @param {{ avoid?: string[], hamlet?: boolean, low?: boolean }} [opts]
 *   avoid: signatures of neighbouring houses to differ from
 */
export function buildHouse(R, theme, opts = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const h = makeHouse(R, theme, opts);
    if (!opts.avoid || !opts.avoid.includes(h.sig) || attempt === 4) return h;
  }
}

function makeHouse(R, theme, opts) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(R() * a.length)];
  const low = !!opts.low;
  const put = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };

  // --- size and plan
  const w = 3.6 + R() * 1.9, d = 3 + R() * 1.3, h = 2.2 + R() * 0.9;
  const doorSide = R() < 0.5 ? -1 : 1;
  const hasWing = R() < 0.55;
  const wingSide = -doorSide;
  const top = 0.35 + h;

  // --- materials from the theme
  const wallSpec = weighted(R, theme.walls);
  const roofSpec = weighted(R, theme.roofs);
  const trimHex = pick(theme.trims), shutterHex = pick(theme.shutters), doorHex = pick(theme.doors);
  const wallTileSize = wallTile(wallSpec.kind);
  const wallMat = wallMaterial(wallSpec.kind, wallSpec.hex, true);
  const wallPlain = wallMaterial(wallSpec.kind, wallSpec.hex, false);   // for extruded gable triangles (no colour attribute)
  const roofMat = roofMaterial(roofSpec.kind, roofSpec.hex);
  const trim = mat(trimHex), shutterMat = mat(shutterHex);
  const glassMat = glassMaterial();
  const stone = mat(theme.plinth);
  const thatch = roofSpec.kind === 'thatch';
  const roofTileSize = ROOF_TILE[roofSpec.kind];
  const ridge = thatch ? '#7a6535' : roofSpec.kind === 'slate' ? '#2f3740' : theme.ridge;
  const OV = thatch ? 0.55 : 0.35;
  const thick = thatch ? 0.3 : 0.16;

  // --- roof shape
  const shapeRoll = R();
  let shape = 'gable';
  if (!hasWing && shapeRoll < 0.3) shape = 'hip';
  else if (shapeRoll > 0.82) shape = 'steep';
  if (thatch && shape === 'hip' && w < d) shape = 'gable';
  const rh = (shape === 'steep' ? 2.0 : shape === 'hip' ? 1.1 : 1.3) + R() * (shape === 'steep' ? 0.5 : 0.7);
  const dormers = (shape === 'gable' || shape === 'steep') && !low && rh > 1.55 && R() < 0.45 ? (w > 4.6 && R() < 0.5 ? 2 : 1) : 0;

  let radius = Math.max(w / 2, d / 2 + 1.3) + 0.8;
  const chimneys = [];                                // chimney tops (local) that can carry smoke

  // --- body
  g.add(box(w + 0.2, 1.6, d + 0.2, stone, 0, -0.45, 0));                // plinth reaches below ground
  put(new THREE.Mesh(wallGeometry(w, h, d, wallTileSize), wallMat), 0, 0.35 + h / 2, 0);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(w + 3.4, d + 3.4).rotateX(-Math.PI / 2), CONTACT_MAT);
  contact.position.y = 0.07; contact.renderOrder = 1; contact.userData.noShadow = true;
  g.add(contact);
  const eave = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.45), EAVE_MAT);
  eave.position.set(0, 0.35 + h - 0.225, d / 2 + 0.012); eave.userData.noShadow = true;
  g.add(eave);

  // corner quoins on stone/brick houses give the corners some structure
  if ((wallSpec.kind === 'brick' || wallSpec.kind === 'plaster') && R() < 0.5) {
    const q = mat(shadeHex(theme.plinth, 1.05));
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      g.add(box(0.26, 0.3, 0.26, q, sx * (w / 2 - 0.02), 0.55 + k * 0.62, d / 2 - 0.02));
    }
  }

  // --- main roof
  const ends = hasWing ? (wingSide > 0 ? [OV, 0] : [0, OV]) : [OV, OV];
  if (shape === 'hip') {
    addHip(g, { cx: 0, cz: 0, len: w, span: d, base: top, rh, ov: OV, roofMat, tile: roofTileSize, ridge });
  } else {
    addGable(g, { cx: 0, cz: 0, len: w, span: d, base: top, rh, ov: OV, ends, yaw: 0, wallMat: wallPlain, roofMat, tile: roofTileSize, wallTileSize, thick, ridge });
  }

  // --- wing: lower, ridge kept under the main eave, eaves ending inside the main walls
  let wing = null;
  if (hasWing) {
    const w2 = 2.2 + R() * 1.0, d2 = d * (0.7 + R() * 0.2), h2 = h * 0.82;
    const overlap = 0.3;
    const cx = wingSide * (w / 2 + w2 / 2 - overlap), cz = -0.2 - R() * 0.3;
    const rh2 = Math.min(rh * 0.8, Math.max(0.7, h - h2 + (shape === 'hip' ? 0.2 : 0.35)));
    g.add(box(w2 + 0.2, 1.6, d2 + 0.2, stone, cx, -0.45, cz));
    put(new THREE.Mesh(wallGeometry(w2, h2, d2, wallTileSize), wallMat), cx, 0.35 + h2 / 2, cz);
    addGable(g, { cx, cz, len: d2, span: w2, base: 0.35 + h2, rh: rh2, ov: 0.15, ends: [0.25, 0.25], yaw: Math.PI / 2, wallMat: wallPlain, roofMat, tile: roofTileSize, wallTileSize, thick, ridge });
    wing = { cx, cz, w2, d2, h2 };
    radius = Math.max(radius, w / 2 + w2 + 0.8, Math.abs(cz) + d2 / 2 + 1.2);
  }

  // --- window dressing helper
  const FL = pick(FLOWERS);
  const dressOpts = (withBox) => {
    const dress = low ? null : (R() < 0.62 ? pick(['shade', 'shade', 'curtain', 'blind']) : null);
    const sh = R() < 0.12 ? 'closed' : R() < 0.18 ? 'none' : 'open';
    return {
      box: withBox, flowers: FL, shutters: sh, dress, shadeAmt: R(), curtain: pick(['#c85a5a', '#d9b84a', '#5a7ac8', '#e8e0d0']),
      awning: !low && R() < 0.16 ? pick(['#c85a5a', '#2f6fb0', '#d9b84a', '#3f8a5a']) : null,
    };
  };

  // --- wing windows
  if (wing) {
    addWindow(g, wing.cx + wingSide * 0.2, 1.55, wing.cz + wing.d2 / 2 + 0.03, 0, glassMat, trim, shutterMat, dressOpts(R() < 0.5));
    addWindow(g, wing.cx + wingSide * (wing.w2 / 2 + 0.03), 1.55, wing.cz, wingSide * Math.PI / 2, glassMat, trim, shutterMat, dressOpts(false));
    addWindow(g, wing.cx, 1.55, wing.cz - wing.d2 / 2 - 0.03, Math.PI, glassMat, trim, shutterMat, dressOpts(false));
  }

  // --- chimney
  const chStyle = thatch && R() < 0.5 ? 'stone' : weighted(R, theme.chimneys);
  const chX = (hasWing ? -wingSide : (R() < 0.5 ? -1 : 1)) * w * 0.26;
  const chZ = shape === 'hip' ? 0 : -d * 0.12;
  const chBase = top + (shape === 'hip' ? rh * 0.55 : rh * 0.72);
  const chTop = top + rh + 0.95;
  if (chStyle !== 'none') {
    const bh = chTop - chBase + 0.2, my = chBase - 0.2 + bh / 2;
    const brick = wallMaterial('brick', chStyle === 'stone' ? '#8f8b82' : '#a8523a', false);
    const stoneMat = wallMaterial('stone', '#8f8b82', false);
    const body = chStyle === 'stone' ? stoneMat : brick;
    const cap = mat(chStyle === 'stone' ? '#6a675f' : '#7a3a2a');
    const addBody = (bw, bd, cxo) => {
      const m = new THREE.Mesh(wallGeometry(bw, bh, bd, 1.4), body);
      m.position.set(chX + cxo, my, chZ);
      g.add(m);
    };
    if (chStyle === 'double') {
      addBody(0.36, 0.5, -0.3); addBody(0.36, 0.5, 0.3);
      g.add(box(1.1, 0.12, 0.62, cap, chX, chTop + 0.05, chZ));
    } else if (chStyle === 'tall') {
      addBody(0.44, 0.44, 0);
      g.add(box(0.6, 0.12, 0.6, cap, chX, chTop + 0.45, chZ));
      g.add(box(0.5, 0.45, 0.5, body, chX, chTop + 0.2, chZ));
    } else if (chStyle === 'stone') {
      addBody(0.74, 0.62, 0);
      g.add(box(0.9, 0.14, 0.78, cap, chX, chTop + 0.06, chZ));
    } else {
      addBody(0.58, 0.58, 0);
      if (chStyle === 'corbel') {
        g.add(box(0.7, 0.1, 0.7, cap, chX, chTop - 0.08, chZ));
        g.add(box(0.82, 0.1, 0.82, cap, chX, chTop + 0.02, chZ));
      } else {
        g.add(box(0.74, 0.14, 0.74, cap, chX, chTop + 0.05, chZ));
      }
      if (chStyle === 'pots') {
        const pot = mat('#c0623a');
        g.add(cyl(0.12, 0.38, pot, chX - 0.15, chTop + 0.32, chZ, 8));
        g.add(cyl(0.12, 0.32, pot, chX + 0.15, chTop + 0.29, chZ, 8));
      }
    }
    chimneys.push([chX, chTop + (chStyle === 'tall' ? 0.7 : chStyle === 'pots' ? 0.55 : 0.25), chZ]);
  }

  // --- door
  const dx = doorSide * w * 0.22;
  const doorStyle = pick(['arch', 'arch', 'plank', 'double']);
  const doorMat = mat(doorHex);
  const doorBase = 0.35, doorH = 1.45, front = d / 2;
  if (doorStyle === 'arch') {
    g.add(box(0.95, doorH + 0.05, 0.1, trim, dx, doorBase + (doorH + 0.05) / 2, front + 0.02));
    const at = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.1, 14, 1, false, -Math.PI / 2, Math.PI), trim);
    at.rotation.x = -Math.PI / 2; at.position.set(dx, doorBase + doorH, front + 0.02);
    g.add(at);
    g.add(box(0.76, doorH, 0.12, doorMat, dx, doorBase + doorH / 2, front + 0.03));
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 14, 1, false, -Math.PI / 2, Math.PI), doorMat);
    arch.rotation.x = -Math.PI / 2; arch.position.set(dx, doorBase + doorH, front + 0.03);
    g.add(arch);
  } else if (doorStyle === 'plank') {
    g.add(box(1.0, doorH + 0.12, 0.1, trim, dx, doorBase + (doorH + 0.12) / 2, front + 0.02));
    g.add(box(0.8, doorH, 0.12, doorMat, dx, doorBase + doorH / 2, front + 0.03));
    const band = mat('#2a2a2a');
    for (const yy of [0.3, doorH - 0.3]) g.add(box(0.8, 0.07, 0.14, band, dx, doorBase + yy, front + 0.04));
    g.add(box(0.07, 0.07, 0.16, mat('#d9b84a'), dx + 0.25, doorBase + doorH * 0.5, front + 0.06));
  } else {
    g.add(box(1.4, doorH + 0.3, 0.1, trim, dx, doorBase + (doorH + 0.3) / 2, front + 0.02));
    for (const s of [-1, 1]) g.add(box(0.6, doorH, 0.12, doorMat, dx + s * 0.32, doorBase + doorH / 2, front + 0.03));
    g.add(box(1.2, 0.22, 0.12, glassMat, dx, doorBase + doorH + 0.07, front + 0.03));  // transom window
  }
  g.add(box(1.5, 0.9, 1.1, stone, dx, -0.09, front + 0.55));       // doorstep: a block that sinks into the ground

  // porch canopy over the door
  if (R() < 0.38) {
    const post = mat(trimHex);
    const px = 0.78;
    for (const s of [-1, 1]) g.add(box(0.12, 2.05, 0.12, post, dx + s * px, 0.35 + 1.02, front + 1.0));
    const roof = box(1.9, 0.12, 1.25, roofMat, dx, 2.5, front + 0.55);
    roof.rotation.x = 0.16;
    g.add(roof);
    g.add(box(1.7, 0.12, 0.12, post, dx, 2.36, front + 1.0));
    radius = Math.max(radius, d / 2 + 2.0);
  }
  // lantern beside the door
  if (!low && R() < 0.65) {
    const lx = dx + (doorSide > 0 ? -1 : 1) * 0.78;
    g.add(box(0.07, 0.07, 0.18, mat('#2a2a2a'), lx, 2.05, front + 0.1));
    g.add(box(0.2, 0.26, 0.2, lanternMat, lx, 1.85, front + 0.22));
  }

  // --- front and side windows
  const freeSide = hasWing ? -wingSide : (R() < 0.5 ? -1 : 1);
  addWindow(g, -doorSide * w * 0.27, 1.65, front + 0.03, 0, glassMat, trim, shutterMat, dressOpts(R() < 0.6));
  addWindow(g, freeSide * (w / 2 + 0.03), 1.65, 0, freeSide * Math.PI / 2, glassMat, trim, shutterMat, dressOpts(false));
  if (!hasWing) addWindow(g, -freeSide * (w / 2 + 0.03), 1.65, 0, -freeSide * Math.PI / 2, glassMat, trim, shutterMat, dressOpts(false));
  const backXs = w > 4.4 ? [-w * 0.26, w * 0.26] : [0];
  backXs.forEach((bx, i) => addWindow(g, bx, 1.65, -d / 2 - 0.03, Math.PI, glassMat, trim, shutterMat, dressOpts(i === 0 && R() < 0.6)));

  // --- dormers on the front slope
  if (dormers) {
    const spots = dormers === 2 ? [-w * 0.24, w * 0.24] : [0];
    const zRoof = d * 0.2;
    const roofY = top + rh * (1 - zRoof / (d / 2 + OV));
    spots.forEach((sx) => {
      put(new THREE.Mesh(wallGeometry(0.95, 0.85, 0.8, wallTileSize), wallPlain), sx, roofY + 0.22, zRoof + 0.15);
      addGable(g, { cx: sx, cz: zRoof + 0.15, len: 0.8, span: 0.95, base: roofY + 0.65, rh: 0.5, ov: 0.1, ends: [0.15, 0.2], yaw: Math.PI / 2, wallMat: wallPlain, roofMat, tile: roofTileSize, wallTileSize, thick: 0.1, ridge });
      addWindow(g, sx, roofY + 0.25, zRoof + 0.58, 0, glassMat, trim, shutterMat, { shutters: 'none', dress: R() < 0.5 ? 'curtain' : null, curtain: '#e8e0d0' });
    });
  }

  // --- round attic window in the free gable (gable roofs only)
  if (shape !== 'hip' && !dormers) {
    const attic = new THREE.Group();
    attic.position.set(freeSide * (w / 2 + 0.02), top + rh * 0.34, 0);
    attic.rotation.y = freeSide * Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16), trim);
    ring.rotation.x = Math.PI / 2;
    const pane = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 16), glassMat);
    pane.rotation.x = Math.PI / 2;
    attic.add(ring, pane);
    g.add(attic);
  }

  // --- small extras
  const extras = [];
  if (!low && R() < 0.4) {                                   // weather vane
    const vx = (hasWing ? wingSide : -1) * -w * 0.2;
    const vy = top + rh + 0.2;
    const m = mat('#2a2a2a');
    g.add(box(0.05, 0.6, 0.05, m, vx, vy + 0.3, 0));
    g.add(box(0.5, 0.05, 0.05, m, vx, vy + 0.45, 0));
    g.add(box(0.05, 0.05, 0.5, m, vx, vy + 0.45, 0));
    g.add(box(0.36, 0.14, 0.04, mat('#c8a52a'), vx + 0.1, vy + 0.62, 0));
    extras.push('vane');
  }
  if (!low && R() < 0.45) {                                  // ivy on the free side wall
    const leaf = [mat('#3f7a3a'), mat('#4f9a46'), mat('#2f6a30')];
    const wx = freeSide * (w / 2 + 0.03);
    for (let i = 0; i < 16; i++) {
      const yy = 0.7 + hash(i, 31) * 2.1, zz = -d / 2 + 0.3 + hash(i, 32) * (d - 0.6);
      const s = 0.18 + hash(i, 33) * 0.2;
      const m = box(0.05, s, s, leaf[i % 3], wx, yy, zz);
      m.rotation.x = hash(i, 34) * 3;
      g.add(m);
    }
    extras.push('ivy');
  }
  if (!low && R() < 0.5) {                                   // barrel and a small woodpile near the door
    const bx = dx + (doorSide > 0 ? 1 : -1) * 1.35;
    g.add(cyl(0.3, 0.7, mat('#7a5230'), bx, 0.35, front + 0.55, 10));
    g.add(cyl(0.31, 0.06, mat('#3a3a3a'), bx, 0.55, front + 0.55, 10));
    g.add(cyl(0.31, 0.06, mat('#3a3a3a'), bx, 0.2, front + 0.55, 10));
    extras.push('barrel');
  }
  if (!low && !hasWing && R() < 0.5) {                       // lean-to shed on the back corner
    const sx = freeSide * (w / 2 + 0.7), sz = -d / 2 + 0.2;
    put(new THREE.Mesh(wallGeometry(1.5, 1.5, 1.6, wallTileSize), wallMaterial('clap', '#8f6a42', true)), sx, 0.35 + 0.75, sz);
    const sr = box(1.9, 0.12, 2.0, roofMat, sx, 2.2, sz);
    sr.rotation.z = freeSide * 0.18;
    g.add(sr);
    radius = Math.max(radius, w / 2 + 1.9);
    extras.push('shed');
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = !o.userData.noShadow; } });
  const merged = mergeByMaterial(g);
  return {
    group: merged, glassMat, lightAnchor: new THREE.Vector3(0, 1.5, d / 2 + 1.4), radius, w, d,
    chimneys, smoke: chimneys.length > 0 && !low && R() < 0.8,
    sig: `${wallSpec.kind}${wallSpec.hex}|${roofSpec.kind}${roofSpec.hex}|${shape}`,
  };
}

// ---------------------------------------------------------------- draw-call merging

/**
 * Collapses every mesh in `root` that shares a material (and shadow behaviour) into one mesh.
 * The world matrices are baked relative to `root`, so call this before moving `root`.
 */
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const list = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) list.push(o); });
  for (const m of list) {
    const key = `${m.material.uuid}|${m.renderOrder}|${m.userData.noShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { material: m.material, renderOrder: m.renderOrder, noShadow: !!m.userData.noShadow, meshes: [] });
    buckets.get(key).meshes.push(m);
  }
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    let total = 0;
    const geos = b.meshes.map((m) => {
      let gm = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      gm.applyMatrix4(m.matrixWorld);
      total += gm.attributes.position.count;
      return gm;
    });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3).fill(1);
    let o = 0;
    for (const gm of geos) {
      const n = gm.attributes.position.count;
      pos.set(gm.attributes.position.array, o * 3);
      if (gm.attributes.normal) nor.set(gm.attributes.normal.array, o * 3);
      else for (let i = 0; i < n; i++) nor[(o + i) * 3 + 1] = 1;
      if (gm.attributes.uv) uv.set(gm.attributes.uv.array, o * 2);
      if (gm.attributes.color) col.set(gm.attributes.color.array, o * 3);
      o += n;
      gm.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.renderOrder = b.renderOrder;
    mesh.castShadow = !b.noShadow;
    mesh.receiveShadow = !b.noShadow;
    if (b.noShadow) mesh.userData.noShadow = true;
    out.add(mesh);
  }
  return out;
}

// ---------------------------------------------------------------- wall box for simple buildings (barn)

const WALL_GEO = (() => {              // unit box, darker toward the bottom (baked ground occlusion)
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = 0.7 + 0.3 * (pos.getY(i) + 0.5); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
export function wallBox(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(WALL_GEO, material);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  return m;
}
