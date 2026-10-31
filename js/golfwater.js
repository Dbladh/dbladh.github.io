// Water for the mini-golf: the same soft cartoon look as the village pond (sky reflection, shallows that go light, glints, foam at the edge, the same day/night and aurora), drawn on
// irregular shapes: blob-shaped ponds and winding rivers that visibly flow. The sky colours and the clock are the village pond's own uniforms (world.waterLook), so the two always match.
import * as THREE from 'three';
import { mulberry32 } from './golfhero.js?v=20261031003010';

/** A water material. `flow` is the direction the water runs (world x, z; zero for still water) and `speed` how fast. */
export function waterMaterial(look, flowX = 0, flowZ = 0, speed = 0, tint = 0) {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFlow: { value: new THREE.Vector2(flowX, flowZ) }, uSpeed: { value: speed }, uNeon: { value: 0 }, uTint: { value: tint } }]);
  for (const k of ['uTime', 'uDay', 'uHorizon', 'uSkyTop', 'uAurora']) u[k] = look[k];      // (shared with the pond, so they stay live)
  return new THREE.ShaderMaterial({
    uniforms: u, fog: true, transparent: true, side: THREE.DoubleSide, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `
      attribute float aDepth; varying vec3 vW; varying float vD;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vD = aDepth;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uDay, uSpeed, uNeon, uTint; uniform vec3 uHorizon, uSkyTop, uAurora; uniform vec2 uFlow;
      varying vec3 vW; varying float vD;
      #include <fog_pars_fragment>
      vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
      void main() {
        vec2 p = vW.xz - uFlow * (uTime * uSpeed);
        float depth = clamp(vD, 0.0, 1.0);
        vec2 g = vec2(0.0);
        g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 2.2 + uTime * 0.9) * 0.45;
        g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 3.3 - uTime * 1.1) * 0.32;
        g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 5.1 + uTime * 1.5) * 0.18;
        vec3 N = normalize(vec3(-g.x * 0.26, 1.0, -g.y * 0.26));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.06 + 0.94 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uSkyTop, smoothstep(0.0, 0.7, R.y));
        sky += uAurora * 2.2 * smoothstep(0.0, 0.5, R.y);
        vec3 body = mix(lin(vec3(0.42, 0.82, 0.78)), lin(vec3(0.18, 0.55, 0.78)), smoothstep(0.0, 0.8, depth));
        body *= 0.4 + 0.6 * uDay;
        vec3 col = mix(body, sky, clamp(fres * 0.8 + 0.08, 0.0, 1.0));
        float band = smoothstep(0.82, 0.95, sin(dot(p, vec2(0.9, 0.4)) * 1.6 - uTime * 0.6 + sin(dot(p, vec2(-0.4, 0.9)) * 0.9) * 1.6));
        col += lin(vec3(0.85, 0.95, 1.0)) * band * (0.1 + 0.2 * uDay);
        float tw = sin(dot(p, vec2(3.6, 2.9)) + uTime * 1.4) * sin(dot(p, vec2(-2.7, 4.1)) - uTime * 1.1);
        col += vec3(1.0) * smoothstep(0.9, 1.0, tw) * (0.12 + 0.3 * uDay);
        if (uSpeed > 0.01) {                                              // a river: pale streaks and foam threads running with the current
          vec2 f = normalize(uFlow + 1e-4), s = vec2(-f.y, f.x);
          float st = smoothstep(0.72, 1.0, sin(dot(p, s) * 6.5 + sin(dot(p, f) * 1.4) * 2.0) * sin(dot(p, f) * 2.6 - uTime * uSpeed * 1.2));
          col += lin(vec3(0.95, 0.99, 1.0)) * st * (0.25 + 0.2 * uDay) * (1.0 - 0.4 * depth);
        }
        col += vec3(0.05, 0.62, 0.7) * uNeon * (0.3 + 0.7 * depth) * (0.8 + 0.4 * band);
        float cau = abs(sin(dot(p, vec2(3.1, 1.7)) + uTime * 0.7 + sin(dot(p, vec2(-1.9, 2.8)) + uTime * 0.5) * 1.6)) * abs(sin(dot(p, vec2(-2.2, 3.4)) - uTime * 0.6 + sin(dot(p, vec2(2.7, 1.3)) - uTime * 0.4) * 1.4));
        col += lin(vec3(0.7, 1.0, 0.95)) * smoothstep(0.78, 1.0, 1.0 - cau) * (1.0 - smoothstep(0.1, 0.7, depth)) * (0.1 + 0.25 * uDay);     // caustics dancing over the shallows
        float shore = 1.0 - smoothstep(0.0, 0.2, depth);
        float fn = 0.5 + 0.5 * sin(dot(p, vec2(5.0, 3.5)) + uTime * 0.8) * sin(dot(p, vec2(-3.5, 5.5)) - uTime * 0.6);
        col = mix(col, lin(vec3(0.97, 0.99, 1.0)) * (0.4 + 0.6 * uDay), shore * smoothstep(0.2, 0.6, fn + 0.35) * 0.85);
        if (uTint > 1.5) {                                                // frozen: pale ice with white cracks
          float cr = smoothstep(0.93, 1.0, abs(sin(dot(p, vec2(2.3, 1.1)) + sin(dot(p, vec2(-1.2, 2.6))) * 1.4)) * abs(sin(dot(p, vec2(-1.7, 2.0)) + 1.3)));
          col = mix(vec3(0.62, 0.8, 0.95) * (0.6 + 0.4 * uDay), vec3(1.0), 0.25 + 0.75 * cr);
        } else if (uTint > 0.5) {                                         // lava: glowing orange with a darker crust drifting over it
          float w1 = 0.5 + 0.5 * sin(p.x * 2.4 + uTime * 0.6) * sin(p.y * 2.1 - uTime * 0.45), crust = smoothstep(0.62, 0.85, 0.5 + 0.5 * sin(p.x * 3.1 - p.y * 2.3 + uTime * 0.3 + sin(p.y * 1.7) * 1.5));
          col = mix(vec3(1.0, 0.26, 0.04), vec3(1.0, 0.74, 0.2), w1); col = mix(col, vec3(0.22, 0.06, 0.04), crust * 0.65);
          float vein = smoothstep(0.9, 1.0, abs(sin(p.x * 4.3 + sin(p.y * 3.1 + uTime * 0.5) * 1.5)) * abs(sin(p.y * 3.7 - p.x * 1.9 + uTime * 0.4)));
          col += vec3(1.0, 0.7, 0.25) * vein * crust * 0.9;                // glowing cracks in the crust
          col = mix(col, vec3(1.0, 0.85, 0.35), (1.0 - smoothstep(0.0, 0.12, depth)) * 0.55);   // a white-hot rim at the bank
        }
        gl_FragColor = vec4(col, uTint > 0.5 ? 1.0 : mix(0.8, 0.95, smoothstep(0.0, 0.4, depth)));
        #include <fog_fragment>
      }`,
  });
}

/** The surface of a pond: rings from the bank (depth 0) to the middle (depth 1). */
export function pondGeometry(poly, y) {
  const n = poly.length / 2; let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += poly[i * 2]; cz += poly[i * 2 + 1]; } cx /= n; cz /= n;
  const pos = [], uv = [], dep = [], idx = [], rings = [[1, 0], [0.72, 0.55], [0.4, 0.9]];
  for (const [k, d] of rings) for (let i = 0; i < n; i++) { pos.push(cx + (poly[i * 2] - cx) * k, y, cz + (poly[i * 2 + 1] - cz) * k); dep.push(d); uv.push((cx + (poly[i * 2] - cx) * k) * 0.6, (cz + (poly[i * 2 + 1] - cz) * k) * 0.6); }
  pos.push(cx, y, cz); dep.push(1); uv.push(cx * 0.6, cz * 0.6);
  for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + ((i + 1) % n), c = (r + 1) * n + i, d = (r + 1) * n + ((i + 1) % n); idx.push(a, c, b, b, c, d); }
  for (let i = 0; i < n; i++) idx.push(2 * n + i, 3 * n, 2 * n + ((i + 1) % n));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** The surface of a river from a to b (half-width hw): the banks wobble a little and the channel bends gently. Returns the geometry and the two bank lines. */
export function riverGeometry(a, b, hw, seed, y) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.sqrt(dx * dx + dz * dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux, rng = mulberry32(seed), N = Math.max(6, Math.ceil(len / 0.5));
  const wob = [], off = []; for (let i = 0; i <= N; i++) { wob.push(1 + (rng() - 0.5) * 0.3); off.push((rng() - 0.5) * 0.2); }
  const pos = [], dep = [], idx = [], COLS = [[-1, 0], [-0.55, 0.65], [0, 1], [0.55, 0.65], [1, 0]], left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, taper = Math.min(1, t * 6, (1 - t) * 6) * 0.35 + 0.65, w = hw * 1.12 * wob[i] * taper, o = i === 0 || i === N ? 0 : off[i];
    const cx = a.x + dx * t + nx * o, cz = a.z + dz * t + nz * o;
    for (const [c, d] of COLS) { pos.push(cx + nx * w * c, y, cz + nz * w * c); dep.push(d); }
    left.push([cx + nx * w, cz + nz * w]); right.push([cx - nx * w, cz - nz * w]);
  }
  for (let i = 0; i < N; i++) for (let c = 0; c < 4; c++) { const p = i * 5 + c, q = p + 5; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setIndex(idx);
  return { geo: g, left, right, ux, uz };
}
