// A tiny pool of soft smoke/dust puffs (one Points draw call) for the bike: dirt kicked up and exhaust while a jump charges.
import * as THREE from 'three';

const N = 72;

/** A 2x2 atlas of ragged smoke/dust blobs (alpha = density, r = a little shading), carved out of a noisy cloud so no edge is a clean circle. */
function makeAtlas() {
  const S = 256, C = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  const hash = (a, b, s) => { const v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const vn = (px, py, s) => { const xi = Math.floor(px), yi = Math.floor(py), xf = px - xi, yf = py - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    return (hash(xi, yi, s) * (1 - sx) + hash(xi + 1, yi, s) * sx) * (1 - sy) + (hash(xi, yi + 1, s) * (1 - sx) + hash(xi + 1, yi + 1, s) * sx) * sy; };
  const fbm = (px, py, s) => vn(px, py, s) * 0.5 + vn(px * 2.1, py * 2.1, s + 3) * 0.3 + vn(px * 4.3, py * 4.3, s + 7) * 0.2;
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * C, oy = Math.floor(cell / 2) * C, ang = hash(cell, 1, 2) * 6.28, lobes = [];
    for (let k = 0; k < 6; k++) { const a = ang + k * 1.05 + hash(cell, k, 5) * 0.8, r = 0.1 + hash(cell, k, 9) * 0.2; lobes.push([Math.cos(a) * r, Math.sin(a) * r, 0.15 + hash(cell, k, 11) * 0.12]); }
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const u = (i / (C - 1) - 0.5), v = (j / (C - 1) - 0.5);
      let dens = 0; for (const l of lobes) { const q = Math.hypot(u - l[0], v - l[1]) / l[2]; dens = Math.max(dens, 1 - q * q); }     // a cluster of lumps
      const n = fbm(i / 18 + cell * 7, j / 18 + cell * 3, cell), edge = 1 - Math.min(1, Math.hypot(u, v) * 2);
      const a = Math.max(0, Math.min(1, (dens * 1.1 - 0.12 + (n - 0.5) * 0.9) * Math.min(1, edge * 3.2)));
      const k = ((oy + j) * S + ox + i) * 4, sh = 0.72 + 0.28 * n + 0.1 * (0.5 - v);
      d[k] = d[k + 1] = d[k + 2] = Math.max(0, Math.min(255, sh * 255)); d[k + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; return t;
}

export function createPuffs(scene) {
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
        gl_PointSize = aSize * uScale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; varying vec3 vC; varying float vA; varying float vR; varying float vCell;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float cs = cos(vR), sn = sin(vR);
        q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) + 0.5;                       // each puff is turned its own way, and keeps turning
        vec2 uv = (vec2(mod(vCell, 2.0), floor(vCell / 2.0)) + clamp(q, 0.0, 1.0)) * 0.5;
        vec4 t = texture2D(uTex, uv);
        float a = min(1.0, t.a * 1.5) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC * (0.75 + 0.45 * t.r), a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.visible = false;
  scene.add(pts);

  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, s0: 1, s1: 2, a: 0.6, r: 1, g: 1, b: 1, rot: 0, spin: 0, cell: 0, lift: 0 }));
  let head = 0;
  const c = new THREE.Color();
  return {
    set visible(v) { pts.visible = v; },
    /** Spawn one puff at (x, y, z) with velocity (vx, vy). */
    /** `lift`: upward acceleration (smoke rises, dust does not). */
    emit(x, y, z, vx, vy, s0, s1, life, color, a = 0.6, lift = 0) {
      const p = P[head++ % N]; c.set(color);
      Object.assign(p, { life, max: life, x, y, z, vx, vy, s0, s1, a, r: c.r, g: c.g, b: c.b, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 1.6, cell: Math.floor(Math.random() * 4), lift });
    },
    update(dt, pixelScale) {
      mat.uniforms.uScale.value = pixelScale;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life > 0) { p.life -= dt; p.vy += p.lift * dt; p.rot += p.spin * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.5 * dt; p.vy *= 1 - 1.2 * dt; }
        const t = p.life > 0 ? 1 - p.life / p.max : 1;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        size[i] = p.s0 + (p.s1 - p.s0) * t;
        alpha[i] = p.life > 0 ? p.a * (1 - t) * Math.min(1, t * 8) : 0; rotA[i] = p.rot; cellA[i] = p.cell;
      }
      geo.attributes.position.needsUpdate = geo.attributes.aColor.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aRot.needsUpdate = geo.attributes.aCell.needsUpdate = true;
    },
    clear() { for (const p of P) p.life = 0; },
  };
}
