// A tiny pool of soft smoke/dust puffs (one Points draw call) for the bike: dirt kicked up and exhaust while a jump charges.
import * as THREE from 'three';

const N = 48;

export function createPuffs(scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
      uniform float uScale; varying vec3 vC; varying float vA;
      void main() {
        vC = aColor; vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.25, d) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.visible = false;
  scene.add(pts);

  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, s0: 1, s1: 2, a: 0.6, r: 1, g: 1, b: 1 }));
  let head = 0;
  const c = new THREE.Color();
  return {
    set visible(v) { pts.visible = v; },
    /** Spawn one puff at (x, y, z) with velocity (vx, vy). */
    emit(x, y, z, vx, vy, s0, s1, life, color, a = 0.6) {
      const p = P[head++ % N]; c.set(color);
      Object.assign(p, { life, max: life, x, y, z, vx, vy, s0, s1, a, r: c.r, g: c.g, b: c.b });
    },
    update(dt, pixelScale) {
      mat.uniforms.uScale.value = pixelScale;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.5 * dt; p.vy *= 1 - 1.2 * dt; }
        const t = p.life > 0 ? 1 - p.life / p.max : 1;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        size[i] = p.s0 + (p.s1 - p.s0) * t;
        alpha[i] = p.life > 0 ? p.a * (1 - t) * Math.min(1, t * 8) : 0;
      }
      geo.attributes.position.needsUpdate = geo.attributes.aColor.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
    },
    clear() { for (const p of P) p.life = 0; },
  };
}
