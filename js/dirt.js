// Dirt kicked up from the wheels: small crisp clods thrown back and up that arc under gravity, bounce once and fade (one Points draw call).
// On the trail they are earthy brown and modest; in mud they are darker, bigger, more of them and thrown further.
import * as THREE from 'three';

const N = 160, GRAV = 22;

/** A 2x2 atlas of irregular dirt chunks (grey shading in rgb, alpha = the silhouette): jagged polygons lit from the upper left, with crumbs. */
function makeAtlas() {
  const S = 256, C = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); const rnd = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * C + C / 2, oy = Math.floor(cell / 2) * C + C / 2, n = 6 + Math.floor(rnd() * 3), pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.283 + rnd() * 0.5, r = C * (0.26 + rnd() * 0.18); pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r * (0.8 + rnd() * 0.3)]); }
    const poly = (q, fill) => { x.beginPath(); q.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fillStyle = fill; x.fill(); };
    const g = x.createLinearGradient(ox - C * 0.3, oy - C * 0.3, ox + C * 0.3, oy + C * 0.3); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#b8b8b8'); g.addColorStop(1, '#6a6a6a');
    poly(pts, g);
    const inner = pts.map((p) => [ox + (p[0] - ox) * 0.55 - 3, oy + (p[1] - oy) * 0.55 - 3]); poly(inner, 'rgba(255,255,255,.35)');            // a lit face
    for (let k = 0; k < 14; k++) { x.fillStyle = `rgba(40,40,40,${0.25 + rnd() * 0.3})`; x.beginPath(); x.arc(ox + (rnd() - 0.5) * C * 0.6, oy + (rnd() - 0.5) * C * 0.6, 1.2 + rnd() * 2.4, 0, 6.283); x.fill(); }   // speckle
    for (let k = 0; k < 4; k++) { const a = rnd() * 6.283, r = C * (0.42 + rnd() * 0.06); poly([[ox + Math.cos(a) * r, oy + Math.sin(a) * r], [ox + Math.cos(a) * r + 6, oy + Math.sin(a) * r + 2], [ox + Math.cos(a) * r + 2, oy + Math.sin(a) * r + 6]], '#999'); }   // crumbs
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; return t;
}
const DIRT = ['#6e4f33', '#8a6a46', '#a8855c', '#5b4129', '#7d5d3c'].map((h) => new THREE.Color(h));
const MUD = ['#2c2016', '#3a2a1c', '#46321f', '#241a12'].map((h) => new THREE.Color(h));

export function createDirt(scene, groundAt) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N), rotA = new Float32Array(N), cellA = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aRot', new THREE.BufferAttribute(rotA, 1));
  geo.setAttribute('aCell', new THREE.BufferAttribute(cellA, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 400 }, uTex: { value: makeAtlas() } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot; attribute float aCell;
      uniform float uScale; varying vec3 vC; varying float vA; varying float vR; varying float vCell;
      void main() {
        vC = aColor; vA = aAlpha; vR = aRot; vCell = aCell;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(3.0, aSize * uScale / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; varying vec3 vC; varying float vA; varying float vR; varying float vCell;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float cs = cos(vR), sn = sin(vR);
        q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) + 0.5;                       // the chunk tumbles
        vec2 uv = (vec2(mod(vCell, 2.0), floor(vCell / 2.0)) + clamp(q, 0.0, 1.0)) * 0.5;
        vec4 t = texture2D(uTex, uv);
        float a = t.a * vA;
        if (a < 0.05) discard;
        gl_FragColor = vec4(vC * (0.55 + 0.75 * t.r), a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 6;
  scene.add(pts);

  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, s: 0.2, r: 1, g: 1, b: 1, bounced: false, rot: 0, spin: 0, cell: 0 }));
  let head = 0, acc = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function emit(x, y, z, vx, vy, s, c) {
    const p = P[head++ % N];
    Object.assign(p, { life: 1.1, max: 1.1, x, y, z, vx, vy, s, r: c.r, g: c.g, b: c.b, bounced: false, rot: Math.random() * 6.28, spin: (Math.random() < 0.5 ? -1 : 1) * rnd(3, 11), cell: Math.floor(Math.random() * 4) });
  }
  return {
    set visible(v) { pts.visible = v; },
    /**
     * Throw dirt for one frame from the wheel's contact point (x, y). `speed`: the bike's forward speed; `power` 0..1: how hard the rear wheel is
     * digging (speed and charge); `mud` 0..1: how deep in mud the bike is (bigger, darker, more).
     */
    spray(dt, x, y, z, speed, power, mud, front = false) {
      const rate = (6 + 32 * power) * (1 + 2.6 * mud) * (front ? 0.45 : 1);
      acc += rate * dt;
      const m = Math.min(1, mud * 1.4);
      while (acc >= 1) {
        acc -= 1;
        const c = (Math.random() < m ? MUD : DIRT)[Math.floor(Math.random() * (Math.random() < m ? MUD.length : DIRT.length))];
        const size = rnd(0.45, 0.8) * (1 + 1.0 * mud) * (0.85 + 0.3 * power);
        const thrown = (1.5 + 0.28 * speed + rnd(0, 4)) * (1 + 0.5 * mud);
        const up = (2.5 + rnd(0, 6) + 3.5 * power) * (1 + 0.55 * mud);
        emit(x + rnd(-0.2, 0.2), y + 0.1, z + rnd(-0.5, 0.5), front ? thrown * 0.5 : -thrown, front ? up * 0.8 : up, size, c);
      }
    },
    /** A burst of clods (a jump-off, a landing, a crash): thrown up and out both ways. `dark` 0..1 blends toward mud. */
    burst(x, y, z, n, power = 1, dark = 0) {
      for (let i = 0; i < n; i++) {
        const c = (Math.random() < dark ? MUD : DIRT)[Math.floor(Math.random() * 4)], dir = Math.random() < 0.5 ? -1 : 1;
        emit(x + rnd(-0.4, 0.4), y + 0.1, z + rnd(-0.6, 0.6), dir * rnd(1.5, 7) * power, rnd(3, 10) * power, rnd(0.4, 0.8) * (1 + 0.6 * dark), c);
      }
    },
    update(dt, pixelScale) {
      mat.uniforms.uScale.value = pixelScale;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life > 0) {
          p.life -= dt; p.rot += p.spin * dt * (p.bounced ? 0.3 : 1); p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          const g = groundAt(p.x) + 0.08;
          if (p.y < g && p.vy < 0) { p.y = g; if (p.bounced) { p.vx *= 0.5; p.vy = 0; } else { p.bounced = true; p.vy *= -0.28; p.vx *= 0.6; } }
        }
        const t = p.life > 0 ? 1 - p.life / p.max : 1;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        size[i] = p.s; rotA[i] = p.rot; cellA[i] = p.cell;
        alpha[i] = p.life > 0 ? Math.min(1, (1 - t) * 3.5) * 0.95 : 0;
      }
      geo.attributes.position.needsUpdate = geo.attributes.aColor.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aRot.needsUpdate = geo.attributes.aCell.needsUpdate = true;
    },
    clear() { for (const p of P) p.life = 0; acc = 0; },
  };
}
