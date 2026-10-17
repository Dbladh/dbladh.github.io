// The game's endless ground. The game starts in the real scene: the bike rides the real hills along its lane, and
// where the real terrain runs out (x = XT) the ground carries on to the right, built from the terrain's own edge
// profile plus a generated lane (rollers, whoops, kickers, doubles, step-downs, climbs: harder the further you go).
//  - Ground chunks of 24 units are recycled around the camera; the real terrain uses the same material, so the seam is quiet.
//  - A cut face ("skirt") runs along the front of the lane for the whole ride, so with the village in front of it clipped
//    away the bike appears to ride along a clean section of hillside.
//  - Trees, pines and bushes (instanced) and two layers of hazy hills fill in the new ground.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261016215148';
import { heightAt as terrainAt } from './world.js?v=20261016215148';

export const XT = 189.6;          // where the real terrain hands over to the generated ground
const DX = 0.5;                 // lane resolution
const CHUNK = 24;
const DXM = 0.6;                // ground mesh resolution along the ride (the lane itself is sampled every DX)
const COLS = CHUNK / DXM + 1;
const X0 = -192;                // chunk grid origin
const POOL = 7;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const C = (hex) => new THREE.Color(hex);

export function createTrack(scene, { laneZ, material, world, seed = 1 }) {
  const group = new THREE.Group();
  const CUTZ = laneZ + 3.5;                         // home-scene objects nearer the camera than this are sliced away while playing
  let rng = mulberry32(seed >>> 0), seedNow = seed;
  const BASE = terrainAt(XT, laneZ);
  const profile = new Map();                        // terrain height along the edge at XT, by z (cached)
  const prof = (z) => { const k = Math.round(z * 4); if (!profile.has(k)) profile.set(k, terrainAt(XT, k / 4)); return profile.get(k); };
  const weight = (z) => (z > laneZ + 3 ? 1 - 0.45 * smooth01((z - laneZ - 3) / 37) : 0.3 + 0.7 * smooth01((z - laneZ + 34) / 30));   // the lane's rises fade toward the back, and a little toward the camera

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
  const groundAt = (x, z) => {
    if (x < XT) return terrainAt(x, z);
    const drop = z > laneZ + 3 ? 7 * smooth01((z - laneZ - 3) / 38) * smooth01((x - XT) / 40) : 0;   // hills fall away toward the camera (eased in so the seam with the real terrain is invisible)
    const far = z < laneZ - 36 ? smooth01((laneZ - 36 - z) / 90) * smooth01((x - XT) / 60) : 0;   // far ridges vary along the ride instead of repeating the edge's profile
    const ridge = far * (7 * Math.sin(x * 0.021 + z * 0.05) + 4 * Math.sin(x * 0.047 - z * 0.03 + 1.7));
    return prof(z) + weight(z) * delta(x) - drop + ridge;
  };
  const slopeAt = (x) => (laneAt(x + 0.5) - laneAt(x - 0.5));
  flat(30);

  // ---------------- ground chunks ----------------
  // Rows run from far behind the lane to past the camera, so the ground in front of the bike is green hillside that
  // falls away toward the viewer (no cut face, no dirt wall).
  const ZS = []; for (let z = -200; z < laneZ - 34; z += 3.2) ZS.push(z); for (let z = laneZ - 34; z <= laneZ + 56.01; z += 1.25) ZS.push(z);   // all the way back to the real terrain's far edge   // as fine as the real terrain, so its colours and relief carry over
  const NR = ZS.length;
  const tc = new THREE.Color();
  /** The real terrain's own colour function (fields, mud, rock, grain), with steepness measured on the generated ground. */
  function topColor(x, z, h) {
    const slope = (Math.abs(groundAt(x + 1.2, z) - h) + Math.abs(groundAt(x, z + 1.2) - h)) / 1.2;
    return world.terrainColor(x, z, h, slope, tc);
  }
  const idxArr = [];
  for (let i = 0; i < COLS - 1; i++) for (let r = 0; r < NR - 1; r++) { const p = i * NR + r, q = (i + 1) * NR + r; idxArr.push(p, p + 1, q, q, p + 1, q + 1); }
  const chunks = [];
  for (let i = 0; i < POOL; i++) {
    const g = new THREE.BufferGeometry();
    for (const [n, sz] of [['position', 3], ['color', 3], ['uv', 2]]) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(COLS * NR * sz), sz));
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
      const x = x0 + i * DXM;
      for (let r = 0; r < NR; r++) {
        const v = i * NR + r, z = ZS[r], y = groundAt(x, z), cc = topColor(x, z, y);
        pos.setXYZ(v, x, y, z); col.setXYZ(v, cc.r, cc.g, cc.b); uv.setXY(v, x / 64, z / 64);
      }
    }
    pos.needsUpdate = true; col.needsUpdate = true; uv.needsUpdate = true;
    c.geo.computeVertexNormals();
    // only the part beyond the real terrain's edge is drawn (the real terrain draws the rest)
    const i0 = Math.min(COLS - 1, Math.max(0, Math.ceil((XT - x0) / DXM - 1e-6)));
    c.geo.setDrawRange(i0 * (NR - 1) * 6, (COLS - 1 - i0) * (NR - 1) * 6);
    c.mesh.visible = i0 < COLS - 1;
  }

  // ---------------- scenery on the new ground: the same trees, bushes, rocks, flowers and grass as the main scene ----------------
  const sceneryOf = chunks.map(() => null);
  function plant(c, idx) {
    if (sceneryOf[c.slot]) { sceneryOf[c.slot].traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); group.remove(sceneryOf[c.slot]); sceneryOf[c.slot] = null; }
    const x0 = Math.max(X0 + idx * CHUNK, XT + 2), x1 = X0 + (idx + 1) * CHUNK;
    if (x1 <= x0 + 1) return;
    const g = world.scatter({ x0, x1, hFn: groundAt, seed: idx * 7919 + seedNow * 104729, laneZ, farZ: laneZ - 70, density: ((x1 - x0) / CHUNK) * (0.15 + 0.85 * smooth01((x0 + (x1 - x0) / 2 - XT) / 80)) });   // the planting thickens gradually past the seam
    group.add(g); sceneryOf[c.slot] = g;
  }

  scene.add(group);
  group.visible = false;

  return {
    group, laneAt, groundAt, slopeAt, XT, cutZ: CUTZ,
    get seed() { return seedNow; },
    set visible(v) { group.visible = v; },
    reset(newSeed = seedNow) {
      seedNow = newSeed; rng = mulberry32(newSeed >>> 0);
      H = [0]; flat(30);
      for (const c of chunks) c.idx = -999;
    },
    /** Keep the ground chunks and their scenery around the camera (call every frame with the camera's x and y). */
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
      for (const c of free) { c.mesh.visible = false; if (sceneryOf[c.slot]) sceneryOf[c.slot].visible = false; }
    },
    dispose() { scene.remove(group); },
  };
}
