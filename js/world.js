// The landscape: layered rolling hills with a winding path, a village of varied cottages,
// several kinds of trees, bushes, rocks, flowers, clouds, and real point lights
// for cottage windows and fireflies at night. Everything is procedural (no model files)
// and seeded, so the layout is the same every visit.
import * as THREE from 'three';

// Where each billboard hill sits. `scale` shrinks the sign (the About sign is a small roadside one).
export const STOPS = {
  creativity:  { x: -34, z: -46, scale: 1,    hillR: 15, hillH: 7,   accent: '#ff9db8' },
  ai:          { x: 0,   z: -64, scale: 1,    hillR: 16, hillH: 9,   accent: '#8ec5ff' },
  engineering: { x: 34,  z: -46, scale: 1,    hillR: 15, hillH: 7,   accent: '#ffd36a' },
  about:       { x: -10, z: -14, scale: 0.45, hillR: 7,  hillH: 2.2, accent: '#9fdc8c' },
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
  return Math.sin((z - 22) * 0.075) * 8;
}

/** Ground height at (x, z). */
export function heightAt(x, z) {
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
  g.fillStyle = '#fcf6e8'; g.fillRect(0, 0, 1024, 576);
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
    const slab = box(L, 0.16, slope + 0.05, roofMat, 0, rh / 2 + 0.06, s * half / 2);
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
}

function buildHouse(rand) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const w = 3.6 + rand() * 1.8, d = 3 + rand() * 1.2, h = 2.2 + rand() * 0.8;
  const wallMat = mat(pick(WALLS)), roofMat = mat(pick(ROOFS));
  const trim = mat('#fff8ea'), shutterMat = mat(pick(SHUTTERS));
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfd9e8, emissive: 0xffb84a, emissiveIntensity: 0 });
  const stone = mat('#b8b0a0');

  g.add(box(w + 0.2, 0.35, d + 0.2, stone, 0, 0.175, 0));
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
    g.add(box(w2 + 0.2, 0.35, d2 + 0.2, stone, cx, 0.175, cz));
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
 * @param {{maxLights?: number}} [opts] maxLights caps real point lights (for weaker GPUs)
 */
export function buildWorld(scene, sections, opts = {}) {
  const maxLights = opts.maxLights ?? 14;
  const rand = rng(11);
  const pick = (a) => a[Math.floor(rand() * a.length)];

  const clouds = [];
  const boards = [];

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
    c.lerp(cPath, onPath * (1 - smooth(-60, -80, z)) * 0.95); // path dissolves on the AI hill
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
  const LIGHT_COLOR = 0xffb35a;

  const nearSign = (x, z, pad = 0) => Object.values(STOPS).some((s) => Math.hypot(x - s.x, z - s.z) < 9 * Math.max(s.scale, 0.8) + pad);
  const village = [
    [-4, 1], [-10, -1], [-18, 1], [-24, -1], [-31, 1], [-37, -1], [-44, 1], [-52, -1],
  ];
  for (const [z, side0] of village) {
    let placed = false;
    for (const side of [side0, -side0]) {
      const off = 6.5 + rand() * 3;
      const x = pathX(z) + side * off, zz = z + (rand() - 0.5) * 2;
      if (nearSign(x, zz)) continue;
      const hs = buildHouse(rand);
      const s = 0.95 + rand() * 0.35;
      hs.group.scale.setScalar(s);
      hs.group.position.set(x, heightAt(x, zz) - 0.05, zz);
      hs.group.rotation.y = Math.atan2(pathX(zz) - x, 5) + (rand() - 0.5) * 0.25;
      scene.add(hs.group);
      houses.push({ x, z: zz });
      windowMats.push(hs.glassMat);
      if (houseLights.length < maxLights) {
        const light = new THREE.PointLight(LIGHT_COLOR, 0, 11, 1.6);
        hs.group.updateMatrixWorld(true);
        light.position.copy(hs.lightAnchor).applyMatrix4(hs.group.matrixWorld);
        scene.add(light);
        houseLights.push(light);
      }
      break;
    }
  }
  const nearHouse = (x, z, r = 6.5) => houses.some((hh) => Math.hypot(x - hh.x, z - hh.z) < r);

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
    scene.add(g);
    clouds.push(g);
  }

  // ---- Fireflies: a glowing particle each, and real lights on a handful of them ----
  const FF = 70;
  const ffBase = [];
  const ffPos = new Float32Array(FF * 3);
  for (let i = 0; i < FF; i++) {
    const x = (rand() - 0.5) * 70, z = -30 + rand() * 50;
    const y = heightAt(x, z) + 1 + rand() * 3;
    ffBase.push({ x, y, z, ph: rand() * 6.28 });
    ffPos.set([x, y, z], i * 3);
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  // Soft round glow sprite (points are square by default).
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const gx = glow.getContext('2d');
  const grad = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = grad; gx.fillRect(0, 0, 64, 64);
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
    color: 0xe6ff8a, size: 16, sizeAttenuation: false, transparent: true, opacity: 0,
    map: new THREE.CanvasTexture(glow), depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(fireflies);
  const ffLights = [];
  const FF_LIGHTS = Math.max(0, Math.min(6, maxLights - houseLights.length));
  for (let i = 0; i < FF_LIGHTS; i++) {
    const l = new THREE.PointLight(0xd8ff6a, 0, 7, 1.6);
    scene.add(l);
    ffLights.push(l);
  }

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
    const frame = box(BOARD_W + 0.8, BOARD_H + 0.8, 0.5, frameMat, 0, cy, 0);
    frame.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshBasicMaterial({ map: drawBoard(sec.title, sec.teaser, s.accent) }),
    );
    face.position.set(0, cy, 0.27);
    face.userData.stopId = id;
    g.add(frame, face);
    for (const px of [-BOARD_W / 2 + 2.2, BOARD_W / 2 - 2.2]) {
      const h = BOARD_BOTTOM + 3;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 10), postMat);
      post.position.set(px, BOARD_BOTTOM - h / 2 + 0.61, -0.2);
      post.castShadow = true;
      g.add(post);
    }
    boardGroup.add(g);
    g.updateMatrixWorld(true);
    boards.push({
      id, face, scale: s.scale,
      center: face.getWorldPosition(new THREE.Vector3()),
      normal: new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta)),
    });
  }

  // ---- per-frame + day/night ----
  let time = 0;
  const HOUSE_I = 26, FF_I = 5;
  return {
    boards,
    /** Per-frame animation: drifting clouds, bobbing fireflies (and their lights). */
    update(dt) {
      time += dt;
      for (const cl of clouds) {
        cl.position.x += cl.userData.speed * dt;
        if (cl.position.x > 190) cl.position.x = -190;
      }
      const a = ffGeo.attributes.position;
      for (let i = 0; i < FF; i++) {
        const b = ffBase[i];
        const x = b.x + Math.sin(time * 0.6 + b.ph) * 1.4;
        const y = b.y + Math.sin(time * 0.9 + b.ph * 2) * 0.7;
        const z = b.z + Math.cos(time * 0.5 + b.ph) * 1.4;
        a.setXYZ(i, x, y, z);
        if (i < ffLights.length) ffLights[i].position.set(x, y, z);
      }
      a.needsUpdate = true;
    },
    /** 0 = daytime, 1 = full night. Switches on window glow and every night light. */
    setNight(n) {
      for (const m of windowMats) m.emissiveIntensity = n * 1.7;
      for (const l of houseLights) l.intensity = n * HOUSE_I;
      fireflies.material.opacity = n;
      ffLights.forEach((l, i) => { l.intensity = n * FF_I * (0.75 + 0.25 * Math.sin(time * 2 + i)); });
    },
  };
}
