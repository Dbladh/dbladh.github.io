// Collectible coins along the ride: lines on the ground and arcs off the kicker lips. Generated per 48-unit block from the
// course seed (so the same course always has the same coins), drawn as one instanced mesh and spun/bobbed per frame.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261027214133';

const BLOCK = 48;
const WIN_L = 90, WIN_R = 190;   // how far either side of the camera coins are drawn (the screen can show well over 100 units at speed, so the edges stay off screen)
const CAP = 700;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createCoins(scene, track, laneZ) {
  // A shiny gold coin: a thin cylinder whose two faces carry a painted "DB" medallion (canvas texture) and whose rim is plain gold.
  // One instanced mesh, one draw call; the shine (a light sweep across the face and a glint as it turns) is a few lines of shader.
  const geo = new THREE.CylinderGeometry(0.64, 0.64, 0.16, 22).rotateX(Math.PI / 2);
  {
    const uv = geo.attributes.uv, idx = geo.index, groups = geo.groups;            // group 0 = rim, 1 = front face, 2 = back face
    const seen = new Set();
    for (const g of groups) for (let i = g.start; i < g.start + g.count; i++) {
      const v = idx.getX(i); if (seen.has(v)) continue; seen.add(v);
      if (g.materialIndex === 0) uv.setXY(v, 0.02, 0.02);                          // the rim samples a plain gold corner of the texture
      else if (g.materialIndex === 2) uv.setX(v, 1 - uv.getX(v));                  // the back face reads the right way round
    }
  }
  const faceTex = (() => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#d99a1c'; x.fillRect(0, 0, S, S);                                // (the corner pixel is the rim colour)
    const R = S / 2, cx = R, cy = R;
    const disc = (r, c0, c1) => { const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r); g.addColorStop(0, c0); g.addColorStop(1, c1); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill(); };
    disc(R * 0.99, '#ffe27a', '#c9840f');                                           // outer rim, bevelled
    disc(R * 0.86, '#a96e0b', '#ffd45a');                                           // the groove between rim and field (dark at the edge, light inside)
    disc(R * 0.80, '#ffe9a0', '#f2b52a');                                           // the field
    x.strokeStyle = 'rgba(120,70,5,.55)'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, R * 0.8, 0, 6.2832); x.stroke();
    x.save(); x.translate(cx, cy);                                                  // little beads around the rim
    for (let i = 0; i < 28; i++) { x.rotate(6.2832 / 28); x.fillStyle = 'rgba(130,80,8,.6)'; x.beginPath(); x.arc(R * 0.93, 0, 3, 0, 6.2832); x.fill(); }
    x.restore();
    x.font = '800 118px "Outfit", "Avenir Next", "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,248,210,.9)'; x.fillText('DB', cx + 3, cy + 8);          // embossed: a light edge below-right, a dark one above-left
    x.fillStyle = 'rgba(120,70,5,.85)'; x.fillText('DB', cx - 2, cy + 3);
    x.fillStyle = '#e1a21c'; x.fillText('DB', cx, cy + 5.5);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; t.anisotropy = 4; t.generateMipmaps = true; return t;
  })();
  const uTime = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ map: faceTex, emissive: new THREE.Color('#ffd46a'), emissiveMap: faceTex, emissiveIntensity: 0.55 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vPh;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPh = instanceMatrix[3].x * 0.37;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vPh;')
      .replace('#include <opaque_fragment>', `
        // metal: a bright specular band as the coin turns, and a diagonal glint that sweeps across the face now and then
        float spec = pow(max(dot(normalize(normal), normalize(vec3(0.45, 0.55, 0.7))), 0.0), 18.0);
        float sw = fract((vMapUv.x + vMapUv.y) * 0.6 - uTime * 0.45 + vPh);
        float gd = (sw - 0.5) / 0.13;
        float glint = exp(-gd * gd) * step(0.1, vMapUv.x) * step(vMapUv.x, 0.98);                  // a soft, blurry band (a gaussian), not a hard line
        outgoingLight += vec3(1.0, 0.93, 0.68) * (spec * 0.75 + glint * 0.5);
        #include <opaque_fragment>`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, CAP);
  mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
  scene.add(mesh);

  let seed = 1, minX = 0;
  let blocked = null;                                           // (x, y) => true where something else (a fuel can) sits: no coin there
  const drawnIn = new Set();                                    // coins the magnet is drawing in
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
    out.meta = { lx, vx, pit: !!pit, x1: pit ? pit.x1 : 0 };
    return out.length >= 5 ? out : [];                                                                   // a little crest is not worth an arc
  }

  function build(b) {
    const list = [], placed = [];
    const x0 = b * BLOCK, x1 = x0 + BLOCK;
    const ok = (c) => c.x >= minX && !(blocked && blocked(c.x, c.y)) && c.y >= track.laneAt(c.x) + 1.0 && !(track.inPit?.(c.x) && c.y < track.laneAt(c.x) + 6);
    // lips of the neighbouring blocks too, so arcs that run across a block edge are resolved the same way whichever block is built first
    const lips = [...lipsIn(b - 1), ...lipsIn(b), ...lipsIn(b + 1)].sort((a, c) => a - c);
    for (const lx of lips) {
      for (const c of lipCoins(lx)) {
        if (!ok(c) || placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < MIN_SEP)) continue;       // never clumped or overlapping
        placed.push(c);
        if (lx >= x0 && lx < x1) list.push({ x: c.x, y: c.y, got: false });
      }
    }
    // a little arc of coins over each obstacle: the line a good hop takes (so the coins show where to jump)
    for (const o of track.obstaclesIn(x0 - 8, x1 + 8)) {
      for (let k = -2; k <= 2; k++) {
        const cx = o.x + k * 3.0, u = (k * 3.0) / 6.6, c = { x: cx, y: track.laneAt(cx) + 1.15 + (o.h + 0.9) * (1 - u * u) };
        if (cx >= x0 && cx < x1 && ok(c) && !placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < MIN_SEP)) { placed.push(c); list.push({ x: c.x, y: c.y, got: false }); }
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
    reset(newSeed, startX) { seed = newSeed; minX = startX + 24; blocks.clear(); drawnIn.clear(); },
    set visible(v) { mesh.visible = v; },
    blockList(b) { return blockOf(b); },
    /** Keep coins out of the way of something else: `fn(x, y)` says whether a coin there must be skipped (set before the course is drawn). */
    setBlocker(fn) { blocked = fn; },
    /** The coin arcs flown off the kicker lips in [x0, x1]: { lx, apex: {x, y}, pit } (the fuel cans use their highest points). */
    arcs(x0, x1) {
      const out = [];
      for (let b = Math.floor(x0 / BLOCK); b <= Math.floor(x1 / BLOCK); b++) for (const lx0 of lipsIn(b)) {
        if (lx0 < x0 || lx0 > x1) continue;
        const pts = lipCoins(lx0); if (!pts.length) continue;
        let top = pts[0]; for (const q of pts) if (q.y > top.y) top = q;
        out.push({ lx: pts.meta.lx, apex: top, pit: pts.meta.pit, x1: pts.meta.x1, pts });
      }
      return out;
    },                       // (for tests)
    get blockSize() { return BLOCK; },
    /** Redraw the coins near the camera. */
    update(camX, time) {
      let n = 0; uTime.value = time;
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
    /** The coins taken by the latest collect() call (for the pop effect). */
    hits: [],
    collect(x, y, k = 1, dt = 1 / 60, vx = 0) {
      let got = 0; this.hits.length = 0;
      const py = y + 0.4 * k, aimX = x + vx * 0.05, pull = 1 - Math.exp(-dt * 16);
      const inner = (dx, dy) => (dx * dx) / (2.6 * k * 2.6 * k) + (dy * dy) / (2.8 * k * 2.8 * k) < 1;
      const take = (c) => { c.got = true; got++; this.hits.push({ x: c.x, y: c.y }); drawnIn.delete(c); };
      // coins newly within reach of the magnet (or right on the bike): taken at once, or started drawing in
      // (an arc is kept with the block that owns its lip, but its coins run on ahead of it, up to about 60 units: look in the blocks behind as well)
      const b0 = Math.max(0, Math.floor((x - 84) / BLOCK)), b1 = Math.floor((x + 12) / BLOCK);
      for (let b = b0; b <= b1; b++) for (const c of blockOf(b)) {
        if (c.got || c.mag || c.x < x - 12 || c.x > x + 12) continue;
        const dx = c.x - x, dy = c.y - py;
        if ((dx * dx) / (6.2 * k * 6.2 * k) + (dy * dy) / (7.0 * k * 7.0 * k) > 1) continue;                                   // out of reach
        if (inner(dx, dy)) take(c); else { c.mag = true; c.magT = 0; drawnIn.add(c); }
      }
      // coins being drawn in (wherever they are now: one that falls behind the bike must still be finished off): they aim a little ahead of the bike so a fast bike
      // does not outrun them, and one that has been drawing in for 0.22 s is simply taken
      for (const c of drawnIn) {
        c.magT += dt;
        if (inner(c.x - x, c.y - py) || c.magT > 0.22) { take(c); continue; }
        c.x += (aimX - c.x) * pull; c.y += (py - c.y) * pull;
      }
      return got;
    },
  };
}
