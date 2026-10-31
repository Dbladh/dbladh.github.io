// The seasonal and holiday touches of the landscape (see seasons.js for which are on). Each season is a small module with build / update / dispose, built the first time the season is on and taken away when it has ended, so a
// quiet part of the year costs nothing. All the little lights are one kind of thing: glowing points (a single shader, a twinkle and a colour each), put as children of the house or the sign they decorate so they follow it.
import * as THREE from 'three';
import { heightAt, POND, pathX } from './world.js?v=20261031104851';

const BU = { uTime: { value: 0 }, uA: { value: 0 }, uPx: { value: 800 } };       // shared by every string of lights
const bulbMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false, uniforms: BU,
  vertexShader: `uniform float uTime, uPx; attribute vec3 aCol; attribute float aPh, aSz; varying vec3 vC; varying float vT;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vC = aCol; vT = 0.6 + 0.4 * sin(uTime * 1.7 + aPh * 6.2831 + sin(uTime * 0.5 + aPh * 3.0));
      gl_PointSize = clamp(aSz * uPx / max(0.5, -mv.z), 2.5, 22.0); }`,
  fragmentShader: `uniform float uA; varying vec3 vC; varying float vT;
    void main() { float d = length(gl_PointCoord - 0.5), core = smoothstep(0.2, 0.0, d), halo = smoothstep(0.5, 0.08, d); gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.55), halo * vT * uA); }`,
});
const XMAS = ['#ff4040', '#3fdc6a', '#ffd84a', '#4aa8ff', '#ff7ad9'].map((c) => new THREE.Color(c));
/** A string of lights: `pts` are [x, y, z] in the parent's own units, `cols` a palette cycled along the string, `size` in those units. */
function bulbs(pts, cols, size) {
  const n = pts.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n), sz = new Float32Array(n);
  pts.forEach((p, i) => { pos.set(p, i * 3); const c = cols[i % cols.length]; col.set([c.r, c.g, c.b], i * 3); ph[i] = (i * 0.173) % 1; sz[i] = size; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aSz', new THREE.BufferAttribute(sz, 1));
  const o = new THREE.Points(g, bulbMat); o.frustumCulled = false; o.renderOrder = 6; return o;
}
const lam = (hex, extra = {}) => new THREE.MeshLambertMaterial({ color: hex, ...extra });
const disposeTree = (o) => o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
const swag = (x0, x1, y, z, dip, n) => { const out = []; for (let i = 0; i <= n; i++) { const u = i / n; out.push([x0 + (x1 - x0) * u, y - dip * Math.sin(Math.PI * u), z]); } return out; };

// ---------------------------------------------------------------- Christmas
function makeChristmas(ctx) {
  const root = new THREE.Group(), houseStrings = [], boardSets = new Map(); ctx.scene.add(root);
  // lights along the edges of every roof, following its pitch: the eaves, the sloping edges of each gable end, and the hips of a hip roof
  const polylines = (r) => {
    const c = Math.cos(r.yaw), sn = Math.sin(r.yaw), T = (x, y, z) => [r.cx + x * c + z * sn, r.base + y, r.cz - x * sn + z * c], out = [];
    if (r.type === 'gable') {
      const e = r.ends || [r.ov, r.ov], L = r.len + e[0] + e[1], sh = (e[1] - e[0]) / 2, half = r.span / 2 + r.ov, x0 = sh - L / 2 - 0.05, x1 = sh + L / 2 + 0.05, yE = 0.1, yR = r.rh + 0.14;
      out.push([T(x0, yE, half + 0.04), T(x1, yE, half + 0.04)], [T(x0, yE, -half - 0.04), T(x1, yE, -half - 0.04)]);
      for (const x of [x0, x1]) out.push([T(x, yE, half + 0.04), T(x, yR, 0), T(x, yE, -half - 0.04)]);
    } else {
      const ex = r.len / 2 + r.ov + 0.04, ez = r.span / 2 + r.ov + 0.04, rx = Math.max(0.05, r.len / 2 - r.span / 2), yE = 0.08, yR = r.rh + 0.1;
      const A = T(-ex, yE, -ez), B = T(ex, yE, -ez), C = T(ex, yE, ez), D = T(-ex, yE, ez), R1 = T(-rx, yR, 0), R2 = T(rx, yR, 0);
      out.push([A, B, C, D, A], [A, R1], [D, R1], [B, R2], [C, R2]);
    }
    return out;
  };
  const along = (line, gap) => {                                  // bulbs spaced evenly along a polyline
    const pts = []; let carry = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); let d = i === 0 ? 0 : carry;
      for (; d <= l + 1e-6; d += gap) { const u = l ? d / l : 0; pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]); }
      carry = d - l;
    }
    return pts;
  };
  for (const h of ctx.world.houseList()) {
    if (!h.group || !h.roofs || !h.roofs.length) continue;
    const pts = []; for (const r of h.roofs) { if (r.len < 1.8) continue; for (const line of polylines(r)) pts.push(...along(line, ctx.low ? 0.8 : 0.45)); }
    if (!pts.length) continue;
    const o = bulbs(pts, XMAS, 0.26); h.group.add(o); houseStrings.push([h.group, o]);
  }
  // every tree wears a string of lights wound round it (a spiral over its crown; round trees get one over all their lobes, cypresses one down the flame, pines one round the cone), and the footbridge has lights along both handrails
  const WARM = ['#ffd27a', '#ffe7b0', '#ffc15a'].map((c) => new THREE.Color(c)), COOL = ['#bfe3ff', '#ffffff', '#8fc4ff'].map((c) => new THREE.Color(c)), PALS = [XMAS, XMAS, WARM, COOL];
  const treePts = [], treeCols = [];
  const trees = ctx.world.treeList(), per = ctx.low ? 18 : 34;
  trees.forEach((t, ti) => {
    const pal = PALS[ti % PALS.length], n = per, wraps = 4.5, a0 = ti * 1.3;
    let cx, cz, y0, y1, rAt;
    if (t.t === 'round') {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ya = 1e9, yb = -1e9;
      for (const L of t.lobes) { x0 = Math.min(x0, L.x - L.r); x1 = Math.max(x1, L.x + L.r); z0 = Math.min(z0, L.z - L.r); z1 = Math.max(z1, L.z + L.r); ya = Math.min(ya, L.y - L.r * 0.8); yb = Math.max(yb, L.y + L.r * 0.9); }
      cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; y0 = ya + 0.2; y1 = yb; const R = Math.max(x1 - x0, z1 - z0) / 2, hy = (y1 - y0) / 2, cy = (y0 + y1) / 2;
      rAt = (y) => R * 1.0 * Math.sqrt(Math.max(0.02, 1 - Math.pow((y - cy) / (hy + 0.01), 2)));
    } else if (t.t === 'cypress') {
      cx = t.x; cz = t.z; y0 = t.y - t.h * 0.78; y1 = t.y + t.h * 0.92; const cy = t.y + t.h * 0.05, hy = t.h; rAt = (y) => t.rx * 0.98 * Math.sqrt(Math.max(0.02, 1 - Math.pow((y - cy) / hy, 2)));
    } else {
      cx = t.x; cz = t.z; y0 = t.y + 0.25; y1 = t.y + t.H * 0.97; rAt = (y) => Math.max(0.04, t.R * 1.0 * (1 - (y - t.y) / t.H));
    }
    for (let i = 0; i < n; i++) { const u = i / (n - 1), y = y0 + (y1 - y0) * u, r = rAt(y), a = a0 + u * wraps * Math.PI * 2; treePts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); treeCols.push(pal[i % pal.length]); }
  });
  if (treePts.length) { const o = bulbs(treePts, [XMAS[0]], 0.34), col = o.geometry.attributes.aCol; treeCols.forEach((c, i) => col.setXYZ(i, c.r, c.g, c.b)); col.needsUpdate = true; root.add(o); }
  const br = ctx.world.bridge();
  if (br) {                                                     // lights along both handrails, rising over the arch
    const pts = [], n = 30;
    for (let k = 0; k <= n; k++) { const t = k / n, x = br.x0 + (br.x1 - br.x0) * t, y = br.yEnd0 + (br.yEnd1 - br.yEnd0) * t + Math.sin(t * Math.PI) * 0.75 + 0.35 + 0.86; for (const sz of [-1, 1]) pts.push([x, y, br.bz + sz * 0.58]); }
    root.add(bulbs(pts, XMAS, 0.26));
  }

  // a lit tree on a free bit of ground
  const spot = ctx.freeSpot(5.5); let tree = null;
  if (spot) {
    tree = new THREE.Group(); tree.position.set(spot.x, spot.y, spot.z); tree.scale.setScalar(1.7);
    const green = lam('#1f6a42'), tiers = [[1.1, 1.4, 0.9], [0.85, 1.2, 1.9], [0.58, 1.0, 2.8]];
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6), lam('#5a3b24')); trunk.position.y = 0.35; tree.add(trunk);
    for (const [r, hh, yy] of tiers) { const c = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 9), green); c.position.y = yy; c.castShadow = true; tree.add(c); }
    const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: '#ffe27a' })); star.position.y = 3.55; tree.add(star);
    const sp = []; for (let i = 0; i < 46; i++) { const u = i / 45, r = 1.05 * (1 - u) + 0.1, a = u * 26; sp.push([Math.cos(a) * r, 0.7 + u * 2.6, Math.sin(a) * r]); }
    tree.add(bulbs(sp, XMAS, 0.22)); root.add(tree);
  }
  // the decorations of each billboard: lights round the frame, garlands, wreaths on the posts, gifts and a small tree on the catwalk
  const garland = lam('#1f7a44'), red = lam('#d63a3a'), gold = lam('#f2c14e');
  function tube(pts, r) { const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); return new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(8, pts.length * 3), r, 5, false), garland); }
  function buildBoard(b) {
    const F = b.frame, g = new THREE.Group(), { lw, lh, x, top, bot, T, cwY, cwW } = F, pts = [], zf = 0.62;
    const x0 = x - lw / 2 - T - 0.12, x1 = x + lw / 2 + T + 0.12, y0 = bot - T - 0.12, y1 = top + T + 0.12, step = ctx.low ? 1.1 : 0.75;
    for (let xx = x0; xx <= x1; xx += step) { pts.push([xx, y1, zf], [xx, y0, zf]); }
    for (let yy = y0 + step; yy < y1; yy += step) { pts.push([x0, yy, zf], [x1, yy, zf]); }
    g.add(bulbs(pts, XMAS, 0.55));
    // garlands: along the top edge (above the frame, rising and falling a little), down both sides (hugging the frame) and along the catwalk rail
    const top0 = top + T + 0.2, topPts = []; for (let i = 0; i <= 28; i++) { const u = i / 28; topPts.push([x - lw / 2 - T + (lw + 2 * T) * u, top0 + 0.16 * Math.sin(u * Math.PI * 7), 0.12]); } g.add(tube(topPts, 0.14));
    for (const sx of [-1, 1]) { const sp = []; for (let i = 0; i <= 18; i++) { const u = i / 18; sp.push([x + sx * (lw / 2 + T + 0.28) + 0.1 * Math.sin(u * 14), bot - T + (lh + 2 * T) * u, 0.3]); } g.add(tube(sp, 0.12)); }
    const rp = []; for (let i = 0; i <= 24; i++) { const u = i / 24; rp.push([x - cwW / 2 + cwW * u, cwY + 1.02 - 0.17 * Math.abs(Math.sin(u * Math.PI * 6)), 1.2]); } g.add(tube(rp, 0.1));
    for (let k = 0; k <= 6; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), red); m.position.set(x - lw / 2 - T + ((lw + 2 * T) * k) / 6, top0 + 0.1, 0.12); g.add(m); }
    // gifts and a small tree on the catwalk
    const giftCols = ['#d63a3a', '#2f8fe0', '#f2c14e'], fy = cwY + 0.07;
    [[-0.34, 0.7], [-0.22, 0.5], [0.3, 0.62]].forEach(([fx, s], i) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), lam(giftCols[i])); box.position.set(x + cwW * fx, fy + s / 2, 0.55); g.add(box);
      for (const [a, c] of [[s * 1.02, s * 0.14], [s * 0.14, s * 1.02]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(a, s * 1.02, c), gold); r.position.copy(box.position); g.add(r); }
    });
    const mini = new THREE.Group(); mini.position.set(x - cwW * 0.44, fy, 0.55);
    for (const [r, hh, yy] of [[0.55, 0.8, 0.5], [0.4, 0.7, 1.05], [0.26, 0.6, 1.5]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 8), lam('#1f6a42')); c.position.y = yy; mini.add(c); }
    const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: '#ffe27a' })); st.position.y = 1.95; mini.add(st);
    const mp = []; for (let i = 0; i < 16; i++) { const u = i / 15, r = 0.5 * (1 - u) + 0.05, a = u * 12; mp.push([Math.cos(a) * r, 0.25 + u * 1.45, Math.sin(a) * r]); } mini.add(bulbs(mp, XMAS, 0.2)); g.add(mini);
    // a wreath on each post
    for (const px of [-5.8, 5.8]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.13, 6, 16), garland); w.position.set(px, 1.2, 0.1); g.add(w); const bow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), red); bow.position.set(px, 0.72, 0.18); g.add(bow); }
    return g;
  }
  function syncBoards(hide) {
    for (const b of ctx.world.boards) {
      if (!b.frame || !b.group) continue; let e = boardSets.get(b);
      if (!e) { e = { v: -1, g: null }; boardSets.set(b, e); }
      if (e.v !== b.frameV) { e.v = b.frameV; if (e.g) { b.group.remove(e.g); disposeTree(e.g); } e.g = buildBoard(b); b.group.add(e.g); }
      e.g.visible = !hide && b.frame.lw < 22;                 // (a sign that is open is full screen: the decorations stay out of the way)
    }
  }
  return {
    update(dt, s) { syncBoards(s.hide); },
    dispose() {
      for (const [g, o] of houseStrings) { g.remove(o); o.geometry.dispose(); }
      for (const [b, e] of boardSets) if (e.g) { b.group.remove(e.g); disposeTree(e.g); }
      if (tree) { root.remove(tree); disposeTree(tree); }
      ctx.scene.remove(root);
    },
    root,
  };
}

// ---------------------------------------------------------------- Santa's sleigh across the night sky
function santaTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#05060f'; g.strokeStyle = '#05060f'; g.lineCap = 'round'; g.lineJoin = 'round';
  const deer = (x, y, s, ph) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.ellipse(0, 0, 26, 12, 0, 0, 6.3); g.fill();                                             // body
    g.beginPath(); g.ellipse(30, -12, 10, 8, -0.4, 0, 6.3); g.fill();                                        // head
    g.lineWidth = 5; g.beginPath(); g.moveTo(22, -8); g.lineTo(30, 0); g.stroke();                           // neck
    g.lineWidth = 3; g.beginPath(); g.moveTo(32, -18); g.lineTo(36, -34); g.lineTo(30, -44); g.moveTo(36, -34); g.lineTo(46, -40); g.moveTo(34, -22); g.lineTo(26, -30); g.stroke();    // antlers
    g.lineWidth = 4; g.beginPath(); g.moveTo(14, 8); g.lineTo(26 + ph * 10, 30); g.moveTo(-14, 8); g.lineTo(-30 - ph * 10, 28); g.moveTo(18, 8); g.lineTo(8 - ph * 8, 30); g.moveTo(-18, 8); g.lineTo(-8 + ph * 8, 30); g.stroke();   // legs
    g.restore();
  };
  [[640, 120, 0.8, 0], [740, 108, 0.8, 1], [840, 100, 0.8, 0], [940, 96, 0.8, 1]].forEach(([x, y, s, ph]) => deer(x, y, s, ph));
  g.lineWidth = 3; g.beginPath(); g.moveTo(180, 120); for (const [x, y] of [[330, 112], [470, 106], [600, 108]]) g.lineTo(x, y); g.stroke();       // the reins
  g.beginPath(); g.moveTo(150, 150); g.quadraticCurveTo(150, 190, 215, 194); g.lineTo(420, 194); g.quadraticCurveTo(460, 190, 450, 156); g.lineTo(460, 130); g.lineTo(405, 150); g.lineTo(180, 150); g.closePath(); g.fill();   // the sleigh
  g.lineWidth = 6; g.beginPath(); g.moveTo(130, 204); g.quadraticCurveTo(260, 214, 470, 200); g.quadraticCurveTo(500, 196, 492, 176); g.stroke();     // runner
  g.beginPath(); g.arc(300, 118, 24, 0, 6.3); g.fill();                                                           // Santa's body and head
  g.beginPath(); g.arc(300, 82, 14, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(288, 76); g.lineTo(302, 46); g.lineTo(322, 80); g.closePath(); g.fill(); g.beginPath(); g.arc(304, 46, 6, 0, 6.3); g.fill();       // head and hat
  g.beginPath(); g.ellipse(210, 120, 50, 40, 0.3, 0, 6.3); g.fill();                                                // the sack
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeSanta(ctx) {
  const mat = new THREE.MeshBasicMaterial({ map: santaTexture(), transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.25), mat); mesh.scale.setScalar(46); mesh.renderOrder = -6; mesh.visible = false; ctx.skyScene.add(mesh);
  let t = -1, wait = 25 + Math.random() * 40, dur = 11, dir = 1, y0 = 38;
  return {
    /** Start a fly-by now. */
    go(name) { if ((name && name !== 'santa') || t >= 0) return; t = 0; dir = Math.random() < 0.5 ? 1 : -1; y0 = 30 + Math.random() * 14; dur = 10 + Math.random() * 3; mesh.scale.x = 46 * dir; mesh.visible = true; ctx.audio?.sleigh?.(dir); },
    update(dt, s) {
      if (t < 0) { if (s.night > 0.4 && !s.hide) wait -= dt * (0.7 + 1.1 * s.peak); if (wait <= 0) { wait = 80 + Math.random() * 100; this.go(); } return; }
      t += dt; const u = t / dur; if (u >= 1) { t = -1; mesh.visible = false; return; }
      const x = (-110 + 220 * u) * dir, y = y0 + Math.sin(u * Math.PI) * 9 - u * 4;
      mesh.position.set(x, y, -125); mat.opacity = Math.min(1, Math.min(u * 6, (1 - u) * 6)) * 0.92 * (1 - 0.8 * (s.fade < 1 ? 1 : 0));
      mesh.rotation.z = Math.atan2(Math.cos(u * Math.PI) * 9 * Math.PI / 220, 1) * dir * -0.6;
    },
    dispose() { ctx.skyScene.remove(mesh); mesh.geometry.dispose(); mat.map.dispose(); mat.dispose(); },
  };
}

// ---------------------------------------------------------------- fireworks (New Year, July 4th)
// Rockets climb in the sky layer (behind the hills, so they burst over the skyline) and burst into a ball of glowing sparks that fall and fade; each burst briefly lights the ground in its colour and is
// followed, a moment later, by a boom and some crackle. A "show" is a short run of bursts every half minute or so on a clear night, more often and with a finale on the holiday itself.
const FW_COLS = [['#ff4d4d', '#ffd24a'], ['#4dd2ff', '#ffffff'], ['#7dff6a', '#ffe94a'], ['#ff6ad5', '#8f6bff'], ['#ffb347', '#ff4d4d'], ['#ffffff', '#9fd4ff'], ['#4a6bff', '#ff4dd2']].map((p) => p.map((c) => new THREE.Color(c)));
const fwBurstMat = (low) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uT: { value: 0 }, uO: { value: new THREE.Vector3() }, uSpd: { value: 16 }, uLife: { value: 2.2 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uPx: BU.uPx, uSize: { value: 0.9 }, uK: { value: 1 } },
  vertexShader: `uniform float uT, uSpd, uLife, uPx, uSize; uniform vec3 uO; attribute vec3 aDir; attribute float aR; varying float vA; varying float vH; varying float vK;
    void main() { float t = uT, sp = uSpd * (0.5 + 0.5 * aR), life = uLife * (0.65 + 0.35 * aR), k = clamp(t / life, 0.0, 1.0);
      vec3 p = uO + aDir * sp * (1.0 - exp(-t * 2.4)) / 2.4; p.y -= 3.2 * t * t;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      float tw = k > 0.45 ? 0.55 + 0.45 * sin(t * 38.0 + aR * 60.0) : 1.0;
      vA = (1.0 - k) * (1.0 - k) * smoothstep(0.0, 0.05, t) * tw; vH = step(0.5, fract(aR * 7.3)); vK = k;
      gl_PointSize = clamp(uSize * (1.0 - 0.55 * k) * uPx / max(1.0, -mv.z), 1.5, 24.0); }`,
  fragmentShader: `uniform vec3 uC1, uC2; varying float vA; varying float vH; varying float vK;
    void main() { float d = length(gl_PointCoord - 0.5), core = smoothstep(0.18, 0.0, d), halo = smoothstep(0.5, 0.05, d); vec3 c = mix(uC1, uC2, vH); gl_FragColor = vec4(mix(c, vec3(1.0), core * (1.0 - vK)) * (0.9 + 0.8 * core), halo * vA); }`,
});
function makeFireworks(ctx) {
  const N = ctx.low ? 56 : 120, POOL = ctx.low ? 3 : 5, bursts = [], rnd = Math.random;
  const dirs = new Float32Array(N * 3), rr = new Float32Array(N);
  for (let i = 0; i < N; i++) { const z = rnd() * 2 - 1, a = rnd() * 6.2832, s = Math.sqrt(1 - z * z); dirs.set([s * Math.cos(a), s * Math.sin(a), z], i * 3); rr[i] = rnd(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3)); geo.setAttribute('aR', new THREE.BufferAttribute(rr, 1));
  for (let i = 0; i < POOL; i++) {
    const mat = fwBurstMat(ctx.low), pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = -5; pts.visible = false; ctx.skyScene.add(pts);
    const rg = new THREE.BufferGeometry(); const rp = new Float32Array(10 * 3); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    const rocket = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#ffe9b0', size: 1.4, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })); rocket.frustumCulled = false; rocket.renderOrder = -5; rocket.visible = false; ctx.skyScene.add(rocket);
    bursts.push({ pts, mat, rocket, rp, rg, busy: false, t: 0, phase: 0, x0: 0, x1: 0, y1: 0, delay: 0, power: 1, pan: 0 });
  }
  let queue = [], wait = 6 + rnd() * 10, glow = 0; const glowCol = new THREE.Color();
  const launch = (delay, big) => {
    const b = bursts.find((q) => !q.busy); if (!b) return false;
    b.busy = true; b.phase = delay > 0 ? -1 : 0; b.delay = delay; b.t = 0; b.x1 = (rnd() * 2 - 1) * 62; b.x0 = b.x1 + (rnd() - 0.5) * 18; b.y1 = 34 + rnd() * 36; if (b.power > 2) b.y1 = 48 + rnd() * 24; b.power = big ? 1.4 : rnd() < 0.22 ? 2.1 + rnd() * 0.5 : 0.8 + rnd() * 0.5; b.pan = b.x1 / 70;
    const p = FW_COLS[(rnd() * FW_COLS.length) | 0]; b.mat.uniforms.uC1.value.copy(p[0]); b.mat.uniforms.uC2.value.copy(p[1]); b.mat.uniforms.uSpd.value = 26 * b.power * (b.power > 2 ? 1.25 : 1); b.mat.uniforms.uSize.value = ctx.low ? 1.5 : 1.2; b.mat.uniforms.uLife.value = (2.0 + rnd() * 0.8) * (b.power > 2 ? 1.5 : 1); b.mat.uniforms.uSize.value *= b.power > 2 ? 1.5 : 1; return true;
  };
  const show = (peak) => { const n = 3 + Math.floor(rnd() * 4 + peak * 8); let t = 0; for (let i = 0; i < n; i++) { t += 0.35 + rnd() * 1.0; queue.push({ at: t, big: false }); } if (peak > 0.5) { for (let i = 0; i < 5; i++) queue.push({ at: t + 1.2 + i * 0.18, big: true }); } };   // (a finale of bigger bursts together on the day itself)
  let clock = 0;
  return {
    go(name) { if (name && name !== 'fireworks') return; show(0.4); },
    update(dt, s) {
      clock += dt;
      const clear = s.night > 0.55 && !s.hide && !(s.weather && (s.weather.rain > 0.2 || s.weather.storm > 0.1 || s.weather.cloud > 0.92));
      if (clear) { wait -= dt * (0.8 + 1.8 * s.peak); if (wait <= 0) { wait = 28 + rnd() * 50; show(s.peak); } }
      for (const q of queue) q.at -= dt; while (queue.length && queue[0].at <= 0) { const q = queue.shift(); launch(0, q.big); }
      for (const b of bursts) {
        if (!b.busy) continue; b.t += dt;
        if (b.phase === 0) {                                    // the rocket climbs
          const dur = 0.85, u = Math.min(1, b.t / dur);
          for (let i = 0; i < 10; i++) { const w = Math.max(0, u - i * 0.018), e = 1 - Math.pow(1 - w, 2); b.rp[i * 3] = b.x0 + (b.x1 - b.x0) * e; b.rp[i * 3 + 1] = -8 + (b.y1 + 8) * e; b.rp[i * 3 + 2] = -105; }
          b.rg.attributes.position.needsUpdate = true; b.rocket.visible = true; b.rocket.material.opacity = 0.9;
          if (b.t === dt) ctx.audio?.firework?.('launch', 0, 0.6, b.pan);
          if (u >= 1) { b.phase = 1; b.t = 0; b.rocket.visible = false; b.pts.visible = true; b.mat.uniforms.uO.value.set(b.x1, b.y1, -105); glow = Math.max(glow, 0.9 * Math.min(1.6, b.power)); glowCol.copy(b.mat.uniforms.uC1.value); ctx.audio?.firework?.('boom', 0.45 + Math.random() * 0.7, b.power, b.pan); }
        } else {
          b.mat.uniforms.uT.value = b.t; if (b.t > b.mat.uniforms.uLife.value + 0.2) { b.busy = false; b.pts.visible = false; }
        }
      }
      glow = Math.max(0, glow - dt * 1.8); ctx.world.setAurora(glow > 0.01 && !s.hide && !ctx.auroraBusy?.() ? glowCol : null, glow * 0.22);
    },
    dispose() { for (const b of bursts) { ctx.skyScene.remove(b.pts); ctx.skyScene.remove(b.rocket); b.mat.dispose(); b.rg.dispose(); b.rocket.material.dispose(); } geo.dispose(); ctx.world.setAurora(null, 0); },
  };
}

// the decorations of each billboard (one group per board, a child of its sign group), rebuilt when the frame's layout changes and hidden while the sign is open
function makeBoardSets(ctx, build) {
  const sets = new Map();
  return {
    sync(hide) {
      for (const b of ctx.world.boards) {
        if (!b.frame || !b.group) continue; let e = sets.get(b); if (!e) { e = { v: -1, g: null }; sets.set(b, e); }
        if (e.v !== b.frameV) { e.v = b.frameV; if (e.g) { b.group.remove(e.g); disposeTree(e.g); } e.g = build(b); b.group.add(e.g); }
        e.g.visible = !hide && b.frame.lw < 22;
      }
    },
    dispose() { for (const [b, e] of sets) if (e.g) { b.group.remove(e.g); disposeTree(e.g); } sets.clear(); },
  };
}
// ---------------------------------------------------------------- the haunted mansion: old, abandoned, run down
// Everything is drawn here (no image files): weathered clapboard and slate shingles with their normal maps made from the same drawing, gothic windows (leaded amber, stained glass, boarded up, broken), and a wrought-iron fence.
function rng(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
function normalMapFrom(src, k = 2.2) {
  const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data, out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d'), im = og.createImageData(w, h), o = im.data, H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  og.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function surfaceTex(height, tint, finish) {                    // height: draws the relief in greys; tint: the colour laid over it; finish: stains, peeling paint, moss on top
  const S = 256, hc = document.createElement('canvas'); hc.width = hc.height = S; height(hc.getContext('2d'), S);
  const cc = document.createElement('canvas'); cc.width = cc.height = S; const c = cc.getContext('2d'); c.drawImage(hc, 0, 0); c.globalCompositeOperation = 'overlay'; c.fillStyle = tint; c.fillRect(0, 0, S, S); c.globalCompositeOperation = 'source-over'; finish(c, S);
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4; return { map, normal: normalMapFrom(hc) };
}
function woodTextures() {
  const r = rng(11), rows = 6;
  return surfaceTex((g, S) => {
    const bh = S / rows; g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < rows; i++) {
      const y = i * bh, gr = g.createLinearGradient(0, y, 0, y + bh); gr.addColorStop(0, '#a0a0a0'); gr.addColorStop(0.86, '#7a7a7a'); gr.addColorStop(1, '#262626'); g.fillStyle = gr; g.fillRect(0, y, S, bh);
      for (let k = 0; k < 30; k++) { g.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.09)'; g.lineWidth = 1; const yy = y + 2 + r() * (bh - 6); g.beginPath(); g.moveTo(0, yy); for (let x = 0; x <= S; x += 32) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 1.4 + (r() - 0.5)); g.stroke(); }
      g.fillStyle = '#1c1c1c'; g.fillRect(r() * S, y, 2, bh * 0.88);                                  // a butt joint
      if (r() < 0.6) { const kx = r() * S, ky = y + bh * 0.45; g.fillStyle = '#585858'; g.beginPath(); g.ellipse(kx, ky, 5, 3, 0, 0, 6.3); g.fill(); g.strokeStyle = '#303030'; g.lineWidth = 1.5; g.stroke(); }
      if (r() < 0.5) { g.strokeStyle = '#161616'; g.lineWidth = 1.5; g.beginPath(); let x = r() * S, yy = y + 2; g.moveTo(x, yy); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 6; yy += bh / 7; g.lineTo(x, yy); } g.stroke(); }   // a split
      g.fillStyle = '#101010'; for (const nx of [20, 100, 180]) g.fillRect(nx + r() * 8, y + bh * 0.3, 2, 2);   // nail heads
    }
  }, '#625b72', (c, S) => {
    for (let i = 0; i < rows; i++) { c.fillStyle = `rgba(${40 + r() * 40},${50 + r() * 30},${40 + r() * 30},${0.08 + r() * 0.12})`; c.fillRect(0, i * S / rows, S, S / rows); }
    for (let k = 0; k < 7; k++) { c.fillStyle = 'rgba(190,190,180,0.22)'; c.beginPath(); const x = r() * S, y = r() * S; c.moveTo(x, y); for (let j = 0; j < 6; j++) c.lineTo(x + (r() - 0.5) * 46, y + (r() - 0.5) * 20); c.fill(); }   // peeling paint
    for (let k = 0; k < 9; k++) { const x = r() * S, gr = c.createLinearGradient(0, 0, 0, 90); gr.addColorStop(0, 'rgba(8,6,10,0.42)'); gr.addColorStop(1, 'rgba(8,6,10,0)'); c.fillStyle = gr; c.fillRect(x, 0, 4 + r() * 12, 40 + r() * 80); }   // rain streaks
    const gm = c.createLinearGradient(0, S, 0, S * 0.7); gm.addColorStop(0, 'rgba(40,70,30,0.25)'); gm.addColorStop(1, 'rgba(40,70,30,0)'); c.fillStyle = gm; c.fillRect(0, S * 0.7, S, S * 0.3);
  });
}
function shingleTextures() {
  const r = rng(23);
  return surfaceTex((g, S) => {
    g.fillStyle = '#101010'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) for (let x = -16; x < S + 16; x += 32) {
      const sx = x + (i % 2) * 16, y = i * 32; g.beginPath(); g.moveTo(sx + 1, y); g.lineTo(sx + 31, y); g.lineTo(sx + 31, y + 22); g.quadraticCurveTo(sx + 16, y + 38, sx + 1, y + 22); g.closePath();
      if (r() < 0.06) { g.fillStyle = '#0a0a0a'; g.fill(); continue; }                                  // a shingle gone
      const gr = g.createLinearGradient(0, y, 0, y + 34); gr.addColorStop(0, '#6a6a6a'); gr.addColorStop(0.6, '#9a9a9a'); gr.addColorStop(1, '#4a4a4a'); g.fillStyle = gr; g.fill();
    }
  }, '#3c4458', (c, S) => {
    for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(${r() < 0.5 ? '30,50,30' : '70,60,60'},${0.1 + r() * 0.16})`; c.fillRect(r() * S, r() * S, 20 + r() * 30, 14 + r() * 16); }
  });
}
const archPath = (g, x0, y0, x1, y1, pointed) => {
  const cx = (x0 + x1) / 2, rad = (x1 - x0) / 2; g.beginPath(); g.moveTo(x0, y1);
  if (pointed) { const sh = y0 + rad * 1.5; g.lineTo(x0, sh); g.quadraticCurveTo(x0, y0 + rad * 0.5, cx, y0); g.quadraticCurveTo(x1, y0 + rad * 0.5, x1, sh); } else { g.lineTo(x0, y0 + rad); g.arc(cx, y0 + rad, rad, Math.PI, 0); }
  g.lineTo(x1, y1); g.closePath();
};
const JEWEL = ['#c0222e', '#e0a52a', '#2457c8', '#238a5c', '#8a2fb0', '#e0652a'];
function windowTexture(kind, seed) {
  const W = 96, Hh = 160, r = rng(seed), c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d');
  archPath(g, 2, 2, W - 2, Hh - 2, kind === 'stain' || seed % 2 === 0); g.fillStyle = '#2a1e22'; g.fill();                                   // the frame
  g.save(); archPath(g, 9, 9, W - 9, Hh - 9, kind === 'stain' || seed % 2 === 0); g.clip();
  if (kind === 'dark' || kind === 'boarded') { g.fillStyle = '#0a0810'; g.fillRect(0, 0, W, Hh); g.strokeStyle = 'rgba(160,170,190,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(20, 30); g.lineTo(60, 80); g.lineTo(46, 140); g.moveTo(60, 80); g.lineTo(84, 70); g.stroke(); if (kind === 'boarded') { g.fillStyle = 'rgba(255,170,70,0.35)'; g.fillRect(0, 0, W, Hh); } }
  else {
    const cell = kind === 'stain' ? 22 : 20;
    for (let j = -2; j < 10; j++) for (let i = -2; i < 6; i++) {
      const x = i * cell + (j % 2) * cell / 2, y = j * cell, col = kind === 'stain' ? JEWEL[Math.floor(r() * JEWEL.length)] : ['#ffb347', '#ffcf6a', '#e8942a', '#ffd98a'][Math.floor(r() * 4)];
      g.fillStyle = kind === 'amber' && r() < 0.18 ? '#150f0a' : col; g.beginPath(); g.moveTo(x, y - cell / 2); g.lineTo(x + cell / 2, y); g.lineTo(x, y + cell / 2); g.lineTo(x - cell / 2, y); g.closePath(); g.fill(); g.strokeStyle = '#0c0a0c'; g.lineWidth = 2.5; g.stroke();
    }
    if (kind === 'stain') { g.strokeStyle = '#0c0a0c'; g.lineWidth = 3; g.fillStyle = '#f0c040'; g.beginPath(); g.arc(W / 2, 52, 14, 0, 6.3); g.fill(); g.stroke(); g.fillStyle = '#c0222e'; g.beginPath(); g.arc(W / 2, 52, 7, 0, 6.3); g.fill(); g.stroke(); }
    if (kind === 'amber' && seed % 3 === 0) { g.strokeStyle = '#0a0a0a'; g.lineWidth = 2; g.beginPath(); g.moveTo(30, 40); g.lineTo(52, 90); g.lineTo(40, 150); g.stroke(); }   // a cracked pane
  }
  g.restore(); g.strokeStyle = '#2a1e22'; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W / 2, Hh - 4); g.moveTo(8, Hh * 0.55); g.lineTo(W - 8, Hh * 0.55); g.stroke();   // the mullion and transom
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeMansion(ctx) {
  const W = woodTextures(), SH = shingleTextures(), cache = new Map(), wins = [], hh = new THREE.Group(), disposables = [];
  const mat = (T, rx, ry, color = '#ffffff') => { const key = T === W ? 'w' : 's', k2 = key + rx.toFixed(1) + ry.toFixed(1) + color; let m = cache.get(k2); if (m) return m;
    const map = T.map.clone(), nm = T.normal.clone(); for (const t of [map, nm]) { t.repeat.set(rx, ry); t.needsUpdate = true; }
    m = new THREE.MeshStandardMaterial({ map, normalMap: nm, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.95, metalness: 0, color }); cache.set(k2, m); disposables.push(map, nm, m); return m; };
  const wood = (w, h, color) => mat(W, Math.max(1, w / 1.5), Math.max(1, h / 1.5), color), slate = (w, h) => mat(SH, Math.max(1, w / 2), Math.max(1, h / 2));
  const stone = new THREE.MeshStandardMaterial({ color: '#4a4650', roughness: 1 }), iron = new THREE.MeshStandardMaterial({ color: '#1c1618', roughness: 0.7, metalness: 0.5 }), brick = new THREE.MeshStandardMaterial({ color: '#5a3a38', roughness: 1 }), dark = new THREE.MeshStandardMaterial({ color: '#0e0b12', roughness: 1 }), trim = wood(1.5, 1.5, '#9a94a8');
  disposables.push(stone, iron, brick, dark);
  const box = (par, w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; par.add(o); return o; };
  const walls = (w, h, d, x, y, z, ry = 0) => { const m = [wood(d, h), wood(d, h), wood(w, d), wood(w, d), wood(w, h), wood(w, h)]; const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; hh.add(o); return o; };
  function gable(len, span, rise, ov, x, y, z, ry = 0, sag = 0) {       // a gable roof, its ridge along x: two slate panels and a board gable end at each end
    const g = new THREE.Group(), ang = Math.atan2(rise, span / 2), Ls = Math.hypot(span / 2, rise) + ov;
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(len + ov * 2, 0.1, Ls), slate(len + ov * 2, Ls)); p.position.set(0, rise / 2 - ov * 0.2, s * (span / 4 + ov * 0.45)); p.rotation.x = s * ang; p.castShadow = true; g.add(p); }
    const sh = new THREE.Shape(); sh.moveTo(-span / 2, 0); sh.lineTo(span / 2, 0); sh.lineTo(0, rise); sh.closePath();
    for (const e of [-1, 1]) { const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }), mat(W, 1 / 1.5, 1 / 1.5)); m.rotation.y = Math.PI / 2; m.position.set(e * len / 2 - (e > 0 ? 0 : 0.08), 0, 0); g.add(m); }
    box(g, len + ov * 2 + 0.1, 0.1, 0.16, dark, 0, rise + 0.02, 0);                                              // the ridge
    g.position.set(x, y, z); g.rotation.set(0, ry, sag); hh.add(g); return g;
  }
  function win(kind, x, y, z, w, h, ry = 0, planks = 0, seed = 1) {
    const m = new THREE.MeshBasicMaterial({ map: windowTexture(kind, seed), transparent: true, alphaTest: 0.5, fog: false }), o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.y = ry; hh.add(o); disposables.push(m.map, m);
    wins.push({ m, ph: seed * 3.7, k: kind === 'stain' ? 0.85 : kind === 'amber' ? 1 : kind === 'boarded' ? 0.5 : 0 });
    const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.y = ry; hh.add(q);
    box(q, w + 0.22, 0.1, 0.22, stone, 0, -h / 2 - 0.05, 0.08);                                                    // the sill
    if (planks) { const pm = wood(1, 0.3, '#8a8478'); for (let i = 0; i < planks; i++) box(q, w * 1.25, 0.2, 0.05, pm, (i % 2 ? 0.03 : -0.03), (i - (planks - 1) / 2) * h * 0.3, 0.1 + i * 0.015, 0, 0, (i % 2 ? 1 : -1) * (0.05 + 0.05 * i) + (i === 1 ? 0.5 : 0)); }
    return o;
  }
  // body
  box(hh, 4.9, 0.55, 3.9, stone, 0, 0.27, 0.15);                                                                  // the stone footing
  walls(4.2, 2.9, 3.2, 0, 2.0, 0);
  walls(1.9, 2.9, 0.7, 0, 2.0, 1.8);                                                                               // the front bay
  walls(1.9, 2.3, 2.5, 3.0, 1.7, -0.1);                                                                           // the right wing
  gable(4.2, 3.4, 1.7, 0.45, 0, 3.45, 0);
  gable(0.7, 2.0, 1.2, 0.3, 0, 3.45, 1.9, Math.PI / 2);                                                            // the gable over the bay (ridge along z)
  gable(2.5, 2.1, 1.0, 0.3, 3.0, 2.85, -0.1, Math.PI / 2);
  // the tower: a tilted drum with a cone, a spire on top
  const tw = new THREE.Group(); tw.position.set(-2.55, 0.5, 0.45); tw.rotation.z = 0.03; hh.add(tw);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 4.9, 10), wood(6, 4.9)); drum.position.y = 2.45; drum.castShadow = true; tw.add(drum);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.6, 10), slate(6, 3)); cap.position.y = 6.2; cap.rotation.z = 0.05; cap.castShadow = true; tw.add(cap);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 1.4, 5), iron); sp.position.y = 8.0; tw.add(sp);
  // chimneys, finials and spires
  [[1.2, 5.3, -0.7, 0.95], [3.4, 4.1, -0.9, 0.7]].forEach(([x, y, z, hgt], i) => { box(hh, 0.6, hgt * 1.6, 0.6, brick, x, y, z, 0, 0, i ? 0.09 : -0.07); box(hh, 0.8, 0.14, 0.8, stone, x + (i ? 0.07 : -0.05), y + hgt * 0.82, z, 0, 0, i ? 0.09 : -0.07); });
  for (const [x, y, z] of [[-2.35, 5.15, 0], [2.35, 5.15, 0], [0, 4.85, 2.65]]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.9, 5), iron); f.position.set(x, y, z); f.rotation.z = (x * 0.05); hh.add(f); }
  // the porch: a deck, turned posts with missing balusters, a sagging roof of slate and steps
  box(hh, 4.5, 0.14, 1.3, wood(4.5, 1.3, '#8a8478'), 0, 0.62, 2.55); box(hh, 1.6, 0.14, 0.7, wood(1.6, 0.7, '#8a8478'), 0, 0.5, 3.4); box(hh, 1.6, 0.14, 0.5, wood(1.6, 0.5, '#8a8478'), 0, 0.38, 3.8);
  const postXs = [-2.1, -1.1, 1.1, 2.1]; for (const px of postXs) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.2, 8), trim); p.position.set(px, 1.25, 3.1); p.castShadow = true; hh.add(p); }
  for (const [x0, x1] of [[-2.1, -1.1], [1.1, 2.1]]) { box(hh, x1 - x0, 0.08, 0.08, trim, (x0 + x1) / 2, 1.1, 3.1); for (let i = 0; i < 6; i++) if (!((x0 < 0 && i === 2) || (x0 > 0 && i === 4))) box(hh, 0.05, 0.5, 0.05, trim, x0 + 0.1 + i * (x1 - x0 - 0.2) / 5, 0.85, 3.1); }
  for (const [x0, x1, sag] of [[-2.35, -0.95, 0.07], [0.95, 2.35, -0.1]]) { const pr = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.09, 1.9), slate(x1 - x0, 1.9)); pr.position.set((x0 + x1) / 2, 1.95, 2.45); pr.rotation.set(0.2, 0, sag); pr.castShadow = true; hh.add(pr); }
  // the front door and the big stained window over it
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.7), new THREE.MeshStandardMaterial({ color: '#241a18', roughness: 1, normalMap: W.normal.clone(), map: W.map.clone() })); door.position.set(0.0, 1.5, 2.16); hh.add(door); disposables.push(door.material);
  win('stain', 0, 2.95, 2.17, 0.8, 1.0, 0, 0, 2); win('stain', 0, 3.95, 2.27, 0.45, 0.85, 0, 0, 4);                                // (the high window of the bay's gable)
  // windows of the main block (front), the wing and the tower
  win('amber', -1.45, 2.85, 1.62, 0.8, 1.2, 0, 0, 3); win('boarded', 1.45, 2.85, 1.62, 0.8, 1.2, 0, 3, 5); win('amber', -1.45, 1.2, 1.62, 0.75, 1.1, 0, 0, 6); win('dark', 1.45, 1.2, 1.62, 0.75, 1.1, 0, 2, 7);
  win('amber', 2.5, 1.95, 1.17, 0.7, 1.15, 0, 0, 8); win('boarded', 3.5, 1.95, 1.17, 0.7, 1.15, 0, 2, 9); win('stain', -2.55, 3.9, 1.5, 0.6, 1.0, 0.0, 0, 10);
  win('amber', -3.07, 1.3, 1.39, 0.55, 0.9, -0.5, 0, 11); win('dark', -2.55, 1.3, 1.5, 0.55, 0.9, 0, 1, 12); win('amber', -2.55, 4.95, 1.45, 0.34, 0.55, 0, 0, 13);
  win('stain', 0.0, 3.0, -1.62, 0.9, 1.4, Math.PI, 0, 14);
  // shutters hanging crooked
  for (const [x, y, z, rz] of [[-2.05, 2.85, 1.65, 0.12], [-0.85, 2.85, 1.65, -0.07], [2.0, 2.85, 1.65, 0.2], [0.8, 1.2, 1.65, -0.1]]) box(hh, 0.36, 1.3, 0.05, wood(0.4, 1.3, '#6f6a70'), x, y, z, 0, 0, rz);
  // an iron fence along the front with a gate, and returns down both sides: spear pickets and rails, some bent, some fallen, some gone
  const r = rng(5), N = 60, pk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), iron, N), fin = new THREE.InstancedMesh(new THREE.ConeGeometry(0.075, 0.26, 4), iron, N), dm = new THREE.Object3D();
  const spots = []; for (let i = 0; i <= 26; i++) { const x = -5.2 + i * 0.4; if (Math.abs(x) < 0.95) continue; spots.push([x, 5.3]); }
  for (let i = 1; i <= 11; i++) { spots.push([-5.2, 5.3 - i * 0.4]); spots.push([5.2, 5.3 - i * 0.4]); }
  let n = 0;
  for (const [x, z] of spots) {
    if (n >= N || r() < 0.1) continue;
    const fall = r() < 0.05, lean = fall ? 1.45 : (r() - 0.5) * 0.1 + (r() < 0.1 ? (r() - 0.5) * 1.0 : 0), y = fall ? 0.06 : 0.75;
    dm.position.set(x, y, z); dm.rotation.set(0, 0, lean); dm.updateMatrix(); pk.setMatrixAt(n, dm.matrix);
    dm.position.set(x - Math.sin(lean) * 0.88, y + Math.cos(lean) * 0.88, z); dm.rotation.set(0, 0, lean); dm.updateMatrix(); fin.setMatrixAt(n, dm.matrix); n++;
  }
  pk.count = fin.count = n; pk.castShadow = true; hh.add(pk, fin);
  for (const [x0, x1] of [[-5.3, -1.0], [1.0, 5.3]]) for (const y of [0.35, 1.15]) box(hh, x1 - x0, 0.05, 0.05, iron, (x0 + x1) / 2, y, 5.3, 0, 0, (x0 < 0 ? 1 : -1) * 0.012);
  for (const sx of [-1, 1]) for (const y of [0.35, 1.15]) box(hh, 0.05, 0.05, 4.6, iron, sx * 5.2, y, 3.0);
  for (const sx of [-1, 1]) { const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), iron), p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 6), iron); p.position.set(sx * 0.95, 0.95, 5.3); g.position.set(sx * 0.95, 1.98, 5.3); hh.add(p, g); }
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 5, 20, Math.PI), iron); arc.position.set(0, 1.95, 5.3); arc.rotation.z = 0.03; hh.add(arc);           // the gate's arch
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.4, 0.04), iron); leaf.position.set(-0.55, 0.75, 5.5); leaf.rotation.y = -0.9; hh.add(leaf);       // a gate hanging open
  // a dead tree with a crowd of thin bare limbs
  const tr = new THREE.Group(); tr.position.set(5.9, 0, 0.9); hh.add(tr);
  const limb = (x, y, z, len, r0, ax, az, depth) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(ax, 0, az); tr.add(g); const m = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.55, r0, len, 5), dark); m.position.y = len / 2; g.add(m);
    if (depth > 0) for (let k = 0; k < 2 + (depth > 1); k++) { const a = (r() - 0.5) * 1.5, b = (r() - 0.5) * 1.2, t = 0.55 + r() * 0.4; const pos = new THREE.Vector3(0, len * t, 0).applyEuler(new THREE.Euler(ax, 0, az)); limb(x + pos.x, y + pos.y, z + pos.z, len * (0.55 + r() * 0.2), r0 * 0.55, ax + b, az + a * (k % 2 ? 1 : -1) + (k % 2 ? 0.6 : -0.6), depth - 1); } };
  limb(0, 0, 0, 3.0, 0.2, 0, 0.04, 3);
  return { group: hh, wins, dispose() { disposeTree(hh); for (const d of disposables) d.dispose(); W.map.dispose(); W.normal.dispose(); SH.map.dispose(); SH.normal.dispose(); } };
}

// ---------------------------------------------------------------- Halloween
// A haunted house on a free bit of ground (crooked tower, glowing windows that flicker, a dead tree, a fence), carved pumpkins with candle-lit faces by the houses, a big orange glow round the moon, bats that cross it,
// a ghost that drifts about the haunted house now and then, and the odd creepy sound; the billboards get pumpkins, cobwebs, orange and purple lights, a perched bat and a skeleton hand.
const HAL = ['#ff8a1f', '#a64dff', '#ff8a1f', '#ffb347', '#8a3dff'].map((c) => new THREE.Color(c));
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const faceTex = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#ffcf5a'; g.shadowColor = '#ff9a1f'; g.shadowBlur = 10;
  g.beginPath(); g.moveTo(30, 52); g.lineTo(52, 52); g.lineTo(41, 30); g.closePath(); g.fill(); g.beginPath(); g.moveTo(76, 52); g.lineTo(98, 52); g.lineTo(87, 30); g.closePath(); g.fill();      // eyes
  g.beginPath(); g.moveTo(62, 66); g.lineTo(70, 80); g.lineTo(54, 80); g.closePath(); g.fill();                                                                                         // nose
  g.beginPath(); g.moveTo(26, 88); g.quadraticCurveTo(64, 118, 102, 88); g.lineTo(94, 86); g.lineTo(86, 98); g.lineTo(76, 90); g.lineTo(64, 102); g.lineTo(52, 90); g.lineTo(42, 98); g.lineTo(34, 86); g.closePath(); g.fill();   // grin
});
const batTex = () => canvasTex(128, 64, (g) => {
  g.fillStyle = '#07050c'; g.beginPath(); g.moveTo(64, 20); g.quadraticCurveTo(80, 6, 124, 14); g.quadraticCurveTo(108, 28, 106, 46); g.quadraticCurveTo(94, 34, 84, 46); g.quadraticCurveTo(76, 36, 70, 52); g.lineTo(64, 40);
  g.lineTo(58, 52); g.quadraticCurveTo(52, 36, 44, 46); g.quadraticCurveTo(34, 34, 22, 46); g.quadraticCurveTo(20, 28, 4, 14); g.quadraticCurveTo(48, 6, 64, 20); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(58, 22); g.lineTo(56, 8); g.lineTo(62, 16); g.lineTo(66, 16); g.lineTo(72, 8); g.lineTo(70, 22); g.closePath(); g.fill();
});
const ghostTex = () => canvasTex(256, 448, (g) => {
  const r = rng(3); g.lineJoin = 'round'; g.lineCap = 'round';
  const shroud = new Path2D();                                  // the hooded shroud, its sleeves held out to the sides, and a ragged hem of tatters
  shroud.moveTo(128, 14); shroud.bezierCurveTo(96, 14, 84, 52, 86, 92); shroud.bezierCurveTo(70, 104, 40, 112, 16, 118); shroud.lineTo(8, 150); shroud.bezierCurveTo(40, 144, 70, 150, 80, 168);
  shroud.bezierCurveTo(66, 250, 52, 330, 38, 440);
  for (let i = 0; i < 9; i++) { const x = 38 + (i + 0.5) * (180 / 9); shroud.lineTo(x - 7, 440 - r() * 30); shroud.lineTo(x, 380 + r() * 50 + (i % 3) * 14); shroud.lineTo(x + 7, 440 - r() * 30 + (i % 2) * 8); }
  shroud.lineTo(218, 440); shroud.bezierCurveTo(204, 330, 190, 250, 176, 168); shroud.bezierCurveTo(186, 150, 216, 144, 248, 150); shroud.lineTo(240, 118); shroud.bezierCurveTo(216, 112, 186, 104, 170, 92); shroud.bezierCurveTo(172, 52, 160, 14, 128, 14); shroud.closePath();
  const gr = g.createLinearGradient(0, 0, 0, 448); gr.addColorStop(0, 'rgba(206,214,208,0.95)'); gr.addColorStop(0.55, 'rgba(176,186,182,0.7)'); gr.addColorStop(1, 'rgba(150,164,160,0)'); g.fillStyle = gr; g.fill(shroud);
  g.save(); g.clip(shroud);                                      // folds and creases in the cloth
  for (let k = 0; k < 34; k++) { const x = 20 + r() * 216, w = 3 + r() * 9; g.strokeStyle = r() < 0.55 ? 'rgba(20,28,30,0.28)' : 'rgba(255,255,255,0.2)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, 90 + r() * 60); g.bezierCurveTo(x + (r() - 0.5) * 50, 200, x + (r() - 0.5) * 70, 320, x + (r() - 0.5) * 60, 450); g.stroke(); }
  for (let k = 0; k < 12; k++) { g.strokeStyle = 'rgba(20,28,30,0.22)'; g.lineWidth = 4 + r() * 6; g.beginPath(); const y = 110 + r() * 40, s = r() < 0.5 ? 1 : -1; g.moveTo(128 + s * 40, y); g.quadraticCurveTo(128 + s * 100, y + 14 + r() * 20, 128 + s * (116 + r() * 10), y + 36); g.stroke(); }   // sleeves
  g.restore();
  const hood = g.createRadialGradient(128, 62, 4, 128, 62, 40); hood.addColorStop(0, '#000'); hood.addColorStop(0.7, 'rgba(2,4,6,0.96)'); hood.addColorStop(1, 'rgba(2,4,6,0)');   // the hood's black void
  g.fillStyle = hood; g.beginPath(); g.ellipse(128, 64, 28, 42, 0, 0, 6.3); g.fill();
  g.shadowColor = '#b6ffd0'; g.shadowBlur = 12; g.fillStyle = '#e6fff0'; for (const ex of [117, 139]) { g.beginPath(); g.ellipse(ex, 56, 3, 6, ex < 128 ? -0.25 : 0.25, 0, 6.3); g.fill(); } g.shadowBlur = 0;      // two cold eyes
  g.fillStyle = 'rgba(0,0,0,0.9)'; g.beginPath(); g.ellipse(128, 86, 4, 9, 0, 0, 6.3); g.fill();
  const hand = (x, y, s) => { g.save(); g.translate(x, y); g.scale(s, 1); g.strokeStyle = '#d4d8cc'; g.lineWidth = 3.2;                  // a skeletal hand with long thin fingers
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-4, -16); g.stroke(); const F = [[-14, -30], [-6, -42], [5, -44], [14, -34]];
    F.forEach(([fx, fy], i) => { g.lineWidth = 2.4; g.beginPath(); g.moveTo(-4 + i * 3, -16); g.lineTo(fx * 0.7, fy * 0.65); g.lineTo(fx + (i - 1.5) * 2, fy - 14); g.stroke(); g.fillStyle = '#eef0e4'; g.beginPath(); g.arc(fx * 0.7, fy * 0.65, 1.8, 0, 6.3); g.fill(); });
    g.lineWidth = 2.4; g.beginPath(); g.moveTo(-3, -6); g.lineTo(-18, -14); g.lineTo(-26, -26); g.stroke(); g.restore(); };
  hand(18, 120, 1); hand(238, 120, -1);
});
const webTex = () => canvasTex(128, 128, (g) => {
  g.strokeStyle = 'rgba(240,240,255,0.8)'; g.lineWidth = 1.6; g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; g.moveTo(0, 0); g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); }
  for (let r = 22; r < 130; r += 20) { g.moveTo(r, 0); for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2, a0 = ((i - 0.5) / 6) * Math.PI / 2, rr = r * 0.82; g.quadraticCurveTo(Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a) * r, Math.sin(a) * r); } }
  g.stroke();
});
function makeHalloween(ctx) {
  const root = new THREE.Group(); ctx.scene.add(root);
  const tex = faceTex(), faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }), skin = lam('#e8741a'), stemM = lam('#4a5a2a');
  const pumpGeo = new THREE.SphereGeometry(1, 12, 9), stemGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.34, 6), faceGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const glowPts = [];
  function pumpkin(s, face = true) {
    const g = new THREE.Group(), b = new THREE.Mesh(pumpGeo, skin); b.scale.set(1, 0.8, 1); b.castShadow = true; g.add(b);
    const st = new THREE.Mesh(stemGeo, stemM); st.position.y = 0.8; st.rotation.z = 0.25; g.add(st);
    if (face) { const f = new THREE.Mesh(faceGeo, faceMat); f.position.set(0, 0.04, 0.97); g.add(f); }
    g.scale.setScalar(s); return g;
  }
  // pumpkins by the houses, facing the front
  const houses = ctx.world.houseList(), put = [];
  houses.forEach((h, i) => {
    const n = 1 + (i % 2) + (ctx.low ? 0 : 1);
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.18 + 0.64 * ((k + 0.5 + (i % 3) * 0.2) / n)), d = (h.r || 3) + 0.9 + k * 0.5, x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      if (Math.abs(x - pathX(z)) < 1.4 || Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) continue;
      const s = 0.38 + ((i * 7 + k * 3) % 5) * 0.06, p = pumpkin(s); p.position.set(x, heightAt(x, z) + 0.8 * s * 0.8, z); p.rotation.y = Math.PI / 2 - a + (k - 0.5) * 0.3; root.add(p); put.push(p);
      glowPts.push([x, heightAt(x, z) + 0.8 * s * 0.8, z + s * 1.2]);
    }
  });
  const glow = bulbs(glowPts, [HAL[0]], 0.9); root.add(glow);
  // the haunted house
  const spot = ctx.freeSpot(12) || ctx.freeSpot(9); let hh = null, mansion = null, wins = [];
  if (spot) {
    mansion = makeMansion(ctx); hh = mansion.group; wins = mansion.wins; hh.position.set(spot.x, spot.y, spot.z); hh.scale.setScalar(1.45); hh.rotation.y = 0.1; root.add(hh);
    for (const [x, z] of [[-0.8, 2.95], [0.85, 2.8]]) { const p = pumpkin(0.42); p.position.set(x, 1.05, z); hh.add(p); }
    ctx.hallSpot = () => ({ x: spot.x, y: spot.y, z: spot.z });
  }
  // a big orange glow round the moon
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, 'rgba(255,150,40,0.95)'); r.addColorStop(0.35, 'rgba(255,120,30,0.45)'); r.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }), transparent: true, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.scale.setScalar(70); halo.renderOrder = -9; ctx.skyScene.add(halo);
  // the billboards
  const bset = makeBoardSets(ctx, (b) => {
    const F = b.frame, g = new THREE.Group(), { lw, lh, x, top, bot, T, cwY, cwW } = F, pts = [], zf = 0.62;
    const x0 = x - lw / 2 - T - 0.12, x1 = x + lw / 2 + T + 0.12, y0 = bot - T - 0.12, y1 = top + T + 0.12, step = ctx.low ? 1.1 : 0.75;
    for (let xx = x0; xx <= x1; xx += step) pts.push([xx, y1, zf], [xx, y0, zf]); for (let yy = y0 + step; yy < y1; yy += step) pts.push([x0, yy, zf], [x1, yy, zf]);
    g.add(bulbs(pts, HAL, 0.55));
    const fy = cwY + 0.07; [[-0.36, 0.34], [-0.05, 0.46], [0.3, 0.38]].forEach(([fx, s], i) => { const p = pumpkin(s); p.position.set(x + cwW * fx, fy + s * 0.64, 0.75); p.rotation.y = (i - 1) * 0.15; g.add(p); });
    for (const sx of [-1, 1]) { const p = pumpkin(0.5); p.position.set(sx * 6.9, 0.45, 1.0); p.rotation.y = -sx * 0.4; g.add(p); }
    const wm = new THREE.MeshBasicMaterial({ map: webTex(), transparent: true, depthWrite: false, opacity: 0.8 });
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), wm); w.scale.x = -sx; w.position.set(x + sx * (lw / 2 + T) - sx * 1.3, top + T - 1.3, 0.64); w.rotation.z = 0; if (sx === -1) { w.position.x = x - lw / 2 - T + 1.3; } g.add(w); }
    const bm = new THREE.MeshBasicMaterial({ map: batTex(), transparent: true, side: THREE.DoubleSide }), bat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), bm); bat.position.set(x + lw * 0.22, top + T + 0.5, 0.2); g.add(bat);
    for (const ex of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.04, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' })); e.position.set(x + lw * 0.22 + ex, top + T + 0.46, 0.22); g.add(e); }
    const bone = lam('#e6e0cc'), hand = new THREE.Group(); hand.position.set(x + lw / 2 + T - 0.2, top + T + 0.1, 0.7);          // a skeleton hand over the top corner
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.18), bone); hand.add(palm);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), bone); f.position.set(-0.2 + i * 0.133, -0.45, 0.04); f.rotation.x = -0.15; hand.add(f); }
    const th = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), bone); th.position.set(0.34, -0.1, 0.04); th.rotation.z = -0.9; hand.add(th); g.add(hand);
    return g;
  });
  return {
    update(dt, s) {
      const n = s.night, flick = 0.8 + 0.2 * Math.sin(performance.now() * 0.013) * Math.sin(performance.now() * 0.0071 + 1);
      faceMat.color.setScalar((0.35 + 0.65 * n) * flick);
      for (const w of wins) { const t = performance.now() * 0.001 + w.ph, f = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3.1) * Math.sin(t * 1.3 + 2)) + (Math.sin(t * 17) > 0.96 ? 0.4 : 0); w.m.color.setScalar(w.k ? (0.15 + 0.85 * n) * f * w.k : 1); }
      const moon = ctx.sky?.bodies.moon;
      if (moon) { halo.position.copy(moon.position); halo.position.z -= 1; halo.material.opacity = 0.7 * (moon.material.opacity ?? 1) * n * s.peak; }
      bset.sync(s.hide);
    },
    spot: hh ? { x: spot.x, y: spot.y, z: spot.z } : null,
    dispose() { bset.dispose(); ctx.skyScene.remove(halo); halo.material.map.dispose(); halo.material.dispose(); if (mansion) mansion.dispose(); disposeTree(root); ctx.scene.remove(root); glow.geometry.dispose(); },
    root,
  };
}
// bats cross the moon, a ghost drifts round the haunted house, and now and then something creepy is heard
function makeHauntings(ctx) {
  const bm = new THREE.SpriteMaterial({ map: batTex(), transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 }), bats = [];
  for (let i = 0; i < (ctx.low ? 0 : 5); i++) { const s = new THREE.Sprite(bm.clone()); s.renderOrder = -6; s.visible = false; ctx.skyScene.add(s); bats.push({ s, d: 0 }); }
  const gm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uMap: { value: ghostTex() }, uT: { value: 0 }, uOp: { value: 0 }, uLean: { value: 0 }, uSize: { value: new THREE.Vector2(2.5, 4.4) } },
    vertexShader: `uniform float uT, uLean; uniform vec2 uSize; varying vec2 vUv; varying float vH;
      void main() { vec2 p = position.xy; float h = 0.5 - p.y; vH = h; float w = h * h;
        // the cloth drifts as if under water: slow, wide, lagging waves that grow towards the hem, a long swell through the whole body, and sleeves that billow up and down
        float dx = (sin(uT * 0.8 + p.y * 3.2) * 0.1 + sin(uT * 0.5 - p.y * 6.0 + 1.7) * 0.06 + sin(uT * 1.3 + p.y * 9.0) * 0.025) * w + uLean * w * 1.4 + sin(uT * 0.45) * 0.03 * h;
        float up = sin(uT * 0.9 + p.x * 5.0) * 0.03 * smoothstep(0.15, 0.5, abs(p.x)) * smoothstep(0.55, 0.3, h) + sin(uT * 0.7 + p.x * 8.0) * 0.015 * h;
        p.x += dx + p.x * sin(uT * 0.6 + h * 4.0) * 0.07 * h; p.y += up - 0.02 * sin(uT * 0.8) * h; vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += p * uSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uT, uOp; varying vec2 vUv; varying float vH;
      void main() { vec2 uv = vUv; uv.x += sin(uT * 0.7 + uv.y * 9.0) * 0.012 * vH; vec4 t = texture2D(uMap, uv); float l = dot(t.rgb, vec3(0.33));
        vec3 c = mix(t.rgb, vec3(0.45, 1.0, 0.66) * (0.35 + l), 0.55); c += vec3(0.05, 0.4, 0.18) * (1.0 - vH) * 0.5;       // a cold green cast, and the head glowing from within
        float a = t.a * uOp * (0.8 + 0.2 * sin(uT * 2.1 + vH * 5.0)); gl_FragColor = vec4(c, a); }`,
  }), ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 14, 26), gm); ghost.frustumCulled = false; ghost.renderOrder = 4; ghost.visible = false; ctx.scene.add(ghost);
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (g) => { const q = g.createRadialGradient(64, 64, 4, 64, 64, 64); q.addColorStop(0, 'rgba(120,255,170,0.85)'); q.addColorStop(0.4, 'rgba(60,220,120,0.3)'); q.addColorStop(1, 'rgba(40,200,100,0)'); g.fillStyle = q; g.fillRect(0, 0, 128, 128); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false })); gl.scale.set(7, 7, 1); gl.visible = false; ctx.scene.add(gl);   // the eerie green light it gives off
  let gop = 0.4, gtar = 0.4, gnext = 0, lwait = 18 + Math.random() * 25; const flashes = [];
  let flight = -1, fdir = 1, fy = 0, gt = -1, gcx = 0, gcz = -20, gcy = 0, waitB = 14 + Math.random() * 20, waitG = 20 + Math.random() * 25, waitS = 10 + Math.random() * 15, clock = 0;
  const KINDS = ['wind', 'owl', 'creak', 'whisper', 'owl', 'wind'];
  return {
    go(name) {
      if (name === 'sound') ctx.audio?.creepy?.(KINDS[(Math.random() * KINDS.length) | 0], (Math.random() * 2 - 1) * 0.8);
      if (name === 'lightning') { ctx.onLightning?.(0.5 + Math.random() * 0.4); if (Math.random() < 0.6) flashes.push(0.12 + Math.random() * 0.12); }
      if (name === 'bats' && flight < 0) { flight = 0; fdir = Math.random() < 0.5 ? 1 : -1; fy = (Math.random() - 0.5) * 8; bats.forEach((b, i) => { b.d = i * 0.35 + Math.random() * 0.2; b.s.visible = true; }); }
      if (name === 'ghost' && gt < 0) { gt = 0; const sp = ctx.hallSpot?.(); gcx = sp ? sp.x : (Math.random() - 0.5) * 20; gcz = sp ? sp.z + 1 : -20; gcy = sp ? sp.y : heightAt(gcx, gcz); gl.visible = true; ctx.audio?.creepy?.('moan', (Math.random() * 2 - 1) * 0.6); ghost.visible = true; }
    },
    update(dt, s) {
      clock += dt; for (let i = flashes.length - 1; i >= 0; i--) { flashes[i] -= dt; if (flashes[i] <= 0) { flashes.splice(i, 1); ctx.onLightning?.(0.3, true); } }          // (a second flicker of the same flash)
      if (s.night > 0.5 && !s.hide) {
        waitB -= dt; waitG -= dt; waitS -= dt;
        if (waitB <= 0) { waitB = 25 + Math.random() * 40; if (!ctx.reduceMotion) this.go('bats'); }
        if (waitG <= 0) { waitG = 30 + Math.random() * 40; if (!ctx.reduceMotion) this.go('ghost'); }
        if (waitS <= 0) { waitS = 20 + Math.random() * 20; this.go('sound'); }
        lwait -= dt * (0.6 + 0.8 * s.peak); if (lwait <= 0) { lwait = 22 + Math.random() * 45; this.go('lightning'); }
      }
      const moon = ctx.sky?.bodies.moon;
      if (flight >= 0) {
        flight += dt; const dur = 9, u = flight / dur, mp = moon ? moon.position : { x: 0, y: 40, z: -125 };
        for (const b of bats) {
          const k = u - b.d / dur * 0.4, sc = 7 + Math.sin(b.d * 9) * 1.5; b.s.visible = k > 0 && k < 1;
          b.s.position.set(mp.x + (k - 0.5) * 230 * fdir, mp.y + fy + Math.sin(k * 11 + b.d * 7) * 3.5 + b.d * 3, mp.z + 0.5); b.s.scale.set(sc * (1 + 0.4 * Math.sin(clock * 22 + b.d * 20)), sc * 0.5 * (1 - 0.45 * Math.sin(clock * 22 + b.d * 20)), 1);
          b.s.material.opacity = Math.min(1, Math.max(0, Math.min(k * 8, (1 - k) * 8))) * 0.95;
        }
        if (u > 1.3) { flight = -1; bats.forEach((b) => { b.s.visible = false; }); }
      }
      if (gt >= 0) {
        gt += dt; const dur = 14, u = gt / dur; if (u >= 1) { gt = -1; ghost.visible = false; gl.visible = false; return; }
        const a = clock * 0.3, r = 4.8 + Math.sin(clock * 0.5) * 1.4, prev = ghost.position.x;
        ghost.position.set(gcx + Math.cos(a) * r, gcy + 2.7 + Math.sin(clock * 0.9) * 0.5 + Math.sin(clock * 0.37) * 0.5, gcz + Math.sin(a) * r * 0.7);   // (it floats: a slow drift and a long, uneven bob)
        gm.uniforms.uLean.value += ((ghost.position.x - prev) * -2.2 - gm.uniforms.uLean.value) * Math.min(1, dt * 2);
        gnext -= dt; if (gnext <= 0) { gnext = 0.5 + Math.random() * 2.2; gtar = Math.random() < 0.25 ? 0.05 + Math.random() * 0.1 : 0.25 + Math.random() * 0.6; }       // it fades to almost nothing and back, at random
        gop += (gtar - gop) * Math.min(1, dt * 1.6); const life = Math.min(1, Math.min(u * 6, (1 - u) * 6));
        gm.uniforms.uT.value = clock; gm.uniforms.uOp.value = life * gop * s.night; ghost.scale.set(1, 1, 1);
        gl.position.copy(ghost.position); gl.position.y += 1.0; gl.material.opacity = life * (0.15 + 0.7 * gop) * s.night * (0.85 + 0.15 * Math.sin(clock * 6.1));
      }
    },
    dispose() { for (const b of bats) { ctx.skyScene.remove(b.s); b.s.material.dispose(); } ctx.scene.remove(ghost); ctx.scene.remove(gl); ghost.geometry.dispose(); gm.uniforms.uMap.value.dispose(); gm.dispose(); gl.material.map.dispose(); gl.material.dispose(); bm.map.dispose(); bm.dispose(); },
  };
}

// ---------------------------------------------------------------- autumn: leaves in the wind, piles of leaves, and the land turning (see world.setAutumn)
const LEAF_COLS = ['#c9531a', '#e0942a', '#a8321c', '#d8b030', '#8a5a22', '#b86a20', '#e8742a'].map((c) => new THREE.Color(c));
function makeAutumn(ctx) {
  const root = new THREE.Group(); ctx.scene.add(root);
  const N = ctx.low ? 90 : 240, seeds = new Float32Array(N * 4), cols = new Float32Array(N * 3), r = rng(77);
  for (let i = 0; i < N; i++) { seeds.set([r(), r(), r(), r()], i * 4); const c = LEAF_COLS[Math.floor(r() * LEAF_COLS.length)]; cols.set([c.r, c.g, c.b], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute('aS', new THREE.BufferAttribute(seeds, 4)); geo.setAttribute('aC', new THREE.BufferAttribute(cols, 3));
  const lm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uShift: { value: new THREE.Vector2() }, uAmt: { value: 1 }, uLight: { value: 1 }, uPx: BU.uPx },
    vertexShader: `uniform vec3 uCam; uniform float uT, uAmt, uPx; uniform vec2 uShift; attribute vec4 aS; attribute vec3 aC; varying vec3 vC; varying float vA, vRot, vTum;
      void main() { float k = aS.w; vec2 box = vec2(64.0);
        vec2 xz = mod(aS.xz * box + uShift * (0.7 + 0.6 * k) - uCam.xz + box * 0.5, box) - box * 0.5;
        float H = 14.0, y = 0.3 + mod(aS.y * H - uT * (0.5 + 0.45 * k), H), ph = k * 60.0;
        xz += vec2(sin(uT * (1.3 + k) + ph), cos(uT * (1.1 + k) + ph * 1.3)) * 0.9; y += sin(uT * (2.0 + k) + ph) * 0.3;
        vec3 w = vec3(uCam.x + xz.x, y, uCam.z + xz.y); vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv;
        vA = (1.0 - smoothstep(0.5, 1.0, length(xz) / 32.0)) * smoothstep(0.0, 1.5, y) * (1.0 - smoothstep(H - 3.0, H, y)) * step(k, uAmt);
        vC = aC; vRot = ph + uT * (0.8 + k * 2.2); vTum = 0.3 + 0.7 * abs(cos(uT * (0.9 + k * 1.4) + ph));
        gl_PointSize = clamp(0.55 * uPx / max(1.0, -mv.z), 3.0, 34.0); }`,
    fragmentShader: `uniform float uLight; varying vec3 vC; varying float vA, vRot, vTum;
      void main() { vec2 c = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); vec2 q = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) * 2.0; q.x /= vTum;
        float w = 0.5 * (1.0 - q.y * q.y), body = smoothstep(w, w - 0.14, abs(q.x)) * step(abs(q.y), 1.0), rib = smoothstep(0.07, 0.0, abs(q.x)) * 0.35;
        gl_FragColor = vec4(vC * (1.0 - rib) * uLight, body * vA); }`,
  });
  const leaves = new THREE.Points(geo, lm); leaves.frustumCulled = false; leaves.renderOrder = 5; root.add(leaves);
  // piles of leaves: low lumpy mounds of orange, red and gold, mostly round the trees that shed (and a few blown into the open), with loose leaves lying about them
  const mound = new THREE.IcosahedronGeometry(1, 1), pp = mound.attributes.position, jr = rng(9);
  for (let i = 0; i < pp.count; i++) { const f = 0.78 + jr() * 0.44; pp.setXYZ(i, pp.getX(i) * f, pp.getY(i) * (0.8 + jr() * 0.4), pp.getZ(i) * f); } mound.computeVertexNormals();
  const houses = ctx.world.houseList(), spots = [], pr = rng(31);
  const ok = (x, z) => Math.abs(x - pathX(z)) > 1.6 && Math.hypot(x - POND.x, z - POND.z) > POND.r + 2 && !houses.some((h) => Math.hypot(x - h.x, z - h.z) < (h.r || 3) + 0.8) && Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z)) < 0.9;
  for (const t of ctx.world.treeList()) {
    if (t.t !== 'round') continue; let cx = 0, cz = 0, rr = 0; for (const L of t.lobes) { cx += L.x; cz += L.z; rr = Math.max(rr, L.r); } cx /= t.lobes.length; cz /= t.lobes.length;
    for (let k = 0; k < (ctx.low ? 1 : 2); k++) { const a = pr() * 6.28, d = rr * (0.7 + pr() * 0.9), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (ok(x, z)) spots.push([x, z, 0.6 + pr() * 0.7]); }
  }
  for (let i = 0; i < (ctx.low ? 6 : 14); i++) { const x = (pr() - 0.5) * 70, z = -6 - pr() * 42; if (ok(x, z)) spots.push([x, z, 0.5 + pr() * 0.5]); }
  const MAXP = spots.length * 3, piles = new THREE.InstancedMesh(mound, new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, MAXP)), LOOSE = spots.length * 8;
  const flat = new THREE.CircleGeometry(0.16, 5), loose = new THREE.InstancedMesh(flat, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), Math.max(1, LOOSE));
  const plan = [], lplan = [];
  for (const [x, z, s] of spots) {
    for (let k = 0; k < 3; k++) { const a = pr() * 6.28, d = k ? s * (0.5 + pr() * 0.5) : 0; plan.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, s: s * (k ? 0.55 + pr() * 0.3 : 1), c: LEAF_COLS[Math.floor(pr() * LEAF_COLS.length)], ry: pr() * 6.28 }); }
    for (let k = 0; k < 8; k++) { const a = pr() * 6.28, d = s * (1.1 + pr() * 1.5); lplan.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, c: LEAF_COLS[Math.floor(pr() * LEAF_COLS.length)], ry: pr() * 6.28, s: 0.8 + pr() * 0.6 }); }
  }
  const dm = new THREE.Object3D(), col = new THREE.Color(); let built = -1;
  function layout(k) {
    plan.forEach((p, i) => { const y = heightAt(p.x, p.z); dm.position.set(p.x, y + 0.02, p.z); dm.rotation.set(0, p.ry, 0); dm.scale.set(p.s * 1.25 * k, p.s * 0.32 * k, p.s * 1.25 * k); dm.updateMatrix(); piles.setMatrixAt(i, dm.matrix); piles.setColorAt(i, col.copy(p.c).multiplyScalar(0.8)); });
    lplan.forEach((p, i) => { const y = heightAt(p.x, p.z); dm.position.set(p.x, y + 0.03, p.z); dm.rotation.set(-Math.PI / 2 + (Math.sin(i) * 0.15), 0, p.ry); dm.scale.setScalar(p.s * k); dm.updateMatrix(); loose.setMatrixAt(i, dm.matrix); loose.setColorAt(i, p.c); });
    piles.count = plan.length; loose.count = lplan.length; piles.instanceMatrix.needsUpdate = loose.instanceMatrix.needsUpdate = true; if (piles.instanceColor) piles.instanceColor.needsUpdate = loose.instanceColor.needsUpdate = true;
  }
  piles.receiveShadow = true; piles.castShadow = false; root.add(piles, loose);
  let kSm = 0, shift = new THREE.Vector2(), clock = 0;
  return {
    update(dt, s) {
      const h = s.active.find((a) => a.id === 'harvest'), k = h ? h.k : 0; kSm += (k - kSm) * (1 - Math.exp(-dt * 1.5)); clock += dt;
      ctx.world.setAutumn(kSm * (s.hide ? 0 : 1));                                                    // (the land turns as the season comes in)
      const kb = Math.round(kSm * 20) / 20; if (kb !== built) { built = kb; layout(Math.max(0.001, kb)); }
      const wnd = s.weather ? s.weather.wind : 0.12, gust = 0.5 + 0.5 * Math.sin(clock * 0.37) * Math.sin(clock * 0.91 + 1.0), sp = 1.0 + 9 * wnd + 5 * gust * gust;                  // (blown along by the wind, in gusts)
      shift.x += sp * dt; shift.y += sp * 0.28 * dt * Math.sin(clock * 0.2 + 0.5);
      const U = lm.uniforms, wet = s.weather ? Math.max(s.weather.rain, s.weather.snow) : 0;
      U.uT.value = clock; U.uShift.value.copy(shift); if (ctx.camera) U.uCam.value.copy(ctx.camera.position); U.uAmt.value = Math.max(0, kSm * (1 - 0.9 * wet) * (ctx.reduceMotion ? 0.3 : 1)); U.uLight.value = 0.4 + 0.6 * (1 - s.night);
    },
    dispose() { ctx.world.setAutumn(0); ctx.scene.remove(root); geo.dispose(); lm.dispose(); mound.dispose(); flat.dispose(); piles.material.dispose(); loose.material.dispose(); piles.dispose(); loose.dispose(); },
    root,
  };
}

// ---------------------------------------------------------------- the manager
const BUILDERS = { christmas: [makeChristmas, makeSanta], halloween: [makeHalloween, makeHauntings], harvest: [makeAutumn], newyear: [makeFireworks], july4: [makeFireworks] };
export function createSeasonFx({ scene, skyScene, world, audio, sky, camera, onLightning, low = false, reduceMotion = false }) {
  const live = new Map();           // season id -> [modules]
  const ctx = { scene, skyScene, world, audio, sky, camera, onLightning, low, reduceMotion };
  const used = [];
  ctx.freeSpot = (clear = 5) => {                      // a flat bit of ground in view that is clear of houses, the path and the pond
    const hs = world.houseList(), cands = [];
    for (let z = -8; z >= -46; z -= 3) for (let x = -34; x <= 34; x += 3) {
      const y = heightAt(x, z); if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3 || Math.abs(x - pathX(z)) < 3.2) continue;
      if (hs.some((h) => Math.hypot(x - h.x, z - h.z) < h.r + clear * 0.5) || used.some((u) => Math.hypot(x - u.x, z - u.z) < 8)) continue;
      const sl = (Math.abs(heightAt(x + 1.5, z) - y) + Math.abs(heightAt(x, z + 1.5) - y)) / 1.5; if (sl > 0.25) continue;
      cands.push({ x, y, z, d: Math.hypot(x * 0.8, z + 16) });
    }
    cands.sort((a, b) => a.d - b.d); const c = cands[0]; if (c) used.push(c); return c || null;
  };
  let fade = 1;
  return {
    /** Bring the modules of the seasons that are on up (and drop those that have ended); `s` is { active, night, hide, fade, peak }. */
    update(dt, s) {
      const ids = new Set(s.active.filter((a) => a.k > 0.02).map((a) => a.id)), hide = s.hide || s.fade < 0.02;
      for (const id of ids) {
        if (live.has(id) || hide || !BUILDERS[id]) continue;
        const mods = []; live.set(id, mods);                                  // (registered first, so a module that fails is not built again every frame)
        for (const mk of BUILDERS[id]) { try { mods.push(mk(ctx)); } catch (e) { console.warn('seasonal touch failed', id, e); } }
      }
      for (const id of [...live.keys()]) if (!ids.has(id)) { for (const m of live.get(id)) m.dispose?.(); live.delete(id); used.length = 0; }
      BU.uTime.value += dt; if (s.px) BU.uPx.value = s.px; BU.uA.value = Math.min(1, 0.35 + 0.65 * s.night) * s.fade * (hide ? 0 : 1);
      const peak = Math.max(0, ...s.active.map((a) => a.peak));
      for (const id of live.keys()) for (const m of live.get(id)) { if (m.root) m.root.visible = !hide; m.update?.(dt, { ...s, peak, hide }); }
      fade = s.fade;
    },
    setPx(px) { BU.uPx.value = px; },
    trigger(name) { for (const mods of live.values()) for (const m of mods) m.go?.(name); },
    get live() { return [...live.keys()]; },
  };
}
