// The planting round the outside of a hole: shrubs, boulders, flower patches, small conifers and grass tufts, set in the ground in world coordinates (so each one sits at the real height of
// the ground there). Placed along the hole's outline with a seeded generator, kept out of every other hole's corridor.
import * as THREE from 'three';
import { mulberry32 } from './golfhero.js?v=20261029193608';
import { toWorld } from './golfsites.js?v=20261029193608';

const jitter = (geo, amt, seed) => {                       // roughen a shape so every boulder and bush is a little lumpy
  const r = mulberry32(seed), p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)}|${p.getY(i).toFixed(3)}|${p.getZ(i).toFixed(3)}`; let f = seen.get(key);
    if (!f) { f = [1 + (r() - 0.5) * amt, 1 + (r() - 0.5) * amt, 1 + (r() - 0.5) * amt]; seen.set(key, f); }
    p.setXYZ(i, p.getX(i) * f[0], p.getY(i) * f[1], p.getZ(i) * f[2]);
  }
  geo.computeVertexNormals(); return geo;
};
let shared = null;
function parts() {
  if (shared) return shared;
  const flat = (color, neon) => { const m = new THREE.MeshLambertMaterial({ color, flatShading: true }); m.userData.neon = neon; return m; };
  shared = {
    bush: { geo: jitter(new THREE.IcosahedronGeometry(0.5, 1), 0.35, 11), mat: flat('#ffffff', 'bush'), colors: ['#4f9d4a', '#5fb455', '#3f8a45', '#6cc060', '#74a944'], lift: 0.22 },
    rock: { geo: jitter(new THREE.IcosahedronGeometry(0.5, 0), 0.45, 5), mat: flat('#ffffff', 'rock'), colors: ['#9b968c', '#b0aa9d', '#847f78', '#a8a095', '#bdb6a6'], lift: 0.1 },
    flower: { geo: new THREE.IcosahedronGeometry(0.5, 0), mat: flat('#ffffff', 'flower'), colors: ['#ff6f91', '#ffd166', '#ffffff', '#c792ea', '#ff9f68', '#7fd1ff'], lift: 0.22 },
    conifer: { geo: new THREE.ConeGeometry(0.5, 1.4, 7), mat: flat('#ffffff', 'conifer'), colors: ['#2f7a4a', '#3a8a52', '#2a6b45'], lift: 0.7 },
    tuft: { geo: new THREE.ConeGeometry(0.5, 1, 5), mat: flat('#ffffff', 'tuft'), colors: ['#8fd16a', '#7cc45f', '#a3d975'], lift: 0.28 },
  };
  return shared;
}

/**
 * The planting for one hole. `site` is its place in the world, `ground(x, z)` the real height of the ground, `avoid(x, z)` says whether a spot is in some hole's corridor.
 * Returns { group, dispose }.
 */
export function buildDecor(h, site, ground, avoid, density = 1) {
  const P = parts(), r = mulberry32(h.seed ^ 0x2c1b3c6d), items = { bush: [], rock: [], flower: [], conifer: [], tuft: [] }, O = h.outline;
  let area = 0; for (let i = 0; i < O.length; i++) { const a = O[i], b = O[(i + 1) % O.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1, put = (type, x, z, sx, sy, sz, rot) => { const w = toWorld(site, x, z); if (avoid(w.x, w.z)) return false; items[type].push([w.x, w.z, sx, sy, sz, rot]); return true; };
  let carry = 0;
  for (let i = 0; i < O.length; i++) {
    const a = O[i], b = O[(i + 1) % O.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dx * dx + dz * dz); if (l < 1e-6) continue;
    const nx = (sgn * dz) / l, nz = (-sgn * dx) / l;
    carry += l; if (carry < 1.0 / density) continue; carry = 0;
    const d = 0.85 + r() * 1.9, x = (a[0] + b[0]) / 2 + nx * d, z = (a[1] + b[1]) / 2 + nz * d, k = r(), rot = r() * 6.283;
    if (k < 0.36) { const s = 0.55 + r() * 0.75; put('bush', x, z, s * (1 + r() * 0.3), s * 0.8, s * (1 + r() * 0.3), rot); }
    else if (k < 0.52) { const s = 0.3 + r() * 0.55; put('rock', x, z, s * 1.3, s * 0.8, s, rot); if (r() < 0.5) put('rock', x + 0.4, z + 0.3, s * 0.6, s * 0.5, s * 0.6, rot + 1); }
    else if (k < 0.7) { if (put('bush', x, z, 0.5, 0.35, 0.5, rot)) for (let f = 0; f < 5; f++) put('flower', x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.2, 0.2, 0.2, 0); }
    else if (k < 0.82) { const s = 0.7 + r() * 0.6; put('conifer', x, z, s, s * (1 + r() * 0.5), s, rot); }
    else if (k < 0.94) { for (let f = 0; f < 3; f++) put('tuft', x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.2 + r() * 0.12, 0.5 + r() * 0.5, 0.2 + r() * 0.12, rot + f); }
  }
  const group = new THREE.Group(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), c = new THREE.Color(), rc = mulberry32(h.seed ^ 0x7777);
  for (const type in items) {
    const list = items[type]; if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(P[type].geo, P[type].mat, list.length);
    list.forEach((it, i) => {
      const y = ground(it[0], it[1]); q.setFromAxisAngle(UP, it[5]);
      m.compose(new THREE.Vector3(it[0], y + P[type].lift * it[3] / (type === 'bush' ? 0.8 : 1) * (type === 'rock' ? 0.6 : 1), it[1]), q, new THREE.Vector3(it[2], it[3], it[4])); mesh.setMatrixAt(i, m);
      c.set(P[type].colors[(rc() * P[type].colors.length) | 0]); c.offsetHSL(0, 0, (rc() - 0.5) * 0.06); mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  return { group, dispose() { for (const o of group.children) o.dispose?.(); } };
}
