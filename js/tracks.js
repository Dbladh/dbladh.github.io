// Tyre marks: a dark line pressed into the ground behind a bike while it is on the ground, broken where it leaves it, fading away
// over a few seconds. One small mesh (a ring of quads reused over and over), drawn by a tiny shader, for both the ride-by bike and the game.
import * as THREE from 'three';

export function createTracks(scene, { groundAt, laneZ, width = 0.5, life = 9, strength = 0.42, color = '#2e2016', quads = 760, step = 0.4 } = {}) {
  const M = quads;
  const pos = new Float32Array(M * 4 * 3), born = new Float32Array(M * 4).fill(-1e9), side = new Float32Array(M * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBorn', new THREE.BufferAttribute(born, 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  const idx = new Uint16Array(M * 6);
  for (let q = 0; q < M; q++) { const v = q * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6); side[v] = side[v + 2] = -1; side[v + 1] = side[v + 3] = 1; }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const U = { uTime: { value: 0 }, uLife: { value: life }, uStrength: { value: strength }, uColor: { value: new THREE.Color(color) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    vertexShader: /* glsl */ `
      attribute float aBorn; attribute float aSide; uniform float uTime; uniform float uLife; uniform float uStrength;
      varying float vA; varying float vSide;
      void main() {
        float age = uTime - aBorn;
        vA = uStrength * clamp(age / 0.12, 0.0, 1.0) * clamp(1.0 - age / uLife, 0.0, 1.0);
        vSide = aSide;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float; uniform vec3 uColor; varying float vA; varying float vSide;
      void main() { float e = 1.0 - smoothstep(0.35, 1.0, abs(vSide)); float a = vA * e; if (a < 0.004) discard; gl_FragColor = vec4(uColor, a); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.userData.dynamic = true;       // (its box changes every frame: the game must not judge it by one look)
  scene.add(mesh);

  let head = 0, prev = null, now = 0;
  const hw = width / 2;
  function addQuad(a, b) {                                              // a, b: x positions (the height is read under each corner, so it hugs the slope across the lane too)
    const q = head++ % M, v = q * 4, z = laneZ, h = (x, zz) => groundAt(x, zz) + 0.07;
    pos.set([a, h(a, z - hw), z - hw, a, h(a, z + hw), z + hw, b, h(b, z - hw), z - hw, b, h(b, z + hw), z + hw], v * 3);
    for (let k = 0; k < 4; k++) born[v + k] = now;
    geo.attributes.position.needsUpdate = geo.attributes.aBorn.needsUpdate = true;
  }
  return {
    set visible(v) { mesh.visible = v; },
    /** The wheel touches the ground at x this frame (`grounded` false: it is in the air, so the line breaks). */
    add(x, grounded) {
      if (!grounded) { prev = null; return; }
      if (prev === null) { prev = x; return; }
      if (Math.abs(x - prev) < step) return;
      if (Math.abs(x - prev) > 6) { prev = x; return; }                  // (a jump in position: start a new line)
      addQuad(prev, x); prev = x;
    },
    update(dt) { now += dt; U.uTime.value = now; },
    /** Forget every mark (a new ride). */
    clear() { born.fill(-1e9); geo.attributes.aBorn.needsUpdate = true; prev = null; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
