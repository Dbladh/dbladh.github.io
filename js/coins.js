// Collectible coins along the ride: lines on the ground and arcs off the kicker lips. Generated per 48-unit block from the
// course seed (so the same course always has the same coins), drawn as one instanced mesh and spun/bobbed per frame.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261016221809';

const BLOCK = 48;
const CAP = 220;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createCoins(scene, track, laneZ) {
  const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14).rotateX(Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(PAL.marigold), emissive: new THREE.Color(PAL.marigold).multiplyScalar(0.7), flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, CAP);
  mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
  scene.add(mesh);

  let seed = 1, minX = 0;
  const blocks = new Map();
  const dummy = new THREE.Object3D();

  function build(b) {
    const list = [];
    const rng = mulberry32((b * 7919 + seed * 104729) >>> 0);
    const x0 = b * BLOCK, x1 = x0 + BLOCK;
    const add = (x, y) => { if (x >= minX && x < x1 + 20) list.push({ x, y, got: false }); };
    // arcs off lips
    const lips = [];
    for (let x = x0; x < x1; x += 0.5) {
      if (lips.length && x - lips[lips.length - 1] < 14) continue;
      if (track.slopeAt(x - 1) > 0.3 && track.slopeAt(x + 1) < track.slopeAt(x - 1) - 0.25) lips.push(x);
    }
    for (const lx of lips) {
      const gy = track.laneAt(lx);
      for (let k = 0; k < 7; k++) {
        const x = lx + 3 + k * 2.6, arc = gy + 1.8 + 4.2 * Math.sin(Math.PI * (k + 0.6) / 7.4);
        add(x, Math.max(arc, track.laneAt(x) + 1.5));
      }
    }
    // runs along the ground
    const runs = 1 + Math.floor(rng() * 2);
    for (let r = 0; r < runs; r++) {
      const sx = x0 + 4 + rng() * (BLOCK - 22), n = 4 + Math.floor(rng() * 5), wave = rng() < 0.35;
      if (lips.some((l) => sx + n * 2.4 > l - 3 && sx < l + 24)) continue;
      for (let k = 0; k < n; k++) { const x = sx + k * 2.4; add(x, track.laneAt(x) + 1.5 + (wave ? Math.sin(k * 0.9) * 0.9 : 0)); }
    }
    return list;
  }
  const blockOf = (b) => { let l = blocks.get(b); if (!l) { l = build(b); blocks.set(b, l); } return l; };

  return {
    /** New course: coins start after `startX + 24`. */
    reset(newSeed, startX) { seed = newSeed; minX = startX + 24; blocks.clear(); },
    set visible(v) { mesh.visible = v; },
    /** Redraw the coins near the camera. */
    update(camX, time) {
      let n = 0;
      const b0 = Math.floor((camX - 30) / BLOCK), b1 = Math.floor((camX + 80) / BLOCK);
      for (let b = b0; b <= b1 && n < CAP; b++) for (const c of blockOf(b)) {
        if (c.got || n >= CAP) continue;
        dummy.position.set(c.x, c.y + Math.sin(time * 2.2 + c.x) * 0.14, laneZ);
        dummy.rotation.set(0, time * 3.2 + c.x * 0.7, 0);
        dummy.scale.setScalar(1); dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    },
    /** Take every coin touching the bike (centre x, y; ~3.6 units long). Returns how many. */
    collect(x, y, k = 1) {
      let got = 0;
      const b0 = Math.floor((x - 3) / BLOCK), b1 = Math.floor((x + 3) / BLOCK);
      for (let b = b0; b <= b1; b++) for (const c of blockOf(b)) {
        if (c.got) continue;
        const dx = (c.x - x) / (2.1 * k), dy = (c.y - (y + 0.4 * k)) / (2.3 * k);
        if (dx * dx + dy * dy < 1) { c.got = true; got++; }
      }
      return got;
    },
  };
}
