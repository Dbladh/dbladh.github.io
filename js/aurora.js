// An aurora in the sky that dances to the house song. One full-sky shader on a big inverted sphere in the sky scene (the transparent canvas drawn behind the
// landscape), so hills, houses and billboards stand in front of it. It is driven by the song's spectrum (see audio.songSpectrum):
//   bass   -> glow, how high the curtains reach (bigger as the music builds) and a pulse on each beat
//   mids   -> how the curtains fold and sway, and how many rays there are
//   treble -> fine bright streaks and shimmer at the tops of the rays
//   colour -> follows how bright the sound is and how loud: green, teal, blue, violet, magenta, with a red fringe on the loudest
// It also lights the world a little: `colour` and `strength` (see `light`) are what the scene's lights, ground and pond take on.
import * as THREE from 'three';

const PAL = [[0.25, 1.0, 0.45], [0.12, 0.92, 0.78], [0.35, 0.55, 1.0], [0.72, 0.38, 1.0], [1.0, 0.3, 0.78], [1.0, 0.32, 0.42]];       // green, teal, blue, violet, magenta, red
export const auroraColour = (t, out = new THREE.Color()) => {
  const x = Math.min(0.9999, Math.max(0, t)) * (PAL.length - 1), i = Math.floor(x), f = x - i;
  return out.setRGB(PAL[i][0] + (PAL[i + 1][0] - PAL[i][0]) * f, PAL[i][1] + (PAL[i + 1][1] - PAL[i][1]) * f, PAL[i][2] + (PAL[i + 1][2] - PAL[i][2]) * f);
};

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform float uTime, uPS, uPR, uPF, uBass, uMid, uTreble, uEnergy, uCentroid, uBeat, uLevel, uDay, uHue, uLayers;
  float hsh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
  vec3 pal(float t) {
    t = clamp(t, 0.0, 0.9999) * 5.0; float i = floor(t), f = fract(t);
    vec3 a = vec3(0.25, 1.0, 0.45), b = vec3(0.12, 0.92, 0.78), c = vec3(0.35, 0.55, 1.0), d = vec3(0.72, 0.38, 1.0), e = vec3(1.0, 0.3, 0.78), g = vec3(1.0, 0.32, 0.42);
    vec3 s0 = i < 0.5 ? a : i < 1.5 ? b : i < 2.5 ? c : i < 3.5 ? d : e, s1 = i < 0.5 ? b : i < 1.5 ? c : i < 2.5 ? d : i < 3.5 ? e : g;
    return mix(s0, s1, f);
  }
  void main() {
    vec3 d = normalize(vDir);
    if (d.y < -0.02) discard;
    float az = atan(d.x, -d.z), el = d.y;                               // az: 0 straight ahead; el: height above the horizon (radians, about)
    vec3 acc = vec3(0.0); float a = 0.0;
    for (int k = 0; k < 3; k++) {
      if (float(k) >= uLayers) break;
      float fi = float(k);
      // the lower edge wanders slowly; the mids make the folds bigger and quicker
      float sway = (vn(vec2(az * 1.6 + fi * 9.0, uTime * (0.05 + 0.03 * fi) + fi * 4.0)) - 0.5) * (0.2 + 0.28 * uMid)
                 + sin(az * 3.2 + uPS + fi * 2.1) * (0.03 + 0.07 * uMid);
      float base = 0.2 + 0.1 * fi + sway;
      float reach = (0.34 + 0.62 * uBass + 0.3 * uEnergy + 0.05 * uBeat) * (1.0 - 0.18 * fi);      // how far up it goes: bigger with the music
      float h = (el - base) / reach;
      float body = smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.0, 1.0, h));
      float glow = pow(clamp(1.0 - h, 0.0, 1.0), 2.0) * body;                                          // brightest along the lower edge
      // vertical rays: noise across the sky, stretched up; more of them with the mids
      float rays = vn(vec2(az * (8.0 + 3.0 * uMid) + fi * 3.7, uPR + fi));
      rays = mix(0.5, 1.0, smoothstep(0.15, 0.9, rays));
      // fine streaks and shimmer from the highs
      float fine = vn(vec2(az * 40.0 + fi * 11.0, el * 5.0 - uPF));
      float spark = smoothstep(0.72, 0.95, fine) * uTreble * smoothstep(0.1, 0.9, h);
      float inten = (glow * rays * (0.5 + 0.75 * uBass + 0.22 * uBeat) + spark * 0.9 * body) * (1.1 - 0.25 * fi);
      float t = uHue + 0.33 * uCentroid + 0.3 * uEnergy + 0.32 * h * (0.4 + uEnergy) + fi * 0.11;
      acc += pal(t) * inten; a += inten;
    }
    vec3 col = acc / max(a, 0.001);
    a = clamp(a, 0.0, 1.0) * uLevel;
    col = mix(col, vec3(dot(col, vec3(0.33))), 0.4 * uDay) + 0.08 * uDay;               // by day: a softer, paler glow
    a *= 1.0 - 0.5 * uDay;
    a *= smoothstep(-0.02, 0.06, el);
    if (a < 0.003) discard;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
  }`;

export function createAurora(skyScene, camera, { low = false } = {}) {
  const U = { uTime: { value: 0 }, uPS: { value: 0 }, uPR: { value: 0 }, uPF: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uTreble: { value: 0 }, uEnergy: { value: 0 }, uCentroid: { value: 0 }, uBeat: { value: 0 },
    uLevel: { value: 0 }, uDay: { value: 0 }, uHue: { value: 0 }, uLayers: { value: low ? 2 : 3 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(250, 40, 24), mat);
  mesh.renderOrder = -11; mesh.frustumCulled = false; mesh.visible = false;      // (drawn first: the sun, moon and stars sit over it)
  skyScene.add(mesh);
  let level = 0, hue = 0;
  const sm = { bass: 0, mid: 0, treble: 0, energy: 0, centroid: 0, beat: 0 };                // (the song's levels, eased again here: the aurora should glide, not jitter)
  const TAU = { bass: 0.5, mid: 0.8, treble: 1.0, energy: 1.6, centroid: 3.0, beat: 0.45 };
  const colour = new THREE.Color(), tmp = new THREE.Color();
  const api = {
    /** The colour and strength (0..1) the aurora is casting on the world right now: the scene's lights, ground and pond take these. */
    colour, strength: 0,
    get level() { return level; },
    /**
     * Every frame. `spec`: audio.songSpectrum's result; `night` 0..1; `on`: is a song playing (the aurora fades in over about 2.5 s and out over 3 s).
     */
    update(dt, spec, night, on) {
      level += ((on ? 1 : 0) - level) * (1 - Math.exp(-dt * (on ? 1.2 : 1.0)));
      if (!on && level < 0.004) { level = 0; mesh.visible = false; api.strength = 0; return; }
      mesh.visible = true; mesh.position.copy(camera.position);
      hue = (hue + dt * 0.012) % 1;
      const wob = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2);                            // a slow drift so it never sits on one colour
      for (const k in sm) sm[k] += (spec[k] - sm[k]) * (1 - Math.exp(-dt / TAU[k]));
      U.uTime.value += dt * (0.4 + sm.energy * 0.3);
      U.uPS.value += dt * (0.16 + 0.3 * sm.mid); U.uPR.value += dt * (0.08 + 0.05 * sm.mid); U.uPF.value += dt * (0.35 + 0.9 * sm.treble);       // (the motions are added up frame by frame, so a change in the music changes their speed smoothly and never makes them jump)
      U.uBass.value = sm.bass; U.uMid.value = sm.mid; U.uTreble.value = sm.treble; U.uEnergy.value = sm.energy; U.uCentroid.value = sm.centroid; U.uBeat.value = sm.beat;
      U.uLevel.value = level; U.uDay.value = 1 - night; U.uHue.value = 0.06 * wob;
      // the colour it throws on the world: the middle of its palette at the moment, brightness following the loudness
      auroraColour(U.uHue.value + 0.33 * sm.centroid + 0.3 * sm.energy + 0.12, colour);
      api.strength = Math.min(0.62, level * (0.18 + 0.5 * sm.energy + 0.06 * sm.beat)) * (1 - 0.6 * (1 - night));
    },
    /** Tint the scene's lights, fog and (via `world.setAurora`) the ground and pond; call after sky.set each frame. */
    light(lights, world, lowEnd) {
      const s = api.strength;
      lights.hemi.intensity *= 1 - 0.3 * level;                                   // a little darker overall, so the aurora's own light is what you see
      if (s > 0.002) {
        lights.hemi.color.lerp(colour, Math.min(0.75, s * 1.4)); lights.hemi.intensity *= 1 + s * 1.1;
        lights.moon.color.lerp(colour, Math.min(0.7, s * 1.3)); lights.moon.intensity += s * 1.1;
        lights.fog.color.lerp(colour, Math.min(0.3, s * 0.5));
        lights.rim.color.copy(tmp.copy(colour).lerp(lights.rim.color, 0.25)); lights.rim.intensity = Math.max(lights.rim.intensity, level * s * 1.1);
      }
      world.setAurora(s > 0.002 && !lowEnd ? colour : null, s);
    },
  };
  return api;
}
