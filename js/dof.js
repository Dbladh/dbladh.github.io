// Depth of field, written by hand so it keeps the canvas transparent
// (the sky is a CSS gradient behind the canvas, which most stock DOF passes would paint black).
//
// 1. The scene is rendered into an off-screen target that also stores depth.
// 2. A full-screen pass blurs each pixel by how far its depth is from the focus distance
//    (a "circle of confusion"), then converts to sRGB for the screen.
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  #include <common>
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focus;      // world distance that is perfectly sharp
  uniform float aperture;   // blur strength
  uniform float maxBlur;    // max blur radius in pixels
  uniform vec2 texel;
  varying vec2 vUv;

  float cocAt(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    float dist = -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    return clamp(aperture * abs(1.0 / focus - 1.0 / max(dist, 0.01)), 0.0, maxBlur);
  }

  void main() {
    float coc = cocAt(vUv);
    vec4 col = texture2D(tColor, vUv);

    if (coc > 0.6) {
      vec4 sum = col;
      float wsum = 1.0;
      // Golden-angle disc: 20 taps spread over the blur radius.
      for (int i = 1; i < 20; i++) {
        float fi = float(i);
        float r = sqrt(fi / 20.0) * coc;
        float a = fi * 2.399963;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
        // A neighbour only contributes if its own blur reaches this far. That stops a sharp,
        // in-focus object (like an open billboard) from bleeding a halo into the blurred background.
        float w = clamp(cocAt(uv) / max(r, 0.75), 0.0, 1.0);
        sum += texture2D(tColor, uv) * w;
        wsum += w;
      }
      col = sum / wsum;
    }

    // The buffer is premultiplied linear; convert the colour to sRGB, then re-premultiply.
    float a = col.a;
    vec3 c = a > 0.0001 ? col.rgb / a : col.rgb;
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= a;
  }
`;

export function createDOF(renderer) {
  if (!renderer.capabilities.isWebGL2) return null;

  let target;
  try {
    target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: 2,
      depthTexture: new THREE.DepthTexture(4, 4),
    });
  } catch (err) {
    console.warn('Depth of field unavailable:', err);
    return null;
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      cameraNear: { value: 0.5 },
      cameraFar: { value: 600 },
      focus: { value: 60 },
      aperture: { value: 90 },
      maxBlur: { value: 12 },
      texel: { value: new THREE.Vector2(1, 1) },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);

  // Writes the main pass's depth into the screen's depth buffer (no colour), so the billboards
  // drawn afterwards are hidden by trees and hills in front of them exactly as in the main pass.
  const depthCopy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: target.depthTexture } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDepth;
      varying vec2 vUv;
      void main() {
        gl_FragDepth = texture2D(tDepth, vUv).x;
        gl_FragColor = vec4(0.0);
      }`,
    colorWrite: false,
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
  }));
  depthCopy.frustumCulled = false;
  const depthScene = new THREE.Scene();
  depthScene.add(depthCopy);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const size = new THREE.Vector2();
  let enabled = true;

  return {
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },

    /** Call after the renderer's size or pixel ratio changes. */
    resize() {
      renderer.getDrawingBufferSize(size);
      target.setSize(size.x, size.y);
      material.uniforms.texel.value.set(1 / size.x, 1 / size.y);
      const k = size.y / 900;
      material.uniforms.aperture.value = 250 * k;
      material.uniforms.maxBlur.value = 16 * k;
    },

    /** Current blur settings in drawing-buffer pixels (used by the firefly shader). */
    get params() {
      return { height: size.y, aperture: material.uniforms.aperture.value, maxBlur: material.uniforms.maxBlur.value };
    },

    /** Render `scene` with `focus` (world units from the camera) in sharp focus. */
    render(scene, camera, focus, ghosts = []) {
      material.uniforms.cameraNear.value = camera.near;
      material.uniforms.cameraFar.value = camera.far;
      material.uniforms.focus.value = Math.max(focus, 1);
      // Layer 0 = the world (blurred by depth of field); layer 1 = billboards (kept sharp).
      camera.layers.set(0);
      // Signs live on both layers so they cast shadows, but must not be drawn (or write depth) in the
      // blurred pass: they are drawn once, sharp, below.
      const saved = ghosts.map((m) => [m.colorWrite, m.depthWrite]);
      ghosts.forEach((m) => { m.colorWrite = false; m.depthWrite = false; });
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      ghosts.forEach((m, i) => { m.colorWrite = saved[i][0]; m.depthWrite = saved[i][1]; });
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(quadScene, quadCam);

      // Billboards: drawn crisp on top, depth-tested against the world's depth.
      const prevAuto = renderer.autoClear, prevShadow = renderer.shadowMap.autoUpdate;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false; // shadows were already rendered in the main pass
      renderer.render(depthScene, quadCam);
      camera.layers.set(1);
      renderer.render(scene, camera);
      renderer.autoClear = prevAuto;
      renderer.shadowMap.autoUpdate = prevShadow;
      camera.layers.enable(0);
      camera.layers.enable(1);
    },
  };
}
