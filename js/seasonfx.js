// The seasonal and holiday touches of the landscape (see seasons.js for which are on). Each season is a small module with build / update / dispose, built the first time the season is on and taken away when it has ended, so a
// quiet part of the year costs nothing. All the little lights are one kind of thing: glowing points (a single shader, a twinkle and a colour each), put as children of the house or the sign they decorate so they follow it.
import * as THREE from 'three';
import { heightAt, POND, pathX } from './world.js?v=20261031101817';

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
  // lights along the eaves of every house: a swag across the front and a run down each side
  for (const h of ctx.world.houseList()) {
    if (!h.group || h.w < 2) continue;
    const s = h.group.scale.x || 1, lw = h.w / s, ld = h.d / s, y = (h.eaveY || 3) - 0.02, zf = ld / 2 + 0.12, pts = [];
    const nSw = Math.max(2, Math.round(lw / 1.8));
    for (let k = 0; k < nSw; k++) { const x0 = -lw / 2 - 0.1 + ((lw + 0.2) * k) / nSw, x1 = -lw / 2 - 0.1 + ((lw + 0.2) * (k + 1)) / nSw; pts.push(...swag(x0, x1, y, zf, 0.2, Math.max(2, Math.round((x1 - x0) / 0.42))).slice(k ? 1 : 0)); }
    for (const sx of [-1, 1]) for (let z = zf - 0.45; z > -ld / 2; z -= 0.45) pts.push([sx * (lw / 2 + 0.12), y, z]);
    const o = bulbs(ctx.low ? pts.filter((_, i) => i % 2 === 0) : pts, XMAS, 0.3); h.group.add(o); houseStrings.push([h.group, o]);
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
    go() { if (t >= 0) return; t = 0; dir = Math.random() < 0.5 ? 1 : -1; y0 = 30 + Math.random() * 14; dur = 10 + Math.random() * 3; mesh.scale.x = 46 * dir; mesh.visible = true; ctx.audio?.sleigh?.(dir); },
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

// ---------------------------------------------------------------- the manager
const BUILDERS = { christmas: [makeChristmas, makeSanta] };
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
