// The seasonal and holiday touches of the landscape (see seasons.js for which are on). Each season is a small module with build / update / dispose, built the first time the season is on and taken away when it has ended, so a
// quiet part of the year costs nothing. All the little lights are one kind of thing: glowing points (a single shader, a twinkle and a colour each), put as children of the house or the sign they decorate so they follow it.
import * as THREE from 'three';
import { heightAt, POND, pathX } from './world.js?v=20261031102519';

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
    b.busy = true; b.phase = delay > 0 ? -1 : 0; b.delay = delay; b.t = 0; b.x1 = (rnd() * 2 - 1) * 62; b.x0 = b.x1 + (rnd() - 0.5) * 18; b.y1 = 34 + rnd() * 36; b.power = big ? 1.25 : 0.8 + rnd() * 0.5; b.pan = b.x1 / 70;
    const p = FW_COLS[(rnd() * FW_COLS.length) | 0]; b.mat.uniforms.uC1.value.copy(p[0]); b.mat.uniforms.uC2.value.copy(p[1]); b.mat.uniforms.uSpd.value = 26 * b.power; b.mat.uniforms.uSize.value = ctx.low ? 1.5 : 1.2; b.mat.uniforms.uLife.value = 2.0 + rnd() * 0.8; return true;
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
          if (u >= 1) { b.phase = 1; b.t = 0; b.rocket.visible = false; b.pts.visible = true; b.mat.uniforms.uO.value.set(b.x1, b.y1, -105); glow = Math.max(glow, 0.9 * b.power); glowCol.copy(b.mat.uniforms.uC1.value); ctx.audio?.firework?.('boom', 0.35 + Math.random() * 0.5, b.power, b.pan); }
        } else {
          b.mat.uniforms.uT.value = b.t; if (b.t > b.mat.uniforms.uLife.value + 0.2) { b.busy = false; b.pts.visible = false; }
        }
      }
      glow = Math.max(0, glow - dt * 1.8); ctx.world.setAurora(glow > 0.01 && !s.hide && !ctx.auroraBusy?.() ? glowCol : null, glow * 0.22);
    },
    dispose() { for (const b of bursts) { ctx.skyScene.remove(b.pts); ctx.skyScene.remove(b.rocket); b.mat.dispose(); b.rg.dispose(); b.rocket.material.dispose(); } geo.dispose(); ctx.world.setAurora(null, 0); },
  };
}

// ---------------------------------------------------------------- the manager
const BUILDERS = { christmas: [makeChristmas, makeSanta], newyear: [makeFireworks], july4: [makeFireworks] };
export function createSeasonFx({ scene, skyScene, world, audio, low = false, reduceMotion = false }) {
  const live = new Map();           // season id -> [modules]
  const ctx = { scene, skyScene, world, audio, low, reduceMotion };
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
