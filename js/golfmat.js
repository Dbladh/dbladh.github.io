// The mini-golf's materials: brick, boulder and stone, wood planks, painted metal, turf and sand, all drawn once with the canvas together with a normal map (and, on the high tier, a roughness map)
// worked out from the same picture so the light catches the surface. Same chunky, warm style as the rest of the site. The high tier (see golfquality.js) draws them at 256 px with extra detail
// (blades of grass, chipped bricks, lichen, nail heads, glints) on physically based materials that pick up the sky's reflections; the low tier keeps the small 128 px tiles on plain lit materials.
import * as THREE from 'three';
import { isLow } from './golfquality.js?v=20261030215905';

let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** Smooth value noise that repeats every `w` x `h` pixels (cells of `cell` pixels), in 0..1. */
function noise(w, h, cell, sx = 1, sy = 1) {
  const gx = Math.max(1, Math.round(w / (cell * sx))), gy = Math.max(1, Math.round(h / (cell * sy))), g = new Float32Array(gx * gy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x / w) * gx, fy = (y / h) * gy, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
    const a = g[(y0 % gy) * gx + (x0 % gx)], b = g[(y0 % gy) * gx + ((x0 + 1) % gx)], c = g[(((y0 + 1) % gy)) * gx + (x0 % gx)], d = g[((y0 + 1) % gy) * gx + ((x0 + 1) % gx)];
    out[y * w + x] = (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  }
  return out;
}
const mix = (a, b, t) => a + (b - a) * t;

/** A normal map from a height field (wraps round the edges so tiles join up). */
function normalMap(h, w, hh, strength) {
  const c = mk(w, hh), x = c.getContext('2d'), img = x.createImageData(w, hh), at = (i, j) => h[((j + hh) % hh) * w + ((i + w) % w)];
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) * strength, dy = (at(i, j + 1) - at(i, j - 1)) * strength, l = Math.sqrt(dx * dx + dy * dy + 1), o = (j * w + i) * 4;
    img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
function tex(canvas, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(canvas); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = isLow() ? 4 : 8; return t;
}
/** Draw a colour picture and its height field with `paint(i, j) -> [r, g, b, height, roughness?]`, then make the texture set (the roughness map only on the high tier). */
function make(w, h, paint, strength, metal = 0) {
  const c = mk(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), hf = new Float32Array(w * h), high = !isLow(), rc = high ? mk(w, h) : null, rx = rc && rc.getContext('2d'), rimg = rx && rx.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [r, g, b, ht, ro] = paint(i, j), o = (j * w + i) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; hf[j * w + i] = ht;
    if (rimg) { const v = Math.max(0, Math.min(1, ro === undefined ? 0.85 : ro)) * 255; rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = v; rimg.data[o + 3] = 255; }
  }
  x.putImageData(img, 0, 0); if (rx) rx.putImageData(rimg, 0, 0);
  return { map: tex(c), normal: tex(normalMap(hf, w, h, strength), true, false), rough: rc ? tex(rc, true, false) : null, metal };
}
const SZ = () => (isLow() ? 128 : 256);

function makeTurf() {
  const W = SZ(), S = W / 128, hi = !isLow(), n1 = noise(W, W, 8 * S), n2 = noise(W, W, 3 * S), n3 = noise(W, W, 1 * S), n0 = noise(W, W, 40 * S), bl = hi ? noise(W, W, 1.2 * S, 1, 5) : null;
  return make(W, W, (i, j) => {
    const k = j * W + i, v = 0.7 * n1[k] + 0.3 * n2[k], fib = n3[k], blade = bl ? bl[k] : fib, g = 226 + v * 26 + (fib - 0.5) * 22 + (hi ? (n0[k] - 0.5) * 22 + (blade - 0.5) * 18 : 0);
    return [g * (0.96 + (hi ? (n0[k] - 0.5) * 0.06 : 0)), g, g * 0.9, 0.3 * v + 0.45 * fib + (hi ? 0.35 * blade : 0.25 * fib), 0.9];
  }, hi ? 2.6 : 2.2);
}
function makeBrick() {                                     // one brick with its mortar border: each instanced brick shows one
  const S = SZ() / 128, hi = !isLow(), W = 128 * S, H = 64 * S, n1 = noise(W, H, 6 * S), n2 = noise(W, H, 2 * S), n3 = noise(W, H, 1 * S), chips = [];
  if (hi) for (let c = 0; c < 7; c++) chips.push([rnd() * W, rnd() * H, (1.5 + rnd() * 2.2) * S]);
  return make(W, H, (i, j) => {
    const m = 5 * S, inside = i >= m && i < W - m && j >= m && j < H - m;
    const edge = inside ? Math.min(i - m, W - m - 1 - i, j - m, H - m - 1 - j) : -1;
    if (!inside) { const g = 205 + (n2[j * W + i] - 0.5) * 30 - (hi ? n3[j * W + i] * 16 : 0); return [g, g * 0.95, g * 0.86, 0.02 + 0.04 * n3[j * W + i], 1]; }
    const v = n1[j * W + i], s = n2[j * W + i], tone0 = 168 + v * 38 + (s - 0.5) * 28, round = Math.min(1, edge / (4 * S));
    let chip = 0; for (const [cx, cy, cr] of chips) { const d = Math.hypot(i - cx, j - cy); if (d < cr && edge < 5 * S) chip = Math.max(chip, 1 - d / cr); }
    const tone = tone0 - chip * 40 - (hi ? (1 - Math.min(1, j / (H * 0.7))) * 0 + n3[j * W + i] * 14 : 0);
    return [tone, tone * 0.52 + 14, tone * 0.38 + 8, 0.45 + 0.4 * round + 0.15 * s - chip * 0.35, 0.78 + 0.2 * n3[j * W + i]];
  }, hi ? 3.0 : 2.6);
}
function makeStone() {
  const S = SZ() / 128, W = 128 * S, hi = !isLow(), n1 = noise(W, W, 24 * S), n2 = noise(W, W, 9 * S), n3 = noise(W, W, 3 * S), n4 = noise(W, W, 14 * S, 1, 0.4), cracks = new Float32Array(W * W);
  for (let c = 0; c < 5; c++) { let x = rnd() * W, y = rnd() * W, a = rnd() * 6.28; for (let s = 0; s < 40 * S; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 2; y += Math.sin(a) * 2; cracks[(((y | 0) + W) % W) * W + (((x | 0) + W) % W)] = 1; } }
  return make(W, W, (i, j) => {
    const k = j * W + i, v = 0.5 * n1[k] + 0.35 * n2[k] + 0.15 * n3[k], strata = hi ? 0.5 + 0.5 * Math.sin(j * 0.33 / S * 2 + n4[k] * 5) : 0.5, g = 150 + v * 78 - cracks[k] * 55 + (strata - 0.5) * (hi ? 20 : 0), lich = hi ? Math.max(0, n2[k] - 0.62) * 3 * (1 - cracks[k]) : 0;
    return [(g * 1.02) * (1 - lich * 0.18), g * (1 + lich * 0.08), (g * 0.94) * (1 - lich * 0.32), v * 0.8 + 0.2 * n3[k] - cracks[k] * 0.4, 0.88 - lich * 0.1];
  }, hi ? 3.6 : 3.2);
}
function makeWood() {                                      // planks that run along the texture's u axis, with grain and a few knots
  const S = SZ() / 128, W = 128 * S, H = 128 * S, hi = !isLow(), n1 = noise(W, H, 28 * S, 4, 1), n2 = noise(W, H, 6 * S, 5, 1), n3 = noise(W, H, 2 * S), nw = noise(W, H, 18 * S, 6, 1), knots = [], plankH = 32 * S;
  for (let k = 0; k < 3; k++) knots.push([rnd() * W, rnd() * H, (3 + rnd() * 3) * S]);
  return make(W, H, (i, j) => {
    const k = j * W + i, plank = Math.floor(j / plankH), seam = j % plankH < 2 * S ? 1 : 0, shift = ((plank * 37) % 11) / 11;
    let v = 0.55 * n1[(((j + 7 * plank) % H) * W + i)] + 0.3 * n2[k] + 0.15 * n3[k] + shift * 0.2;
    let kn = 0; for (const [kx, ky, kr] of knots) { const d = Math.hypot(i - kx, (j - ky) * 1.4); if (d < kr) kn = Math.max(kn, 1 - d / kr); }
    let nail = 0; if (hi) { const py = (plank + 0.5) * plankH; for (const nx of [7 * S, W - 7 * S]) { const d = Math.hypot(i - nx, j - py); if (d < 2.4 * S) nail = Math.max(nail, 1 - d / (2.4 * S)); } }
    const weather = hi ? (nw[k] - 0.5) * 26 : 0, tone = 150 + v * 70 - seam * 70 - kn * 45 + weather - nail * 70;
    return [tone * (1.0 - (hi ? (nw[k] - 0.5) * 0.08 : 0)), tone * 0.72, tone * 0.46 + (hi ? weather * 0.3 : 0), v * 0.5 - seam * 0.9 - kn * 0.3 + 0.5 + nail * 0.5, nail > 0.3 ? 0.4 : 0.8 + 0.15 * n3[k]];
  }, hi ? 2.6 : 2.2);
}
function makeMetal() {                                     // brushed paint: fine streaks, a few scratches
  const W = isLow() ? 64 : 128, S = W / 64, hi = !isLow(), n1 = noise(W, W, 2 * S, 12, 1), n2 = noise(W, W, 10 * S, 1, 1), sc = new Float32Array(W * W);
  for (let s = 0; s < 14 * S; s++) { let x = rnd() * W, y = rnd() * W; const l = (6 + rnd() * 14) * S; for (let t = 0; t < l; t++) sc[(((y + t * 0.2) | 0) % W) * W + ((x + t) | 0) % W] = 1; }
  return make(W, W, (i, j) => { const k = j * W + i, g = 214 + (n1[k] - 0.5) * 26 + (n2[k] - 0.5) * 16 + sc[k] * 22; return [g, g, g, n1[k] * 0.4 + sc[k] * 0.3, hi ? 0.34 + sc[k] * 0.3 + (1 - n2[k]) * 0.12 : 0.5]; }, hi ? 1.8 : 1.4, 0.45);
}
function makeSand() {                                     // fine grains, a few pebbles and soft ripples
  const S = SZ() / 128, W = 128 * S, hi = !isLow(), n1 = noise(W, W, 10 * S, 3, 1), n2 = noise(W, W, 2 * S), n3 = noise(W, W, 1 * S), pe = new Float32Array(W * W);
  for (let p = 0; p < 18 * S; p++) { const cx = rnd() * W, cy = rnd() * W, r = (1 + rnd() * 1.5) * S; for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) if (i * i + j * j < r * r) pe[(((cy + j) | 0) + W) % W * W + (((cx + i) | 0) + W) % W] = 1; }
  return make(W, W, (i, j) => { const k = j * W + i, rip = 0.5 + 0.5 * Math.sin(j * 0.35 / S + n1[k] * 5), glint = hi && n3[k] > 0.93 ? 28 : 0, g = 226 + (n2[k] - 0.5) * 34 + (rip - 0.5) * 14 - pe[k] * 40 + glint; return [g, g * 0.9, g * 0.66 - pe[k] * 6, 0.3 * rip + 0.7 * n2[k] + pe[k] * 0.4, glint ? 0.3 : 0.92 - pe[k] * 0.1]; }, hi ? 1.8 : 1.4);
}

/** The lawn of a themed hole: the same kind of light, grey-leaning picture as the turf (the hole's lawn colours tint it through vertex colours), painted as dunes, snow, sugar, basalt or damp moss. */
function makeGround(kind) {
  const W = SZ(), S = W / 128, hi = !isLow(), n1 = noise(W, W, 10 * S, 3, 1), n2 = noise(W, W, 3 * S), n3 = noise(W, W, 1 * S), n0 = noise(W, W, 36 * S), n4 = noise(W, W, 6 * S, 1, 4), cr = new Float32Array(W * W), sp = [];
  if (kind === 'rock' || kind === 'moss') for (let c = 0; c < (kind === 'rock' ? 9 : 4); c++) { let x = rnd() * W, y = rnd() * W, a = rnd() * 6.28; for (let t = 0; t < 46 * S; t++) { a += (rnd() - 0.5) * 0.8; x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; cr[(((y | 0) + W) % W) * W + (((x | 0) + W) % W)] = 1; } }
  if (kind === 'candy') for (let c = 0; c < 70 * S * S / 2; c++) sp.push([rnd() * W, rnd() * W, rnd() * 3.14, ['#ff3d7f', '#ffe14a', '#3dc8ff', '#ffffff', '#9a5cff'][(rnd() * 5) | 0]]);
  const sprink = new Map(); if (kind === 'candy') for (const [x, y, a, c] of sp) for (let t = -3; t <= 3; t++) { const px = Math.round(x + Math.cos(a) * t * S) , py = Math.round(y + Math.sin(a) * t * S); sprink.set(((py + W) % W) * W + ((px + W) % W), c); }
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  return make(W, W, (i, j) => {
    const k = j * W + i, v = 0.6 * n1[k] + 0.4 * n2[k];
    if (kind === 'sand') { const rip = 0.5 + 0.5 * Math.sin(j * 0.3 / S + n1[k] * 6), gl = hi && n3[k] > 0.94 ? 22 : 0, g = 232 + (n2[k] - 0.5) * 22 + (rip - 0.5) * 16 + gl; return [g, g * 0.97, g * 0.92, 0.5 * rip + 0.5 * n2[k], gl ? 0.3 : 0.95]; }
    if (kind === 'snow') { const drift = 0.5 + 0.5 * Math.sin(i * 0.12 / S + n1[k] * 4) * Math.cos(j * 0.1 / S), gl = hi && n3[k] > 0.955 ? 30 : 0, g = 244 + (n0[k] - 0.5) * 10 - (1 - drift) * 8 + gl; return [g * 0.97, g * 0.99, g, 0.4 * drift + 0.3 * n2[k], gl ? 0.15 : 0.7]; }
    if (kind === 'candy') { const sc = sprink.get(k); if (sc) { const [r, g, b] = hex(sc); return [r, g, b, 0.9, 0.35]; } const g = 238 + (n2[k] - 0.5) * 10 + Math.sin((i + j) * 0.2 / S) * 4; return [g, g * 0.97, g * 0.98, 0.3 * n2[k], 0.4]; }
    if (kind === 'rock') { const g = 130 + v * 70 + (n3[k] - 0.5) * 20; const c = cr[k]; return c ? [255, 140, 40, 0, 0.5] : [g, g * 0.95, g * 0.98, v * 0.8 + 0.2 * n3[k], 0.85]; }
    if (kind === 'moss') { const m = Math.max(0, n4[k] - 0.45) * 1.6, g = 150 + v * 60 - cr[k] * 40; return [g * (1 - m * 0.25), g * (1 + m * 0.1), g * (1 - m * 0.2), v * 0.7 + 0.3 * n3[k] - cr[k] * 0.3, 0.9]; }
    return [220, 220, 220, v, 0.9];
  }, hi ? 2.8 : 2.2);
}
function makePatch(kind) {                                  // high tier only: ice with cracks and glints, mud with wet puddles, caramel with swirls, quicksand with slow rings
  const W = SZ(), S = W / 128, n1 = noise(W, W, 8 * S, 3, 1), n2 = noise(W, W, 3 * S), n3 = noise(W, W, 1 * S), cr = new Float32Array(W * W);
  if (kind === 'ice') for (let c = 0; c < 7; c++) { let x = rnd() * W, y = rnd() * W, a = rnd() * 6.28; for (let t = 0; t < 40 * S; t++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5; cr[(((y | 0) + W) % W) * W + (((x | 0) + W) % W)] = 1; } }
  return make(W, W, (i, j) => {
    const k = j * W + i, v = 0.6 * n1[k] + 0.4 * n2[k];
    if (kind === 'rough') { const g = 175 + (n3[k] - 0.5) * 110 + (n1[k] - 0.5) * 40; return [g, g, g, 0.7 * n3[k] + 0.3 * n2[k], 1]; }                      // the rough: a fine, dense speckle, tinted dark by the theme
    if (kind === 'ice') { const g = 236 + (n2[k] - 0.5) * 20 - cr[k] * 60, gl = n3[k] > 0.96 ? 20 : 0; return [g * 0.9 + gl, g * 0.97 + gl, 255, 0.3 * v - cr[k] * 0.6, gl || cr[k] ? 0.5 : 0.12]; }
    if (kind === 'mud') { const pud = n2[k] > 0.62, g = 150 + (n1[k] - 0.5) * 50; return pud ? [g * 0.55, g * 0.45, g * 0.35, 0, 0.12] : [g, g * 0.78, g * 0.55, v, 0.9]; }
    if (kind === 'caramel') { const sw = 0.5 + 0.5 * Math.sin((i + j) * 0.18 / S + n1[k] * 7), g = 215 + sw * 30; return [g, g * 0.75, g * 0.4, 0.4 * sw + 0.2 * n2[k], 0.18]; }
    const r = 0.5 + 0.5 * Math.sin(Math.hypot(i - W / 2, j - W / 2) * 0.5 / S + n1[k] * 3), g = 200 + r * 40;
    return [g, g * 0.82, g * 0.55, 0.3 * r + 0.3 * n2[k], 0.95];
  }, 2.4);
}
let built = null;
/** The textures and materials (built the first time they are asked for). The tier comes from golfquality.js: the low tier leaves out the normal maps and uses plain lit materials. */
export function golfMaterials() {
  if (built) return built;
  const low = isLow(), T = { turf: makeTurf(), brick: makeBrick(), stone: makeStone(), wood: makeWood(), metal: makeMetal(), sand: makeSand() };
  const lam = (t, color = '#ffffff', extra = {}) => {
    const common = { map: t.map, normalMap: low ? null : t.normal, normalScale: new THREE.Vector2(0.9, 0.9), color, ...extra };
    const m = low ? new THREE.MeshLambertMaterial(common) : new THREE.MeshStandardMaterial({ ...common, roughnessMap: t.rough, roughness: 1, metalness: t.metal || 0, envMapIntensity: 0.55 });
    for (const key in T) if (T[key] === t) m.userData.neon = key; return m;
  };
  built = {
    tex: T,
    turf: lam(T.turf, '#ffffff', { vertexColors: true }),
    brick: lam(T.brick), stone: lam(T.stone), wood: lam(T.wood),
    plaster: lam(T.stone, '#fff4dc'), shingle: lam(T.wood, '#e8604e'), darkwood: lam(T.wood, '#8a5a38'), metal: lam(T.metal, '#aab2bd'),
    red: lam(T.metal, '#e04a4a'), blue: lam(T.metal, '#4d8fe0'), cream: lam(T.metal, '#fffaf0'),
    lam,
    /** The lawn material of a themed hole ('grass' is the turf): cached, tinted by the hole's vertex colours. */
    /** The map and normal map of a surface patch (ice, mud, caramel, quicksand), tinted by the caller; null on the low tier. */
    patch(kind) { if (isLow()) return null; const key = 'p_' + kind; if (!T[key]) T[key] = makePatch(kind); return T[key]; },
    ground(kind) { if (!kind || kind === 'grass') return built.turf; const key = 'g_' + kind; if (!built[key]) { const t = makeGround(kind); T[key] = t; built[key] = lam(t, '#ffffff', { vertexColors: true }); built[key].userData.neon = 'turf'; } return built[key]; },
  };
  return built;
}

const boxCache = new Map();
/** A box of the given size whose texture repeats by size, so it is never stretched (one tile = `tile` units). */
export function boxGeo(sx, sy, sz, tile = 1.5) {
  const key = `${Math.round(sx * 20)}|${Math.round(sy * 20)}|${Math.round(sz * 20)}|${tile}`;
  let g = boxCache.get(key); if (g) return g;
  g = new THREE.BoxGeometry(sx, sy, sz); const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];      // the faces: +x, -x, +y, -y, +z, -z
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile); }
  boxCache.set(key, g); return g;
}
