// The landscape: layered rolling hills with a winding path, a village of varied cottages,
// several kinds of trees, bushes, rocks, flowers, clouds, and real point lights
// for cottage windows and fireflies at night. Everything is procedural (no model files)
// and seeded, so the layout is the same every visit.
import * as THREE from 'three';

// Where each billboard hill sits. `scale` shrinks the sign (the About sign is a small roadside one).
export const STOPS = {
  creativity:  { x: -34, z: -46, scale: 1,    hillR: 15, hillH: 7,   accent: '#ff9db8', paper: '#ffffff' },
  ai:          { x: 0,   z: -64, scale: 1,    hillR: 16, hillH: 9,   accent: '#8ec5ff', paper: '#ffffff' },
  engineering: { x: 34,  z: -46, scale: 1,    hillR: 15, hillH: 7,   accent: '#ffd36a', paper: '#ffffff' },
  about:       { x: -10, z: -14, scale: 0.45, hillR: 7,  hillH: 2.2, accent: '#9fdc8c', paper: '#ffffff' },
};

const BOARD_W = 16, BOARD_H = 9, BOARD_BOTTOM = 2.2;

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
  h += Math.max(0, -z - 10) * 0.05;
  h += smooth(-95, -170, z) * (10 + fbm(x * 0.03 + 20, z * 0.03) * 22); // distant ridges
  for (const s of Object.values(STOPS)) {
    const dx = x - s.x, dz = z - s.z, sig = s.hillR / 1.8;
    h += s.hillH * Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
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
function addGable(group, { cx, cz, len, span, base, rh, ov, yaw, wallMat, roofMat }) {
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
  const L = len + 2 * ov;
  for (const s of [1, -1]) {
    const slab = new THREE.Mesh(slabGeometry(L, 0.16, slope + 0.05), roofMat);
    slab.position.set(0, rh / 2 + 0.06, s * half / 2);
    slab.rotation.x = s * ang;
    g.add(slab);
  }
  // Ridge cap
  g.add(box(L, 0.14, 0.26, mat('#b8451f'), 0, rh + 0.1, 0));
  group.add(g);
}

function addWindow(group, x, y, z, yaw, glassMat, trim, shutterMat, withBox) {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.rotation.y = yaw;
  w.add(box(0.98, 0.98, 0.1, trim));
  w.add(box(0.74, 0.74, 0.14, glassMat));
  w.add(box(0.06, 0.74, 0.16, trim));            // mullion
  w.add(box(1.15, 0.1, 0.24, trim, 0, -0.55, 0.06));
  for (const s of [-1, 1]) w.add(box(0.3, 0.9, 0.08, shutterMat, s * 0.66, 0, 0.0));
  if (withBox) w.add(box(0.9, 0.2, 0.2, mat('#7a4a2c'), 0, -0.72, 0.12));
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
  lg.add(shaft, decal);
  group.add(lg);
}

function buildHouse(rand) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const w = 3.6 + rand() * 1.8, d = 3 + rand() * 1.2, h = 2.2 + rand() * 0.8;
  const wallMat = mat(pick(WALLS)), roofMat = roofMaterial(pick(ROOFS));
  const trim = mat('#fff8ea'), shutterMat = mat(pick(SHUTTERS));
  const glassMat = glassMaterial();
  const stone = mat('#b8b0a0');

  g.add(box(w + 0.2, 1.6, d + 0.2, stone, 0, -0.45, 0)); // plinth reaches below ground, so no gaps on slopes
  g.add(box(w, h, d, wallMat, 0, 0.35 + h / 2, 0));
  const top = 0.35 + h;
  const rh = 1.3 + rand() * 0.8;
  addGable(g, { cx: 0, cz: 0, len: w, span: d, base: top, rh, ov: 0.35, yaw: 0, wallMat, roofMat });

  // Optional wing: a smaller block with a perpendicular roof (gives the L-shaped look).
  const doorSide = rand() < 0.5 ? -1 : 1;
  if (rand() < 0.65) {
    const side = -doorSide;
    const w2 = 2.2 + rand() * 1.0, d2 = d * (0.7 + rand() * 0.25), h2 = h * 0.82;
    const cx = side * (w / 2 + w2 / 2 - 0.2), cz = -0.2 - rand() * 0.4;
    g.add(box(w2 + 0.2, 1.6, d2 + 0.2, stone, cx, -0.45, cz));
    g.add(box(w2, h2, d2, wallMat, cx, 0.35 + h2 / 2, cz));
    addGable(g, { cx, cz, len: d2, span: w2, base: 0.35 + h2, rh: rh * 0.8, ov: 0.3, yaw: Math.PI / 2, wallMat, roofMat });
    addWindow(g, cx, 1.55, cz + d2 / 2 + 0.03, 0, glassMat, trim, shutterMat, rand() < 0.5);
  }

  // Chimney
  const chX = (rand() < 0.5 ? -1 : 1) * w * 0.28;
  g.add(box(0.58, rh + 1.2, 0.58, mat('#b5543a'), chX, top + (rh + 1.2) / 2 - 0.2, -d * 0.12));
  g.add(box(0.74, 0.14, 0.74, mat('#8f3f2b'), chX, top + rh + 0.95, -d * 0.12));

  // Arched door
  const dx = doorSide * w * 0.2;
  const doorMat = mat(pick(['#9a4a2c', '#6a3a22', '#3f7f6f']));
  g.add(box(0.95, 1.55, 0.1, trim, dx, 0.35 + 0.78, d / 2 + 0.02));
  g.add(box(0.76, 1.45, 0.12, doorMat, dx, 0.35 + 0.73, d / 2 + 0.03));
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 14, 1, false, -Math.PI / 2, Math.PI), doorMat);
  arch.rotation.x = -Math.PI / 2;
  arch.position.set(dx, 0.35 + 1.45, d / 2 + 0.03);
  g.add(arch);
  g.add(box(1.5, 0.12, 1.1, stone, dx, 0.3, d / 2 + 0.55)); // doorstep

  // Windows: opposite the door on the front, plus both sides
  addWindow(g, -doorSide * w * 0.28, 1.65, d / 2 + 0.03, 0, glassMat, trim, shutterMat, rand() < 0.6);
  if (w > 4.3) addWindow(g, doorSide * w * 0.38 * -1, 1.65, d / 2 + 0.03, 0, glassMat, trim, shutterMat, false);
  addWindow(g, w / 2 + 0.03, 1.65, 0, Math.PI / 2, glassMat, trim, shutterMat, false);
  addWindow(g, -w / 2 - 0.03, 1.65, 0, -Math.PI / 2, glassMat, trim, shutterMat, false);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, glassMat, lightAnchor: new THREE.Vector3(0, 1.5, d / 2 + 1.4), halfW: w / 2 + 1.5 };
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
  g.fillStyle = accent; g.fillRect(0, 0, 1024, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene, sections, opts = {}) {
  const maxLights = opts.maxLights ?? 14;
  const skyScene = opts.skyScene ?? scene; // clouds live on the layer behind the title text
  const rand = rng(11);
  const pick = (a) => a[Math.floor(rand() * a.length)];

  const clouds = [];
  const boards = [];

  // ---- House sites: all along the path, alternating sides, on flattened plots ----
  const nearSign = (x, z, pad = 0) => Object.values(STOPS).some((s) => Math.hypot(x - s.x, z - s.z) < 9 * Math.max(s.scale, 0.8) + pad);
  PADS.length = 0;
  const sites = [];
  [-8, -16, -24, -32, -40, -48].forEach((z0, i) => {
    const z = z0 + (rand() - 0.5) * 2.5;
    const side = i % 2 === 0 ? -1 : 1;
    const slope = pathX(z + 0.5) - pathX(z - 0.5);            // dx/dz of the path
    const k = Math.sqrt(1 + slope * slope);
    const nx = 1 / k, nz = -slope / k;                         // unit normal to the path
    const perp = 6.6 + rand() * 1.4;                           // distance from the path's centre line
    const x = pathX(z) + side * perp * nx, zz = z + side * perp * nz;
    if (nearSign(x, zz)) return;
    const site = { x, z: zz, fx: -side * nx, fz: -side * nz, perp, y: rawHeight(x, zz) };
    sites.push(site);
    PADS.push({ x, z: zz, r: 7.2, y: site.y });
  });

  // ---- Terrain: colour by height, warm meadow patches, pale path ----
  const geo = new THREE.PlaneGeometry(380, 250, 190, 125);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -75);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cLow = new THREE.Color('#55ad5a'), cHigh = new THREE.Color('#c9ee9a');
  const cWarm = new THREE.Color('#e2ea8a'), cPath = new THREE.Color('#f1e5c6'), cDeep = new THREE.Color('#3f9a58');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = heightAt(x, z);
    p.setY(i, h);
    const t = THREE.MathUtils.clamp((h + 3) / 16, 0, 1);
    c.copy(cLow).lerp(cHigh, t);
    c.lerp(cDeep, smooth(0.25, 0, t) * 0.5);
    c.lerp(cWarm, smooth(0.52, 0.78, fbm(x * 0.05 + 40, z * 0.05)) * 0.65);
    const onPath = 1 - smooth(1.5, 3.1, Math.abs(x - pathX(z)));
    let walk = 0; // short footpath from each front door to the main path
    for (const st of sites) {
      const ax = st.x + st.fx * 3.2, az = st.z + st.fz * 3.2;
      const bx = st.x + st.fx * st.perp, bz = st.z + st.fz * st.perp;
      const abx = bx - ax, abz = bz - az;
      const tt = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
      walk = Math.max(walk, 1 - smooth(0.6, 1.5, Math.hypot(x - (ax + abx * tt), z - (az + abz * tt))));
    }
    c.lerp(cPath, Math.max(onPath, walk) * (1 - smooth(-60, -80, z)) * 0.95); // path dissolves on the AI hill
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- Village: cottages scattered along the path ----
  const houses = []; // { x, z }
  const windowMats = [];
  const houseLights = [];
  const houseCap = Math.min(6, Math.max(1, maxLights - 3));
  const LIGHT_COLOR = 0xffb35a;

  const nearHouse = (x, z, r = 6.5) => houses.some((hh) => Math.hypot(x - hh.x, z - hh.z) < r);
  for (const st of sites) {
    const hs = buildHouse(rand);
    hs.group.scale.setScalar(0.95 + rand() * 0.3);
    hs.group.position.set(st.x, st.y, st.z);
    hs.group.rotation.y = Math.atan2(st.fx, st.fz) + (rand() - 0.5) * 0.12; // front door faces the path
    scene.add(hs.group);
    houses.push({ x: st.x, z: st.z });
    windowMats.push(hs.glassMat);
    if (houseLights.length < houseCap) {
      const light = new THREE.PointLight(LIGHT_COLOR, 0, 11, 1.6);
      hs.group.updateMatrixWorld(true);
      light.position.copy(hs.lightAnchor).applyMatrix4(hs.group.matrixWorld);
      scene.add(light);
      houseLights.push(light);
    }
  }

  // ---- Instanced vegetation ----
  const items = { trunk: [], lobe: [], cypress: [], pine: [], bush: [], rock: [], tuft: [], flower: [] };
  const GREENS = ['#5cb85c', '#6cc96a', '#4aa857', '#7fd070', '#8fcf5a'].map((h) => new THREE.Color(h));
  const FALL = ['#f58a3c', '#f7b83c', '#e86a3a', '#ffcf5a'].map((h) => new THREE.Color(h));
  const DARK = ['#3f9a5a', '#4aa862', '#36895a'].map((h) => new THREE.Color(h));
  const BLOSSOM = new THREE.Color('#ffb3c8');

  function addTree(x, z, s) {
    const y = heightAt(x, z);
    const kind = rand();
    if (kind < 0.42) { // puffy round tree: trunk + 3-5 soft lobes
      items.trunk.push({ p: [x, y + 0.9 * s, z], s: [0.32 * s, 1.8 * s, 0.32 * s] });
      const col = rand() < 0.2 ? pick(FALL) : rand() < 0.04 ? BLOSSOM : pick(GREENS);
      const n = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const a = rand() * 6.28, r = (k === 0 ? 0 : 0.9) * s;
        const ls = (1.1 + rand() * 0.7) * s;
        items.lobe.push({
          p: [x + Math.cos(a) * r, y + (2.6 + rand() * 1.1) * s, z + Math.sin(a) * r],
          s: [ls, ls * (0.85 + rand() * 0.2), ls], c: col.clone().offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.06),
        });
      }
    } else if (kind < 0.7) { // tall cypress
      items.trunk.push({ p: [x, y + 0.5 * s, z], s: [0.25 * s, 1.0 * s, 0.25 * s] });
      const hgt = (3 + rand() * 2.2) * s;
      items.cypress.push({ p: [x, y + hgt * 0.9, z], s: [0.9 * s, hgt, 0.9 * s], c: pick(DARK) });
    } else if (kind < 0.88) { // layered pine
      items.trunk.push({ p: [x, y + 0.6 * s, z], s: [0.3 * s, 1.2 * s, 0.3 * s] });
      const col = pick(DARK);
      for (let k = 0; k < 3; k++) {
        const r = (2.0 - k * 0.55) * s;
        items.pine.push({ p: [x, y + (1.6 + k * 1.15) * s, z], s: [r, 1.8 * s, r], c: col });
      }
    } else { // slender birch-like tree with a small bright canopy
      items.trunk.push({ p: [x, y + 1.4 * s, z], s: [0.2 * s, 2.8 * s, 0.2 * s], c: new THREE.Color('#e8e2d2') });
      const col = rand() < 0.5 ? pick(FALL) : pick(GREENS);
      for (let k = 0; k < 3; k++) {
        const ls = (0.9 + rand() * 0.4) * s;
        items.lobe.push({ p: [x + (rand() - 0.5) * 0.8 * s, y + (3.2 + k * 0.55) * s, z + (rand() - 0.5) * 0.8 * s], s: [ls, ls * 1.15, ls], c: col });
      }
    }
  }

  // Forest clusters (denser where noise is high), kept off the path, houses and signs.
  let placedTrees = 0, guard = 0;
  while (placedTrees < 150 && guard++ < 6000) {
    const x = (rand() - 0.5) * 220, z = -150 + rand() * 175;
    if (z > -6 && Math.abs(x) < 30) continue;                     // open meadow in front of the camera
    if (Math.abs(x - pathX(z)) < 4.5 && z > -80) continue;        // keep the path clear
    if (nearSign(x, z) || nearHouse(x, z)) continue;
    const dens = fbm(x * 0.045 + 5, z * 0.045);
    if (dens < 0.46 && rand() < 0.8) continue;
    addTree(x, z, 0.75 + rand() * 0.75);
    placedTrees++;
  }
  // Garden trees and bushes next to each house.
  for (const hh of houses) {
    for (let k = 0; k < 3; k++) {
      const a = rand() * 6.28, r = 4 + rand() * 3;
      const x = hh.x + Math.cos(a) * r, z = hh.z + Math.sin(a) * r;
      if (Math.abs(x - pathX(z)) < 3.5 || nearSign(x, z)) continue;
      if (rand() < 0.4) addTree(x, z, 0.6 + rand() * 0.4);
      else items.bush.push({ p: [x, heightAt(x, z) + 0.45, z], s: [0.9, 0.7, 0.9], c: pick(GREENS) });
    }
  }
  // Bushes lining the path.
  for (let z = 24; z > -60; z -= 1.6 + rand() * 2.4) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = pathX(z) + side * (3.4 + rand() * 2.5);
    if (nearSign(x, z) || nearHouse(x, z, 4)) continue;
    const s = 0.5 + rand() * 0.7;
    items.bush.push({ p: [x, heightAt(x, z) + 0.4 * s, z], s: [s * 1.1, s * 0.8, s * 1.1], c: pick(GREENS) });
  }
  // Rocks
  for (let i = 0; i < 46; i++) {
    const x = (rand() - 0.5) * 160, z = -90 + rand() * 110;
    if (Math.abs(x - pathX(z)) < 3 || nearHouse(x, z, 4) || nearSign(x, z, -2)) continue;
    const s = 0.4 + rand() * 0.9;
    items.rock.push({ p: [x, heightAt(x, z) + s * 0.25, z], s: [s * 1.2, s * 0.7, s], ry: rand() * 6.28, c: new THREE.Color().setHSL(0.1, 0.06, 0.55 + rand() * 0.15) });
  }
  // Grass tufts
  for (let i = 0; i < 360; i++) {
    const x = (rand() - 0.5) * 120, z = -50 + rand() * 80;
    if (Math.abs(x - pathX(z)) < 2.2 || nearHouse(x, z, 3.5)) continue;
    const s = 0.5 + rand() * 0.8;
    items.tuft.push({ p: [x, heightAt(x, z) + 0.3 * s, z], s: [s, s, s], ry: rand() * 6.28, c: pick(GREENS).clone().offsetHSL(0, 0, -0.06) });
  }
  // Flowers in clusters
  const FLOWERS = ['#ffffff', '#ffd23f', '#ff7aa8', '#c59bff', '#ff9f5a'].map((h) => new THREE.Color(h));
  for (let k = 0; k < 14; k++) {
    const cx = (rand() - 0.5) * 90, cz = -35 + rand() * 60;
    const base = pick(FLOWERS);
    for (let i = 0; i < 28; i++) {
      const x = cx + (rand() - 0.5) * 9, z = cz + (rand() - 0.5) * 9;
      if (Math.abs(x - pathX(z)) < 2.4 || nearHouse(x, z, 3.5) || nearSign(x, z, -3)) continue;
      items.flower.push({ p: [x, heightAt(x, z) + 0.25, z], s: [1, 1, 1], c: rand() < 0.75 ? base : pick(FLOWERS) });
    }
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function instanced(geometry, material, list, { shadow = true, defaultColor } = {}) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((it, i) => {
      _e.set(0, it.ry ?? rand() * 6.28, 0);
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
  instanced(new THREE.CylinderGeometry(0.5, 0.7, 1, 7), white(), items.trunk, { defaultColor: new THREE.Color('#8a5a3c') });
  instanced(new THREE.SphereGeometry(1, 14, 10), white(), items.lobe);
  instanced(new THREE.SphereGeometry(1, 12, 14), white(), items.cypress);
  instanced(new THREE.ConeGeometry(1, 1, 10), white(), items.pine);
  instanced(new THREE.SphereGeometry(1, 10, 8), white(), items.bush);
  instanced(new THREE.DodecahedronGeometry(1, 0), white({ flatShading: true }), items.rock);
  instanced(new THREE.ConeGeometry(0.18, 0.9, 4), white(), items.tuft, { shadow: false });
  instanced(new THREE.IcosahedronGeometry(0.2, 0), white({ flatShading: true }), items.flower, { shadow: false });

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
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);
  const startCam = new THREE.Vector3(0, 7, 22);
  const frameMat = mat('#f2efe6');
  const postMat = mat('#d8d4c8');

  for (const [id, s] of Object.entries(STOPS)) {
    const sec = sections[id];
    if (!sec) continue;
    const g = new THREE.Group();
    g.position.set(s.x, heightAt(s.x, s.z), s.z);
    const theta = Math.atan2(startCam.x - s.x, startCam.z - s.z);
    g.rotation.y = theta;
    g.scale.setScalar(s.scale);

    const cy = BOARD_BOTTOM + BOARD_H / 2;
    const T = 0.4;                      // frame thickness: constant, however far the sign stretches
    const fMat = new THREE.MeshBasicMaterial({ color: 0xece7da }); // unlit like the face, own material per sign
    const parts = [0, 1, 2, 3, 4].map(() => {   // top, bottom, left, right, backing
      const m = new THREE.Mesh(UNIT_BOX, fMat);
      m.castShadow = true;
      g.add(m);
      return m;
    });
    const teaserTex = drawBoard(sec.title, sec.teaser, s.accent);
    const openTex = drawOpenBoard(s.paper, s.accent);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: teaserTex }));
    face.userData.stopId = id;
    g.add(face);

    const board = {
      id, face, scale: s.scale, layout: null,
      width: BOARD_W * s.scale, height: BOARD_H * s.scale,   // original size (world units)
      /**
       * Resize and shift the sign face. `w`/`h` are world units; `ox`/`oy` move it within the
       * sign's plane. The frame strips keep a constant thickness.
       */
      setLayout(L) {
        const lw = L.w / s.scale, lh = L.h / s.scale, x = L.ox / s.scale, y = cy + L.oy / s.scale;
        face.scale.set(lw, lh, 1);
        face.position.set(x, y, 0.27);
        parts[0].scale.set(lw + 2 * T, T, 0.5); parts[0].position.set(x, y + lh / 2 + T / 2, 0);
        parts[1].scale.set(lw + 2 * T, T, 0.5); parts[1].position.set(x, y - lh / 2 - T / 2, 0);
        parts[2].scale.set(T, lh, 0.5);         parts[2].position.set(x - lw / 2 - T / 2, y, 0);
        parts[3].scale.set(T, lh, 0.5);         parts[3].position.set(x + lw / 2 + T / 2, y, 0);
        parts[4].scale.set(lw, lh, 0.45);       parts[4].position.set(x, y, -0.02);
        board.layout = { ...L };
      },
      /** Swap the face between the teaser and the plain "content is open" surface.
       *  Open signs draw over the terrain (a stretched sign can dip below the hill). The depth
       *  test must stay ON with an always-pass function: with it off, WebGL writes no depth and
       *  the depth-of-field pass would treat the sign as far-away sky and blur it. */
      setOpen(on) {
        face.material.map = on ? openTex : teaserTex;
        face.material.depthFunc = fMat.depthFunc = on ? THREE.AlwaysDepth : THREE.LessEqualDepth;
        face.renderOrder = on ? 11 : 0;
        parts.forEach((m) => { m.renderOrder = on ? 10 : 0; });
      },
    };
    board.setLayout({ w: board.width, h: board.height, ox: 0, oy: 0 });
    for (const px of [-BOARD_W / 2 + 2.2, BOARD_W / 2 - 2.2]) {
      const h = BOARD_BOTTOM + 3;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 10), postMat);
      post.position.set(px, BOARD_BOTTOM - h / 2 + 0.61, -0.2);
      post.castShadow = true;
      g.add(post);
    }
    boardGroup.add(g);
    g.updateMatrixWorld(true);
    board.center = face.getWorldPosition(new THREE.Vector3());
    board.normal = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    boards.push(board);
  }

  // ---- per-frame + day/night ----
  let time = 0, night = 0;
  const HOUSE_I = 26, FF_I = 9;
  const glow = glowKit();
  return {
    boards,
    /** Per-frame animation: drifting clouds, drifting fireflies (and their lights and ground pools). */
    update(dt) {
      time += dt;
      ffUniforms.uTime.value = time;
      for (const cl of clouds) {
        cl.position.x += cl.userData.speed * dt;
        if (cl.position.x > 190) cl.position.x = -190;
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
