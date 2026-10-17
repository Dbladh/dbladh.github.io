// The game's endless ground. The game starts in the real scene: the bike rides the real hills along its lane, and
// where the real terrain runs out (x = XT) the ground carries on to the right, built from the terrain's own edge
// profile plus a generated lane (rollers, whoops, kickers, doubles, step-downs, climbs: harder the further you go).
//  - Ground chunks of 24 units are recycled around the camera; the real terrain uses the same material, so the seam is quiet.
//  - A cut face ("skirt") runs along the front of the lane for the whole ride, so with the village in front of it clipped
//    away the bike appears to ride along a clean section of hillside.
//  - Trees, pines and bushes (instanced) and two layers of hazy hills fill in the new ground.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261016210713';
import { heightAt as terrainAt } from './world.js?v=20261016210713';

export const XT = 186;          // where the real terrain hands over to the generated ground
const DX = 0.5;                 // lane resolution
const CHUNK = 24;
const COLS = CHUNK / DX + 1;
const X0 = -192;                // chunk grid origin
const POOL = 7;
const PER = { pine: 5, round: 4, bush: 9 };

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const C = (hex) => new THREE.Color(hex);

export function createTrack(scene, { laneZ, material, seed = 1 }) {
  const group = new THREE.Group();
  const ZC = laneZ + 5.5;                           // the cut face
  let rng = mulberry32(seed >>> 0), seedNow = seed;
  const BASE = terrainAt(XT, laneZ);
  const profile = new Map();                        // terrain height along the edge at XT, by z (cached)
  const prof = (z) => { const k = Math.round(z * 4); if (!profile.has(k)) profile.set(k, terrainAt(XT, k / 4)); return profile.get(k); };
  const weight = (z) => 0.3 + 0.7 * smooth01((z - laneZ + 34) / 30);   // the lane's rises fade toward the back

  // ---------------- lane generator (heights relative to the real terrain's edge) ----------------
  let H = [0];
  const last = () => H[H.length - 1];
  const push = (y) => H.push(y);
  const flat = (len) => { const y = last(); for (let i = 0; i < len / DX; i++) push(y); };
  const ease = (dy, len) => { const y = last(), n = Math.round(len / DX); for (let i = 1; i <= n; i++) push(y + dy * smooth01(i / n)); };
  const whoops = (n, amp, wl) => { const y = last(), m = Math.round(wl / DX); for (let k = 0; k < n; k++) for (let i = 1; i <= m; i++) push(y + amp * 0.5 * (1 - Math.cos((i / m) * Math.PI * 2))); };
  const kicker = (rise, slope, landLen, drop) => {
    const y = last(), n = Math.round(rise / slope / DX);
    for (let i = 1; i <= n; i++) push(y + rise * (i / n) * (i < 6 ? 0.55 + 0.45 * smooth01(i / 6) : 1));
    ease(-(rise + drop), landLen);
  };
  function piece(d) {
    const lvl = last();                               // relative to the edge: keep it within about -2 .. +11
    const low = lvl < 0, high = lvl > 8, r = rng();
    const k = () => ({ rise: 2.2 + d * 2.8 + rng() * 1.0, slope: 0.62 + rng() * 0.2, land: 18 + rng() * 8 + d * 6 });
    if (low && r < 0.55) { ease(3 + rng() * 3, 28 + rng() * 14); flat(6 + rng() * 6); return; }
    if (high && r < 0.6) { ease(-(3 + rng() * 4), 26 + rng() * 14); flat(4 + rng() * 6); return; }
    if (r < 0.2) { whoops(3 + Math.floor(rng() * (2 + d * 3)), 0.45 + rng() * 0.5 + d * 0.3, 6 + rng() * 2.5); flat(4 + rng() * 5); }
    else if (r < 0.46) { const a = k(); kicker(a.rise, a.slope, a.land, high ? 1 + rng() * 2 : -0.2); flat(6 + rng() * 6); }
    else if (r < 0.62) { const a = k(); kicker(a.rise, a.slope, a.land * 0.8, 0); flat(7 + rng() * 4); const b = k(); kicker(b.rise, b.slope, b.land, lvl > 3 ? 1 : 0); flat(8 + rng() * 6); }
    else if (r < 0.74) { ease((rng() < 0.5 ? -1 : 1) * (2 + rng() * 2.5), 14 + rng() * 8); flat(5 + rng() * 6); }
    else if (r < 0.9) { ease((lvl > 4 ? -1 : 1) * (2 + rng() * 3), 36 + rng() * 26); flat(4 + rng() * 5); }
    else flat(10 + rng() * 10);
  }
  function ensure(xMax) {
    while (XT + (H.length - 1) * DX < xMax) piece(Math.min(1, (H.length - 1) * DX / 1800));
  }
  const delta = (x) => {
    if (x <= XT) return 0;
    ensure(x + 60);
    const f = (x - XT) / DX, i = Math.floor(f);
    return H[i] + (H[i + 1] - H[i]) * (f - i);
  };
  /** Ground height at the lane (what the bike rides on). */
  const laneAt = (x) => (x < XT ? terrainAt(x, laneZ) : BASE + delta(x));
  /** Ground height anywhere on the generated stretch. */
  const groundAt = (x, z) => (x < XT ? terrainAt(x, z) : prof(z) + weight(z) * delta(x));
  const slopeAt = (x) => (laneAt(x + 0.5) - laneAt(x - 0.5));
  flat(30);

  // ---------------- ground chunks ----------------
  const ZS = [-34, -26, -18, -12, -8, -4, -1.6, 0, 1.6, 3.2, 5.5].map((o) => laneZ + o);   // top rows
  const NT = ZS.length;
  const FACE = [{ dy: 0 }, { dy: -2.6 }, { dy: -7 }, { abs: -90 }];
  const NR = NT + FACE.length;
  const cLow = C('#4cbf4f').lerp(C(PAL.sage), 0.13), cHigh = C('#d6f48a').lerp(C(PAL.sage), 0.1), cDeep = C('#3f9a58'), cWarm = C('#f0ee80');
  const faceCol = [C(PAL.timber), C(PAL.timber).lerp(C(PAL.timberDeep), 0.4), C(PAL.timberDeep), C(PAL.timberDeep).multiplyScalar(0.5)];
  const tc = new THREE.Color();
  function topColor(x, z, h) {
    const t = Math.min(1, Math.max(0, (h + 3) / 16));
    tc.copy(cLow).lerp(cHigh, t).lerp(cDeep, smooth01((0.25 - t) / 0.25) * 0.5);
    const n = 0.5 + 0.25 * Math.sin(x * 0.05 + 40) * Math.cos(z * 0.05) + 0.2 * Math.sin(x * 0.13 + z * 0.09);
    tc.lerp(cWarm, smooth01((n - 0.52) / 0.26) * 0.65);
    return tc.offsetHSL(0, 0, (hash(x * 7.1, z * 5.3) - 0.5) * 0.06);
  }
  const idxArr = [];
  for (let i = 0; i < COLS - 1; i++) for (let r = 0; r < NR - 1; r++) { const p = i * NR + r, q = (i + 1) * NR + r; idxArr.push(p, p + 1, q, q, p + 1, q + 1); }
  const chunks = [];
  for (let i = 0; i < POOL; i++) {
    const g = new THREE.BufferGeometry();
    for (const [n, s] of [['position', 3], ['color', 3], ['uv', 2]]) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(COLS * NR * s), s));
    g.setIndex(idxArr);
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = false; m.visible = false; m.receiveShadow = true;
    group.add(m);
    chunks.push({ mesh: m, geo: g, idx: -999, slot: i });
  }
  function fillChunk(c, idx) {
    c.idx = idx;
    const pos = c.geo.attributes.position, col = c.geo.attributes.color, uv = c.geo.attributes.uv;
    const x0 = X0 + idx * CHUNK;
    for (let i = 0; i < COLS; i++) {
      const x = x0 + i * DX, real = x < XT;
      const faceTop = real ? terrainAt(x, ZC) : prof(ZC) + weight(ZC) * delta(x);
      for (let r = 0; r < NR; r++) {
        const v = i * NR + r;
        let y, z, cc;
        if (r < NT) {
          z = ZS[r];
          y = real ? faceTop : groundAt(x, z);
          if (real) z = ZC; // collapsed onto the cut: the real terrain draws this part
          cc = topColor(x, z, y);
        } else {
          const f = FACE[r - NT]; z = ZC;
          y = f.abs !== undefined ? f.abs : faceTop + f.dy;
          cc = tc.copy(faceCol[r - NT]).offsetHSL(0, 0, (hash(Math.floor(x / DX), r) - 0.5) * 0.05);
        }
        pos.setXYZ(v, x, y, z); col.setXYZ(v, cc.r, cc.g, cc.b); uv.setXY(v, x / 64, z / 64);
      }
    }
    pos.needsUpdate = true; col.needsUpdate = true; uv.needsUpdate = true;
    c.geo.computeVertexNormals();
    c.mesh.visible = true;
  }

  // ---------------- scenery on the new ground ----------------
  const flatMat = () => new THREE.MeshLambertMaterial({ flatShading: true });
  const mk = (geo, n, color) => {
    const m = new THREE.InstancedMesh(geo, flatMat(), n);
    m.frustumCulled = false; if (color) m.material.color.set(color);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) { m.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); m.setColorAt(i, new THREE.Color(1, 1, 1)); }
    group.add(m); return m;
  };
  const inst = {
    pine: mk(new THREE.ConeGeometry(1.3, 5.2, 6).translate(0, 3.6, 0), POOL * PER.pine),
    crown: mk(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.6, 0), POOL * PER.round),
    trunk: mk(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 5).translate(0, 1.2, 0), POOL * PER.round, PAL.timberDeep),
    bush: mk(new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.72, 1).translate(0, 0.45, 0), POOL * PER.bush),
  };
  const GREENS = [PAL.leaf, PAL.leaf2, PAL.moss, '#5f8a4e'].map(C);
  const WARM = [PAL.marigold, PAL.coral, PAL.terracotta].map(C);
  const dummy = new THREE.Object3D(), pc = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function plant(c, idx) {
    const x0 = X0 + idx * CHUNK, on = x0 + CHUNK > XT;
    const r = mulberry32((idx * 7919 + seedNow * 104729) >>> 0);
    const put = (mesh, per, i, x, z, s, color) => {
      const slot = c.slot * per + i;
      if (!on || x < XT + 2) { mesh.setMatrixAt(slot, ZERO); return; }
      dummy.position.set(x, groundAt(x, z) - 0.1, z); dummy.scale.set(s, s * (0.9 + r() * 0.3), s); dummy.rotation.set(0, r() * 6, 0); dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      if (color) mesh.setColorAt(slot, color);
    };
    const zr = (near, far) => laneZ - (near + Math.pow(r(), 0.8) * (far - near));
    for (let i = 0; i < PER.pine; i++) put(inst.pine, PER.pine, i, x0 + r() * CHUNK, zr(4, 32), 0.8 + r() * 0.9, pc.copy(GREENS[Math.floor(r() * 3)]).offsetHSL(0, 0, -0.1 + r() * 0.05));
    for (let i = 0; i < PER.round; i++) {
      const x = x0 + r() * CHUNK, z = zr(4, 32), s = 0.9 + r() * 0.8, warm = r() < 0.18;
      put(inst.trunk, PER.round, i, x, z, s, null);
      put(inst.crown, PER.round, i, x, z, s, pc.copy(warm ? WARM[Math.floor(r() * 3)] : GREENS[Math.floor(r() * 4)]));
    }
    for (let i = 0; i < PER.bush; i++) put(inst.bush, PER.bush, i, x0 + r() * CHUNK, zr(2.4, 22), 0.8 + r() * 0.9, pc.copy(GREENS[Math.floor(r() * 4)]).offsetHSL(0, 0, 0.02));
    for (const m of Object.values(inst)) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // ---------------- far hills beyond the real terrain's edge ----------------
  const HILLS = [
    { z: laneZ - 62, base: -4, amp: 14, wl: 90, color: C(PAL.blueGreen).lerp(C(PAL.sage), 0.3), step: 2.5 },
    { z: laneZ - 130, base: 8, amp: 22, wl: 150, color: C(PAL.softBlue).lerp(C(PAL.blueGreen), 0.4), step: 4 },
  ];
  const HW = 120;
  const hillY = (L, x) => BASE + L.base + L.amp * (0.5 + 0.28 * Math.sin(x / L.wl * 6.28 + 1) + 0.16 * Math.sin(x / L.wl * 15.1 + 2.3) + 0.06 * Math.sin(x / L.wl * 33 + 0.4));
  for (const L of HILLS) {
    L.meshes = [];
    const n = Math.round(HW / L.step) + 1;
    for (let k = 0; k < 4; k++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const ix = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      g.setIndex(ix);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: L.color, flatShading: true, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.userData.idx = -999; group.add(m); L.meshes.push(m);
    }
  }
  function fillHill(L, m, idx) {
    m.userData.idx = idx;
    const p = m.geometry.attributes.position, x0 = idx * HW, n = Math.round(HW / L.step) + 1;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * L.step;
      p.setXYZ(i * 2, x, hillY(L, x), L.z); p.setXYZ(i * 2 + 1, x, -140, L.z);
    }
    p.needsUpdate = true; m.geometry.computeVertexNormals();
  }

  scene.add(group);
  group.visible = false;

  return {
    group, laneAt, groundAt, slopeAt, XT, cutZ: ZC,
    get seed() { return seedNow; },
    set visible(v) { group.visible = v; },
    reset(newSeed = seedNow) {
      seedNow = newSeed; rng = mulberry32(newSeed >>> 0);
      H = [0]; flat(30);
      for (const c of chunks) c.idx = -999;
      for (const L of HILLS) L.meshes.forEach((m) => { m.userData.idx = -999; });
    },
    /** Keep chunks, scenery and hills around the camera (call every frame with the camera's x and y). */
    update(camX, camY) {
      const first = Math.floor((camX - 38 - X0) / CHUNK), lastC = Math.floor((camX + 62 - X0) / CHUNK);
      ensure(X0 + (lastC + 1) * CHUNK + 40);
      const have = new Map(chunks.map((c) => [c.idx, c]));
      const free = chunks.filter((c) => c.idx < first || c.idx > lastC);
      for (let i = first; i <= lastC; i++) {
        if (have.has(i)) continue;
        const c = free.pop();
        if (!c) break;
        fillChunk(c, i); plant(c, i);
      }
      for (const c of free) c.mesh.visible = false;
      for (const L of HILLS) {
        const f = Math.floor((camX - 170) / HW);
        L.meshes.forEach((m, k) => { const want = f + k; if (m.userData.idx !== want) fillHill(L, m, want); m.position.y = (camY - BASE) * 0.8; });
        L.meshes.forEach((m) => { m.visible = (m.userData.idx + 1) * HW > XT - 60; });
      }
    },
    dispose() { scene.remove(group); },
  };
}
