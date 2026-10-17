// The things lying on the trail that the rider has to jump: logs, stumps, rocks, stacked logs and boulders, built from a few flat-shaded
// low-poly shapes in the same palette as the scenery. Meshes are made when an obstacle comes into range and dropped when it is far behind.
import * as THREE from 'three';

export const KINDS = {
  log:    { label: 'Log',     h: 0.55, hw: 0.62, big: false },
  stump:  { label: 'Stump',   h: 0.58, hw: 0.55, big: false },
  rock:   { label: 'Rock',    h: 0.62, hw: 0.8,  big: false },
  logs2:  { label: 'Log pile', h: 1.15, hw: 1.0, big: true },
  boulder: { label: 'Boulder', h: 1.5, hw: 1.2,  big: true },
};

const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const COL = { bark: new THREE.Color('#6a4a2d'), bark2: new THREE.Color('#563a22'), ring: new THREE.Color('#d8b57a'), rock: new THREE.Color('#8d8a82'), rock2: new THREE.Color('#6f6d66'), moss: new THREE.Color('#5f8a4a') };

const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const tint = (geo, fn) => {                                         // per-vertex colours (so one material and one draw call per piece)
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i), i); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
};
const jitter = (geo, seed, amt) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const k = Math.round(p.getX(i) * 50) * 7 + Math.round(p.getY(i) * 50) * 13 + Math.round(p.getZ(i) * 50) * 29; p.setXYZ(i, p.getX(i) * (1 + (hash(k, seed) - 0.5) * amt), p.getY(i) * (1 + (hash(k, seed + 1) - 0.5) * amt), p.getZ(i) * (1 + (hash(k, seed + 2) - 0.5) * amt)); } geo.computeVertexNormals(); return geo; };

/** A log lying across the trail (its axis along z), with pale cut ends. */
function logGeo(r, len, seed) {
  const g = new THREE.CylinderGeometry(r, r * (0.92 + hash(seed, 1) * 0.1), len, 9, 1).rotateX(Math.PI / 2);
  jitter(g, seed, 0.12);
  return tint(g, (c, x, y, z) => { const end = Math.abs(z) > len * 0.495; c.copy(end ? COL.ring : (hash(Math.round(x * 20), seed) > 0.55 ? COL.bark2 : COL.bark)); });
}
function stumpGeo(r, h, seed) {
  const g = new THREE.CylinderGeometry(r * 0.85, r * 1.15, h, 8, 1); jitter(g, seed, 0.14);
  return tint(g, (c, x, y) => { c.copy(y > h * 0.49 ? COL.ring : (hash(Math.round(x * 15 + y * 9), seed) > 0.5 ? COL.bark2 : COL.bark)); });
}
function rockGeo(r, sy, sz, seed, detail = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail); g.scale(1, sy, sz); jitter(g, seed, 0.3);
  return tint(g, (c, x, y, z, i) => { c.copy(COL.rock).lerp(COL.rock2, 0.5 - y / (r * sy * 2.4)); if (y > r * sy * 0.55 && hash(i, seed) > 0.45) c.lerp(COL.moss, 0.45); });
}

/** The meshes of one obstacle `o` ({ kind, x, h, hw, id }) standing on `ground`. */
export function buildObstacle(o, ground, laneZ) {
  const g = new THREE.Group(), K = KINDS[o.kind], seed = o.id * 3 + 1, yaw = (hash(seed, 4) - 0.5) * 0.7;
  const add = (geo, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  if (o.kind === 'log') { const r = K.h / 2 * 1.05; add(logGeo(r, 6.2, seed), 0, r - 0.04, 0, yaw); }
  else if (o.kind === 'stump') { add(stumpGeo(0.58, K.h + 0.1, seed), 0, K.h / 2 - 0.05, 0); add(stumpGeo(0.4, 0.4, seed + 5), 1.6, 0.18, 1.4); }
  else if (o.kind === 'rock') { add(rockGeo(0.95, 0.68, 1.15, seed), 0, K.h - 0.95 * 0.68, 0); add(rockGeo(0.45, 0.7, 0.9, seed + 2), 1.1, 0.2, 1.3); add(rockGeo(0.35, 0.7, 0.9, seed + 3), -1.3, 0.15, -1.1); }
  else if (o.kind === 'logs2') {
    const r = 0.32; add(logGeo(r, 6, seed), 0, r - 0.04, -0.38, yaw * 0.6); add(logGeo(r, 5.6, seed + 1), 0.1, r - 0.04, 0.38, yaw * 0.6 + 0.05);
    add(logGeo(r * 0.95, 5.8, seed + 2), 0.05, r * 2.2, 0, yaw * 0.6 - 0.04);
  }
  else { add(rockGeo(1.45, 0.72, 1.35, seed, 1), 0, K.h - 1.45 * 0.72, 0); add(rockGeo(0.7, 0.7, 1, seed + 4), 1.5, 0.3, 1.8); }
  g.position.set(o.x, ground, laneZ);
  g.userData.base = ground;
  return g;
}
