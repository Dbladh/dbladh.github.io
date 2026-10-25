// The black-light night: as it gets dark the course turns into a fluorescent mini-golf. Everything in the golf's own materials is darkened and given a glow in a saturated version of its
// own colour (or the neon colour its material is tagged with, for the textured ones), the turf goes near black with a faint green glow, the water glows teal. `set(k)` runs 0 (day) to 1 (night);
// `reset()` puts every material back (they are shared between visits).
import * as THREE from 'three';

const OVERRIDE = { brick: '#ff5a1f', stone: '#8a63ff', wood: '#33ff9e', plaster: '#ff4fd8', shingle: '#ffb21f', darkwood: '#ff8a1f', metal: '#4fe3ff', sand: '#fff0a0', bush: '#18ff6a', rock: '#6f9bff', flower: '#ff5fd0', conifer: '#14ffd2', tuft: '#a6ff3a', sign: '#fff6c8', ball: '#7ffcff' };
const orig = new WeakMap(), hsl = { h: 0, s: 0, l: 0 };
const saturate = (c) => { c.getHSL(hsl); return new THREE.Color().setHSL(hsl.h, 1, Math.min(0.58, Math.max(0.46, hsl.l))); };

export function createNeon() {
  const mats = new Set(); let last = -1;
  const apply = (mt, k) => {
    if (mt.uniforms && mt.uniforms.uNeon) { mt.uniforms.uNeon.value = k; return; }
    let o = orig.get(mt); if (!o) { o = { color: mt.color.clone(), emissive: mt.emissive.clone(), ei: mt.emissiveIntensity, neon: null }; o.neon = mt.vertexColors ? new THREE.Color('#0c5a2a') : (mt.userData.neon && (o.color.r + o.color.g + o.color.b) / 3 > 0.9 ? new THREE.Color(OVERRIDE[mt.userData.neon]) : saturate(o.color)); orig.set(mt, o); }
    mt.color.copy(o.color).multiplyScalar(1 - 0.72 * k);
    mt.emissive.copy(o.neon); mt.emissiveIntensity = mt.vertexColors ? 0.45 * k : 0.95 * k;
    if (!k) { mt.emissive.copy(o.emissive); mt.emissiveIntensity = o.ei; mt.color.copy(o.color); }
  };
  return {
    /** Take in every golf material under `root`. */
    add(root) {
      root.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of ms) {
          if (!mt) continue;
          if (mt.isMeshLambertMaterial) { if (mt.map && !mt.emissiveMap && !mt.vertexColors) { mt.emissiveMap = mt.map; mt.needsUpdate = true; } mats.add(mt); }
          else if (mt.uniforms && mt.uniforms.uNeon) mats.add(mt);
        }
      });
    },
    set(k) { if (Math.abs(k - last) < 0.004) return; last = k; for (const mt of mats) apply(mt, k); },
    reset() { last = -1; for (const mt of mats) apply(mt, 0); mats.clear(); },
  };
}
