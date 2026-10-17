// Dirt kicked up from the wheels: small crisp clods thrown back and up that arc under gravity, bounce once and fade (one Points draw call).
// On the trail they are earthy brown and modest; in mud they are darker, bigger, more of them and thrown further.
import * as THREE from 'three';

const N = 160, GRAV = 22;
const DIRT = ['#6e4f33', '#8a6a46', '#a8855c', '#5b4129', '#7d5d3c'].map((h) => new THREE.Color(h));
const MUD = ['#2c2016', '#3a2a1c', '#46321f', '#241a12'].map((h) => new THREE.Color(h));

export function createDirt(scene, groundAt) {
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
        gl_PointSize = max(2.0, aSize * uScale / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC; varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q * vec2(1.0, 1.15)) * 2.0;                     // a lumpy, crisp little clod
        float a = smoothstep(1.0, 0.8, d) * vA;
        if (a < 0.02) discard;
        float shade = 0.78 + 0.45 * (0.5 - q.y) - 0.15 * q.x;           // lit from above
        gl_FragColor = vec4(vC * shade, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 6;
  scene.add(pts);

  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, s: 0.2, r: 1, g: 1, b: 1, bounced: false }));
  let head = 0, acc = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function emit(x, y, z, vx, vy, s, c) {
    const p = P[head++ % N];
    Object.assign(p, { life: 1.1, max: 1.1, x, y, z, vx, vy, s, r: c.r, g: c.g, b: c.b, bounced: false });
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
    update(dt, pixelScale) {
      mat.uniforms.uScale.value = pixelScale;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life > 0) {
          p.life -= dt; p.vy -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          const g = groundAt(p.x) + 0.08;
          if (p.y < g && p.vy < 0) { p.y = g; if (p.bounced) { p.vx *= 0.5; p.vy = 0; } else { p.bounced = true; p.vy *= -0.28; p.vx *= 0.6; } }
        }
        const t = p.life > 0 ? 1 - p.life / p.max : 1;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        size[i] = p.s;
        alpha[i] = p.life > 0 ? Math.min(1, (1 - t) * 3.5) * 0.95 : 0;
      }
      geo.attributes.position.needsUpdate = geo.attributes.aColor.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
    },
    clear() { for (const p of P) p.life = 0; acc = 0; },
  };
}
