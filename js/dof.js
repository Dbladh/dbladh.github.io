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
  uniform sampler2D tBlur;  // half-resolution blurred colour (HALF_RES only)
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focus;      // world distance that is perfectly sharp
  uniform float aperture;   // blur strength
  uniform float maxBlur;    // max blur radius in pixels
  uniform vec2 texel;
  uniform vec3 hazeColor;   // linear horizon colour
  uniform float hazeAmt;    // 0 = off
  uniform float bloom;      // 0 = off
  varying vec2 vUv;

  float cocAt(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    float dist = -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    return clamp(aperture * abs(1.0 / focus - 1.0 / max(dist, 0.01)), 0.0, maxBlur);
  }

  void main() {
    float coc = cocAt(vUv);
    vec4 col = texture2D(tColor, vUv);

#ifdef HALF_RES
    col = mix(col, texture2D(tBlur, vUv), smoothstep(0.5, 2.5, coc));   // sharp pixels stay full resolution
#else
    if (coc > 0.6) {
      vec4 sum = col;
      float wsum = 1.0;
      // Golden-angle disc: 14 taps spread over the blur radius.
      for (int i = 1; i < 14; i++) {
        float fi = float(i);
        float r = sqrt(fi / 14.0) * coc;
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
#endif
#ifdef BLUR_ONLY
    gl_FragColor = col;
    return;
#endif

    // The buffer is premultiplied linear; convert the colour to sRGB, then re-premultiply.
    float a = col.a;
    vec3 c = a > 0.0001 ? col.rgb / a : col.rgb;
    if (a > 0.001) {
      // Aerial perspective: distant ground fades toward the horizon colour (ridges layer in blue/violet).
      float dz = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, cameraNear, cameraFar);
      c = mix(c, hazeColor, hazeAmt * 0.65 * smoothstep(55.0, 200.0, dz));
      // Cheap bloom: bright neighbours (lit windows, lanterns, sun glints) spill softly.
      if (bloom > 0.0) {
        vec3 glow = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float ang = float(i) * 0.785398;
          for (int k = 1; k <= 2; k++) {
            vec2 o = vec2(cos(ang), sin(ang)) * float(k) * 7.0 * texel * (texel.x * 900.0 + 0.5);
            vec4 s = texture2D(tColor, vUv + o);
            vec3 sc = s.a > 0.001 ? s.rgb / s.a : s.rgb;
            glow += max(sc - vec3(1.0), 0.0) * s.a / float(k);
          }
        }
        c += glow * bloom * 0.09;
      }
    }
    // Grade: filmic tone curve, a little more saturation, warm highlights over cool shadows, soft vignette.
    c *= 1.18;
    c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(luma), c, 1.2);
    c += vec3(-0.004, 0.006, 0.018) * (1.0 - smoothstep(0.0, 0.3, luma));
    c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.45, 1.0, luma));
    float vig = smoothstep(1.05, 0.35, length((vUv - 0.5) * vec2(1.0, 0.9)));
    c *= mix(0.8, 1.0, vig);
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= a;
  }
`;

export function createDOF(renderer, { half = false } = {}) {
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

  let halfRes = half;
  let blurTarget = null;
  try {
    blurTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
  } catch (err) { halfRes = false; }
  const uniforms = {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      cameraNear: { value: 0.5 },
      cameraFar: { value: 600 },
      focus: { value: 60 },
      aperture: { value: 90 },
      maxBlur: { value: 12 },
      texel: { value: new THREE.Vector2(1, 1) },
      hazeColor: { value: new THREE.Color('#bfe8ff') },
      hazeAmt: { value: 1 },
      bloom: { value: 1 },
      tBlur: { value: blurTarget ? blurTarget.texture : null },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    defines: halfRes ? { HALF_RES: 1 } : {},
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  // Half-resolution pass: only the blurred colour, drawn into a target a quarter of the pixel count.
  const blurMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms, defines: { BLUR_ONLY: 1 },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const blurScene = new THREE.Scene();
  const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  blurQuad.frustumCulled = false;
  blurScene.add(blurQuad);
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

    /** Blur at half resolution (cheaper, slightly softer). Can be flipped at runtime by the watchdog. */
    get half() { return halfRes; },
    set half(v) {
      v = !!v && !!blurTarget;
      if (v === halfRes) return;
      halfRes = v;
      material.defines = v ? { HALF_RES: 1 } : {};
      material.needsUpdate = true;
    },

    /** Time-of-day inputs for the composite: horizon colour for haze, and bloom on/off (0..1). */
    setLook(horizon, bloom) {
      if (horizon) material.uniforms.hazeColor.value.copy(horizon);
      if (bloom !== undefined) material.uniforms.bloom.value = bloom;
    },

    /** Call after the renderer's size or pixel ratio changes. */
    resize() {
      renderer.getDrawingBufferSize(size);
      target.setSize(size.x, size.y);
      blurTarget?.setSize(Math.max(1, Math.round(size.x / 2)), Math.max(1, Math.round(size.y / 2)));
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
      if (halfRes) {
        renderer.setRenderTarget(blurTarget);
        renderer.clear();
        renderer.render(blurScene, quadCam);
      }
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
