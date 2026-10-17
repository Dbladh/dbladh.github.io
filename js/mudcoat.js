// Mud that sticks to the bike and rider: riding through a mud patch builds a coat that is thickest low down (wheels, forks, boots, lower frame),
// breaks up into splotches, and then slowly dries (from dark and wet to pale and dusty) and falls away over about twenty seconds.
//
// It is painted on, not modelled: every material of the bike and rider is patched with a few lines of shader that blend a mud colour into the
// surface where a noise pattern, in the bike's own frame, is below the current coat level (so it stays put on the bike as it moves and tilts).
import * as THREE from 'three';

const U = { uMud: { value: 0 }, uMudDry: { value: 0 }, uMudInv: { value: new THREE.Matrix4() } };
const patched = new WeakSet();

function patch(m) {
  if (!m || patched.has(m) || m.isShaderMaterial || m.isPointsMaterial || m.isSpriteMaterial) return;
  patched.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMudWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMudWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uMud; uniform float uMudDry; uniform mat4 uMudInv; varying vec3 vMudWp;
      float mdH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float mdN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(mdH(i), mdH(i + vec3(1,0,0)), f.x), mix(mdH(i + vec3(0,1,0)), mdH(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(mdH(i + vec3(0,0,1)), mdH(i + vec3(1,0,1)), f.x), mix(mdH(i + vec3(0,1,1)), mdH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (uMud > 0.002) {
        vec3 lp = (uMudInv * vec4(vMudWp, 1.0)).xyz;                         // where on the bike this is (the bike's own frame; the ground is at y = -0.36)
        float h = lp.y + 0.36;
        float low = 1.0 - smoothstep(0.0, 1.35, h);                          // more mud the lower down
        float n = mdN(lp * 6.0) * 0.55 + mdN(lp * 15.0) * 0.3 + mdN(lp * 34.0) * 0.15;
        float cover = uMud * (0.45 + 1.1 * low) - (1.0 - n) * 0.95 * (1.0 - uMud * 0.4);   // a thick coat is mostly solid; a thin one is splotches
        float m = smoothstep(0.22, 0.4, cover);
        vec3 wet = vec3(0.07, 0.045, 0.025), dry = vec3(0.28, 0.2, 0.12);
        vec3 mc = mix(wet, dry, uMudDry) * (0.7 + 0.6 * n);
        diffuseColor.rgb = mix(diffuseColor.rgb, mc, m * 0.96);
      }`);
  };
  m.customProgramCacheKey = () => (prev ? 'mud+' + String(prev).length : 'mud');
  m.needsUpdate = true;
}

export function createMudCoat(root) {
  root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(patch); });
  const st = { coat: 0, dryT: 0 };
  const inv = U.uMudInv.value;
  return {
    get coat() { return st.coat; },
    /** `mud`: how deep in mud the bike is right now (0..1, 0 when airborne). Builds the coat in mud; the coat dries and falls away otherwise. */
    update(dt, mud) {
      if (mud > 0.15) { st.coat = Math.min(1, st.coat + mud * dt * 0.8); st.dryT = 0; }
      else { st.dryT += dt; st.coat = Math.max(0, st.coat - dt * (0.035 + 0.025 * Math.min(1, st.dryT / 12))); }      // slow to start, then peels away faster as it dries
      U.uMud.value = st.coat; U.uMudDry.value = Math.min(1, st.dryT / 14);
      if (st.coat > 0.002) { root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert(); }
    },
    reset() { st.coat = 0; st.dryT = 0; U.uMud.value = 0; U.uMudDry.value = 0; },
    /** (for tests) set the coat and how dry it is (0..1). */
    set(c, dry = 0) { st.coat = c; st.dryT = dry * 14; U.uMud.value = c; U.uMudDry.value = dry; root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert(); },
  };
}
