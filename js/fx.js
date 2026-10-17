// Feedback ("juice") for the dirt-bike game: speed lines and a speed vignette, sparks, expanding rings, a halo behind the bike, screen flashes,
// hit-stop / slow motion, camera shake and bump. Everything is pooled (no per-frame allocation) and purely cosmetic.
// `?fx=0` in the URL turns it all off.
import * as THREE from 'three';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createFx(scene, camera, renderer, { low = false } = {}) {
  const off = /[?&]fx=0\b/.test(location.search);
  const noop = () => {};
  if (off) {
    return { off: true, set visible(v) {}, setIntensity: noop, tick: noop, burst: noop, ring: noop, halo: noop, setAnchor: noop, flash: noop, hitStop: noop, slowmo: noop, shake: noop, bump: noop,
      trail: noop, flick: noop, reset: noop, timeScale: 1, shakeX: 0, shakeY: 0, bumpY: 0, fovAdd: 0 };
  }
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const vignette = document.getElementById('gh-vignette'), flashEl = document.getElementById('gh-flash');

  // ---------- speed lines: thin streaks in the top and bottom bands of the view, attached to the camera ----------
  if (!camera.parent) scene.add(camera);
  const LINES = low ? 22 : 44;
  const lineGroup = new THREE.Group(); lineGroup.visible = false; camera.add(lineGroup);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf6f3e6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false });
  const lines = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), lineMat, LINES);
  lines.frustumCulled = false; lines.renderOrder = 8; lineGroup.add(lines);
  const L = Array.from({ length: LINES }, (_, i) => ({ x: (Math.random() * 2 - 1) * 1.2, y: (Math.random() < 0.5 ? -1 : 1) * (0.24 + Math.random() * 0.3), d: 8 + Math.random() * 24, len: 0.7 + Math.random() * 1.6, sp: 0.7 + Math.random() * 0.6 }));
  const dummy = new THREE.Object3D();
  let speedK = 0, boostK = 0, chargeK = 0, flick = 0;

  // ---------- sparks: additive points ----------
  const NS = low ? 90 : 170;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(NS * 3), sCol = new Float32Array(NS * 3), sSize = new Float32Array(NS), sAlpha = new Float32Array(NS);
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1)); sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlpha, 1));
  const sMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main() { vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() { vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float star = max(0.0, 1.0 - d) + 0.5 * max(0.0, 1.0 - 6.0 * min(abs(p.x), abs(p.y))) * (1.0 - d);
        float a = clamp(star, 0.0, 1.0) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * (0.6 + a), a); }`,
  });
  const sPts = new THREE.Points(sGeo, sMat); sPts.frustumCulled = false; sPts.renderOrder = 7; root.add(sPts);
  const S = Array.from({ length: NS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, g: 0, size: 0.3, r: 1, gc: 1, b: 1, drag: 1 }));
  let sHead = 0; const tmpC = new THREE.Color();

  // ---------- rings ----------
  const ringGeo = new THREE.RingGeometry(0.78, 1, 40);
  const R = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.visible = false; m.renderOrder = 9; root.add(m); return { m, life: 0, max: 1, s0: 1, s1: 2, o: 1 };
  });
  let rHead = 0;

  // ---------- halo ----------
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
  const haloSprite = new THREE.Sprite(haloMat); haloSprite.renderOrder = 6; haloSprite.visible = false; root.add(haloSprite);
  const H = { life: 0, max: 1, scale: 4, o: 0.5 }; const anchor = new THREE.Vector3(), tmpP = new THREE.Vector3(); let bikeY = -0.2;

  // ---------- time, shake, bump, fov ----------
  const T = { hit: 0, slow: 0, slowScale: 1, shakeT: 0, shakeAmp: 0 };
  const fx = {
    off: false, timeScale: 1, shakeX: 0, shakeY: 0, bumpY: 0, fovAdd: 0,
    set visible(v) { root.visible = v; lineGroup.visible = v; if (!v) { lineMat.opacity = 0; if (vignette) vignette.style.opacity = '0'; } },
    /** Speed feel: speed 0..1 (cruising to flat out), boost 0..1 (how much hold-speed is built), charge 0..1. */
    setIntensity(s, b, c) { speedK = s; boostK = b; chargeK = c; },
    /** A burst of `n` sparks around (x, y, z). `kind`: 'perfect' | 'clean' | 'trick' | 'coin' | 'crash' | 'dust' | 'pit'. */
    burst(kind, x, y, z, n = 14, color = '#ffe27a') {
      const spec = {
        perfect: { sp: [3, 9], up: 5, size: 0.5, life: 0.7, g: -9 }, clean: { sp: [2, 5], up: 3, size: 0.4, life: 0.5, g: -9 },
        trick: { sp: [4, 11], up: 2, size: 0.55, life: 0.8, g: -4 }, coin: { sp: [2, 5], up: 2, size: 0.4, life: 0.45, g: -4 },
        crash: { sp: [4, 12], up: 6, size: 0.6, life: 0.9, g: -14 }, dust: { sp: [1.5, 4], up: 2, size: 0.35, life: 0.5, g: -6 }, pit: { sp: [2, 7], up: 7, size: 0.5, life: 1.0, g: -12 },
      }[kind] || { sp: [2, 6], up: 3, size: 0.4, life: 0.6, g: -8 };
      tmpC.set(color);
      for (let i = 0; i < n; i++) {
        const p = S[sHead++ % NS], a = Math.random() * Math.PI * 2, v = spec.sp[0] + Math.random() * (spec.sp[1] - spec.sp[0]);
        Object.assign(p, { life: spec.life * (0.6 + Math.random() * 0.6), max: spec.life, x, y, z: z + (Math.random() - 0.5) * 0.6, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v * 0.7 + spec.up * Math.random(), g: spec.g, size: spec.size * (0.6 + Math.random() * 0.8), r: tmpC.r, gc: tmpC.g, b: tmpC.b, drag: 1.2 });
      }
    },
    /** A single trailing spark (for trick trails). */
    trail(x, y, z, color) {
      tmpC.set(color); const p = S[sHead++ % NS];
      Object.assign(p, { life: 0.5, max: 0.5, x: x + (Math.random() - 0.5) * 0.4, y: y + (Math.random() - 0.5) * 0.4, z, vx: -2 - Math.random() * 3, vy: (Math.random() - 0.5) * 2, g: 0, size: 0.5, r: tmpC.r, gc: tmpC.g, b: tmpC.b, drag: 2 });
    },
    /** An expanding ring. flat = lying on the ground; otherwise it faces the camera. */
    ring(x, y, z, color, s0 = 0.6, s1 = 4, life = 0.55, flat = true, opacity = 0.9) {
      const r = R[rHead++ % R.length]; r.m.material.color.set(color); r.m.position.set(x, y, z); r.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
      Object.assign(r, { life, max: life, s0, s1, o: opacity }); r.m.visible = true;
    },
    /** A soft glow behind the bike. */
    halo(color, scale = 5, life = 0.5, opacity = 0.6) { haloMat.color.set(color); Object.assign(H, { life, max: life, scale, o: opacity }); haloSprite.visible = true; },
    setAnchor(x, y, z) { anchor.set(x, y, z); },
    /** A brief colour wash over the screen. */
    flash(color = '#ffffff', opacity = 0.3, ms = 140) {
      if (!flashEl) return;
      flashEl.style.transition = 'none'; flashEl.style.background = color; flashEl.style.opacity = String(opacity);
      void flashEl.offsetWidth; flashEl.style.transition = `opacity ${ms}ms ease-out`; flashEl.style.opacity = '0';
    },
    hitStop(ms) { T.hit = Math.max(T.hit, ms / 1000); },
    slowmo(scale, ms) { T.slow = Math.max(T.slow, ms / 1000); T.slowScale = scale; },
    shake(amp, ms) { T.shakeAmp = Math.max(T.shakeAmp, amp); T.shakeT = Math.max(T.shakeT, ms / 1000); },
    bump(dy) { fx.bumpY += dy; },
    reset() {
      for (const p of S) p.life = 0; for (const r of R) { r.life = 0; r.m.visible = false; } H.life = 0; haloSprite.visible = false;
      T.hit = T.slow = T.shakeT = T.shakeAmp = 0; fx.timeScale = 1; fx.shakeX = fx.shakeY = fx.bumpY = fx.fovAdd = 0; speedK = boostK = chargeK = 0;
      if (vignette) vignette.style.opacity = '0'; if (flashEl) flashEl.style.opacity = '0'; lineMat.opacity = 0;
    },
    /** Advance with REAL time `dt` (before any time scale). */
    tick(dt) {
      // time scale: hit-stop and slow motion
      T.hit = Math.max(0, T.hit - dt); T.slow = Math.max(0, T.slow - dt);
      fx.timeScale = T.hit > 0 ? 0.12 : T.slow > 0 ? T.slowScale : 1;
      // shake and bump
      T.shakeT = Math.max(0, T.shakeT - dt); const am = T.shakeT > 0 ? T.shakeAmp * Math.min(1, T.shakeT * 6) : 0; if (T.shakeT <= 0) T.shakeAmp = 0;
      fx.shakeX = (Math.random() - 0.5) * am; fx.shakeY = (Math.random() - 0.5) * am;
      fx.bumpY *= Math.exp(-7 * dt);
      // fov push with boost, a little with speed
      const target = 4 * boostK + 3 * speedK * (0.5 + 0.5 * boostK);
      fx.fovAdd += (target - fx.fovAdd) * Math.min(1, dt * 3.5);
      // speed lines
      camera.updateMatrixWorld(); tmpP.copy(anchor).project(camera); if (Number.isFinite(tmpP.y)) bikeY += (Math.max(-0.7, Math.min(0.7, tmpP.y)) - bikeY) * Math.min(1, dt * 6); else bikeY = -0.2;
      const s = clamp01(speedK * 0.75 + boostK * 0.35 + chargeK * 0.15), on = smooth(0.12, 0.35, s);
      flick = Math.max(0, flick - dt * 3);
      lineMat.opacity = (0.05 + 0.17 * s + 0.15 * flick) * on; lineGroup.visible = on > 0.01;
      if (on > 0.01) {
        const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), asp = camera.aspect;
        for (let i = 0; i < LINES; i++) {
          const l = L[i], halfH = tan * l.d, halfW = halfH * asp;
          l.x -= dt * (0.9 + 2.6 * s + flick) * l.sp * (30 / l.d) * 0.9;
          if (l.x < -1.25) { l.x = 1.25 + Math.random() * 0.2; l.y = (Math.random() < 0.5 ? -1 : 1) * (0.24 + Math.random() * 0.3); l.d = 8 + Math.random() * 24; l.len = 0.7 + Math.random() * 1.6; }
          const len = l.len * (0.25 + 1.2 * s + flick * 0.5) * halfW * 0.18;
          dummy.position.set(l.x * halfW, Math.max(-0.97, Math.min(0.97, bikeY + l.y)) * halfH, -l.d); dummy.scale.set(len, 0.0055 * l.d + 0.004, 1); dummy.updateMatrix(); lines.setMatrixAt(i, dummy.matrix);
        }
        lines.instanceMatrix.needsUpdate = true;
      }
      // vignette: wind at the edges
      if (vignette) vignette.style.opacity = String((0.55 * smooth(0.2, 0.9, s)).toFixed(3));
      // sparks
      sMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      for (let i = 0; i < NS; i++) {
        const p = S[i];
        if (p.life > 0) { p.life -= dt; p.vy += p.g * dt; p.vx *= Math.exp(-p.drag * dt); p.x += p.vx * dt; p.y += p.vy * dt; }
        const u = p.life > 0 ? p.life / p.max : 0;
        sPos[i * 3] = p.x; sPos[i * 3 + 1] = p.y; sPos[i * 3 + 2] = p.z; sCol[i * 3] = p.r; sCol[i * 3 + 1] = p.gc; sCol[i * 3 + 2] = p.b;
        sSize[i] = p.size * (0.4 + 0.6 * u); sAlpha[i] = u > 0 ? Math.min(1, u * 2.2) : 0;
      }
      sGeo.attributes.position.needsUpdate = sGeo.attributes.aColor.needsUpdate = sGeo.attributes.aSize.needsUpdate = sGeo.attributes.aAlpha.needsUpdate = true;
      // rings
      for (const r of R) {
        if (!r.m.visible) continue;
        r.life -= dt; const u = 1 - Math.max(0, r.life) / r.max;
        if (r.life <= 0) { r.m.visible = false; continue; }
        const e = 1 - (1 - u) * (1 - u); r.m.scale.setScalar(r.s0 + (r.s1 - r.s0) * e); r.m.material.opacity = r.o * (1 - u) * (1 - u);
      }
      // halo
      if (H.life > 0) {
        H.life -= dt; const u = Math.max(0, H.life) / H.max;
        haloSprite.position.copy(anchor); haloSprite.scale.setScalar(H.scale * (1.4 - 0.4 * u)); haloMat.opacity = H.o * u;
        if (H.life <= 0) haloSprite.visible = false;
      }
    },
    /** A quick flick of extra streaks (jump release, landings). */
    flick(v = 1) { flick = Math.min(1.5, flick + v); },
  };
  return fx;
}
