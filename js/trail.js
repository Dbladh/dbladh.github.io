// A worn dirt-bike trail along the lane the rider follows: a soft-edged ribbon of packed dirt with two tyre ruts, draped over the ground
// (the real hills at the start and the generated ground after them), broken at gaps. Built from short segments that are re-laid as the
// camera moves, so the cost stays small (about twenty small meshes, one material).
import * as THREE from 'three';

const SEG = 24, STEP = 0.5, COLS = SEG / STEP + 1, ROWS = 7, HALF = 3.6;     // segment length, spacing along it, rows across, half the ribbon's width
const R = 130;                                                                // how far either side of the camera the trail is laid

export function createTrail(parent, { laneZ, groundAt, inPit }) {
  const group = new THREE.Group(); group.visible = true; parent.add(group);
  // The look is worked out in the fragment shader (no texture at all, nothing for a phone's GPU to refuse to sample): packed warm dirt, two darker
  // ruts, grass creeping in at the edges and along the middle, ragged feathered edges. u (along) is world x / 9, v (across) 0..1.
  const U = { uX0: { value: 0 }, uX1: { value: 1 }, uOpacity: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vX;
      void main() { vUv = uv; vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uX0; uniform float uX1; uniform float uOpacity; uniform vec3 uTint;
      varying vec2 vUv; varying float vX;
      float hsh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); i = mod(i, 4096.0);
        return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float u = vUv.x, v = clamp(vUv.y, 0.0, 1.0), o = (v - 0.5) * 2.0;
        float wob = (vn(vec2(u * 8.0, 3.7)) - 0.5) * 0.18 + (vn(vec2(u * 24.0, 9.1)) - 0.5) * 0.06;
        float ao = abs(o + wob);
        float rut = exp(-pow((ao - 0.36) / 0.1, 2.0)), ridge = exp(-pow(o / 0.14, 2.0));
        vec3 c = vec3(222.0, 164.0, 116.0) + vec3(10.0 * (1.0 - rut) - 40.0 * rut, 8.0 * (1.0 - rut) - 32.0 * rut, 6.0 * (1.0 - rut) - 22.0 * rut);
        float grain = (vn(vec2(u * 14.0, v * 100.0)) - 0.5) * 30.0 + (vn(vec2(u * 40.0, v * 216.0)) - 0.5) * 16.0 + (hsh(floor(vec2(u * 256.0, v * 128.0))) - 0.5) * 10.0;
        c += vec3(grain, grain * 0.85, grain * 0.7);
        float grass = min(1.0, clamp((ao - 0.62) / 0.3, 0.0, 1.0) + ridge * 0.22 * (vn(vec2(u * 30.0, 5.5)) > 0.5 ? 1.0 : 0.3));
        c = mix(c, vec3(104.0, 146.0, 66.0), grass) / 255.0;
        float edge = 1.0 - clamp((ao - 0.66 - (vn(vec2(u * 18.0, 1.3)) - 0.5) * 0.16) / 0.3, 0.0, 1.0);
        float a = edge * edge * (3.0 - 2.0 * edge) * smoothstep(uX0, uX1, vX) * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(pow(max(c, vec3(0.0)), vec3(2.2)) * uTint, a);      // (the working space is linear)
      }`,
  });
  let scene = null, sun = null, hemi = null, looks = 0;
  function lightTint() {                                                       // as bright as the scene's own light is (day, dusk, night)
    if (!scene) { scene = group; while (scene.parent) scene = scene.parent; }
    if ((!sun || !hemi) && looks++ < 3) scene.traverse((o) => { if (o.isHemisphereLight && !hemi) hemi = o; else if (o.isDirectionalLight && o.castShadow && !sun) sun = o; });
    const ch = (k) => Math.min(1.1, Math.max(0.3, 0.2 + (hemi ? hemi.color[k] * hemi.intensity * 0.5 : 0.5) + (sun ? sun.color[k] * sun.intensity * 0.4 : 0.4)));
    U.uTint.value.setRGB(ch('r'), ch('g'), ch('b'));
  }
  const idx = [];                                                              // (the index of a full segment; broken at gaps by shortening the draw range per quad run)
  const count = Math.ceil((2 * R) / SEG) + 2, segs = [];
  let startX = 0, fade = 1, lastFirst = null, lastLast = null, more = false;
  for (let k = 0; k < count; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COLS * ROWS * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(COLS * ROWS * 2), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array((COLS - 1) * (ROWS - 1) * 6), 1));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = 2; group.add(m);
    segs.push({ m, g, idx: -999 });
  }
  function lay(s, i) {
    s.idx = i; const x0 = i * SEG, pos = s.g.attributes.position, uv = s.g.attributes.uv, ix = s.g.index.array;
    for (let c = 0; c < COLS; c++) {
      const x = x0 + c * STEP;
      for (let r = 0; r < ROWS; r++) {
        const o = r / (ROWS - 1) * 2 - 1, z = laneZ + o * HALF, v = c * ROWS + r;
        pos.setXYZ(v, x, groundAt(x, z) + 0.05, z); uv.setXY(v, x / 9, (o + 1) / 2);
      }
    }
    let n = 0;                                                                   // quads, skipping any that touch a gap
    for (let c = 0; c < COLS - 1; c++) {
      const xa = x0 + c * STEP, xb = xa + STEP;
      if (inPit(xa - 0.2) || inPit(xb + 0.2)) continue;
      for (let r = 0; r < ROWS - 1; r++) { const p = c * ROWS + r, q = (c + 1) * ROWS + r; ix[n++] = p; ix[n++] = p + 1; ix[n++] = q; ix[n++] = q; ix[n++] = p + 1; ix[n++] = q + 1; }
    }
    s.g.setDrawRange(0, n); s.g.index.needsUpdate = true; pos.needsUpdate = uv.needsUpdate = true;
    s.m.visible = n > 0;
  }
  return {
    set visible(v) { group.visible = v; },
    /** A new ride begins at x: the trail starts there (faded in). */
    reset(x) { startX = x; U.uX0.value = x + 6; U.uX1.value = x + 26; lastFirst = lastLast = null; more = false; for (const s of segs) { s.idx = -999; s.m.visible = false; } },
    /** 0..1: the whole trail fades in with the camera's trip into the game. */
    setFade(k) { fade = k; U.uOpacity.value = k; },
    update(camX) {
      lightTint();
      const first = Math.floor((camX - R) / SEG), last = Math.floor((camX + R) / SEG);
      if (first === lastFirst && last === lastLast && !more) return;                      // nothing changed since last frame: no work, no garbage
      lastFirst = first; lastLast = last;
      const have = new Set(segs.map((s) => s.idx)), free = segs.filter((s) => s.idx < first || s.idx > last);
      let built = 0, waiting = false;
      for (let i = first; i <= last; i++) {
        if (have.has(i) || (i + 1) * SEG < startX - 2) continue;
        if (built >= 4) { waiting = true; break; }
        const s = free.pop(); if (!s) break; lay(s, i); built++;
      }
      more = waiting;
      for (const s of free) { s.idx = -999; s.m.visible = false; }
    },
    /** The gaps (and so the broken stretches) of the course changed: lay everything again. */
    relay() { lastFirst = lastLast = null; for (const s of segs) s.idx = -999; },
  };
}
