// Rain and snow: falling streaks and flakes in a box that follows the camera. Every particle is a fixed random seed: the vertex shader works out where it is from the clock (it falls, drifts with the wind and
// wraps round the box), so there is nothing to update per particle on the CPU. One draw call each; `amount` (0..1) thins them out without rebuilding anything.
import * as THREE from 'three';

const BOX = 56;                                        // the box round the camera, in world units
function seedGeometry(n, lines) {
  const seeds = new Float32Array(n * (lines ? 6 : 3)), end = new Float32Array(n * (lines ? 2 : 1)), rnd = new Float32Array(n * (lines ? 2 : 1)); let s = 1234567;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const x = r(), y = r(), z = r(), a = r();
    if (lines) { seeds.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1; rnd[i * 2] = rnd[i * 2 + 1] = a; } else { seeds.set([x, y, z], i * 3); rnd[i] = a; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1)); return g;
}
const COMMON = `
  uniform vec3 uCam; uniform float uTime, uAmount, uBox; uniform vec2 uWind; attribute float aEnd, aRnd; varying float vA;
  vec3 wrapped(vec3 seedPos, vec3 vel, out float fade) {
    vec3 box = vec3(uBox, uBox * 0.7, uBox), p = mod(seedPos * box + vel * uTime - uCam + box * 0.5, box) - box * 0.5;
    fade = (1.0 - smoothstep(0.5, 1.0, length(p.xz) / (uBox * 0.5))) * (1.0 - smoothstep(0.55, 1.0, abs(p.y) / (uBox * 0.35))) * smoothstep(aRnd, aRnd + 0.12, uAmount);
    return uCam + p;
  }`;

export function createPrecip({ low = false } = {}) {
  const group = new THREE.Group(); group.visible = false;
  const rainMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmount: { value: 0 }, uBox: { value: BOX }, uWind: { value: new THREE.Vector2() }, uSpeed: { value: 38 }, uLen: { value: 2.3 }, uColor: { value: new THREE.Color('#cfe3ff') }, uAlpha: { value: 0.32 } },
    vertexShader: COMMON + `uniform float uSpeed, uLen; void main() {
      vec3 vel = vec3(uWind.x, -uSpeed, uWind.y); float f; vec3 w = wrapped(position, vel, f); w -= normalize(vel) * uLen * aEnd; vA = f * (1.0 - 0.85 * aEnd);
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vA; void main() { gl_FragColor = vec4(uColor, vA * uAlpha); }',
  });
  const snowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmount: { value: 0 }, uBox: { value: BOX }, uWind: { value: new THREE.Vector2() }, uPx: { value: 800 }, uColor: { value: new THREE.Color('#ffffff') }, uAlpha: { value: 0.9 } },
    vertexShader: COMMON + `uniform float uPx; void main() {
      vec3 vel = vec3(uWind.x * 0.6, -(2.2 + 2.0 * aRnd), uWind.y * 0.6); float f; vec3 w = wrapped(position, vel, f);
      w.x += sin(uTime * 0.8 + aRnd * 40.0) * 0.9; w.z += cos(uTime * 0.65 + aRnd * 31.0) * 0.9;
      vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; vA = f; gl_PointSize = clamp((0.13 + 0.1 * aRnd) * uPx / max(0.5, -mv.z), 1.5, 14.0); }`,
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor, smoothstep(0.5, 0.12, d) * vA * uAlpha); }',
  });
  const leafMat = new THREE.ShaderMaterial({                                   // leaves and petals blown along by a strong wind
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmount: { value: 0 }, uBox: { value: BOX }, uWind: { value: new THREE.Vector2() }, uPx: { value: 800 }, uAlpha: { value: 0.95 } },
    vertexShader: COMMON + `uniform float uPx; varying vec3 vC; void main() {
      vec3 vel = vec3(uWind.x * 0.55 + 1.5, -(0.7 + 0.9 * aRnd), uWind.y * 0.55 + 0.5); float f; vec3 w = wrapped(position, vel, f);
      w.y += sin(uTime * 2.2 + aRnd * 60.0) * 0.5; w.z += cos(uTime * 1.7 + aRnd * 45.0) * 0.8;
      vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; vA = f;
      vC = aRnd < 0.34 ? vec3(0.86, 0.46, 0.16) : aRnd < 0.66 ? vec3(0.9, 0.72, 0.2) : vec3(0.42, 0.62, 0.2);
      gl_PointSize = clamp(0.16 * uPx / max(0.5, -mv.z), 2.0, 16.0); }`,
    fragmentShader: 'uniform float uAlpha; varying float vA; varying vec3 vC; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q * vec2(1.0, 1.7)); gl_FragColor = vec4(vC, smoothstep(0.5, 0.25, d) * vA * uAlpha); }',
  });
  const leaves = new THREE.Points(seedGeometry(low ? 40 : 110, false), leafMat);
  const rain = new THREE.LineSegments(seedGeometry(low ? 1200 : 4200, true), rainMat), snow = new THREE.Points(seedGeometry(low ? 700 : 2200, false), snowMat);
  for (const o of [rain, snow, leaves]) { o.frustumCulled = false; o.renderOrder = 5; group.add(o); }
  let t = 0;
  return {
    group,
    /** Move the box to the camera and set how much of each is falling. `hide` switches both off (the games, simple view). */
    update(dt, camera, wx, hide, pxH, calm = false) {
      const r = hide ? 0 : wx.rain, s = hide ? 0 : wx.snow, lf = hide ? 0 : Math.max(0, (wx.wind - 0.3) / 0.7) * (1 - 0.6 * Math.max(r, s)); group.visible = r > 0.01 || s > 0.01 || lf > 0.01; if (!group.visible) return;
      t += dt * (calm ? 0.5 : 1);
      rain.visible = r > 0.01; snow.visible = s > 0.01; leaves.visible = lf > 0.01;
      const cp = camera.position, wind = wx.wind;
      for (const m of [rainMat, snowMat, leafMat]) { m.uniforms.uCam.value.copy(cp); m.uniforms.uTime.value = t; m.uniforms.uWind.value.set(wind * 14, wind * 4); }
      rainMat.uniforms.uAmount.value = r; rainMat.uniforms.uSpeed.value = 34 + 12 * wx.storm; rainMat.uniforms.uAlpha.value = 0.34 + 0.2 * r;
      leafMat.uniforms.uAmount.value = lf; leafMat.uniforms.uPx.value = pxH / (2 * Math.tan((camera.fov * Math.PI) / 360));
      snowMat.uniforms.uAmount.value = s; snowMat.uniforms.uPx.value = pxH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
    dispose() { for (const o of [rain, snow, leaves]) o.geometry.dispose(); rainMat.dispose(); snowMat.dispose(); leafMat.dispose(); },
  };
}
