// Collectible coins along the ride: lines on the ground and arcs off the kicker lips. Generated per 48-unit block from the
// course seed (so the same course always has the same coins), drawn as one instanced mesh and spun/bobbed per frame.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261017085314';

const BLOCK = 48;
const WIN_L = 90, WIN_R = 190;   // how far either side of the camera coins are drawn (the screen can show well over 100 units at speed, so the edges stay off screen)
const CAP = 700;

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

  const G = 24, STEP = 3.1, MIN_SEP = 2.7;                  // gravity, spacing along an arc, and the closest two coins may ever be
  const POP = (s, vx) => Math.min(8, s * vx * 0.32);          // the lip of a big kicker throws you up a little extra (same rule as the game)
  const JUMP_VY = (c) => 5.5 + 9.5 * (1 - (1 - c) * (1 - c));   // upward kick for a jump charged to c (0..1)

  const lipsIn = (b) => {
    const out = [], x0 = b * BLOCK, x1 = x0 + BLOCK;
    for (let x = x0; x < x1; x += 0.5) {
      if (out.length && x - out[out.length - 1] < 14) continue;
      const s1 = track.slopeAt(x - 1);
      if (s1 > 0.3 && s1 < 1.6 && track.slopeAt(x + 1) < s1 - 0.25) out.push(x);          // (a near-vertical wall, like the far bank of a gap, is not a ramp)
    }
    return out;
  };
  /** Coins along the path a bike leaving the lip at lx would fly (ballistic), evenly spaced by arc length. `land(x)` is the height it stops at. */
  function arcCoins(lx, vx, vy, land, maxCoins, out) {
    const lipY = track.laneAt(lx) + 1.0;                                                              // bike centre height above the ground
    let t = 0, px = lx, py = lipY, run = 0, n = 0;
    for (let k = 0; k < 140 && n < maxCoins; k++) {
      t += 0.04;
      const nx = lx + vx * t, ny = lipY + vy * t - 0.5 * G * t * t;
      if (t > 0.3 && ny <= land(nx) + 1.1) break;                                                    // it has landed
      run += Math.hypot(nx - px, ny - py); px = nx; py = ny;
      if (run >= STEP) { run = 0; out.push({ x: nx, y: ny }); n++; }
    }
  }
  /** Every coin one lip is responsible for: its arcs (fixed by the course, never by build order). */
  function lipCoins(lx0) {
    const rng = mulberry32((Math.floor(lx0 * 10) * 2654435 + seed * 104729) >>> 0), out = [];
    let lx = lx0, top = track.laneAt(lx0);                                                              // the lip is the crest the ramp climbs to
    for (let x = lx0; x <= lx0 + 10; x += 0.5) { const h = track.laneAt(x); if (h > top) { top = h; lx = x; } }
    const s = track.slopeAt(lx - 1.2), vx = track.speedAt(lx) - 1.5;                                  // cruising speed here (a short ramp barely slows you)
    const vy0 = vx * s + POP(s, vx);
    const pit = track.pitAfter?.(lx);                                                                   // a gap right after this lip?
    const land = pit ? (x) => (x < pit.x1 ? -1e9 : track.laneAt(x)) : (x) => track.laneAt(x);
    if (pit) {
      // across a gap: the gentlest line that still clears the far bank with a little to spare (so the arc is never taller than it has to be)
      let c = 1;
      for (let k = 0.25; k <= 1.0001; k += 0.05) {
        const vy = vy0 + JUMP_VY(k); let clears = false;
        for (let t = 0.1; t < 5; t += 0.03) { const x = lx + vx * t, y = track.laneAt(lx) + 1.0 + vy * t - 0.5 * G * t * t; if (x >= pit.x1 + 1) { clears = y >= track.laneAt(x) + 1.8; break; } }
        if (clears) { c = Math.min(1, k + 0.12); break; }
      }
      arcCoins(lx, vx, vy0 + JUMP_VY(c), land, 18, out);
    } else {
      arcCoins(lx, vx, vy0, land, 14, out);                                                              // off a kicker: the line you get with no jump at all
    }
    return out.length >= 5 ? out : [];                                                                   // a little crest is not worth an arc
  }

  function build(b) {
    const list = [], placed = [];
    const x0 = b * BLOCK, x1 = x0 + BLOCK;
    const ok = (c) => c.x >= minX && c.y >= track.laneAt(c.x) + 1.0 && !(track.inPit?.(c.x) && c.y < track.laneAt(c.x) + 6);
    // lips of the neighbouring blocks too, so arcs that run across a block edge are resolved the same way whichever block is built first
    const lips = [...lipsIn(b - 1), ...lipsIn(b), ...lipsIn(b + 1)].sort((a, c) => a - c);
    for (const lx of lips) {
      for (const c of lipCoins(lx)) {
        if (!ok(c) || placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < MIN_SEP)) continue;       // never clumped or overlapping
        placed.push(c);
        if (lx >= x0 && lx < x1) list.push({ x: c.x, y: c.y, got: false });
      }
    }
    // the odd short line on the flat, now and then (only where no arc is nearby)
    const rng = mulberry32((b * 7919 + seed * 104729) >>> 0);
    if (!lips.some((l) => l > x0 - 30 && l < x1 + 30) && rng() < 0.12) {
      const sx = x0 + 8 + rng() * (BLOCK - 24);
      for (let k = 0; k < 4; k++) { const c = { x: sx + k * STEP, y: track.laneAt(sx + k * STEP) + 1.7 }; if (ok(c)) list.push({ x: c.x, y: c.y, got: false }); }
    }
    return list;
  }
  const blockOf = (b) => { let l = blocks.get(b); if (!l) { l = build(b); blocks.set(b, l); } return l; };

  return {
    /** New course: coins start after `startX + 24`. */
    reset(newSeed, startX) { seed = newSeed; minX = startX + 24; blocks.clear(); },
    set visible(v) { mesh.visible = v; },
    blockList(b) { return blockOf(b); },                       // (for tests)
    get blockSize() { return BLOCK; },
    /** Redraw the coins near the camera. */
    update(camX, time) {
      let n = 0;
      const b0 = Math.floor((camX - WIN_L) / BLOCK), b1 = Math.floor((camX + WIN_R) / BLOCK);
      for (let b = b0; b <= b1 && n < CAP; b++) for (const c of blockOf(b)) {
        if (c.got || n >= CAP) continue;
        const f = Math.min(1, Math.max(0, (camX + WIN_R - c.x) / 30)) * Math.min(1, Math.max(0, (c.x - (camX - WIN_L)) / 20));   // grow in at the edges of the window, which lie well off screen
        if (f <= 0.01) continue;
        dummy.position.set(c.x, c.y + Math.sin(time * 2.2 + c.x) * 0.14, laneZ);
        dummy.rotation.set(0, time * 3.2 + c.x * 0.7, 0);
        dummy.scale.setScalar(f); dummy.updateMatrix();
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
