// The landscape: layered rolling hills with a winding path, a village of varied cottages,
// several kinds of trees, bushes, rocks, flowers, clouds, and real point lights
// for cottage windows and fireflies at night. Everything is procedural (no model files)
// and seeded, so the layout is the same every visit.
import * as THREE from 'three';

// Where each billboard sits. Each sign stands on a big hill set well back. On wide screens it sits on the
// hill's outer flank (`desk`); on narrower screens it slides inward along the hill (never past the crest,
// `hill.x`) and, in portrait, steps to its `stagger` depth so the three signs zig-zag instead of overlapping.
// `scale` shrinks the sign (the About sign is a small roadside one).
export const STOPS = {
  creativity:  { desk: { x: -38, z: -58 }, stagger: { z: -46 }, hill: { x: -13, z: -54, rx: 26, rz: 18, h: 9 },
                 scale: 1, accent: '#ff9db8', paper: '#ffffff', yaw: 0.28 },
  ai:          { desk: { x: 0, z: -78 },   stagger: { z: -76 }, hill: { x: 0, z: -80, rx: 30, rz: 16, h: 12 },
                 scale: 1, accent: '#8ec5ff', paper: '#ffffff', yaw: -0.18 },
  engineering: { desk: { x: 38, z: -58 },  stagger: { z: -58 }, hill: { x: 13, z: -60, rx: 26, rz: 18, h: 9 },
                 scale: 1, accent: '#ffd36a', paper: '#ffffff', yaw: -0.30 },
  about:       { desk: { x: -10, z: -14 }, stagger: { z: -14 }, hill: { x: -4, z: -14, rx: 9, rz: 7, h: 2.2 },
                 scale: 0.45, accent: '#9fdc8c', paper: '#ffffff', yaw: 0.22 },
};

// Hills that fill the left and right edges of the view: gentle shoulders near the camera, bigger hills
// behind them, and far backdrop hills. { x, z, rx, rz, h }
const FLANKS = [
  { x: -52, z: -20, rx: 24, rz: 22, h: 7 },  { x: 54, z: -14, rx: 24, rz: 22, h: 6.5 },
  { x: -34, z: 6, rx: 16, rz: 13, h: 2.4 },  { x: 36, z: 8, rx: 16, rz: 13, h: 2.2 },
  { x: -82, z: -42, rx: 34, rz: 30, h: 15 }, { x: 84, z: -40, rx: 34, rz: 30, h: 14 },
  { x: -24, z: -93, rx: 16, rz: 13, h: 14 },   // the windmill's own hilltop, behind and between the signs
];

const BOARD_W = 16, BOARD_H = 9, BOARD_BOTTOM = 2.2;
const SIGN_GREY = 0xc8c6bd; // frame + posts: the billboard's steel/concrete grey

// ---------------------------------------------------------------- helpers

function rng(seed) { // mulberry32
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// Value noise + fractal sum: gives hills a natural, non-repeating shape.
function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}
function fbm(x, z) {
  let a = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { a += vnoise(x * f, z * f) * amp; f *= 2.03; amp *= 0.5; }
  return a; // roughly 0..0.94
}

/** The dirt path's x position at depth z (it winds from the camera up toward the AI hill). */
/** A small pond in the right-hand meadow. */
export const POND = { x: 17, z: -4, r: 6.5 };

export function pathX(z) {
  // Wide S-curves near the camera that settle toward the middle at the AI hill.
  const amp = 13 * (1 - 0.92 * smooth(-30, -66, z));
  return Math.sin((z - 22) * 0.082) * amp + Math.sin((z - 22) * 0.21) * 1.8 * (1 - smooth(-20, -60, z));
}

/** Ground height at (x, z). */
function rawHeight(x, z) {
  const calm = 0.2 + 0.8 * smooth(12, 46, Math.hypot(x, z - 22)); // gentle meadow near the camera
  let h = (fbm(x * 0.016, z * 0.016) - 0.45) * 15 * calm;
  h += (fbm(x * 0.06 + 9, z * 0.06 + 3) - 0.5) * 3 * calm;
  h += (fbm(x * 0.14 + 60, z * 0.14 + 20) - 0.5) * 1.3 * calm;   // knolls and swales a few metres wide
  h += (vnoise(x * 0.55 + 7, z * 0.55 + 3) - 0.5) * 0.32 * calm; // fine ripples in the ground
  const pdx = x - POND.x, pdz = z - POND.z;
  h -= 2.5 * Math.exp(-(pdx * pdx + pdz * pdz) / (2 * (POND.r * 0.62) ** 2)); // pond basin
  h += Math.max(0, -z - 10) * 0.05;
  h += smooth(-95, -170, z) * (10 + fbm(x * 0.03 + 20, z * 0.03) * 22); // distant ridges
  for (const s of Object.values(STOPS)) {
    const { x: hx, z: hz, rx, rz, h: hh } = s.hill;
    const dx = (x - hx) / (rx / 1.8), dz = (z - hz) / (rz / 1.8);
    h += hh * Math.exp(-0.5 * (dx * dx + dz * dz));
  }
  for (const f of FLANKS) {
    const dx = (x - f.x) / (f.rx / 1.8), dz = (z - f.z) / (f.rz / 1.8);
    h += f.h * Math.exp(-0.5 * (dx * dx + dz * dz));
  }
  h -= 0.35 * (1 - smooth(0, 4, Math.abs(x - pathX(z)))); // path sits in a shallow trough
  return h;
}

// Flat building plots: the terrain eases to each house's ground level, so nothing floats.
const PADS = []; // { x, z, r, y } filled in by buildWorld before the terrain is made

/** Ground height at (x, z), including the flattened plots under houses. */
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (const pad of PADS) {
    const w = 1 - smooth(pad.r, pad.r + 4.5, Math.hypot(x - pad.x, z - pad.z));
    if (w > 0) h = lerp(h, pad.y, w);
  }
  return h;
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w; y += lineH;
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  return y;
}

// The sign face, drawn on a canvas: cream card, chunky title, mono call-to-action.
function drawBoard(title, teaser, accent) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 576);
  g.fillStyle = accent; g.fillRect(0, 0, 1024, 40);
  g.fillStyle = '#111';
  g.textBaseline = 'top';
  g.font = '900 92px "Helvetica Neue", Arial, sans-serif';
  const y = wrapText(g, title, 56, 80, 910, 98);
  g.font = '500 40px system-ui, Arial, sans-serif';
  g.fillStyle = '#333';
  wrapText(g, teaser, 56, y + 14, 910, 52);
  g.fillStyle = '#111';
  g.font = '700 38px ui-monospace, Menlo, monospace';
  g.fillText('CLICK TO EXPLORE  →', 56, 508);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- materials

const matCache = new Map();
function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color: hex, ...opts }));
  return matCache.get(key);
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT_BOX, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

// ---------------------------------------------------------------- low-poly geometry

/** Pushes each vertex in or out by a hash of its position, so shapes get an irregular, crystalline outline. */
function jitter(geo, amount, seed = 0) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (hash(v.x * 12.9 + v.z * 4.1 + seed, v.y * 78.2 + v.z * 0.8 + seed * 1.7) - 0.5) * amount;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Bakes a soft top-light into vertex colours: darker underneath, brighter on top (multiplies the instance colour). */
function shade(geo, lo = 0.7, hi = 1.08) {
  const pos = geo.attributes.position;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = lerp(lo, hi, (pos.getY(i) - y0) / Math.max(1e-6, y1 - y0));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** A tiny grass tuft: five thin triangular blades fanned out and leaning, about 0.4 tall. */
function tuftGeometry() {
  const pos = [], col = [];
  const blades = [[0, 0.42, 0.2], [1.3, 0.30, 0.3], [2.5, 0.38, 0.22], [3.7, 0.28, 0.32], [5.0, 0.36, 0.25]]; // yaw, height, lean
  for (const [yaw, h, lean] of blades) {
    const c = Math.cos(yaw), sn = Math.sin(yaw), hw = 0.055;
    const tip = [c * lean * h * 1.2, h, sn * lean * h * 1.2];
    const l = [-sn * hw, 0, c * hw], r = [sn * hw, 0, -c * hw];
    for (const [v, k] of [[l, 0.62], [r, 0.62], [tip, 1.1]]) { pos.push(v[0], v[1], v[2]); col.push(k, k, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A low-poly pine: stacked, overlapping skirts that droop to a jagged, scalloped hem, narrowing
 * to a point at the top. Unit size: radius up to 1, height from y = -0.5 to 0.5.
 * Vertex colours darken toward each hem, so the tiers read as separate layers.
 */
function pineGeometry(tiers = 5, teeth = 9) {
  const pos = [], col = [];
  const n = teeth * 2;
  const rad = (i) => 1.0 - i * 0.17;                 // tier radii, bottom to top
  const step = 0.9 / tiers;                           // vertical spacing between tier hems
  const tri = (a, b, c, shades) => {
    for (const [v, k] of [[a, shades[0]], [b, shades[1]], [c, shades[2]]]) { pos.push(v[0], v[1], v[2]); col.push(k, k, k); }
  };
  for (let i = 0; i < tiers; i++) {
    const R = rad(i), yb = -0.5 + i * step, last = i === tiers - 1;
    const yt = last ? 0.5 : yb + step * 2.0;          // each tier reaches up behind the next
    const rt = last ? 0 : R * 0.3;
    const hem = [], neck = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const tooth = k % 2 === 0;
      const j = 0.9 + hash(i * 7.7 + k, k * 1.3 + i) * 0.2;       // each tooth a little different
      const r = R * (tooth ? 1.0 * j : 0.68);
      hem.push([Math.cos(a) * r, yb + (tooth ? -0.035 : 0.03) * (1 + R), Math.sin(a) * r]);
      neck.push([Math.cos(a) * rt, yt, Math.sin(a) * rt]);
    }
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const lo = 0.55, hi = 1.05; // hem darker, neck lighter
      tri(hem[k], hem[k2], neck[k], [lo, lo, hi]);
      if (!last) tri(hem[k2], neck[k2], neck[k], [lo, hi, hi]);
    }
    // underside: a dark flat skirt so the hem has thickness
    const c = [0, yb + 0.02, 0];
    for (let k = 0; k < n; k++) tri(c, hem[(k + 1) % n], hem[k], [0.35, 0.5, 0.5]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- house materials

let _tileTex = null;
/** Seamless roof-tile texture: staggered rows of rounded tiles with shaded edges. */
function tileTexture() {
  if (_tileTex) return _tileTex;
  const S = 256, cols = 8, rows = 10;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
  const tw = S / cols, th = S / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * th;
      const v = 190 + Math.floor(((r * 7 + k * 13) % 5) * 9); // slight tile-to-tile variation
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.moveTo(x + 1, y);
      g.lineTo(x + tw - 1, y);
      g.lineTo(x + tw - 1, y + th * 0.62);
      g.quadraticCurveTo(x + tw / 2, y + th * 1.18, x + 1, y + th * 0.62);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(40,30,30,0.55)'; g.lineWidth = 1.6; g.stroke(); // shadow line under each tile
    }
  }
  _tileTex = new THREE.CanvasTexture(c);
  _tileTex.wrapS = _tileTex.wrapT = THREE.RepeatWrapping;
  _tileTex.colorSpace = THREE.SRGBColorSpace;
  _tileTex.anisotropy = 8;
  return _tileTex;
}

const roofCache = new Map();
/** Tiled roof material in the given tint (standard material: catches light and shows relief). */
function roofMaterial(hex) {
  if (!roofCache.has(hex)) {
    const tex = tileTexture();
    roofCache.set(hex, new THREE.MeshStandardMaterial({
      color: hex, map: tex, bumpMap: tex, bumpScale: 2.2, roughness: 0.78, metalness: 0, envMapIntensity: 0.35,
    }));
  }
  return roofCache.get(hex);
}

/** A roof slab whose top-face UVs follow its real size, so tiles keep a constant scale. */
function slabGeometry(len, thick, span) {
  const g = new THREE.BoxGeometry(len, thick, span);
  const uv = g.attributes.uv;
  for (let i = 8; i < 16; i++) uv.setXY(i, uv.getX(i) * (len / 1.7), uv.getY(i) * (span / 1.7)); // +y and -y faces
  return g;
}

let _glassTex = null, _glassGlow = null;
function glassTextures() {
  if (_glassTex) return { map: _glassTex, glow: _glassGlow };
  const S = 128;
  const make = (draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // Glass: sky-blue gradient, diagonal reflection streaks, dark muntins and frame.
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
  // Night glow: warm lamplit panes, black where the muntins are.
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
function glassMaterial() {
  const { map, glow } = glassTextures();
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, map, metalness: 0.45, roughness: 0.1, envMapIntensity: 1.6,
    emissive: 0xffb84a, emissiveMap: glow, emissiveIntensity: 0,
  });
}

// ---------------------------------------------------------------- window light

let _glow = null;
/** Shared night-light pieces: a "four panes" light pattern for the ground and a soft shaft material. */
function glowKit() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.shadowColor = '#fff'; g.shadowBlur = 4; g.fillStyle = '#fff';
  // The pattern widens away from the wall (light spreads) and is split by the window's muntins.
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
  g.globalCompositeOperation = 'destination-in'; // fade out with distance from the wall
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

/** A faint cone of light from a window rectangle down onto its pool on the ground. */
function shaftGeometry(h) {
  const gy = -h + 0.26;
  const P = [
    [-0.37, 0.37, 0.06], [0.37, 0.37, 0.06], [0.37, -0.37, 0.06], [-0.37, -0.37, 0.06], // window: TL TR BR BL
    [-0.75, gy, 3.5], [0.75, gy, 3.5], [0.55, gy, 1.1], [-0.55, gy, 1.1],               // ground: far L/R, near R/L
  ];
  const B = [1, 1, 1, 1, 0.1, 0.1, 0.32, 0.32]; // brightest at the glass, fading toward the ground
  const idx = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(B.flatMap((b) => [b, b, b]), 3));
  geo.setIndex(idx);
  return geo;
}

// ---------------------------------------------------------------- buildings

const WALLS = ['#f6e3c0', '#f9d9b0', '#fbe9c8', '#f3d2c2', '#eadfc2', '#fdf0d8'];
const ROOFS = ['#e8692f', '#d9542b', '#f08a45', '#c94a2a', '#e07a3a'];
const SHUTTERS = ['#4f9a8a', '#7a5a9a', '#c45a4a', '#5a86c4', '#6aa84f'];

/**
 * A gable roof sitting on a wall block. The wall-coloured triangle fills the gable ends;
 * two slabs form the overhanging roof. Built with the ridge along local x, then yawed.
 */
function addGable(group, { cx, cz, len, span, base, rh, ov, ends = [ov, ov], yaw, wallMat, roofMat }) {
  const g = new THREE.Group();
  g.position.set(cx, base, cz);
  g.rotation.y = yaw;

  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(0, rh); shape.closePath();
  const tri = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  tri.rotateY(-Math.PI / 2);
  tri.translate(len / 2, 0, 0);
  g.add(new THREE.Mesh(tri, wallMat));

  const half = span / 2 + ov;
  const slope = Math.hypot(half, rh);
  const ang = Math.atan2(rh, half);
  const L = len + ends[0] + ends[1];
  const shift = (ends[1] - ends[0]) / 2;   // roof may overhang one gable end more than the other (or not at all)
  for (const s of [1, -1]) {
    const slab = new THREE.Mesh(slabGeometry(L, 0.16, slope + 0.05), roofMat);
    slab.position.set(shift, rh / 2 + 0.06, s * half / 2);
    slab.rotation.x = s * ang;
    g.add(slab);
  }
  // Ridge cap
  g.add(box(L, 0.14, 0.26, mat('#b8451f'), shift, rh + 0.1, 0));
  group.add(g);
}

function addWindow(group, x, y, z, yaw, glassMat, trim, shutterMat, withBox) {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.rotation.y = yaw;
  // Glass sits slightly *behind* a frame that stands proud of the wall, so the frame shades it.
  w.add(box(0.76, 0.76, 0.05, glassMat, 0, 0, -0.01));
  const T = 0.13, F = 0.14, out = 0.06;                       // frame width, depth, how far it stands out
  w.add(box(0.98, T, F, trim, 0, 0.5 - T / 2, out));          // top
  w.add(box(0.98, T, F, trim, 0, -0.5 + T / 2, out));         // bottom
  w.add(box(T, 0.98, F, trim, -0.5 + T / 2, 0, out));         // left
  w.add(box(T, 0.98, F, trim, 0.5 - T / 2, 0, out));          // right
  w.add(box(0.05, 0.76, 0.06, trim, 0, 0, out));              // vertical muntin
  w.add(box(0.76, 0.05, 0.06, trim, 0, 0, out));              // horizontal muntin
  w.add(box(1.18, 0.1, 0.3, trim, 0, -0.56, 0.1));            // projecting sill
  for (const s of [-1, 1]) w.add(box(0.3, 0.98, 0.07, shutterMat, s * 0.68, 0, 0.03));
  if (withBox) w.add(box(0.9, 0.2, 0.2, mat('#7a4a2c'), 0, -0.74, 0.14));
  group.add(w);

  // Night light: a shaft out of the glass and the window's four panes projected on the ground.
  const kit = glowKit();
  const lg = new THREE.Group();
  lg.position.set(x, y, z);
  lg.rotation.y = yaw;
  const shaft = new THREE.Mesh(shaftGeometry(y), kit.shaftMat);
  const decal = new THREE.Mesh(kit.decalGeo, kit.decalMat);
  decal.position.set(0, -y + 0.26, 2.2);
  shaft.renderOrder = decal.renderOrder = 2;
  shaft.userData.noShadow = decal.userData.noShadow = true; // light effects, not objects
  lg.add(shaft, decal);
  group.add(lg);
}

const WALL_GEO = (() => {              // unit box, darker toward the bottom (baked ground occlusion)
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = 0.7 + 0.3 * (pos.getY(i) + 0.5); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();
function wallBox(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(WALL_GEO, material);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  return m;
}

let _blob = null;
function blobTexture() {              // soft radial falloff, used for contact shadows
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

let _wash = null;
/** Light from four lamps along the top edge: bright pools just under each, fading down the face. */
function lampWashTexture() {
  if (_wash) return _wash;
  const W = 512, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  const vg = g.createLinearGradient(0, 0, 0, H);                       // general brightening toward the top
  vg.addColorStop(0, 'rgba(255,255,255,0.22)'); vg.addColorStop(0.6, 'rgba(255,255,255,0.04)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {                                        // lamp positions: x = 0.5 + (i - 1.5) * 0.26
    const cx = W * (0.5 + (i - 1.5) * 0.26);
    const rg = g.createRadialGradient(cx, 0, 4, cx, 0, W * 0.34);
    rg.addColorStop(0, 'rgba(255,255,255,0.6)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.translate(0, 0); g.scale(1, 0.9);
    g.fillStyle = rg; g.fillRect(cx - W * 0.3, 0, W * 0.6, H / 0.9);
    g.restore();
  }
  _wash = new THREE.CanvasTexture(c);
  _wash.colorSpace = THREE.SRGBColorSpace;
  return _wash;
}

function buildHouse(rand) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const w = 3.6 + rand() * 1.8, d = 3 + rand() * 1.2, h = 2.2 + rand() * 0.8;
  const wallHex = pick(WALLS);
  const wallMat = mat(wallHex, { vertexColors: true }), wallPlain = mat(wallHex); // plain one for the gable triangles
  const roofMat = roofMaterial(pick(ROOFS));
  const trim = mat('#fff8ea'), shutterMat = mat(pick(SHUTTERS));
  const glassMat = glassMaterial();
  const stone = mat('#b8b0a0');
  const doorSide = rand() < 0.5 ? -1 : 1;           // which side of the front wall the door is on
  const hasWing = rand() < 0.6;
  const wingSide = -doorSide;                       // the wing grows out of the side without the door
  const top = 0.35 + h;
  const rh = 1.3 + rand() * 0.8;
  let radius = Math.max(w / 2, d / 2 + 1.3) + 0.8;  // footprint radius used to keep plants and rocks clear

  g.add(box(w + 0.2, 1.6, d + 0.2, stone, 0, -0.45, 0)); // plinth reaches below ground, so no gaps on slopes
  g.add(wallBox(w, h, d, wallMat, 0, 0.35 + h / 2, 0));
  // soft contact shadow on the ground, and a band of shade under the eave on the front wall
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(w + 3.4, d + 3.4).rotateX(-Math.PI / 2), CONTACT_MAT);
  contact.position.y = 0.07;
  contact.renderOrder = 1;
  contact.userData.noShadow = true;
  g.add(contact);
  const eave = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.45), EAVE_MAT);
  eave.position.set(0, 0.35 + h - 0.225, d / 2 + 0.012);
  eave.userData.noShadow = true;
  g.add(eave);

  // Main roof. On the wing side it ends flush with the gable wall, so the wing's roof can meet it cleanly.
  const OV = 0.35;
  const ends = hasWing ? (wingSide > 0 ? [OV, 0] : [0, OV]) : [OV, OV];
  addGable(g, { cx: 0, cz: 0, len: w, span: d, base: top, rh, ov: OV, ends, yaw: 0, wallMat: wallPlain, roofMat });

  // Wing: lower, with its ridge kept just under the main eave and its eaves ending inside the main walls.
  if (hasWing) {
    const w2 = 2.2 + rand() * 1.0, d2 = d * (0.7 + rand() * 0.2), h2 = h * 0.82;
    const overlap = 0.3;                              // wing wall sinks this far into the main wall
    const cx = wingSide * (w / 2 + w2 / 2 - overlap), cz = -0.2 - rand() * 0.3;
    const rh2 = Math.min(rh * 0.8, Math.max(0.7, h - h2 + 0.35));
    g.add(box(w2 + 0.2, 1.6, d2 + 0.2, stone, cx, -0.45, cz));
    g.add(wallBox(w2, h2, d2, wallMat, cx, 0.35 + h2 / 2, cz));
    // inner eave overhang (0.15) is smaller than the overlap (0.3), so it stays hidden inside the main house
    addGable(g, { cx, cz, len: d2, span: w2, base: 0.35 + h2, rh: rh2, ov: 0.15, ends: [0.25, 0.25], yaw: Math.PI / 2, wallMat: wallPlain, roofMat });
    addWindow(g, cx + wingSide * 0.2, 1.55, cz + d2 / 2 + 0.03, 0, glassMat, trim, shutterMat, rand() < 0.5);
    addWindow(g, cx + wingSide * (w2 / 2 + 0.03), 1.55, cz, wingSide * Math.PI / 2, glassMat, trim, shutterMat, false);
    radius = Math.max(radius, w / 2 + w2 + 0.8, Math.abs(cz) + d2 / 2 + 1.2);
  }

  // Chimney: on the main ridge, clear of the wing
  const chX = (hasWing ? -wingSide : (rand() < 0.5 ? -1 : 1)) * w * 0.26;
  g.add(box(0.58, rh + 1.2, 0.58, mat('#b5543a'), chX, top + (rh + 1.2) / 2 - 0.2, -d * 0.12));
  g.add(box(0.74, 0.14, 0.74, mat('#8f3f2b'), chX, top + rh + 0.95, -d * 0.12));

  // Arched door with a matching arched frame
  const dx = doorSide * w * 0.22;
  const doorMat = mat(pick(['#9a4a2c', '#6a3a22', '#3f7f6f']));
  const doorBase = 0.35, doorH = 1.45, springY = doorBase + doorH;       // where the arch starts
  g.add(box(0.95, doorH + 0.05, 0.1, trim, dx, doorBase + (doorH + 0.05) / 2, d / 2 + 0.02));
  const archTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.1, 14, 1, false, -Math.PI / 2, Math.PI), trim);
  archTrim.rotation.x = -Math.PI / 2;
  archTrim.position.set(dx, springY, d / 2 + 0.02);
  g.add(archTrim);
  g.add(box(0.76, doorH, 0.12, doorMat, dx, doorBase + doorH / 2, d / 2 + 0.03));
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 14, 1, false, -Math.PI / 2, Math.PI), doorMat);
  arch.rotation.x = -Math.PI / 2;
  arch.position.set(dx, springY, d / 2 + 0.03);
  g.add(arch);
  g.add(box(1.5, 0.12, 1.1, stone, dx, 0.3, d / 2 + 0.55)); // doorstep

  // Windows: one on the front opposite the door (never overlapping it), and one in the end wall
  // that is NOT the wing's wall. Round attic window in the free gable.
  addWindow(g, -doorSide * w * 0.27, 1.65, d / 2 + 0.03, 0, glassMat, trim, shutterMat, rand() < 0.6);
  const freeSide = hasWing ? -wingSide : (rand() < 0.5 ? -1 : 1);
  addWindow(g, freeSide * (w / 2 + 0.03), 1.65, 0, freeSide * Math.PI / 2, glassMat, trim, shutterMat, false);
  if (!hasWing) addWindow(g, -freeSide * (w / 2 + 0.03), 1.65, 0, -freeSide * Math.PI / 2, glassMat, trim, shutterMat, false);
  const attic = new THREE.Group();
  attic.position.set(freeSide * (w / 2 + 0.02), top + rh * 0.34, 0);
  attic.rotation.y = freeSide * Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16), trim);
  ring.rotation.x = Math.PI / 2;
  const pane = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 16), glassMat);
  pane.rotation.x = Math.PI / 2;
  attic.add(ring, pane);
  g.add(attic);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = !o.userData.noShadow; } });
  return { group: g, glassMat, lightAnchor: new THREE.Vector3(0, 1.5, d / 2 + 1.4), radius, w, d };
}

/** A farm barn: red walls, dark gable roof, big double doors with white X bracing, a hay-loft hatch. */
function buildBarn() {
  const g = new THREE.Group();
  const w = 5.6, d = 3.9, h = 3.0, top = 0.35 + h, rh = 1.7;
  const red = '#b5402f';
  const wallMat = mat(red, { vertexColors: true }), plain = mat(red), trim = mat('#f6efdc'), stone = mat('#9c9588');
  g.add(box(w + 0.2, 1.6, d + 0.2, stone, 0, -0.45, 0));
  g.add(wallBox(w, h, d, wallMat, 0, 0.35 + h / 2, 0));
  addGable(g, { cx: 0, cz: 0, len: w, span: d, base: top, rh, ov: 0.4, yaw: 0, wallMat: plain, roofMat: roofMaterial('#4a3a36') });
  const fz = d / 2 + 0.03;
  g.add(box(2.3, 2.3, 0.1, trim, 0, 0.35 + 1.15, fz));                      // door frame
  g.add(box(2.0, 2.05, 0.12, mat('#8f3226'), 0, 0.35 + 1.05, fz + 0.02));   // doors
  for (const a of [0.74, -0.74]) {                                            // white X bracing
    const x = new THREE.Mesh(UNIT_BOX, trim);
    x.scale.set(2.5, 0.12, 0.05); x.rotation.z = a; x.position.set(0, 0.35 + 1.05, fz + 0.1);
    g.add(x);
  }
  g.add(box(1.9, 0.1, 0.06, trim, 0, 0.35 + 1.05, fz + 0.1));
  g.add(box(0.9, 0.7, 0.08, trim, 0, top + 0.5, fz - 0.03));                 // hatch frame in the gable
  g.add(box(0.7, 0.5, 0.1, mat('#3b2018'), 0, top + 0.5, fz));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, radius: Math.max(w, d) / 2 + 1.4, w, d };
}

/** A small windmill: tapered tower, red cap, and a four-bladed rotor that turns (see `rotor`). */
function buildWindmill() {
  const g = new THREE.Group();
  const stone = mat('#9c9588'), wall = mat('#f1e7cf'), roof = mat('#b5402f'), wood = mat('#8a6a46'), cloth = mat('#fbf6e6');
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.2, 8), stone)).position.y = 0.2;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.45, 5.2, 8), wall);
  tower.position.y = 3.4; g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.7, 8), roof);
  cap.position.y = 6.85; g.add(cap);
  const door = box(0.7, 1.2, 0.12, mat('#6b3a22'), 0, 1.2, 1.5); g.add(door);
  const rotor = new THREE.Group();
  rotor.position.set(0, 5.9, 1.2);
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8).rotateX(Math.PI / 2), wood));
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = k * Math.PI / 2 + 0.4;
    arm.add(box(0.14, 4.2, 0.1, wood, 0, 2.1, 0));                          // spar
    arm.add(box(0.8, 3.0, 0.04, cloth, 0.45, 2.3, 0.04));                   // sail
    for (let r = 0; r < 4; r++) arm.add(box(0.8, 0.05, 0.05, wood, 0.45, 0.9 + r * 0.72, 0.05)); // slats
    rotor.add(arm);
  }
  g.add(rotor);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, rotor, radius: 3.2 };
}

// ---------------------------------------------------------------- the world

/**
 * @param {THREE.Scene} scene
 * @param {Record<string, {title:string, teaser:string}>} sections
 * @param {{maxLights?: number, skyScene?: THREE.Scene}} [opts] maxLights caps real point lights
 *   (for weaker GPUs); skyScene is where clouds go (behind the title)
 */
// The sign face while its content is open: the section's colour with the accent stripe.
// (The readable text itself is real HTML laid exactly over the face by main.js.)
function drawOpenBoard(paper, accent) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576; // same size as the teaser face, so the stripe stays crisp
  const g = c.getContext('2d');
  g.fillStyle = paper; g.fillRect(0, 0, 1024, 576);
  void accent; // the coloured bar is a separate mesh (see setLayout), not part of this texture
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene, sections, opts = {}) {
  const maxLights = opts.maxLights ?? 14;
  const skyScene = opts.skyScene ?? scene; // clouds live on the layer behind the title text
  const low = !!opts.low;                  // weaker machine: fewer plants, coarser terrain
  const rand = rng(11);
  const pick = (a) => a[Math.floor(rand() * a.length)];

  const clouds = [];
  const boards = [];

  // ---- House sites: all along the path, alternating sides, on flattened plots ----
  // Keep plants and houses off every spot a sign can occupy (crest to desktop spot, desktop to stagger depth).
  const signSpots = Object.values(STOPS).map((s) => {
    const pts = [];
    for (const px of [s.hill.x, (s.hill.x + s.desk.x) / 2, s.desk.x]) for (const pz of [s.desk.z, s.stagger.z]) pts.push([px, pz]);
    return { pts, r: 9.5 * Math.max(s.scale, 0.8) };
  });
  const nearSign = (x, z, pad = 0) => signSpots.some((sp) => sp.pts.some(([px, pz]) => Math.hypot(x - px, z - pz) < sp.r + pad));
  const nearPond = (x, z, pad = 0) => Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.3 + pad;
  PADS.length = 0;
  const sites = [];
  [-8, -16, -24, -32, -40, -48].forEach((z0, i) => {
    const z = z0 + (rand() - 0.5) * 2.5;
    const side = i % 2 === 0 ? -1 : 1;
    const slope = pathX(z + 0.5) - pathX(z - 0.5);            // dx/dz of the path
    const k = Math.sqrt(1 + slope * slope);
    const nx = 1 / k, nz = -slope / k;                         // unit normal to the path
    const perp = 7.2 + rand() * 1.4;                           // distance from the path's centre line
    const x = pathX(z) + side * perp * nx, zz = z + side * perp * nz;
    if (nearSign(x, zz) || nearPond(x, zz, 4)) return;
    const site = { x, z: zz, fx: -side * nx, fz: -side * nz, perp, y: rawHeight(x, zz) };
    sites.push(site);
    PADS.push({ x, z: zz, r: 7.6, y: site.y });
  });

  // ---- Hamlets on the left and right slopes, each on its own winding path off the main one ----
  const curve = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))).getPoints(80).map((v) => [v.x, v.z]);
  const branches = [
    curve([[pathX(4), 4], [-9, 2], [-17, -2], [-23, -7], [-29, -12], [-36, -17], [-43, -23]]),   // left, ends at the windmill
    curve([[pathX(2), 2], [9, 1], [17, -2], [24, -6], [30, -11], [36, -9], [41, -5]]),             // right, ends at the barn
  ];
  const farm = [];                                          // barn / windmill, built later
  const tangent = (b, i) => { const a = b[Math.max(0, i - 1)], c = b[Math.min(b.length - 1, i + 1)]; const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  [[0, 0.46, 1], [0, 0.7, -1], [1, 0.42, -1], [1, 0.66, 1]].forEach(([bi, u, side]) => {
    const b = branches[bi], i = Math.round(u * (b.length - 1)), [tx, tz] = tangent(b, i);
    const nx = -tz, nz = tx, perp = 6.0;
    const x = b[i][0] + side * nx * perp, zz = b[i][1] + side * nz * perp;
    if (nearPond(x, zz, 3) || nearSign(x, zz)) return;
    const site = { x, z: zz, fx: -side * nx, fz: -side * nz, perp, y: rawHeight(x, zz), hamlet: true };
    sites.push(site);
    PADS.push({ x, z: zz, r: 6.0, y: site.y });
  });
  { // windmill at the end of the left path (on the flank hill), barn at the end of the right path
    const wb = branches[0][branches[0].length - 1], bb = branches[1][branches[1].length - 1];
    const by = rawHeight(bb[0] + 2, bb[1] - 1);
    // Windmill: on the slope behind and between the creativity and AI signs, so it never covers a billboard.
    const WMX = -23, WMZ = -92, wy = rawHeight(WMX, WMZ);
    farm.push({ kind: 'windmill', x: WMX, z: WMZ, y: wy });
    PADS.push({ x: WMX, z: WMZ, r: 5, y: wy });
    // The left path now ends at one more cottage, facing back down the path.
    { const [tx, tz] = tangent(branches[0], branches[0].length - 3);
      const hx = wb[0] - tx * 1.5 + tz * 4.5, hz = wb[1] - tz * 1.5 - tx * 4.5;
      if (!nearPond(hx, hz, 3) && !nearSign(hx, hz)) {
        const site = { x: hx, z: hz, fx: tz * -1 + 0, fz: tx * 1, perp: 4.5, y: rawHeight(hx, hz), hamlet: true };
        sites.push(site); PADS.push({ x: hx, z: hz, r: 6, y: site.y });
      } }
    farm.push({ kind: 'barn', x: bb[0] + 2.5, z: bb[1] - 1, y: by, rot: Math.atan2(-(bb[0] + 2.5), 22 - (bb[1] - 1)) + 0.5 });
    PADS.push({ x: bb[0] + 2.5, z: bb[1] - 1, r: 5.5, y: by });
  }
  const distToPolyline = (x, z, pts) => {                   // for painting the branch paths on the ground
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
      const abx = bx - ax, abz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
      best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)));
    }
    return best;
  };
  const branchBox = branches.map((b) => ({ x0: Math.min(...b.map((p) => p[0])) - 4, x1: Math.max(...b.map((p) => p[0])) + 4, z0: Math.min(...b.map((p) => p[1])) - 4, z1: Math.max(...b.map((p) => p[1])) + 4 }));

  // Water level: a little below the average ground height on a ring around the pond.
  let ringSum = 0;
  for (let k = 0; k < 8; k++) ringSum += rawHeight(POND.x + Math.cos(k * 0.785) * POND.r * 1.4, POND.z + Math.sin(k * 0.785) * POND.r * 1.4);
  const WATER_Y = ringSum / 8 - 0.5;

  // ---- Terrain: height + colour with fields, mud, rocky slopes, shore sand and the path ----
  const SEG = low ? [190, 125] : [380, 250];
  const geo = new THREE.PlaneGeometry(380, 250, SEG[0], SEG[1]);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -75);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cLow = new THREE.Color('#55ad5a'), cHigh = new THREE.Color('#c9ee9a');
  const cWarm = new THREE.Color('#e2ea8a'), cPath = new THREE.Color('#f1e5c6'), cDeep = new THREE.Color('#3f9a58');
  const cGold = new THREE.Color('#e3dc72'), cCrop = new THREE.Color('#8fcd5d'), cDirt = new THREE.Color('#a68a5b');
  const cRock = new THREE.Color('#a39b86'), cSand = new THREE.Color('#ead9a4'), cBed = new THREE.Color('#3d8f86');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = heightAt(x, z);
    p.setY(i, h);
    const slope = (Math.abs(heightAt(x + 1.2, z) - h) + Math.abs(heightAt(x, z + 1.2) - h)) / 1.2;
    const t = THREE.MathUtils.clamp((h + 3) / 16, 0, 1);
    c.copy(cLow).lerp(cHigh, t);
    c.lerp(cDeep, smooth(0.25, 0, t) * 0.5);
    c.lerp(cWarm, smooth(0.52, 0.78, fbm(x * 0.05 + 40, z * 0.05)) * 0.65);

    // Patchwork fields on gentle ground in the middle distance, with mown stripes.
    const gx = Math.floor((x + 300) / 15), gz = Math.floor((z + 300) / 19);
    if (z < -14 && z > -92 && hash(gx * 3.1, gz * 1.7) > 0.58 && Math.abs(x - pathX(z)) > 6) {
      const stripe = 0.5 + 0.5 * Math.sin(x * 1.9 + gz * 2.0);
      c.lerp(hash(gx, gz) > 0.78 ? cGold : cCrop, (0.3 + 0.25 * stripe) * (1 - smooth(0.3, 0.7, slope)));
    }
    c.lerp(cDirt, smooth(0.78, 0.9, vnoise(x * 0.3 + 90, z * 0.3)) * 0.55);  // bare earth patches
    c.lerp(cRock, smooth(0.5, 1.1, slope) * 0.75);                           // steep ground is rocky
    c.offsetHSL(0, 0, (hash(x * 7.1, z * 5.3) - 0.5) * 0.06);                // fine grass grain

    // Pond shore: sand above the waterline, dark bed below it.
    const dp = Math.hypot(x - POND.x, z - POND.z);
    c.lerp(cSand, (1 - smooth(WATER_Y + 0.1, WATER_Y + 0.9, h)) * (1 - smooth(POND.r * 1.3, POND.r * 2.1, dp)) * 0.9);
    c.lerp(cBed, smooth(WATER_Y, WATER_Y - 1.4, h) * 0.7);

    const onPath = 1 - smooth(1.5, 3.1, Math.abs(x - pathX(z)));
    let walk = 0; // short footpath from each front door to the main path
    for (const st of sites) {
      const ax = st.x + st.fx * 3.2, az = st.z + st.fz * 3.2;
      const bx = st.x + st.fx * st.perp, bz = st.z + st.fz * st.perp;
      const abx = bx - ax, abz = bz - az;
      const tt = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
      walk = Math.max(walk, 1 - smooth(0.6, 1.5, Math.hypot(x - (ax + abx * tt), z - (az + abz * tt))));
    }
    let branch = 0;
    branches.forEach((b, bi) => {
      const bx = branchBox[bi];
      if (x < bx.x0 || x > bx.x1 || z < bx.z0 || z > bx.z1) return;
      branch = Math.max(branch, 1 - smooth(0.8, 1.9, distToPolyline(x, z, b)));
    });
    c.lerp(cPath, Math.max(onPath, walk, branch) * (1 - smooth(-60, -80, z)) * 0.95); // path dissolves on the AI hill
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Pond water: glossy, picks up the sky through the environment map.
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r * 1.6, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4fb0d4, roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.8, envMapIntensity: 1.8 }),
  );
  water.position.set(POND.x, WATER_Y, POND.z);
  scene.add(water);

  // ---- Village: cottages along the path ----
  const houses = []; // { x, z, r }
  const windowMats = [];
  const houseLights = [];
  const houseCap = Math.min(6, Math.max(1, maxLights - 3));
  const LIGHT_COLOR = 0xffb35a;

  // Anything that is a plant or a rock must stay outside every house's footprint.
  const nearHouse = (x, z, pad = 1.5) => houses.some((hh) => Math.hypot(x - hh.x, z - hh.z) < hh.r + pad);
  for (const st of sites) {
    const hs = buildHouse(rand);
    const sc = 0.95 + rand() * 0.3;
    hs.group.scale.setScalar(sc);
    hs.group.position.set(st.x, st.y, st.z);
    hs.group.rotation.y = Math.atan2(st.fx, st.fz) + (rand() - 0.5) * 0.12; // front door faces the path
    scene.add(hs.group);
    houses.push({ x: st.x, z: st.z, r: hs.radius * sc, w: hs.w * sc, d: hs.d * sc, rot: hs.group.rotation.y });
    windowMats.push(hs.glassMat);
    if (houseLights.length < houseCap) {
      const light = new THREE.PointLight(LIGHT_COLOR, 0, 11, 1.6);
      hs.group.updateMatrixWorld(true);
      light.position.copy(hs.lightAnchor).applyMatrix4(hs.group.matrixWorld);
      scene.add(light);
      houseLights.push(light);
    }
  }

  // Barn, windmill and a few hay bales
  const windmills = [];
  for (const f of farm) {
    if (f.kind === 'barn') {
      const bn = buildBarn();
      bn.group.position.set(f.x, f.y, f.z);
      bn.group.rotation.y = f.rot;
      scene.add(bn.group);
      houses.push({ x: f.x, z: f.z, r: bn.radius, w: bn.w, d: bn.d, rot: f.rot });
      const bale = new THREE.CylinderGeometry(0.55, 0.55, 0.9, 12);
      const baleMat = mat('#d8b85a');
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(bale, baleMat);
        const a = f.rot + 0.9 + k * 0.5, r = bn.radius + 0.6 + (k % 2) * 0.7;
        const bx = f.x + Math.sin(a) * r, bz = f.z + Math.cos(a) * r;
        m.position.set(bx, heightAt(bx, bz) + 0.5, bz);
        m.rotation.set(Math.PI / 2, rand() * 3, 0);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      }
    } else {
      const wm = buildWindmill();
      wm.group.position.set(f.x, f.y - 0.5, f.z);
      wm.group.scale.setScalar(1.8);                                      // far away, so bigger than a village building
      wm.group.rotation.y = Math.atan2(-f.x, 22 - f.z) - 0.25;           // face roughly toward the viewer
      scene.add(wm.group);
      windmills.push(wm.rotor);
      houses.push({ x: f.x, z: f.z, r: wm.radius * 1.8, w: 3.2, d: 3.2, rot: 0 });
    }
  }

  // ---- Vegetation and props (instanced) ----
  const items = {
    trunk: [], flare: [], lobe: [], leaf: [], fruit: [], cypress: [], pine: [], bush: [], berry: [],
    rock: [], grass: [], stem: [], head: [], dot: [], spike: [], fern: [], mushStem: [], mushCap: [],
    log: [], reed: [], reedTop: [], lily: [], post: [], rail: [],
  };
  const GREENS = ['#5cb85c', '#6cc96a', '#4aa857', '#7fd070', '#8fcf5a'].map((h) => new THREE.Color(h));
  const FALL = ['#ff9a4a', '#ffc94a', '#f2703c', '#ffd966'].map((h) => new THREE.Color(h));
  const DARK = ['#3f9a5a', '#4aa862', '#36895a'].map((h) => new THREE.Color(h));
  const BLOSSOM = new THREE.Color('#ffb3c8');
  const BARK = new THREE.Color('#8a5a3c'), BIRCH = new THREE.Color('#e8e2d2');
  const free = (x, z, pad = 0) => !nearSign(x, z) && !nearHouse(x, z, 1.2 + pad) && !nearPond(x, z, pad - 1.5);
  const D = low ? 0.55 : 1; // detail multiplier: weaker machines get fewer plants
  const anchors = []; // things grass gathers around: { x, z, r (footprint radius), n (tuft count) }

  /** A trunk-and-branches pair: a branch leans out from the trunk into the canopy. */
  function branch(x, y, z, s, lenMul = 1) {
    const a = rand() * 6.28, tilt = 0.55 + rand() * 0.4, len = (1.0 + rand() * 0.5) * s * lenMul;
    items.trunk.push({
      p: [x - Math.sin(tilt) * Math.cos(a) * len * 0.5, y + Math.cos(tilt) * len * 0.5, z + Math.sin(tilt) * Math.sin(a) * len * 0.5],
      s: [0.09 * s, len, 0.09 * s], ry: a, rz: tilt,
    });
  }

  function addTree(x, z, s, force) {
    const y = heightAt(x, z);
    anchors.push({ x, z, r: 0.55 * s, n: 7 });
    const kind = force ?? rand();
    if (kind < 0.4) { // round oak / apple / blossom tree: trunk, root flare, branches, lobes, leaf tufts
      items.trunk.push({ p: [x, y + 0.95 * s, z], s: [0.3 * s, 1.9 * s, 0.3 * s] });
      items.flare.push({ p: [x, y + 0.2 * s, z], s: [0.6 * s, 0.55 * s, 0.6 * s] });
      branch(x, y + 1.7 * s, z, s); branch(x, y + 1.9 * s, z, s);
      const roll = rand();
      const base = roll < 0.18 ? pick(FALL) : roll < 0.3 ? BLOSSOM : pick(GREENS);
      const lobes = [];
      const n = 4 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const a = rand() * 6.28, r = (k === 0 ? 0 : 0.95) * s;
        const ls = (1.1 + rand() * 0.7) * s;
        const L = { x: x + Math.cos(a) * r, y: y + (2.7 + rand() * 1.1) * s, z: z + Math.sin(a) * r, r: ls };
        lobes.push(L);
        items.lobe.push({
          p: [L.x, L.y, L.z], s: [ls, ls * (0.85 + rand() * 0.2), ls],
          c: base.clone().offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.06),
        });
      }
      // leaf tufts break up the smooth outline of the canopy
      for (let k = 0; k < 9; k++) {
        const L = lobes[Math.floor(rand() * lobes.length)];
        const th = rand() * 6.28, ph = Math.acos(rand() * 1.4 - 0.5);
        const ts = (0.3 + rand() * 0.28) * s;
        items.leaf.push({
          p: [L.x + Math.sin(ph) * Math.cos(th) * L.r * 0.92, L.y + Math.cos(ph) * L.r * 0.8, L.z + Math.sin(ph) * Math.sin(th) * L.r * 0.92],
          s: [ts, ts * 0.85, ts], c: base.clone().offsetHSL(0, 0.04, 0.05 + rand() * 0.07),
        });
      }
      if (roll >= 0.3 && rand() < 0.35) { // apple tree: red fruit among the leaves
        const fc = pick([new THREE.Color('#e2402f'), new THREE.Color('#f0883a'), new THREE.Color('#d9344a')]);
        for (let k = 0; k < 6; k++) {
          const L = lobes[Math.floor(rand() * lobes.length)];
          const th = rand() * 6.28;
          items.fruit.push({ p: [L.x + Math.cos(th) * L.r * 0.8, L.y - L.r * 0.3 + rand() * L.r * 0.5, L.z + Math.sin(th) * L.r * 0.8], s: [0.13 * s, 0.13 * s, 0.13 * s], c: fc });
        }
      }
    } else if (kind < 0.66) { // tall cypress, sometimes with a smaller companion
      items.trunk.push({ p: [x, y + 0.5 * s, z], s: [0.25 * s, 1.0 * s, 0.25 * s] });
      const hgt = (3 + rand() * 2.2) * s;
      items.cypress.push({ p: [x, y + hgt * 0.9, z], s: [(0.8 + rand() * 0.35) * s, hgt, (0.8 + rand() * 0.35) * s], c: pick(DARK) });
      if (rand() < 0.4) items.cypress.push({ p: [x + 1.0 * s, heightAt(x + s, z) + hgt * 0.35, z + 0.4 * s], s: [0.55 * s, hgt * 0.5, 0.55 * s], c: pick(DARK) });
    } else if (kind < 0.84) { // layered pine: one jagged, drooping, multi-tier shape
      items.trunk.push({ p: [x, y + 0.7 * s, z], s: [0.3 * s, 1.4 * s, 0.3 * s] });
      const H = (4.6 + rand() * 1.4) * s, R = (1.55 + rand() * 0.4) * s;
      items.pine.push({ p: [x, y + 0.9 * s + H / 2, z], s: [R, H, R], ry: rand() * 6.28, c: pick(DARK).clone().offsetHSL(0, 0.02, 0.02) });
    } else { // slender birch with a bright canopy and a couple of branches
      items.trunk.push({ p: [x, y + 1.5 * s, z], s: [0.2 * s, 3.0 * s, 0.2 * s], c: BIRCH });
      branch(x, y + 2.4 * s, z, s, 0.8);
      const col = rand() < 0.5 ? pick(FALL) : pick(GREENS);
      for (let k = 0; k < 4; k++) {
        const ls = (0.8 + rand() * 0.4) * s;
        items.lobe.push({ p: [x + (rand() - 0.5) * 0.9 * s, y + (3.3 + k * 0.5) * s, z + (rand() - 0.5) * 0.9 * s], s: [ls, ls * 1.2, ls], c: col.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.08) });
      }
    }
    // Undergrowth at the foot of the tree: ferns, mushrooms, now and then a fallen log.
    if (rand() < 0.55) {
      for (let k = 0; k < 4; k++) {
        const a = rand() * 6.28, r = (0.9 + rand() * 0.9) * s;
        const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
        for (let f = 0; f < 5; f++) {
          const fa = (f / 5) * 6.28;
          items.fern.push({ p: [fx, heightAt(fx, fz) + 0.22, fz], s: [0.8, 0.8, 0.8], ry: fa, rz: 0.95, c: pick(DARK).clone().offsetHSL(0, 0, 0.06) });
        }
      }
    }
    if (rand() < 0.25) {
      for (let k = 0; k < 3; k++) {
        const a = rand() * 6.28, r = (0.7 + rand() * 0.6) * s;
        const mx = x + Math.cos(a) * r, mz = z + Math.sin(a) * r, my = heightAt(mx, mz);
        const ms = 0.7 + rand() * 0.7;
        items.mushStem.push({ p: [mx, my + 0.09 * ms, mz], s: [ms, ms, ms], c: new THREE.Color('#f3ecd8') });
        const cap = pick([new THREE.Color('#d8342a'), new THREE.Color('#e8832a'), new THREE.Color('#b87a4b')]);
        items.mushCap.push({ p: [mx, my + 0.17 * ms, mz], s: [0.15 * ms, 0.11 * ms, 0.15 * ms], c: cap });
        if (cap.r > 0.6) for (let d = 0; d < 3; d++) items.dot.push({ p: [mx + (rand() - 0.5) * 0.1 * ms, my + 0.23 * ms, mz + (rand() - 0.5) * 0.1 * ms], s: [0.03 * ms, 0.02 * ms, 0.03 * ms], c: new THREE.Color('#ffffff') });
      }
    }
    if (rand() < 0.12) items.log.push({ p: [x + 1.6 * s, heightAt(x + 1.6 * s, z) + 0.2, z + 0.5 * s], s: [0.24, 1.4 + rand() * 1.0, 0.24], rx: Math.PI / 2, ry: rand() * 6.28, c: BARK });
  }

  function addBush(x, z, s) {
    const y = heightAt(x, z);
    anchors.push({ x, z, r: 0.75 * s, n: 5 });
    const col = pick(GREENS);
    items.bush.push({ p: [x, y + 0.4 * s, z], s: [s * 1.1, s * 0.8, s * 1.1], c: col });
    if (rand() < 0.5) items.bush.push({ p: [x + 0.5 * s, heightAt(x + 0.5 * s, z) + 0.28 * s, z + 0.2 * s], s: [s * 0.7, s * 0.55, s * 0.7], c: col.clone().offsetHSL(0, 0, -0.04) });
    if (rand() < 0.4) { // berries
      const bc = pick([new THREE.Color('#c93a4a'), new THREE.Color('#7a4bb0'), new THREE.Color('#3a63c9')]);
      for (let k = 0; k < 6; k++) {
        const th = rand() * 6.28, ph = Math.acos(rand() * 0.9);
        items.berry.push({ p: [x + Math.sin(ph) * Math.cos(th) * s * 1.0, y + 0.4 * s + Math.cos(ph) * s * 0.75, z + Math.sin(ph) * Math.sin(th) * s * 1.0], s: [0.07, 0.07, 0.07], c: bc });
      }
    }
  }

  // Forest clusters (denser where noise is high); clear of the path, houses, signs and pond.
  let placedTrees = 0, guard = 0;
  const treeTarget = Math.round(165 * D);
  while (placedTrees < treeTarget && guard++ < 9000) {
    const x = (rand() - 0.5) * 220, z = -150 + rand() * 175;
    if (z > -6 && Math.abs(x) < 30) continue;                     // open meadow in front of the camera
    if (Math.abs(x - pathX(z)) < 4.5 && z > -80) continue;        // keep the path clear
    if (!free(x, z, 2)) continue;
    const dens = fbm(x * 0.045 + 5, z * 0.045);
    if (dens < 0.46 && rand() < 0.8) continue;
    addTree(x, z, 0.75 + rand() * 0.75);
    placedTrees++;
  }
  // Garden: trees, bushes, hedges and lavender just outside each house's footprint.
  for (const hh of houses) {
    for (let k = 0; k < 6; k++) {
      const a = rand() * 6.28, r = hh.r + 0.8 + rand() * 2.8;
      const x = hh.x + Math.cos(a) * r, z = hh.z + Math.sin(a) * r;
      if (Math.abs(x - pathX(z)) < 3.2 || !free(x, z)) continue;
      const roll = rand();
      if (roll < 0.28) addTree(x, z, 0.55 + rand() * 0.4);
      else if (roll < 0.7) addBush(x, z, 0.5 + rand() * 0.45);
      else { // a short hedge row
        const ha = rand() * 6.28;
        for (let q = 0; q < 4; q++) {
          const hx = x + Math.cos(ha) * q * 0.75, hz = z + Math.sin(ha) * q * 0.75;
          if (!free(hx, hz)) continue;
          items.bush.push({ p: [hx, heightAt(hx, hz) + 0.32, hz], s: [0.62, 0.58, 0.62], c: GREENS[1] });
        }
      }
    }
  }
  // Path edge: bushes, lavender, ferns, little edging stones.
  for (let z = 24; z > -62; z -= 1.3 + rand() * 2.0) {
    const px = pathX(z);
    for (const side of [-1, 1]) {
      if (rand() < 0.45) {
        const x = px + side * (3.2 + rand() * 2.4);
        if (free(x, z)) addBush(x, z, 0.45 + rand() * 0.6);
      }
      if (rand() < 0.35) { // lavender clump
        const lx = px + side * (2.5 + rand() * 1.2);
        if (free(lx, z)) for (let q = 0; q < 6; q++) {
          const ox = lx + (rand() - 0.5) * 0.7, oz = z + (rand() - 0.5) * 0.7;
          items.spike.push({ p: [ox, heightAt(ox, oz) + 0.3, oz], s: [1, 0.7 + rand() * 0.6, 1], rz: (rand() - 0.5) * 0.25, c: pick([new THREE.Color('#8f6ad8'), new THREE.Color('#a47be6'), new THREE.Color('#7a55c4')]) });
        }
      }
      // edging stones either side of the path
      const sx = px + side * (1.9 + rand() * 0.35);
      if (rand() < 0.8 && z > -60) items.rock.push({ p: [sx, heightAt(sx, z) + 0.06, z], s: [0.22 + rand() * 0.18, 0.12, 0.2 + rand() * 0.14], ry: rand() * 6.28, c: new THREE.Color().setHSL(0.1, 0.05, 0.6 + rand() * 0.15) });
    }
  }
  // Rocks scattered about, a few piled in clusters
  for (let i = 0; i < Math.round(60 * D); i++) {
    const x = (rand() - 0.5) * 160, z = -90 + rand() * 110;
    if (Math.abs(x - pathX(z)) < 3 || !free(x, z, 1)) continue;
    const n = rand() < 0.35 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const s = (0.35 + rand() * 0.85) * (k ? 0.65 : 1);
      const rx = x + (rand() - 0.5) * 1.4 * (n - 1), rz = z + (rand() - 0.5) * 1.4 * (n - 1);
      items.rock.push({ p: [rx, heightAt(rx, rz) + s * 0.22, rz], s: [s * 1.2, s * 0.7, s], ry: rand() * 6.28, c: new THREE.Color().setHSL(0.1, 0.06, 0.5 + rand() * 0.2) });
    }
  }
  // Wildflowers: stems with heads of several kinds, in drifts of one colour with a few strays
  const PALETTE = [
    { kind: 'daisy', c: '#ffffff' }, { kind: 'daisy', c: '#fff3b0' }, { kind: 'poppy', c: '#e8402f' },
    { kind: 'tulip', c: '#ff7aa8' }, { kind: 'tulip', c: '#ffd23f' }, { kind: 'spike', c: '#8f6ad8' },
    { kind: 'sun', c: '#ffc928' }, { kind: 'daisy', c: '#ffb36b' },
  ];
  const STEM = new THREE.Color('#4f9a47');
  for (let k = 0; k < Math.round(22 * D); k++) {
    const cx = (rand() - 0.5) * 100, cz = -38 + rand() * 66;
    const base = pick(PALETTE);
    const count = Math.round((18 + rand() * 16));
    for (let i = 0; i < count; i++) {
      const x = cx + (rand() - 0.5) * 9, z = cz + (rand() - 0.5) * 9;
      if (Math.abs(x - pathX(z)) < 2.4 || nearHouse(x, z, 0.5) || nearSign(x, z, -3) || nearPond(x, z, -1.5)) continue;
      const f = rand() < 0.8 ? base : pick(PALETTE);
      const y = heightAt(x, z), col = new THREE.Color(f.c);
      const ht = f.kind === 'sun' ? 1.0 + rand() * 0.35 : f.kind === 'spike' ? 0.55 : 0.32 + rand() * 0.28;
      items.stem.push({ p: [x, y + ht / 2, z], s: [1, ht, 1], rz: (rand() - 0.5) * 0.15, c: STEM });
      if (f.kind === 'daisy') {
        items.head.push({ p: [x, y + ht + 0.02, z], s: [0.12, 0.035, 0.12], c: col });
        items.dot.push({ p: [x, y + ht + 0.05, z], s: [0.045, 0.03, 0.045], c: new THREE.Color('#f4b400') });
      } else if (f.kind === 'poppy') {
        items.head.push({ p: [x, y + ht + 0.03, z], s: [0.13, 0.05, 0.13], c: col });
        items.dot.push({ p: [x, y + ht + 0.07, z], s: [0.04, 0.03, 0.04], c: new THREE.Color('#2b1a14') });
      } else if (f.kind === 'tulip') {
        items.head.push({ p: [x, y + ht + 0.07, z], s: [0.07, 0.11, 0.07], c: col });
      } else if (f.kind === 'spike') {
        items.spike.push({ p: [x, y + ht + 0.12, z], s: [1.2, 0.9, 1.2], c: col });
      } else { // sunflower: big disc, dark centre
        items.head.push({ p: [x, y + ht + 0.03, z], s: [0.24, 0.05, 0.24], rx: 0.5, c: col });
        items.dot.push({ p: [x, y + ht + 0.07, z], s: [0.1, 0.05, 0.1], c: new THREE.Color('#4a2c14') });
      }
    }
  }
  // Pond life: reeds with brown heads around the shore, lily pads with a few lotus flowers
  for (let k = 0; k < Math.round(46 * D); k++) {
    const a = rand() * 6.28, r = POND.r * (0.95 + rand() * 0.5);
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    const gy = heightAt(x, z);
    if (gy < WATER_Y - 0.5 || gy > WATER_Y + 1.1) continue;
    for (let q = 0; q < 3; q++) {
      const ox = x + (rand() - 0.5) * 0.5, oz = z + (rand() - 0.5) * 0.5, ht = 1.0 + rand() * 0.9;
      items.reed.push({ p: [ox, gy + ht / 2, oz], s: [1, ht, 1], rz: (rand() - 0.5) * 0.18, c: new THREE.Color('#6fa24a') });
      if (rand() < 0.6) items.reedTop.push({ p: [ox, gy + ht + 0.1, oz], s: [1, 1, 1], c: new THREE.Color('#6b4a2b') });
    }
  }
  for (let k = 0; k < Math.round(16 * D); k++) {
    const a = rand() * 6.28, r = rand() * POND.r * 0.75;
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r;
    items.lily.push({ p: [x, WATER_Y + 0.05, z], s: [0.7 + rand() * 0.6, 1, 0.7 + rand() * 0.6], ry: rand() * 6.28, c: pick(GREENS).clone().offsetHSL(0, 0, -0.05) });
    if (rand() < 0.3) items.head.push({ p: [x, WATER_Y + 0.14, z], s: [0.14, 0.09, 0.14], c: new THREE.Color('#ff9fc2') });
  }
  // Rocks around the pond edge
  for (let k = 0; k < Math.round(14 * D); k++) {
    const a = rand() * 6.28, r = POND.r * (1.1 + rand() * 0.45);
    const x = POND.x + Math.cos(a) * r, z = POND.z + Math.sin(a) * r, s = 0.3 + rand() * 0.6;
    items.rock.push({ p: [x, heightAt(x, z) + s * 0.2, z], s: [s * 1.2, s * 0.65, s], ry: rand() * 6.28, c: new THREE.Color().setHSL(0.1, 0.05, 0.5 + rand() * 0.2) });
  }
  // Grass: small, simple tufts (3 flat blades each). A light scatter over the meadow, and
  // thick rings gathered at the base of houses, trees, bushes and rocks, like the reference.
  function tuft(x, z, s = 1) {
    if (Math.abs(x - pathX(z)) < 1.7 || nearPond(x, z, -1.5)) return;
    items.grass.push({
      p: [x, heightAt(x, z) - 0.02, z], s: [s, s * (0.75 + rand() * 0.5), s], ry: rand() * 6.28,
      c: pick(GREENS).clone().offsetHSL(0, 0, -0.06 + rand() * 0.1),
    });
  }
  for (let i = 0; i < Math.round(420 * D); i++) {
    const x = (rand() - 0.5) * 120, z = -50 + rand() * 82;
    if (nearHouse(x, z, 0.6)) continue;
    tuft(x, z, 0.7 + rand() * 0.4);
  }
  for (const hh of houses) {                                 // houses: grass hugging the foot of the walls
    const c = Math.cos(hh.rot), sn = Math.sin(hh.rot);
    for (let k = 0; k < Math.round(90 * D); k++) {
      // a point just outside the main body's rectangle, in the house's own frame
      const per = rand() * 2 * (hh.w + hh.d);
      let lx, lz;
      if (per < hh.w) { lx = per - hh.w / 2; lz = hh.d / 2; }
      else if (per < hh.w + hh.d) { lx = hh.w / 2; lz = per - hh.w - hh.d / 2; }
      else if (per < 2 * hh.w + hh.d) { lx = per - hh.w - hh.d - hh.w / 2; lz = -hh.d / 2; }
      else { lx = -hh.w / 2; lz = per - 2 * hh.w - hh.d - hh.d / 2; }
      const out = 0.25 + rand() * rand() * 1.1;                // most hug the wall, a few straggle outward
      const nx = Math.abs(lz) > Math.abs(lx) * 0.6 && Math.abs(lz) >= hh.d / 2 - 1e-6 ? 0 : Math.sign(lx);
      const nz = nx === 0 ? Math.sign(lz) : 0;
      lx += nx * out; lz += nz * out;
      tuft(hh.x + lx * c + lz * sn, hh.z - lx * sn + lz * c, 0.85 + rand() * 0.5);
    }
  }
  for (const an of anchors) {                                // trees and bushes: a tight ring at the roots
    for (let k = 0; k < Math.round(an.n * D) + 2; k++) {
      const a = rand() * 6.28, r = an.r * (0.8 + rand() * 1.1);
      tuft(an.x + Math.cos(a) * r, an.z + Math.sin(a) * r, 0.65 + rand() * 0.45);
    }
  }
  for (const rk of items.rock) {                             // rocks: grass hugging the foot of each stone
    const size = Math.max(rk.s[0], rk.s[2]);
    if (size < 0.3) continue;
    for (let k = 0; k < Math.round(7 * D) + 2; k++) {
      const a = rand() * 6.28, r = size * (0.8 + rand() * 0.7);
      tuft(rk.p[0] + Math.cos(a) * r, rk.p[2] + Math.sin(a) * r, 0.6 + rand() * 0.45);
    }
  }

  // A couple of short wooden fences beside the path
  for (const [zA, zB, side] of [[2, -8, 1], [-20, -30, -1]]) {
    let prev = null;
    for (let z = zA; z > zB; z -= 1.5) {
      const x = pathX(z) + side * 3.9;
      if (!free(x, z, -0.5)) { prev = null; continue; }
      const P = [x, heightAt(x, z), z];
      items.post.push({ p: [P[0], P[1] + 0.45, P[2]], s: [1, 1, 1], c: new THREE.Color('#a9835a') });
      if (prev) {
        const dxp = P[0] - prev[0], dzp = P[2] - prev[2], len = Math.hypot(dxp, dzp);
        const ang = Math.atan2(-dzp, dxp);
        for (const yy of [0.35, 0.7]) {
          items.rail.push({ p: [(P[0] + prev[0]) / 2, (P[1] + prev[1]) / 2 + yy, (P[2] + prev[2]) / 2], s: [len, 1, 1], ry: ang, c: new THREE.Color('#b8956a') });
        }
      }
      prev = P;
    }
  }

  // Fences along parts of the branch paths, and lanterns' worth of trees around the hamlets and flank hills
  branches.forEach((b, bi) => {
    for (const side of [1, -1]) {
      let prev = null;
      for (let i = 14; i < b.length - 10; i += 3) {
        const [tx, tz] = tangent(b, i), nx = -tz, nz = tx;
        const inRun = (i > 20 && i < 44) === (side > 0);              // each side fenced along a different stretch
        const x = b[i][0] + side * nx * 2.3, z = b[i][1] + side * nz * 2.3;
        if (!inRun || !free(x, z, -0.5)) { prev = null; continue; }
        const P = [x, heightAt(x, z), z];
        items.post.push({ p: [P[0], P[1] + 0.45, P[2]], s: [1, 1, 1], c: new THREE.Color('#a9835a') });
        if (prev) {
          const dxp = P[0] - prev[0], dzp = P[2] - prev[2], len = Math.hypot(dxp, dzp), ang = Math.atan2(-dzp, dxp);
          for (const yy of [0.35, 0.7]) items.rail.push({ p: [(P[0] + prev[0]) / 2, (P[1] + prev[1]) / 2 + yy, (P[2] + prev[2]) / 2], s: [len, 1, 1], ry: ang, c: new THREE.Color('#b8956a') });
        }
        prev = P;
      }
    }
  });
  const cluster = (cx, cz, r, n, sMin = 0.7, sMax = 1.3) => {
    for (let i = 0, got = 0; got < n && i < n * 12; i++) {
      const a = rand() * 6.28, d = Math.sqrt(rand()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!free(x, z, 1.5) || Math.abs(x - pathX(z)) < 4.5) continue;
      if (branches.some((b) => distToPolyline(x, z, b) < 2.8)) continue;
      addTree(x, z, sMin + rand() * (sMax - sMin));
      got++;
    }
  };
  cluster(-30, -7, 11, Math.round(14 * D));  cluster(-46, -14, 12, Math.round(14 * D));  cluster(-20, 10, 9, Math.round(7 * D));
  cluster(30, -2, 11, Math.round(14 * D));   cluster(46, -10, 12, Math.round(14 * D));   cluster(22, 12, 9, Math.round(7 * D));
  for (const f of farm) for (let k = 0; k < Math.round(7 * D); k++) {   // garden bushes and tall grass round the farm buildings
    const a = rand() * 6.28, r = 3 + rand() * 3, x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
    if (free(x, z, 0) && !branches.some((b) => distToPolyline(x, z, b) < 2)) addBush(x, z, 0.5 + rand() * 0.5);
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function instanced(geometry, material, list, { shadow = true, defaultColor } = {}) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((it, i) => {
      _e.set(it.rx || 0, it.ry ?? rand() * 6.28, it.rz || 0);
      _m.compose(_v.set(...it.p), _q.setFromEuler(_e), _s.set(...it.s));
      mesh.setMatrixAt(i, _m);
      const col = it.c ?? defaultColor;
      if (col) mesh.setColorAt(i, col);
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  const white = (extra = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...extra });
  // Faceted, flat-shaded low-poly forms (not smooth spheres): jittered icosahedra for foliage,
  // a lathed flame for cypress, stepped tiers for pines. Vertex colours add a baked top-light.
  const flat = (extra = {}) => white({ flatShading: true, vertexColors: true, ...extra });
  const blobGeos = [0, 1, 2].map((i) => shade(jitter(new THREE.IcosahedronGeometry(1, 1), 0.38, i * 7.3), 0.7, 1.1));
  const lobeLists = [[], [], []];
  items.lobe.forEach((it, i) => lobeLists[i % 3].push(it));
  const trunkGeo = shade(jitter(new THREE.CylinderGeometry(0.45, 0.7, 1, 6, 2), 0.18, 5), 0.75, 1.05);
  instanced(trunkGeo, flat(), items.trunk, { defaultColor: BARK });
  instanced(shade(new THREE.ConeGeometry(0.75, 1, 6), 0.7, 1.0), flat(), items.flare, { defaultColor: BARK });
  lobeLists.forEach((list, i) => instanced(blobGeos[i], flat(), list));
  instanced(shade(jitter(new THREE.IcosahedronGeometry(1, 0), 0.35, 3), 0.8, 1.12), flat(), items.leaf, { shadow: false });
  instanced(new THREE.IcosahedronGeometry(1, 0), white({ flatShading: true }), items.fruit, { shadow: false });
  // cypress: a faceted flame, widest a little below the middle
  instanced(shade(jitter(lathe([[0, -1], [0.62, -0.88], [0.95, -0.45], [1, -0.05], [0.82, 0.42], [0.46, 0.8], [0, 1]], 7), 0.12, 9), 0.6, 1.1), flat(), items.cypress);
  // pine: drooping jagged tiers, two-sided so it never turns see-through
  instanced(pineGeometry(5, 9), flat({ side: THREE.DoubleSide }), items.pine);
  instanced(shade(jitter(new THREE.IcosahedronGeometry(1, 1), 0.3, 11), 0.65, 1.08), flat(), items.bush);
  instanced(new THREE.IcosahedronGeometry(1, 0), white({ flatShading: true }), items.berry, { shadow: false });
  instanced(new THREE.DodecahedronGeometry(1, 0), white({ flatShading: true }), items.rock);
  instanced(tuftGeometry(), flat({ side: THREE.DoubleSide }), items.grass, { shadow: false });
  instanced(new THREE.CylinderGeometry(0.014, 0.02, 1, 4), white(), items.stem, { shadow: false });
  instanced(new THREE.SphereGeometry(1, 8, 6), white(), items.head, { shadow: false });
  instanced(new THREE.SphereGeometry(1, 6, 5), white(), items.dot, { shadow: false });
  instanced(new THREE.ConeGeometry(0.05, 0.5, 5).translate(0, 0.25, 0), white(), items.spike, { shadow: false });
  instanced(new THREE.ConeGeometry(0.12, 0.85, 3).translate(0, 0.42, 0), white(), items.fern, { shadow: false });
  instanced(new THREE.CylinderGeometry(0.028, 0.034, 0.18, 5), white(), items.mushStem, { shadow: false });
  instanced(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), white(), items.mushCap, { shadow: false });
  instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), white(), items.log, { defaultColor: BARK });
  instanced(new THREE.CylinderGeometry(0.04, 0.05, 1, 5), white(), items.reed, { shadow: false });
  instanced(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 6), white(), items.reedTop, { shadow: false });
  instanced(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 12), white(), items.lily, { shadow: false });
  instanced(new THREE.BoxGeometry(0.12, 0.9, 0.12), white(), items.post);
  instanced(new THREE.BoxGeometry(1, 0.08, 0.06), white(), items.rail);

  // ---- Butterflies: a few drifting about the meadow by day ----
  const butterflies = [];
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.16, 0.09, 0.03, 0.14, -0.08, 0.02], 3));
  wingGeo.computeVertexNormals();
  for (let i = 0; i < Math.round(14 * D); i++) {
    const col = new THREE.Color(pick(['#ffd23f', '#ff9fc2', '#ffffff', '#7ac6ff', '#ff8a3c']));
    const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    const grp = new THREE.Group();
    const wl = new THREE.Mesh(wingGeo, m), wr = new THREE.Mesh(wingGeo, m);
    wr.scale.x = -1;
    grp.add(wl, wr);
    const bx = (rand() - 0.5) * 50, bz = -20 + rand() * 40;
    grp.userData = { bx, bz, by: heightAt(bx, bz) + 1.1 + rand() * 1.2, ph: rand() * 6.28, sp: 0.5 + rand() * 0.6, wl, wr };
    scene.add(grp);
    butterflies.push(grp);
  }

  // ---- Clouds: soft clumps that drift sideways ----
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xe8eeff, emissiveIntensity: 0.55 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const s = 3 + rand() * 3.2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), cloudMat);
      b.position.set(j * 4 - n * 2, rand() * 1.5, (rand() - 0.5) * 3);
      b.scale.y = 0.55;
      g.add(b);
    }
    g.position.set((rand() - 0.5) * 320, 40 + rand() * 26, -75 - rand() * 60);
    g.userData.speed = 0.5 + rand() * 0.8;
    skyScene.add(g);
    clouds.push(g);
  }

  // ---- Fireflies: spread through the whole depth of the scene ----
  // Near ones sit right in front of the camera (big, soft bokeh), far ones twinkle on the hills.
  const FF_GROUPS = [
    { n: 30, xr: 14, z0: 8, z1: 19 },     // close to the camera
    { n: 36, xr: 32, z0: -22, z1: 8 },    // middle distance
    { n: 28, xr: 62, z0: -64, z1: -22 },  // far away
  ];
  const FF_COLORS = ['#d8ff6a', '#ffe27a', '#9dffb0', '#ffd0a0', '#c6ff8a'].map((h) => new THREE.Color(h));
  const ffData = [];
  FF_GROUPS.forEach((gr, gi) => {
    for (let i = 0; i < gr.n; i++) {
      const x = (rand() * 2 - 1) * gr.xr, z = gr.z0 + rand() * (gr.z1 - gr.z0);
      ffData.push({ x, z, y: heightAt(x, z) + 0.7 + rand() * 3, ph: rand() * 6.28, gi, col: pick(FF_COLORS) });
    }
  });
  const FF = ffData.length;
  const ffGeo = new THREE.BufferGeometry();
  const ffPos = new Float32Array(FF * 3), ffCol = new Float32Array(FF * 3), ffSeed = new Float32Array(FF);
  ffData.forEach((f, i) => { ffPos.set([f.x, f.y, f.z], i * 3); ffCol.set([f.col.r, f.col.g, f.col.b], i * 3); ffSeed[i] = rand(); });
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  ffGeo.setAttribute('aColor', new THREE.BufferAttribute(ffCol, 3));
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed, 1));
  const ffUniforms = {
    uNight: { value: 0 }, uTime: { value: 0 }, uScale: { value: 700 }, uBase: { value: 0.34 },
    uFocus: { value: 55 }, uAperture: { value: 0 }, uMaxBlur: { value: 14 },
  };
  const fireflies = new THREE.Points(ffGeo, new THREE.ShaderMaterial({
    uniforms: ffUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uScale, uBase, uFocus, uAperture, uMaxBlur;
      attribute vec3 aColor; attribute float aSeed;
      varying vec3 vColor; varying float vSoft; varying float vTwinkle;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mv.z, 0.5);
        // Same circle-of-confusion maths as the depth-of-field pass, so near fireflies
        // become big soft bokeh discs and far ones stay tiny sparks.
        float coc = clamp(uAperture * abs(1.0 / uFocus - 1.0 / dist), 0.0, uMaxBlur);
        float core = uBase * projectionMatrix[1][1] * uScale * 0.5 / dist;
        float size = core + coc * 1.8 + 3.0;
        gl_PointSize = size;
        gl_Position = projectionMatrix * mv;
        vSoft = coc * 1.8 / size;
        vColor = aColor;
        vTwinkle = 0.62 + 0.38 * sin(uTime * (1.4 + aSeed) + aSeed * 40.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying vec3 vColor; varying float vSoft; varying float vTwinkle;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        float glow = exp(-r * r * 4.5);
        float disc = smoothstep(1.0, 0.8, r) * 0.55 + glow * 0.35;
        float a = mix(glow, disc, vSoft) * (1.0 - 0.5 * vSoft) * vTwinkle * uNight * 1.7;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  }));
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // Some fireflies carry real lights (spread near/middle/far) plus a glow pool on the ground.
  const FF_LIGHTS = Math.max(0, Math.min(8, maxLights - houseLights.length));
  const byGroup = FF_GROUPS.map(() => []);
  ffData.forEach((f, i) => byGroup[f.gi].push(i));
  const carriers = [];
  for (let k = 0; carriers.length < FF_LIGHTS && k < 20; k++) {
    for (const list of byGroup) if (list[k] !== undefined && carriers.length < FF_LIGHTS) carriers.push(list[k]);
  }
  const poolTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ffLights = carriers.map((idx) => {
    const col = ffData[idx].col;
    const light = new THREE.PointLight(col, 0, 13, 1.4);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: poolTex, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    pool.renderOrder = 2;
    scene.add(light, pool);
    return { idx, light, pool };
  });

  // ---- Billboards ----
  // A real sign structure: a deep rim with a light inner lip, a backing box and rear beam, steel posts
  // with ground shadows, a front catwalk with railing and a ladder, and lamps on arms above.
  // Frame parts are *lit* (darker underneath, lit from the sun) while the face stays unlit so text is crisp.
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);
  const startCam = new THREE.Vector3(0, 7, 22);
  const signMats = [];                 // every sign material (the depth-of-field pass ghosts these)

  /** Unit box / cylinder with a vertical vertex-colour ramp: darker underneath, lighter on top. */
  const rampBox = (() => {
    const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 0.58 + 0.42 * (p.getY(i) + 0.5); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  })();
  const rampPost = (() => {
    const g = new THREE.CylinderGeometry(0.4, 0.5, 1, 10), p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = 0.55 + 0.45 * (p.getY(i) + 0.5); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  })();

  for (const [id, s] of Object.entries(STOPS)) {
    const sec = sections[id];
    if (!sec) continue;
    const g = new THREE.Group();
    g.scale.setScalar(s.scale);              // position and bearing are set by board.place() below

    const cy = BOARD_BOTTOM + BOARD_H / 2;
    const T = 0.5, DEPTH = 0.9, LIP = 0.16;
    const metal = new THREE.MeshLambertMaterial({ color: SIGN_GREY, vertexColors: true });
    const lipMat = new THREE.MeshLambertMaterial({ color: 0xe4e1d8 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x8c8672 });
    const faceMat = new THREE.MeshBasicMaterial({ map: null });
    const barMat = new THREE.MeshBasicMaterial({ color: s.accent });
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x10190a, transparent: true, opacity: 0.5, depthWrite: false });
    const washMat = new THREE.MeshBasicMaterial({ map: lampWashTexture(), color: 0xffd49a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc476, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const haloMat = new THREE.SpriteMaterial({ map: blobTexture(), color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mine = [metal, lipMat, lampMat, faceMat, barMat, blobMat, washMat, beamMat, haloMat];
    signMats.push(...mine);

    const solids = [];                 // { m, order } meshes whose draw order is fixed while open
    const mk = (geo, material, order, shadow = true) => {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = shadow; m.receiveShadow = shadow;
      g.add(m); solids.push({ m, order });
      return m;
    };
    const rim = [0, 1, 2, 3].map(() => mk(rampBox, metal, 9));     // top, bottom, left, right
    const back = mk(rampBox, metal, 9);
    const lip = [0, 1, 2, 3].map(() => mk(rampBox, lipMat, 13));
    const catwalk = mk(rampBox, metal, 13);
    const railTop = mk(rampBox, metal, 13), railMid = mk(rampBox, metal, 13);
    const railPosts = Array.from({ length: 9 }, () => mk(rampBox, metal, 13));
    const ladderRails = [mk(rampBox, metal, 13), mk(rampBox, metal, 13)];
    const rungs = Array.from({ length: 9 }, () => mk(rampBox, metal, 13));
    const beam = mk(rampBox, metal, 9);                            // rear cross-beam behind the face
    const stems = Array.from({ length: 4 }, () => mk(rampBox, metal, 13));
    const arms = Array.from({ length: 4 }, () => mk(rampBox, metal, 13));
    const hoods = Array.from({ length: 4 }, () => mk(rampBox, metal, 13));
    const bulbs = Array.from({ length: 4 }, () => mk(rampBox, lampMat, 13, false));
    const walkway = [catwalk, railTop, railMid, ...railPosts, ...ladderRails, ...rungs];
    const postXs = [-BOARD_W / 2 + 2.2, BOARD_W / 2 - 2.2];
    const POST_H = BOARD_BOTTOM + 3;
    const posts = postXs.map((px) => {
      const m = new THREE.Mesh(rampPost, metal);
      m.scale.set(1, POST_H, 1);
      m.position.set(px, BOARD_BOTTOM - POST_H / 2 + 0.61, -0.55);
      m.castShadow = m.receiveShadow = true;
      g.add(m); solids.push({ m, order: 9 });
      return m;
    });

    const teaserTex = drawBoard(sec.title, sec.teaser, s.accent);
    const openTex = drawOpenBoard(s.paper, s.accent);
    faceMat.map = teaserTex;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), faceMat);
    face.userData.stopId = id;
    g.add(face);
    // The coloured bar across the top while open: its own strip, so its height can stay
    // readable on screen however the sign is stretched. Text scrolls underneath it.
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), barMat);
    bar.visible = false;
    g.add(bar);

    // Light thrown by the lamps: a wash over the face (bright pools under each lamp), a soft cone
    // from every bulb, and a halo around each bulb. All additive, all fade in with the night.
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), washMat);
    wash.renderOrder = 0; g.add(wash);
    const CONE_SEG = 12;
    const cones = Array.from({ length: 4 }, () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_SEG + 2) * 3), 3));
      const col = new Float32Array((CONE_SEG + 2) * 3);
      for (let i = 0; i < 3; i++) col[i] = 0.9;                       // apex (at the bulb) bright, rim black
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const idx = [];
      for (let i = 0; i < CONE_SEG; i++) idx.push(0, 1 + i, 1 + ((i + 1) % CONE_SEG));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, beamMat);
      m.frustumCulled = false; g.add(m);
      return m;
    });
    const halos = Array.from({ length: 4 }, () => { const sp = new THREE.Sprite(haloMat); g.add(sp); return sp; });
    const lightFx = [wash, ...cones, ...halos];

    const sty = { night: 0, open: false };
    const applyLight = () => {
      const k = sty.open ? 0 : sty.night;                              // an open sign is lit evenly for reading
      const dim = 1 - 0.4 * k;                                        // the face is dim after dark...
      faceMat.color.setRGB(dim, dim * 0.98, dim * 0.94);
      washMat.opacity = k * 0.5;                                       // ...and the lamps' pools light it up
      beamMat.opacity = k * 0.07;
      haloMat.opacity = sty.open ? sty.night * 0.25 : sty.night * 0.5;
      lipMat.emissive.setRGB(0.26 * sty.night, 0.18 * sty.night, 0.07 * sty.night); // rim catches the glow
    };

    const set = (m, w, h, d, x, y, z) => { m.scale.set(w, h, d); m.position.set(x, y, z); };
    const board = {
      id, face, scale: s.scale, layout: null,
      width: BOARD_W * s.scale, height: BOARD_H * s.scale,   // original size (world units)
      /**
       * Resize and shift the sign face. `w`/`h` are world units; `ox`/`oy` move it within the
       * sign's plane. Rim, lip and fittings keep a constant thickness and follow the face.
       */
      setLayout(L) {
        const lw = L.w / s.scale, lh = L.h / s.scale, x = L.ox / s.scale, y = cy + L.oy / s.scale;
        face.scale.set(lw, lh, 1);
        face.position.set(x, y, 0.31);
        const top = y + lh / 2, bot = y - lh / 2;
        // rim (deep) and its lighter inner lip
        set(rim[0], lw + 2 * T, T, DEPTH, x, top + T / 2, 0);
        set(rim[1], lw + 2 * T, T, DEPTH, x, bot - T / 2, 0);
        set(rim[2], T, lh, DEPTH, x - lw / 2 - T / 2, y, 0);
        set(rim[3], T, lh, DEPTH, x + lw / 2 + T / 2, y, 0);
        set(lip[0], lw + 2 * LIP, LIP, 0.14, x, top + LIP / 2, 0.48);
        set(lip[1], lw + 2 * LIP, LIP, 0.14, x, bot - LIP / 2, 0.48);
        set(lip[2], LIP, lh, 0.14, x - lw / 2 - LIP / 2, y, 0.48);
        set(lip[3], LIP, lh, 0.14, x + lw / 2 + LIP / 2, y, 0.48);
        set(back, lw, lh, 0.8, x, y, -0.12);
        set(beam, lw + 2 * T, 0.32, 0.32, x, bot + lh * 0.18, -0.62);          // beam tying the posts together
        // catwalk under the sign, projecting forward, with railing and a ladder at the right end
        const cwY = bot - T - 0.1, cwW = lw + 1.2;
        set(catwalk, cwW, 0.14, 1.15, x, cwY, 0.62);
        set(railTop, cwW, 0.09, 0.09, x, cwY + 0.98, 1.14);
        set(railMid, cwW, 0.07, 0.07, x, cwY + 0.52, 1.14);
        railPosts.forEach((m, i) => set(m, 0.09, 0.98, 0.09, x - cwW / 2 + 0.05 + (i / 8) * (cwW - 0.1), cwY + 0.49, 1.14));
        const ladH = Math.max(1.2, cwY + 0.2), lx = x + cwW / 2 - 0.55;
        set(ladderRails[0], 0.08, ladH, 0.08, lx - 0.22, cwY - ladH / 2, 1.05);
        set(ladderRails[1], 0.08, ladH, 0.08, lx + 0.22, cwY - ladH / 2, 1.05);
        rungs.forEach((m, i) => set(m, 0.5, 0.06, 0.07, lx, cwY - 0.25 - (i / 8) * (ladH - 0.45), 1.05));
        // lamps on arms above the sign, shining down onto the face
        const top2 = top + T;
        for (let i = 0; i < 4; i++) {
          const lx2 = x + (i - 1.5) * (lw * 0.26);
          set(stems[i], 0.1, 0.55, 0.1, lx2, top2 + 0.27, -0.1);
          set(arms[i], 0.08, 0.08, 1.15, lx2, top2 + 0.55, 0.48);
          set(hoods[i], 0.55, 0.13, 0.42, lx2, top2 + 0.5, 1.02);
          set(bulbs[i], 0.3, 0.07, 0.24, lx2, top2 + 0.42, 1.02);
          halos[i].position.set(lx2, top2 + 0.36, 1.02);
          halos[i].scale.setScalar(1.5);
          // cone: apex at the bulb, base a wide ellipse on the face
          const pos = cones[i].geometry.attributes.position;
          pos.setXYZ(0, lx2, top2 + 0.4, 1.02);
          const by = top - lh * 0.5, rx = lw * 0.17, ry = lh * 0.22;
          for (let k = 0; k < CONE_SEG; k++) {
            const a = (k / CONE_SEG) * Math.PI * 2;
            pos.setXYZ(1 + k, lx2 + Math.cos(a) * rx, by + Math.sin(a) * ry, 0.33);
          }
          pos.needsUpdate = true;
        }
        wash.scale.set(lw, lh, 1);
        wash.position.set(x, y, 0.325);
        const barH = L.bar ?? 0.0694 * L.h;     // default = the teaser's stripe proportion
        bar.scale.set(lw, barH / s.scale, 1);
        bar.position.set(x, y + lh / 2 - barH / s.scale / 2, 0.315);
        board.layout = { ...L, bar: barH };
      },
      /** Swap the face between the teaser and the plain "content is open" surface.
       *  Open signs draw over the terrain (a stretched sign can dip below the hill). The depth
       *  test must stay ON with an always-pass function: with it off, WebGL writes no depth and
       *  the depth-of-field pass would treat the sign as far-away sky and blur it. */
      setOpen(on) {
        faceMat.map = on ? openTex : teaserTex;
        const fn = on ? THREE.AlwaysDepth : THREE.LessEqualDepth;
        mine.forEach((m) => { m.depthFunc = fn; });
        bar.visible = on;
        bar.renderOrder = on ? 12 : 0;
        face.renderOrder = on ? 11 : 0;
        solids.forEach(({ m, order }) => { m.renderOrder = on ? order : 0; });
        // The catwalk, railing and ladder stand in front of the face, so they would cut across the text.
        walkway.forEach((m) => { m.visible = !on; });
        blobs.forEach((m) => { m.visible = !on; }); // ground decals would paint over the face (it ignores depth while open)
        sty.open = on; applyLight();
        lightFx.forEach((m) => { m.renderOrder = on ? 14 : 0; });
      },
      /** Lamps glow after dark. */
      setNight(n) {
        lampMat.color.setRGB(0.55 + 0.45 * n, 0.52 + 0.4 * n, 0.45 + 0.1 * n);
        sty.night = n; applyLight();
      },
    };
    board.setLayout({ w: board.width, h: board.height, ox: 0, oy: 0 });
    board.setNight(0);

    // layer 1 = drawn sharp after depth of field; the signs also stay on layer 0 so they cast shadows
    g.traverse((o) => o.layers.enable(1));
    boardGroup.add(g);
    g.updateMatrixWorld(true);

    // soft contact shadow where each post meets the hill
    const blobs = postXs.map((px) => {
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), blobMat);
      blob.renderOrder = 1;
      blob.layers.set(1);              // layer 1 only: it is a ground decal, not a shadow caster
      g.add(blob);
      return blob;
    });

    /**
     * Stand the sign at ground position (x, z), `lift` units up on longer posts. Aims it at the
     * start camera (plus its own yaw), lengthens each post to reach the ground under it, and moves
     * the contact shadows to match. Also refreshes `center`/`normal` used by the camera stops.
     */
    const POST_TOP = BOARD_BOTTOM + 0.61;
    const tmp = new THREE.Vector3();
    board.place = (x, z, lift = 0) => {
      g.position.set(x, heightAt(x, z) + lift, z);
      const theta = Math.atan2(startCam.x - x, startCam.z - z) + (s.yaw || 0); // turned a little off-square
      g.rotation.y = theta;
      g.updateMatrixWorld(true);
      postXs.forEach((px, i) => {
        tmp.set(px, 0, -0.55).applyMatrix4(g.matrixWorld);
        const ground = (heightAt(tmp.x, tmp.z) - g.position.y) / s.scale;   // local height of the ground here
        const bottom = Math.min(ground - 0.6, -1.0);                          // sink the post into the hill
        posts[i].scale.y = POST_TOP - bottom;
        posts[i].position.y = (POST_TOP + bottom) / 2;
        blobs[i].position.set(px, ground + 0.08, -0.55);
      });
      board.center.set(0, cy, 0.31).applyMatrix4(g.matrixWorld);             // default-size face centre
      board.normal.set(Math.sin(theta), 0, Math.cos(theta));
      board.pos.set(x, z);
      board.lift = lift;
    };
    board.pos = new THREE.Vector2(s.desk.x, s.desk.z);
    board.lift = 0;
    board.center = new THREE.Vector3();
    board.normal = new THREE.Vector3();
    board.place(s.desk.x, s.desk.z, 0);
    boards.push(board);
  }

  // ---- per-frame + day/night ----
  let time = 0, night = 0;
  const HOUSE_I = 26, FF_I = 9;
  const glow = glowKit();
  return {
    boards,
    /**
     * Seat every sign for the current screen shape. Each slides inward along its hill until it fits the
     * visible width (never past the hill's crest), steps to its zig-zag depth as the screen gets narrow,
     * and is lifted on posts if the terrain in front would hide its lower edge.
     * @param {number} aspect   viewport width / height
     * @param {number} fov      vertical field of view in degrees
     * @param {THREE.Vector3} cam  the overview camera position
     */
    placeBoards(aspect, fov, cam) {
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const t = smooth(1.1, 0.65, aspect);                                   // 0 on wide screens, 1 in portrait
      for (const b of boards) {
        const s = STOPS[b.id];
        const z = lerp(s.desk.z, s.stagger.z, t);
        const hw = tanHalf * Math.max(1, cam.z - z) * aspect;               // half the visible width at its depth
        const fit = hw - (BOARD_W / 2) * s.scale - 2.2;                     // leave room for the frame and parallax
        const xMag = Math.max(Math.abs(s.hill.x), Math.min(Math.abs(s.desk.x), fit));
        const x = (s.desk.x < 0 ? -1 : 1) * xMag;
        // lift so the face's lower edge clears the terrain between the camera and the sign
        // (checked for the bottom-left, bottom-centre and bottom-right points of the face)
        const theta = Math.atan2(startCam.x - x, startCam.z - z) + (s.yaw || 0);
        const rx = Math.cos(theta), rz = -Math.sin(theta);                    // the sign's local +x in world
        const half = (BOARD_W / 2) * s.scale;
        const ground = heightAt(x, z);
        const bottomAt0 = ground + BOARD_BOTTOM * s.scale;                  // world y of the face bottom with no lift
        let lift = 0;
        for (const off of [-1, 0, 1]) {
          const tx = x + rx * half * off, tz = z + rz * half * off;
          const tBottom = heightAt(x, z) + BOARD_BOTTOM * s.scale;
          for (let k = 1; k <= 60; k++) {
            const u = k / 61;                                                // fraction of the way from camera to target
            const px = lerp(cam.x, tx, u), pz = lerp(cam.z, tz, u);
            if (Math.hypot(px - tx, pz - tz) < 1.2) continue;               // right under the face
            const need = (heightAt(px, pz) + 0.6 - cam.y) / u - (tBottom - cam.y);
            lift = Math.max(lift, need);
          }
        }
        void bottomAt0;
        b.place(x, z, Math.min(Math.max(0, lift), 9));
      }
    },
    /** Every sign material, so depth of field can render them only in its sharp pass. */
    signMats,
    /** Per-frame animation: drifting clouds, drifting fireflies (and their lights and ground pools). */
    update(dt) {
      time += dt;
      ffUniforms.uTime.value = time;
      for (const wr of windmills) wr.rotation.z -= dt * 0.7;
      for (const cl of clouds) {
        cl.position.x += cl.userData.speed * dt;
        if (cl.position.x > 190) cl.position.x = -190;
      }
      // butterflies flutter along looping paths; they roost (hide) once it gets dark
      for (const bf of butterflies) {
        const u = bf.userData, t = time * u.sp + u.ph;
        bf.visible = night < 0.5;
        bf.position.set(u.bx + Math.sin(t) * 3.2 + Math.sin(t * 2.3) * 0.8, u.by + Math.sin(t * 1.7) * 0.5, u.bz + Math.cos(t * 0.8) * 3.0);
        bf.rotation.y = t + Math.PI / 2;
        const flap = Math.sin(time * 22 + u.ph) * 0.9;
        u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
      }
      const a = ffGeo.attributes.position;
      const pos = new THREE.Vector3();
      for (let i = 0; i < FF; i++) {
        const f = ffData[i];
        const amp = f.gi === 0 ? 1.8 : 1.3;
        a.setXYZ(i,
          f.x + Math.sin(time * 0.35 + f.ph) * amp,
          f.y + Math.sin(time * 0.8 + f.ph * 2) * 0.7,
          f.z + Math.cos(time * 0.3 + f.ph * 1.3) * amp);
      }
      a.needsUpdate = true;
      ffLights.forEach((fl, k) => {
        pos.fromBufferAttribute(a, fl.idx);
        const flick = 0.75 + 0.25 * Math.sin(time * 2.1 + k * 1.7);
        fl.light.position.copy(pos);
        fl.light.intensity = night * FF_I * flick;
        fl.pool.position.set(pos.x, heightAt(pos.x, pos.z) + 0.08, pos.z);
        fl.pool.material.opacity = night * 0.5 * flick;
      });
    },
    /** 0 = daytime, 1 = full night. Switches on window glow, window light and every night light. */
    setNight(n) {
      night = n;
      for (const m of windowMats) m.emissiveIntensity = n * 1.7;
      for (const l of houseLights) l.intensity = n * HOUSE_I;
      glow.decalMat.opacity = n * 1.0;   // the four panes on the ground
      glow.shaftMat.opacity = n * 0.1;   // soft shaft out of each window
      ffUniforms.uNight.value = n;
      boards.forEach((b) => b.setNight(n));
    },
    /** Lets the fireflies share the depth-of-field settings, so near ones bloom into bokeh. */
    setView({ height, focus, aperture, maxBlur }) {
      ffUniforms.uScale.value = height;
      ffUniforms.uFocus.value = focus;
      ffUniforms.uAperture.value = aperture;
      ffUniforms.uMaxBlur.value = maxBlur;
    },
  };
}
