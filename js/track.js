// The game's endless ground. The game starts in the real scene: the bike rides the real hills along its lane, and
// where the real terrain runs out (x = XT) the ground carries on to the right, built from the terrain's own edge
// profile plus a generated lane (rollers, whoops, kickers, doubles, step-downs, climbs: harder the further you go).
//  - Ground chunks of 24 units are recycled around the camera; the real terrain uses the same material, so the seam is quiet.
//  - A cut face ("skirt") runs along the front of the lane for the whole ride, so with the village in front of it clipped
//    away the bike appears to ride along a clean section of hillside.
//  - Trees, pines and bushes (instanced) and two layers of hazy hills fill in the new ground.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261017110320';
import { heightAt as terrainAt } from './world.js?v=20261017110320';

export const XT = 189.6;          // where the real terrain hands over to the generated ground
const DX = 0.5;                 // lane resolution
const CHUNK = 24;
const DXM = 0.6;                // ground mesh resolution along the ride (the lane itself is sampled every DX)
const COLS = CHUNK / DXM + 1;
const X0 = -192;                // chunk grid origin

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
  // hazards: gaps (pits between a lip and a far bank) and mud patches (slow the bike)
  const gaps = [], muds = [];
  let lastHazard = -1e9;
  const xNow = () => XT + (H.length - 1) * DX;
  const speedAt = (x) => 15 + Math.min(9, Math.max(0, x - 60) / 260) + 1.5;       // roughly how fast the rider will be here
  function gapPiece(d) {
    flat(10 + rng() * 4);
    const x = xNow() + 6, vx = speedAt(x);
    const rise = 3 + d * 2.5 + rng() * 0.8, slope = 0.72 + rng() * 0.14;
    const y0 = last(), n = Math.round(rise / slope / DX);
    for (let i = 1; i <= n; i++) push(y0 + rise * (i / n) * (i < 6 ? 0.55 + 0.45 * smooth01(i / 6) : 1));
    const lipY = last(), x0 = xNow();
    // width: always one a rider who is a little slow, and does not charge at all, still clears from the bare ramp with plenty of air time to square up
    // (a charged jump, or the speed you normally have, flies well past it); gaps grow only with how fast the rider will be and a little with distance
    const vs = vx - 3, vy = vs * slope * 1.15 + 1.5, flight = (vs * 2 * vy) / 24;
    const G = Math.max(8, flight * (0.42 + 0.3 * rng() + 0.15 * d));
    const floor = lipY - 14;
    for (let i = 0; i < Math.round(G / DX) - 1; i++) push(floor);
    push(lipY - rng() * 1.2);                                                       // the far bank, a touch lower than the lip
    gaps.push({ x0, x1: xNow() });
    ease(-(3 + rng() * 3), 22 + rng() * 10); flat(8);
  }
  function mudPiece(d) {
    flat(6);
    const W = 9 + rng() * 5 + d * 3, x0 = xNow();                                      // a patch you can hop (or grit through)
    ease(-0.35, 2); flat(W - 4); ease(0.35, 2);
    muds.push({ x0, x1: xNow() });
    flat(6);
  }
  function piece(d) {
    if (xNow() > XT + 40 && xNow() - lastHazard > 40 && rng() < 0.17 + 0.18 * d) {
      if (rng() < 0.55) gapPiece(d); else mudPiece(d);
      lastHazard = xNow(); return;
    }
    const lvl = last();                               // relative to the edge: keep it within about -2 .. +11
    const low = lvl < 0, high = lvl > 8, r = rng();
    const k = () => ({ rise: 3 + d * 3.2 + rng() * 1.0, slope: 0.7 + rng() * 0.2, land: 24 + rng() * 10 + d * 8 });   // bigger kickers: more air even without a jump
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
  /** Is x inside a gap (a pit)? */
  const inPit = (x) => { if (x < XT) return false; laneAt(x + 30); return gaps.some((g) => x > g.x0 + 0.3 && x < g.x1 - 0.1); };
  /** The gap x lies over, if any (its span). */
  const pitSpan = (x) => { if (x < XT) return null; laneAt(x + 30); return gaps.find((g) => x > g.x0 - 0.5 && x < g.x1 + 0.5) || null; };
  /** 0..1: how deep in mud x is (soft edges). */
  const mudAt = (x) => { if (x < XT) return 0; laneAt(x + 30); let m = 0; for (const u of muds) if (x > u.x0 - 0.5 && x < u.x1 + 0.5) m = Math.max(m, Math.min(smooth01((x - u.x0) / 1.5 + 0.2), smooth01((u.x1 - x) / 1.5 + 0.2))); return m; };
  /** The gap whose lip is at x (within a metre), if any. */
  const pitAfter = (x) => { laneAt(x + 80); return gaps.find((g) => Math.abs(g.x0 - x) < 1.2) || null; };
  /** The next hazard starting within `range` ahead of x: { type, x0, x1 } or null. */
  const hazardAhead = (x, range) => {
    laneAt(x + range + 20);
    let best = null;
    for (const g of gaps) if (g.x0 > x && g.x0 < x + range && (!best || g.x0 < best.x0)) best = { type: 'gap', ...g };
    for (const u of muds) if (u.x0 > x && u.x0 < x + range && (!best || u.x0 < best.x0)) best = { type: 'mud', ...u };
    return best;
  };
  flat(30);

  // ---------------- ground chunks ----------------
  // Green hillside that falls away toward the viewer (no cut face, no dirt wall). Two pools of 24-unit chunks share the same columns:
  // NEAR rows (fine, from just behind the lane to past the camera) cover about 100 units either side of the camera, and FAR rows
  // (coarser, back to the real terrain's far edge) about 240, since far ground is seen across a very wide span.
  const ZN = []; for (let z = laneZ - 34; z <= laneZ + 56.01; z += 1.25) ZN.push(z);        // as fine as the real terrain, so its colours and relief carry over
  const ZF = []; for (let z = -200; z <= laneZ - 34 + 1e-6; z += 3.2) ZF.push(z); if (ZF[ZF.length - 1] < laneZ - 34 - 1e-6) ZF.push(laneZ - 34);
  const tc = new THREE.Color();
  /** The real terrain's own colour function (fields, mud, rock, grain), with steepness measured on the generated ground. */
  const PIT_C = new THREE.Color('#3f3126'), MUD_C = new THREE.Color('#7a5434'), PUDDLE_C = new THREE.Color('#3b2a1c');
  function topColor(x, z, h) {
    const slope = (Math.abs(groundAt(x + 1.2, z) - h) + Math.abs(groundAt(x, z + 1.2) - h)) / 1.2;
    world.terrainColor(x, z, h, slope, tc);
    if (x > XT) {
      let pit = 0; for (const g of gaps) if (x > g.x0 - 0.7 && x < g.x1 + 0.7) pit = 1;                              // gaps: bare dark earth in the pit and up its walls
      if (pit) tc.lerp(PIT_C, 0.9).offsetHSL(0, 0, (hash(x * 3.1, z * 1.7) - 0.5) * 0.05);
    }
    return tc;
  }
  function makePool(rows, count) {
    const NR = rows.length, idx = [];
    for (let i = 0; i < COLS - 1; i++) for (let r = 0; r < NR - 1; r++) { const p = i * NR + r, q = (i + 1) * NR + r; idx.push(p, p + 1, q, q, p + 1, q + 1); }
    const pool = { rows, NR, chunks: [] };
    for (let k = 0; k < count; k++) {
      const g = new THREE.BufferGeometry();
      for (const [n, sz] of [['position', 3], ['color', 3], ['uv', 2]]) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(COLS * NR * sz), sz));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, material);
      m.frustumCulled = false; m.visible = false; m.receiveShadow = true;
      group.add(m);
      pool.chunks.push({ mesh: m, geo: g, idx: -999 });
    }
    return pool;
  }
  /** Fill a ground chunk in small steps (a generator), so no single frame pays for the whole thing. */
  function* fillChunk(pool, c, idx) {
    c.idx = idx; c.mesh.visible = false;
    if (X0 + (idx + 1) * CHUNK <= XT) return;                                       // wholly inside the real terrain: nothing to draw, so nothing to build
    const { rows, NR } = pool, pos = c.geo.attributes.position, col = c.geo.attributes.color, uv = c.geo.attributes.uv;
    const x0 = X0 + idx * CHUNK;
    for (let i = 0; i < COLS; i++) {
      const x = x0 + i * DXM;
      for (let r = 0; r < NR; r++) {
        const v = i * NR + r, z = rows[r], y = groundAt(x, z), cc = topColor(x, z, y);
        pos.setXYZ(v, x, y, z); col.setXYZ(v, cc.r, cc.g, cc.b); uv.setXY(v, x / 64, z / 64);
      }
      if (i % 10 === 9) yield;
    }
    pos.needsUpdate = true; col.needsUpdate = true; uv.needsUpdate = true;
    yield;
    c.geo.computeVertexNormals();
    // only the part beyond the real terrain's edge is drawn (the real terrain draws the rest)
    const i0 = Math.min(COLS - 1, Math.max(0, Math.ceil((XT - x0) / DXM - 1e-6)));
    c.geo.setDrawRange(i0 * (NR - 1) * 6, (COLS - 1 - i0) * (NR - 1) * 6);
    c.mesh.visible = i0 < COLS - 1;
  }
  const jobs = [];                                                                    // chunk fills in progress
  /** Run the queued chunk fills until the frame's time is up (always at least one step). */
  function runJobs(deadline) {
    while (jobs.length && jobs[0].c.idx !== jobs[0].idx) jobs.shift();                // (a place the camera has left)
    do {
      const j = jobs[0]; if (!j) return;
      if (j.c.idx !== j.idx || j.gen.next().done) jobs.shift();
    } while (performance.now() < deadline);
  }
  let warm = 150;
  const NEAR_R = 100, FAR_R = 240, PLANT_R = 125;
  const near = makePool(ZN, Math.ceil((2 * NEAR_R) / CHUNK) + 2), far = makePool(ZF, Math.ceil((2 * FAR_R) / CHUNK) + 2);
  function refresh(pool, camX, R, budget) {
    const first = Math.floor((camX - R - X0) / CHUNK), lastC = Math.floor((camX + R - X0) / CHUNK);
    const have = new Set(pool.chunks.map((c) => c.idx));
    const free = pool.chunks.filter((c) => c.idx < first || c.idx > lastC);
    const need = [];
    for (let i = first; i <= lastC; i++) if (!have.has(i)) need.push(i);
    need.sort((a, b) => Math.abs(X0 + (a + 0.5) * CHUNK - camX) - Math.abs(X0 + (b + 0.5) * CHUNK - camX));   // nearest first; a few per frame so no frame stalls
    for (const i of need.slice(0, budget)) {
      const c = free.pop();
      if (!c) break;
      for (let k = jobs.length - 1; k >= 0; k--) if (jobs[k].c === c) jobs.splice(k, 1);   // it was still being filled for a place the camera has left
      jobs.push({ c, idx: i, gen: fillChunk(pool, c, i) }); c.idx = i; c.mesh.visible = false;
    }
    for (const c of free) { c.idx = -999; c.mesh.visible = false; }
  }

  // ---------------- scenery on the new ground: the same trees, bushes, rocks, flowers and grass as the main scene ----------------
  const scenery = new Map();                      // chunk index -> Group
  /** Where a house or windmill stands in the background of this stretch (if any): flat ground, clear of pits, well behind the lane. */
  function planBuildings(idx) {
    const cx0 = X0 + idx * CHUNK, cx1 = cx0 + CHUNK, r = mulberry32((idx * 4421 + seedNow * 977) >>> 0);
    const dens = smooth01((cx0 + CHUNK / 2 - XT - 25) / 90);                         // none near the seam, then a house or mill every couple of stretches
    if (r() > 0.6 * dens) return [];
    for (let tries = 0; tries < 14; tries++) {
      const x = cx0 + 9 + r() * (CHUNK - 18), z = laneZ - (26 + r() * 42), kind = r() < 0.22 ? 'windmill' : 'house', rad = kind === 'windmill' ? 4.4 : 6.6;
      if (gaps.some((g) => g.x1 > x - rad - 4 && g.x0 < x + rad + 4)) continue;
      let lo = 1e9, hi = -1e9;
      for (let k = 0; k < 9; k++) { const a = (k / 8) * 6.28, h = groundAt(x + Math.cos(a) * rad * 0.7, z + Math.sin(a) * rad * 0.7); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (hi - lo < 1.8) return [{ x, z, kind, r: rad }];
    }
    return [];
  }
  function plant(idx) {
    const x0 = Math.max(X0 + idx * CHUNK, XT + 2), x1 = X0 + (idx + 1) * CHUNK;
    if (x1 <= x0 + 1) { scenery.set(idx, null); return; }
    laneAt(x1 + 60);                                                                  // make sure the course (and so every gap) exists this far ahead
    const list = planBuildings(idx);
    const holder = new THREE.Group();
    const avoid = (x, z) => inPit(x) || list.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 1.2);
    holder.add(world.scatter({ x0, x1, hFn: groundAt, laneAt, seed: idx * 7919 + seedNow * 104729, laneZ, farZ: laneZ - 70, avoid, density: ((x1 - x0) / CHUNK) * (0.15 + 0.85 * smooth01((x0 + (x1 - x0) / 2 - XT) / 80)) }));   // the planting thickens gradually past the seam
    if (list.length) pendingB.push({ idx, holder, list });                              // houses and windmills are the costly part: built on a later frame
    group.add(holder); scenery.set(idx, holder);
  }
  const pendingB = [];
  function buildPending() {
    const b = pendingB.shift(); if (!b) return;
    const bg = world.sceneryBuildings({ list: b.list, hFn: groundAt, seed: b.idx * 31 + seedNow });
    b.holder.userData.buildings = bg; b.holder.add(bg);
  }
  function dropScenery(idx) { const pi = pendingB.findIndex((b) => b.idx === idx); if (pi >= 0) pendingB.splice(pi, 1); const g = scenery.get(idx); if (g) { g.userData.buildings?.userData.dispose?.(); g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); group.remove(g); } scenery.delete(idx); }
  function clearScenery() { for (const k of [...scenery.keys()]) dropScenery(k); }

  // ---------------- mud patches: a crisp, lumpy blob lying on the ground (own geometry, not painted on the terrain) ----------------
  const mudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const puddleMat = new THREE.MeshPhongMaterial({ color: '#4a3b30', shininess: 90, specular: new THREE.Color('#9fb0bc'), flatShading: true });
  const clumpMat = new THREE.MeshLambertMaterial({ color: '#5a3f27', flatShading: true });
  const MUD_COLS = ['#6f4d2e', '#5a3f27', '#7c5936', '#493322'].map((h) => new THREE.Color(h));
  const mudMeshes = new Map();          // mud index -> Group
  function buildMud(u, seedN) {
    const r = mulberry32((Math.floor(u.x0 * 10) + seedN * 131) >>> 0), cx = (u.x0 + u.x1) / 2, cz = laneZ + 1.8, rx = (u.x1 - u.x0) / 2 + 1.2, rz = 7.2;
    const SEG = 48, RINGS = 6, ph = [r() * 6, r() * 6, r() * 6];
    const outline = (a) => 1 + 0.13 * Math.sin(a * 3 + ph[0]) + 0.08 * Math.sin(a * 5 + ph[1]) + 0.05 * Math.sin(a * 9 + ph[2]);   // a lumpy, irregular outline
    const pos = [], col = [], idx = [];
    const heightOn = (px, pz, rf) => {
      const lane = Math.exp(-Math.pow((pz - laneZ) / 2.2, 2));                       // keep the lane itself smooth so the bike is not buried
      const lumps = (0.1 * Math.sin(px * 1.3 + ph[0]) * Math.cos(pz * 1.1 + ph[1]) + 0.07 * Math.sin(px * 2.7 + pz * 2.1)) * (1 - 0.8 * lane) * Math.min(1, (1 - rf) * 5);
      const rim = 0.2 * Math.exp(-Math.pow((rf - 0.92) / 0.07, 2));                  // a raised lip of churned mud around the edge
      return groundAt(px, pz) + 0.2 + lumps + rim;                                  // always above the terrain, so no grass shows through
    };
    const vtx = (rf, a) => {
      const n = outline(a);
      const px = cx + Math.cos(a) * rx * n * rf, pz = cz + Math.sin(a) * rz * n * rf;
      const y = heightOn(px, pz, rf) - (rf >= 0.999 ? 0.1 : 0);                       // the very edge tucks into the ground
      pos.push(px, y, pz);
      const t = 0.5 + 0.5 * Math.sin(px * 0.9 + ph[1]) * Math.cos(pz * 0.8 + ph[2]);   // mottled browns, a lighter damp ring at the edge
      const c = MUD_COLS[1].clone().lerp(MUD_COLS[2], t * 0.8).lerp(MUD_COLS[3], Math.max(0, 0.6 - rf) * 0.8 * (1 - t));
      if (rf > 0.8) c.lerp(MUD_COLS[0], (rf - 0.8) * 3);
      c.offsetHSL(0, 0, (r() - 0.5) * 0.05);
      col.push(c.r, c.g, c.b);
    };
    pos.push(cx, heightOn(cx, cz, 0), cz); col.push(0.3, 0.2, 0.13);
    for (let k = 1; k <= RINGS; k++) for (let j = 0; j < SEG; j++) vtx(k / RINGS, (j / SEG) * Math.PI * 2);
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
    for (let k = 0; k < RINGS - 1; k++) for (let j = 0; j < SEG; j++) {
      const a = 1 + k * SEG + j, b = 1 + k * SEG + ((j + 1) % SEG), c2 = 1 + (k + 1) * SEG + j, d = 1 + (k + 1) * SEG + ((j + 1) % SEG);
      idx.push(a, b, c2, b, d, c2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    const grp = new THREE.Group();
    const blob = new THREE.Mesh(g, mudMat); blob.receiveShadow = true; grp.add(blob);
    // wet puddles and lumps of churned earth
    for (let k = 0; k < 5; k++) {
      const a = r() * 6.28, rf = 0.15 + r() * 0.65, n = outline(a), px = cx + Math.cos(a) * rx * n * rf, pz = cz + Math.sin(a) * rz * n * rf;
      const rad = 0.8 + r() * 1.5, p = new THREE.Mesh(new THREE.CircleGeometry(rad, 9).rotateX(-Math.PI / 2), puddleMat);
      p.scale.set(1.5, 1, 1); p.position.set(px, heightOn(px, pz, rf) + 0.07, pz); p.rotation.y = r() * 3; grp.add(p);
    }
    const clumps = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), clumpMat, 30), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let k = 0; k < 30; k++) {
      const a = r() * 6.28, rf = Math.sqrt(r()) * 0.97, n = outline(a), px = cx + Math.cos(a) * rx * n * rf, pz = cz + Math.sin(a) * rz * n * rf, s0 = 0.14 + r() * 0.32;
      if (Math.abs(pz - laneZ) < 1.6) { m4.makeScale(0, 0, 0); clumps.setMatrixAt(k, m4); continue; }                // keep the lane clear
      e.set(r() * 3, r() * 6, r() * 3); q.setFromEuler(e);
      m4.compose(v3.set(px, heightOn(px, pz, rf) + s0 * 0.25, pz), q, sc.set(s0 * 1.4, s0 * 0.7, s0)); clumps.setMatrixAt(k, m4);
    }
    clumps.castShadow = false; grp.add(clumps);
    return grp;
  }
  function dropMud(i) { const g = mudMeshes.get(i); if (!g) return; g.traverse((o) => { if (o.isMesh) { if (o.geometry && o !== undefined) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); } }); group.remove(g); mudMeshes.delete(i); }
  function syncMud(camX) {
    for (let i = 0; i < muds.length; i++) {
      const u = muds[i], near = u.x1 > camX - 130 && u.x0 < camX + 170;
      if (near && !mudMeshes.has(i)) { const g = buildMud(u, seedNow); group.add(g); mudMeshes.set(i, g); }
      else if (!near && mudMeshes.has(i)) dropMud(i);
    }
  }

  scene.add(group);
  group.visible = false;

  return {
    group, laneAt, groundAt, slopeAt, inPit, pitSpan, mudAt, hazardAhead, speedAt, pitAfter, XT, cutZ: CUTZ,
    get seed() { return seedNow; },
    set visible(v) { group.visible = v; },
    reset(newSeed = seedNow) {
      seedNow = newSeed; rng = mulberry32(newSeed >>> 0);
      H = [0]; gaps.length = 0; muds.length = 0; lastHazard = -1e9; flat(30); warm = 150; pendingB.length = 0; jobs.length = 0;
      for (const pool of [near, far]) for (const c of pool.chunks) { c.idx = -999; c.mesh.visible = false; }
      clearScenery();
      for (const k of [...mudMeshes.keys()]) dropMud(k);
    },
    /** Keep the ground chunks and their scenery around the camera (call every frame with the camera's x and y). */
    update(camX) {
      ensure(camX + FAR_R + 60);
      const dl = warm > 0 ? Infinity : performance.now() + 2.5; warm--;                // after the first moments, do at most a few ms of building per frame
      refresh(near, camX, NEAR_R, 3); refresh(far, camX, FAR_R, 2); runJobs(dl);
      syncMud(camX);
      const first = Math.floor((camX - PLANT_R - X0) / CHUNK), lastC = Math.floor((camX + PLANT_R - X0) / CHUNK);
      for (const k of [...scenery.keys()]) if (k < first || k > lastC) dropScenery(k);
      if (performance.now() < dl) {
        let planted = false;
        for (let i = first; i <= lastC; i++) if (!scenery.has(i)) { plant(i); planted = true; break; }          // at most one new stretch of planting per frame
        if (!planted || warm > 0) buildPending();
      }
    },
    dispose() { scene.remove(group); },
  };
}
