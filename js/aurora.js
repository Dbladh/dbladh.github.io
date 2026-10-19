// An aurora in the sky that dances to the house song. One full-sky shader on a big inverted sphere in the sky scene (the transparent canvas drawn behind the
// landscape), so hills, houses and billboards stand in front of it. It is driven by the song's spectrum (see audio.songSpectrum):
//   bass   -> glow, how high the curtains reach (bigger as the music builds) and a pulse on each beat
//   mids   -> how the curtains fold and sway, and how many rays there are
//   treble -> fine bright streaks and shimmer at the tops of the rays
//   colour -> follows how bright the sound is and how loud: green, teal, blue, violet, magenta, with a red fringe on the loudest
// It also lights the world a little: `colour` and `strength` (see `light`) are what the scene's lights, ground and pond take on.
import * as THREE from 'three';
import { SONG_RH, SONG_LH } from './notes.js?v=20261018230715';

const PAL = [[0.25, 1.0, 0.45], [0.12, 0.92, 0.78], [0.35, 0.55, 1.0], [0.72, 0.38, 1.0], [1.0, 0.3, 0.78], [1.0, 0.32, 0.42]];       // green, teal, blue, violet, magenta, red
const WARM_PAL = [[1.0, 0.88, 0.34], [1.0, 0.68, 0.22], [1.0, 0.46, 0.15], [1.0, 0.3, 0.12], [0.95, 0.2, 0.18], [1.0, 0.62, 0.3]];       // yellow, amber, orange, red-orange, red, soft orange
const HAZE = new THREE.Color('#ffb070'); let sweep = 0;
let WARM = 0;                                                         // 0 = the cool palette (greens, blues, magentas); 1 = the warm one (yellows, oranges, reds)
export const setWarm = (w) => { WARM = w; };
export const auroraColour = (t, out = new THREE.Color()) => {
  const x = Math.min(0.9999, Math.max(0, t)) * (PAL.length - 1), i = Math.floor(x), f = x - i, m = (P, c) => P[i][c] + (P[i + 1][c] - P[i][c]) * f;
  return out.setRGB(m(PAL, 0) + (m(WARM_PAL, 0) - m(PAL, 0)) * WARM, m(PAL, 1) + (m(WARM_PAL, 1) - m(PAL, 1)) * WARM, m(PAL, 2) + (m(WARM_PAL, 2) - m(PAL, 2)) * WARM);
};

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform float uWarm; uniform float uTime, uPS, uPR, uPF, uBass, uMid, uTreble, uEnergy, uCentroid, uBeat, uLevel, uDay, uHue, uLayers, uStr;
  float hsh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
  vec3 pal(float t) {
    t = clamp(t, 0.0, 0.9999) * 5.0; float i = floor(t), f = fract(t);
    vec3 a = vec3(0.25, 1.0, 0.45), b = vec3(0.12, 0.92, 0.78), c = vec3(0.35, 0.55, 1.0), d = vec3(0.72, 0.38, 1.0), e = vec3(1.0, 0.3, 0.78), g = vec3(1.0, 0.32, 0.42);
    vec3 s0 = i < 0.5 ? a : i < 1.5 ? b : i < 2.5 ? c : i < 3.5 ? d : e, s1 = i < 0.5 ? b : i < 1.5 ? c : i < 2.5 ? d : i < 3.5 ? e : g;
    vec3 cool = mix(s0, s1, f);
    vec3 wa = vec3(1.0, 0.88, 0.34), wb = vec3(1.0, 0.68, 0.22), wc = vec3(1.0, 0.46, 0.15), wd = vec3(1.0, 0.3, 0.12), we = vec3(0.95, 0.2, 0.18), wg = vec3(1.0, 0.62, 0.3);
    vec3 w0 = i < 0.5 ? wa : i < 1.5 ? wb : i < 2.5 ? wc : i < 3.5 ? wd : we, w1 = i < 0.5 ? wb : i < 1.5 ? wc : i < 2.5 ? wd : i < 3.5 ? we : wg;
    return mix(cool, mix(w0, w1, f), uWarm);
  }
  void main() {
    vec3 d = normalize(vDir);
    if (d.y < -0.02) discard;
    float az = atan(d.x, -d.z), el = d.y;                               // az: 0 straight ahead; el: height above the horizon (radians, about)
    vec3 acc = vec3(0.0); float a = 0.0;
    for (int k = 0; k < 3; k++) {
      float lw = clamp(uLayers - float(k), 0.0, 1.0);                  // (a curtain fades in as the count rises, so none pops)
      if (lw <= 0.0) break;
      float fi = float(k);
      // the lower edge wanders slowly; the mids make the folds bigger and quicker
      float sway = (vn(vec2(az * 1.6 + fi * 9.0, uTime * (0.05 + 0.03 * fi) + fi * 4.0)) - 0.5) * (0.2 + 0.28 * uMid)
                 + sin(az * 3.2 + uPS + fi * 2.1) * (0.03 + 0.07 * uMid);
      float base = 0.2 + 0.1 * fi + sway;
      float reach = (0.34 + 0.62 * uBass + 0.3 * uEnergy + 0.05 * uBeat + 0.3 * uStr) * (1.0 - 0.18 * fi);      // how far up it goes: bigger with the music
      float h = (el - base) / reach;
      float body = smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.0, 1.0, h));
      float glow = pow(clamp(1.0 - h, 0.0, 1.0), 2.0) * body;                                          // brightest along the lower edge
      // vertical rays: noise across the sky, stretched up; more of them with the mids
      float rays = vn(vec2(az * (8.0 + 3.0 * uMid) + fi * 3.7, uPR + fi));
      rays = mix(0.5, 1.0, smoothstep(0.15, 0.9, rays));
      // fine streaks and shimmer from the highs
      float fine = vn(vec2(az * 40.0 + fi * 11.0, el * 5.0 - uPF));
      float spark = smoothstep(0.72, 0.95, fine) * uTreble * smoothstep(0.1, 0.9, h);
      float inten = (glow * rays * (0.5 + 0.75 * uBass + 0.22 * uBeat) + spark * 0.9 * body) * (1.1 - 0.25 * fi) * lw * (1.0 + 0.7 * uStr);
      float t = uHue + 0.33 * uCentroid + 0.3 * uEnergy + 0.32 * h * (0.4 + uEnergy) + fi * 0.11;
      acc += pal(t) * inten; a += inten;
    }
    vec3 col = acc / max(a, 0.001);
    a = clamp(a, 0.0, 1.0) * 0.6 * uLevel;                                              // (see-through: the song's stars behind it shine through)
    col = mix(col, vec3(dot(col, vec3(0.33))), 0.4 * uDay) + 0.08 * uDay;               // by day: a softer, paler glow
    a *= 1.0 - 0.5 * uDay;
    a *= smoothstep(-0.02, 0.06, el);
    if (a < 0.003) discard;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
  }`;

export function createAurora(skyScene, camera, { low = false, scene = skyScene } = {}) {
  const U = { uWarm: { value: 0 }, uTime: { value: 0 }, uPS: { value: 0 }, uPR: { value: 0 }, uPF: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uTreble: { value: 0 }, uEnergy: { value: 0 }, uCentroid: { value: 0 }, uBeat: { value: 0 },
    uLevel: { value: 0 }, uDay: { value: 0 }, uHue: { value: 0 }, uLayers: { value: low ? 2 : 3 }, uStr: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(250, 40, 24), mat);
  mesh.renderOrder = -11; mesh.frustumCulled = false; mesh.visible = false;      // (drawn first: the sun, moon and stars sit over it)
  skyScene.add(mesh);
  // A rare shooting star: a thin streak that crosses the upper sky now and then while the song plays (one small quad, drawn in the sky canvas).
  const star = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uA; varying vec2 vUv; void main() { float v = abs(vUv.y * 2.0 - 1.0); float a = pow(vUv.x, 3.0) * (1.0 - v * v) * smoothstep(1.0, 0.55, v + 0.0) * uA; if (a < 0.004) discard; gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * 1.6, clamp(a * 1.8, 0.0, 1.0)); }',
  }));
  star.renderOrder = 5; star.frustumCulled = false; star.visible = false; scene.add(star);
  let starT = -1, starNext = 9, sx = 0, sy = 0; const sq = new THREE.Quaternion(), sz = new THREE.Quaternion(), sv = new THREE.Vector3();
  const starTick = (dt) => {
    starNext -= dt;
    if (starT < 0) { if (starNext > 0 || level < 0.8) { star.visible = false; return; } starT = 0; sx = 0.1 + Math.random() * 0.7; sy = 0.6 + Math.random() * 0.35; }
    starT += dt / 1.4; if (starT >= 1) { starT = -1; starNext = 14 + Math.random() * 16; star.visible = false; return; }
    const d = 200, hh = d * Math.tan(camera.fov * Math.PI / 360), hw = hh * camera.aspect, ang = Math.PI + 0.38;
    const e = 1 - (1 - starT) * (1 - starT), dx = Math.cos(ang), dy = Math.sin(ang), len = 0.2 * hw, run = 0.65 * hw * e;
    const hx = sx * hw + dx * run, hy = sy * hh + dy * run;
    sv.set(hx - dx * len / 2, hy - dy * len / 2, -d).applyQuaternion(camera.quaternion).add(camera.position); star.position.copy(sv);
    sq.copy(camera.quaternion); sz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang); star.quaternion.copy(sq.multiply(sz));
    star.scale.set(len, Math.max(0.6, hh * 0.012), 1);
    star.material.uniforms.uA.value = Math.pow(Math.sin(Math.PI * starT), 0.8) * level; star.visible = true;
  };
  // The meteors follow the clarinet solo (0:36 to 1:26): each of its notes sends one streak across the sky, running for as long as the note is held (a short note is a quick streak, a long one a slow
  // stream), higher in the sky for a higher note, all running the same way like a real shower. They are warm-coloured and come from a small pool of one-quad streaks.
  const METEORS = 7, ms = [];
  for (let i = 0; i < METEORS; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color(1, 0.8, 0.5) } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; uniform vec3 uC; varying vec2 vUv; void main() { float v = abs(vUv.y * 2.0 - 1.0); float a = pow(vUv.x, 3.0) * (1.0 - v * v) * smoothstep(1.0, 0.55, v) * uA; if (a < 0.004) discard; gl_FragColor = vec4(mix(uC, vec3(1.0), pow(vUv.x, 6.0)) * 1.7, clamp(a * 1.8, 0.0, 1.0)); }',
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.renderOrder = 5; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    ms.push({ mesh, t: -1, sx: 0, sy: 0, ang: 0, len: 0, run: 0, amp: 1, dur: 1 });
  }
  let lastNote = -1;
  const MCOL = [new THREE.Color(1, 0.62, 0.3), new THREE.Color(1, 0.78, 0.42), new THREE.Color(1, 0.5, 0.28), new THREE.Color(1, 0.9, 0.62)];
  const launch = (dur, pitch, vel) => {
    const m = ms.find((q) => q.t < 0); if (!m) return;
    m.t = 0; m.amp = vel; m.dur = Math.max(0.5, dur); m.ang = Math.PI + 0.5 + (Math.random() - 0.5) * 0.08;
    m.run = Math.min(1.15, 0.4 + 0.3 * dur); m.len = 0.2 + 0.1 * vel;
    const lo = Math.max(-0.2, -1 + 0.87 * m.run); m.sx = lo + Math.random() * (1.0 - lo);              // (starts at the right, runs down to the left, and stays on screen)
    m.sy = Math.min(1.1, Math.max(0.45, 0.5 + (pitch - 51) / 20 * 0.55 + (Math.random() - 0.5) * 0.1));  // (a higher note, a higher streak)
    m.mesh.material.uniforms.uC.value.copy(MCOL[(Math.random() * MCOL.length) | 0]);
  };
  const meteorTick = (dt, bp, notes) => {
    if (notes && notes.clN !== lastNote) { if (lastNote >= 0 && notes.clN - lastNote === 1 && notes.clDur > 0 && level > 0.5) launch(notes.clDur, notes.clPitch, notes.clVel); lastNote = notes.clN; }
    const d = 200, hh = d * Math.tan(camera.fov * Math.PI / 360), hw = hh * camera.aspect;
    for (const m of ms) {
      if (m.t === -1) { m.mesh.visible = false; continue; }
      m.t += dt / m.dur;
      if (m.t >= 1) { m.t = -1; m.mesh.visible = false; continue; }
      if (m.t < 0) { m.mesh.visible = false; continue; }                                        // (waiting out its small delay)
      const e = 0.4 * (1 - (1 - m.t) * (1 - m.t)) + 0.6 * m.t, dx = Math.cos(m.ang), dy = Math.sin(m.ang), len = m.len * hw, run = m.run * hw * e;
      sv.set(m.sx * hw + dx * run - dx * len / 2, m.sy * hh + dy * run - dy * len / 2, -d).applyQuaternion(camera.quaternion).add(camera.position); m.mesh.position.copy(sv);
      sq.copy(camera.quaternion); sz.setFromAxisAngle(zAxis, m.ang); m.mesh.quaternion.copy(sq.multiply(sz));
      m.mesh.scale.set(len, Math.max(0.9, hh * 0.02 * (0.6 + 0.5 * m.amp)), 1);
      m.mesh.material.uniforms.uA.value = Math.min(1, m.t * 7) * Math.min(1, (1 - m.t) * 4) * (0.6 + 0.5 * m.amp) * level;     // (it lights quickly, holds while the note is held, then fades)
      m.mesh.visible = true;
    }
  };
  const zAxis = new THREE.Vector3(0, 0, 1);
  let level = 0, hue = 0, harm = 0, strs = 0;                                  // (harm: the colour the current chord pulls the aurora towards, eased)
  const colour = new THREE.Color();

  // The song's stars: every pitch the song plays (29 of them) owns 3 or 4 stars scattered over the sky (4 for the most-played notes, about a hundred in all); each star shines dimly until its
  // note sounds, then flares with a sparkle and fades back as the note dies away. Higher notes sit higher in the sky and further right. They are drawn in the sky layer before the aurora, so its glow
  // passes over them and they shine through. Everything is added up frame by frame in one Points draw.
  const counts = new Map(); for (const n of [...SONG_RH, ...SONG_LH]) counts.set(n[1], (counts.get(n[1]) || 0) + 1);
  const pitches = [...counts.keys()].sort((p, q) => p - q), starP = [], starPos = [], starSeed = [], starRank = [];
  const hash = (k) => { const h = Math.sin(k * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };
  pitches.forEach((p, pi) => {
    const u = pi / (pitches.length - 1), k = counts.get(p) >= 12 ? 4 : 3;
    for (let j = 0; j < k; j++) {
      const r1 = hash(p * 7.3 + j * 1.9), r2 = hash(p * 3.1 + j * 5.7), r3 = hash(p * 9.7 + j * 2.3);
      starP.push(p); starRank.push(u); starSeed.push(r3);
      starPos.push(Math.max(-0.95, Math.min(0.95, (u * 2 - 1) * 0.45 + (r1 - 0.5) * 1.6)), 0.08 + u * 0.6 + r2 * 0.3, 0);
    }
  });
  const NS = starP.length, starEnv = new Float32Array(NS);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starPos), 3));
  sGeo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(starSeed), 1));
  sGeo.setAttribute('aRank', new THREE.BufferAttribute(new Float32Array(starRank), 1));
  sGeo.setAttribute('aEnv', new THREE.BufferAttribute(starEnv, 1));
  const SU = { uA: { value: 0 }, uT: { value: 0 }, uHH: { value: 1 }, uAsp: { value: 1.6 }, uK: { value: 1 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() } };
  const starsMat = new THREE.ShaderMaterial({
    uniforms: SU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `
      uniform float uA, uT, uHH, uAsp, uK; attribute float aSeed, aRank, aEnv; varying float vE, vSeed, vRank;
      void main() {
        float t = uT, drift = 0.012 * sin(t * 0.3 + aSeed * 40.0);                                  // (each star floats a little, as if in a dream)
        vec3 p = vec3((position.x + drift + 0.008 * sin(t * 0.5 + aSeed * 17.0)) * uHH * uAsp, (position.y + 0.014 * sin(t * 0.4 + aSeed * 23.0)) * uHH, -200.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vE = aEnv; vSeed = aSeed; vRank = aRank;
        gl_PointSize = (14.0 + 70.0 * aEnv * (0.8 + 0.4 * aSeed)) * uK;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uA, uT; uniform vec3 uC1, uC2; varying float vE, vSeed, vRank;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
        float core = exp(-r2 * 26.0), halo = exp(-r2 * 5.0);
        float spike = exp(-abs(q.x) * 26.0) * exp(-abs(q.y) * 3.0) + exp(-abs(q.y) * 26.0) * exp(-abs(q.x) * 3.0);
        float idle = 0.34 + 0.1 * sin(uT * 0.7 + vSeed * 50.0);                                    // (a faint twinkle while its note is silent)
        float lit = vE * vE * (3.0 - 2.0 * vE);
        vec3 base = mix(uC1, uC2, vRank);
        vec3 col = mix(base, vec3(1.0), 0.15 + 0.6 * lit);
        float a = (core * (idle + 1.8 * lit) + halo * (0.1 + 0.7 * lit) + spike * (0.1 + 0.9 * lit)) * uA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, min(a, 1.0));
      }`,
  });
  const starsMesh = new THREE.Points(sGeo, starsMat);
  starsMesh.renderOrder = -12; starsMesh.frustumCulled = false; starsMesh.visible = false; skyScene.add(starsMesh);
  let starsA = 0, starsT = 0;
  const starsTick = (dt, notes, on) => {
    const want = on && notes && notes.pe && level > 0.3 ? 1 : 0;
    starsA += (want - starsA) * (1 - Math.exp(-dt * (want ? 0.7 : 1.2)));
    if (starsA < 0.004) { starsMesh.visible = false; return; }
    starsMesh.position.copy(camera.position); starsMesh.quaternion.copy(camera.quaternion);
    for (let i = 0; i < NS; i++) starEnv[i] = Math.min(1, notes.pe[starP[i]]);
    sGeo.attributes.aEnv.needsUpdate = true;
    starsT += dt; SU.uT.value = starsT; SU.uHH.value = 200 * Math.tan(camera.fov * Math.PI / 360); SU.uAsp.value = camera.aspect;
    SU.uK.value = Math.max(0.5, Math.min(1.6, (typeof innerHeight === 'number' ? innerHeight : 800) * Math.min(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) / 800));
    SU.uA.value = starsA * (0.6 + 0.4 * level);
    SU.uC1.value.copy(colour); auroraColour((U.uHue.value + 0.5) % 1, SU.uC2.value); SU.uC2.value.lerp(colour, 0.2);
    starsMesh.visible = true;
  };
  const sm = { bass: 0, mid: 0, treble: 0, energy: 0, centroid: 0, beat: 0 };                // (the song's levels, eased again here: the aurora should glide, not jitter)
  const TAU = { bass: 0.5, mid: 0.8, treble: 1.0, energy: 1.6, centroid: 3.0, beat: 0.45 };
  const tmp = new THREE.Color();
  const api = {
    /** The colour and strength (0..1) the aurora is casting on the world right now: the scene's lights, ground and pond take these. */
    colour, strength: 0, sm,
    get level() { return level; },
    /** How many curtains (0..3, fractional: the last one fades in); the song's quiet opening shows fewer. */
    set layers(n) { U.uLayers.value = Math.min(low ? 2 : 3, n); },
    /**
     * Every frame. `spec`: audio.songSpectrum's result; `night` 0..1; `on`: is a song playing (the aurora fades in over about 2.5 s and out over 3 s).
     */
    update(dt, spec, night, on, beatPos = -1, notes = null) {
      level += ((on ? 1 : 0) - level) * (1 - Math.exp(-dt * (on ? 0.6 : 0.5)));
      if (!on && level < 0.004) { level = 0; starsMesh.visible = false; starsA = 0; mesh.visible = false; star.visible = false; starT = -1; for (const m of ms) { m.t = -1; m.mesh.visible = false; } api.strength = 0; return; }
      mesh.visible = true; mesh.position.copy(camera.position); starTick(dt); meteorTick(dt, beatPos, notes);
      hue = (hue + dt * 0.012) % 1; U.uWarm.value = WARM; sweep += dt * 0.09;
      const wob = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2);                            // a slow drift so it never sits on one colour
      for (const k in sm) sm[k] += (spec[k] - sm[k]) * (1 - Math.exp(-dt / TAU[k]));
      U.uTime.value += dt * (0.4 + sm.energy * 0.3);
      U.uPS.value += dt * (0.16 + 0.3 * sm.mid); U.uPR.value += dt * (0.08 + 0.05 * sm.mid); U.uPF.value += dt * (0.35 + 0.9 * sm.treble);       // (the motions are added up frame by frame, so a change in the music changes their speed smoothly and never makes them jump)
      U.uBass.value = sm.bass; U.uMid.value = sm.mid; U.uTreble.value = sm.treble; U.uEnergy.value = sm.energy; U.uCentroid.value = sm.centroid; U.uBeat.value = sm.beat;
      if (notes && notes.chord >= 0) {                                              // the chord sets the mood: major leans to the greens and teals, minor to the blues and violets, and the root moves it a little round that range (a circle of fifths, so close chords look alike)
        const fifths = ((notes.root * 7) % 12) / 12, target = notes.minor ? 0.16 + 0.12 * fifths : -0.1 + 0.12 * fifths;
        harm += (target - harm) * (1 - Math.exp(-dt / 1.4));
      } else harm += (0 - harm) * (1 - Math.exp(-dt / 1.4));
      strs += ((notes ? notes.st : 0) - strs) * (1 - Math.exp(-dt / 0.5)); U.uStr.value = strs;                   // (the strings: the curtains rise higher and glow stronger as the pad swells)
      U.uLevel.value = level; U.uDay.value = 1 - night; U.uHue.value = 0.06 * wob + harm;
      // the colour it throws on the world: the middle of its palette at the moment, brightness following the loudness
      auroraColour(U.uHue.value + 0.33 * sm.centroid + 0.3 * sm.energy + 0.12, colour);
      starsTick(dt, notes, on);
      api.strength = Math.min(0.62, level * (0.18 + 0.5 * sm.energy + 0.06 * sm.beat + 0.12 * strs)) * (1 - 0.6 * (1 - night));
    },
    /** Tint the scene's lights, fog and (via `world.setAurora`) the ground and pond; call after sky.set each frame. */
    light(lights, world, lowEnd) {
      const s = api.strength;
      if (s > 0.002) {
        lights.hemi.color.lerp(colour, Math.min(0.75, s * 1.4)); lights.hemi.intensity *= 1 + s * 1.1;
        lights.moon.color.lerp(colour, Math.min(0.7, s * 1.3)); lights.moon.intensity += s * 1.1;
        lights.fog.color.lerp(colour, Math.min(0.3, s * 0.5));
        if (WARM > 0.002) { lights.fog.color.lerp(HAZE, 0.4 * WARM); lights.hemi.color.lerp(HAZE, 0.25 * WARM); }       // the warm passage: a soft golden haze in the air
        lights.rim.position.set(Math.sin(sweep) * 120, 36 + Math.sin(sweep * 0.7 + 1) * 10, -150);                      // the edge light drifts slowly across behind the village, so the rims of the hills and roofs sweep
        lights.rim.color.copy(colour); lights.rim.intensity = level * (1.5 + 3.8 * s);        // from behind the village: the crests and edges of the hills, trees and roofs catch it
      }
      world.setAurora(s > 0.002 && !lowEnd ? colour : null, s);
    },
  };
  return api;
}
