// The mini-golf's materials: brick, boulder and stone, wood planks, painted metal and turf, all drawn once with the canvas (a few tiles of 128 px, a few milliseconds each)
// together with a normal map worked out from the same picture so the light catches the surface. Same chunky, warm style as the rest of the site.
import * as THREE from 'three';

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
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
/** Draw a colour picture and its height field with `paint(i, j) -> [r, g, b, height]`, then make the texture pair. */
function make(w, h, paint, strength) {
  const c = mk(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), hf = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [r, g, b, ht] = paint(i, j), o = (j * w + i) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; hf[j * w + i] = ht; }
  x.putImageData(img, 0, 0);
  return { map: tex(c), normal: tex(normalMap(hf, w, h, strength), true, false) };
}

function makeTurf() {
  const W = 128, n1 = noise(W, W, 8), n2 = noise(W, W, 3), n3 = noise(W, W, 1);
  return make(W, W, (i, j) => { const k = j * W + i, v = 0.7 * n1[k] + 0.3 * n2[k], fib = n3[k], g = 226 + v * 26 + (fib - 0.5) * 22; return [g * 0.96, g, g * 0.9, 0.35 * v + 0.65 * fib]; }, 2.2);
}
function makeBrick() {                                     // one brick with its mortar border: each instanced brick shows one
  const W = 128, H = 64, n1 = noise(W, H, 6), n2 = noise(W, H, 2);
  return make(W, H, (i, j) => {
    const m = 5, inside = i >= m && i < W - m && j >= m && j < H - m;
    const edge = inside ? Math.min(i - m, W - m - 1 - i, j - m, H - m - 1 - j) : -1;
    if (!inside) { const g = 205 + (n2[j * W + i] - 0.5) * 30; return [g, g * 0.95, g * 0.86, 0.05]; }
    const v = n1[j * W + i], s = n2[j * W + i], tone = 168 + v * 38 + (s - 0.5) * 28, round = Math.min(1, edge / 4);
    return [tone, tone * 0.52 + 14, tone * 0.38 + 8, 0.45 + 0.4 * round + 0.15 * s];
  }, 2.6);
}
function makeStone() {
  const W = 128, n1 = noise(W, W, 24), n2 = noise(W, W, 9), n3 = noise(W, W, 3), cracks = new Float32Array(W * W);
  for (let c = 0; c < 5; c++) { let x = rnd() * W, y = rnd() * W, a = rnd() * 6.28; for (let s = 0; s < 40; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 2; y += Math.sin(a) * 2; cracks[(((y | 0) + W) % W) * W + (((x | 0) + W) % W)] = 1; } }
  return make(W, W, (i, j) => { const k = j * W + i, v = 0.5 * n1[k] + 0.35 * n2[k] + 0.15 * n3[k], g = 150 + v * 78 - cracks[k] * 55; return [g * 1.02, g, g * 0.94, v * 0.8 + 0.2 * n3[k] - cracks[k] * 0.4]; }, 3.2);
}
function makeWood() {                                      // planks that run along the texture's u axis, with grain and a few knots
  const W = 128, H = 128, n1 = noise(W, H, 28, 4, 1), n2 = noise(W, H, 6, 5, 1), n3 = noise(W, H, 2), knots = [];
  for (let k = 0; k < 3; k++) knots.push([rnd() * W, rnd() * H, 3 + rnd() * 3]);
  return make(W, H, (i, j) => {
    const k = j * W + i, plank = Math.floor(j / 32), seam = j % 32 < 2 ? 1 : 0, shift = ((plank * 37) % 11) / 11;
    let v = 0.55 * n1[(((j + 7 * plank) % H) * W + i)] + 0.3 * n2[k] + 0.15 * n3[k] + shift * 0.2;
    let kn = 0; for (const [kx, ky, kr] of knots) { const d = Math.hypot(i - kx, (j - ky) * 1.4); if (d < kr) kn = Math.max(kn, 1 - d / kr); }
    const tone = 150 + v * 70 - seam * 70 - kn * 45;
    return [tone * 1.0, tone * 0.72, tone * 0.46, v * 0.5 - seam * 0.9 - kn * 0.3 + 0.5];
  }, 2.2);
}
function makeMetal() {                                     // brushed paint: fine streaks, a few scratches
  const W = 64, n1 = noise(W, W, 2, 12, 1), n2 = noise(W, W, 10, 1, 1), sc = new Float32Array(W * W);
  for (let s = 0; s < 14; s++) { let x = rnd() * W, y = rnd() * W; const l = 6 + rnd() * 14; for (let t = 0; t < l; t++) sc[(((y + t * 0.2) | 0) % W) * W + ((x + t) | 0) % W] = 1; }
  return make(W, W, (i, j) => { const k = j * W + i, g = 214 + (n1[k] - 0.5) * 26 + (n2[k] - 0.5) * 16 + sc[k] * 22; return [g, g, g, n1[k] * 0.4 + sc[k] * 0.3]; }, 1.4);
}

function makeSand() {                                     // fine grains, a few pebbles and soft ripples
  const W = 128, n1 = noise(W, W, 10, 3, 1), n2 = noise(W, W, 2), pe = new Float32Array(W * W);
  for (let p = 0; p < 18; p++) { const cx = rnd() * W, cy = rnd() * W, r = 1 + rnd() * 1.5; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j < r * r) pe[(((cy + j) | 0) + W) % W * W + (((cx + i) | 0) + W) % W] = 1; }
  return make(W, W, (i, j) => { const k = j * W + i, rip = 0.5 + 0.5 * Math.sin(j * 0.35 + n1[k] * 5), g = 226 + (n2[k] - 0.5) * 34 + (rip - 0.5) * 14 - pe[k] * 40; return [g, g * 0.9, g * 0.66 - pe[k] * 6, 0.3 * rip + 0.7 * n2[k] + pe[k] * 0.5]; }, 1.8);
}
let built = null;
/** The textures and materials (built the first time they are asked for). Pass `lowEnd` to leave out the normal maps. */
export function golfMaterials(lowEnd = false) {
  if (built) return built;
  const T = { turf: makeTurf(), brick: makeBrick(), stone: makeStone(), wood: makeWood(), metal: makeMetal(), sand: makeSand() };
  const lam = (t, color = '#ffffff', extra = {}) => new THREE.MeshLambertMaterial({ map: t.map, normalMap: lowEnd ? null : t.normal, normalScale: new THREE.Vector2(0.9, 0.9), color, ...extra });
  built = {
    tex: T,
    turf: lam(T.turf, '#ffffff', { vertexColors: true }),
    brick: lam(T.brick), stone: lam(T.stone), wood: lam(T.wood),
    plaster: lam(T.stone, '#fff4dc'), shingle: lam(T.wood, '#e8604e'), darkwood: lam(T.wood, '#8a5a38'), metal: lam(T.metal, '#aab2bd'),
    red: lam(T.metal, '#e04a4a'), blue: lam(T.metal, '#4d8fe0'), cream: lam(T.metal, '#fffaf0'),
    lam,
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
