// Time of day: one number (hour 0-24) drives the sky gradient (CSS), sun/moon,
// lights, fog and star visibility. The sky itself is a CSS gradient on <body>,
// which lets the big "Danny Bladh" title sit *behind* the 3D hills.
import * as THREE from 'three';

// hour, sky top, sky bottom (horizon), sun color, sun intensity, hemisphere intensity
const KEYS = [
  { h: 0,    top: '#16206a', bot: '#5a4a9a', sun: '#9fb8ff', sunI: 0.0, hemi: 0.55 },
  { h: 5,    top: '#3a3f9a', bot: '#c07ab8', sun: '#d2b0ff', sunI: 0.15, hemi: 0.6 },
  { h: 6.5,  top: '#5a8cf0', bot: '#ffb48a', sun: '#ffb06a', sunI: 0.75, hemi: 0.7 },
  { h: 9,    top: '#3f9af8', bot: '#c8ecff', sun: '#fff1cc', sunI: 1.15, hemi: 0.85 },
  { h: 13,   top: '#2f86ff', bot: '#bfe8ff', sun: '#fff6df', sunI: 1.25, hemi: 0.9 },
  { h: 16,   top: '#4a8cf0', bot: '#ffe0a8', sun: '#ffd88a', sunI: 1.15, hemi: 0.8 },
  { h: 17.5, top: '#5f86e0', bot: '#ffc27a', sun: '#ffb347', sunI: 1.0, hemi: 0.72 },
  { h: 19,   top: '#7a58c8', bot: '#ff9a7a', sun: '#ff8a4c', sunI: 0.7, hemi: 0.62 },
  { h: 20.5, top: '#2c3a8a', bot: '#8a5cb0', sun: '#a08ae0', sunI: 0.15, hemi: 0.55 },
  { h: 24,   top: '#16206a', bot: '#5a4a9a', sun: '#9fb8ff', sunI: 0.0, hemi: 0.55 },
];

// The original, dimmer look, kept for A/B comparison with ?look=classic.
const KEYS_CLASSIC = [
  { h: 0,    top: '#0b1030', bot: '#2a2f66', sun: '#8fa8ff', sunI: 0.0, hemi: 0.35 },
  { h: 5,    top: '#2a2f78', bot: '#7a5aa8', sun: '#b9a0ff', sunI: 0.1, hemi: 0.4 },
  { h: 6.5,  top: '#6a7fe0', bot: '#ffb0a0', sun: '#ffb27a', sunI: 0.6, hemi: 0.55 },
  { h: 9,    top: '#5aa0f0', bot: '#d6ecfa', sun: '#fff3d6', sunI: 1.1, hemi: 0.75 },
  { h: 13,   top: '#3f8cf0', bot: '#cfe9fb', sun: '#fff8e8', sunI: 1.25, hemi: 0.85 },
  { h: 17,   top: '#5a8fe0', bot: '#ffd9a6', sun: '#ffcf8a', sunI: 1.0, hemi: 0.7 },
  { h: 19,   top: '#6a4fb8', bot: '#ff8f6a', sun: '#ff8a5c', sunI: 0.55, hemi: 0.5 },
  { h: 20.5, top: '#1c2058', bot: '#5a3c78', sun: '#8f7fd0', sunI: 0.05, hemi: 0.38 },
  { h: 24,   top: '#0b1030', bot: '#2a2f66', sun: '#8fa8ff', sunI: 0.0, hemi: 0.35 },
];
let KEYS_ACTIVE = KEYS;

const _a = new THREE.Color();
const _b = new THREE.Color();

function sample(hour) {
  let i = 0;
  while (i < KEYS_ACTIVE.length - 2 && hour > KEYS_ACTIVE[i + 1].h) i++;
  const k0 = KEYS_ACTIVE[i], k1 = KEYS_ACTIVE[i + 1];
  const f = THREE.MathUtils.clamp((hour - k0.h) / (k1.h - k0.h), 0, 1);
  const mix = (key) => _a.set(k0[key]).lerp(_b.set(k1[key]), f).clone();
  return {
    top: mix('top'), bot: mix('bot'), sun: mix('sun'),
    sunI: THREE.MathUtils.lerp(k0.sunI, k1.sunI, f),
    hemi: THREE.MathUtils.lerp(k0.hemi, k1.hemi, f),
  };
}

/**
 * @param {THREE.Scene} scene     main scene (terrain etc.): fog and the real lights live here
 * @param {THREE.Scene} skyScene  separate scene drawn on a canvas *behind* the title text:
 *                                 sun, moon, stars and clouds
 */
export function createSky(scene, skyScene, renderer, { classic = false } = {}) {
  if (classic) KEYS_ACTIVE = KEYS_CLASSIC;
  const fog = classic ? new THREE.Fog(0xcfe9fb, 60, 230) : new THREE.Fog(0xcfe9fb, 48, 215);
  scene.fog = fog;

  // Sky-tinted fill from above, warm grass bounce from below.
  const hemi = new THREE.HemisphereLight(0xffffff, classic ? 0x8aa860 : 0xa8c470, 0.8);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0);
  scene.add(hemi, sunLight, sunLight.target, moonLight, moonLight.target);
  // Rim light: a weak, shadowless light from behind the village so tree, roof and hill silhouettes
  // pick up a bright edge against the haze.
  const rimLight = new THREE.DirectionalLight(0xffffff, 0);
  scene.add(rimLight, rimLight.target);
  rimLight.target.position.set(0, 3, -30);
  rimLight.layers.enable(1);
  // Lights must be on layer 1 as well: the sharp billboard pass renders only layer 1, and lights
  // that are not visible to the camera's layers would leave the (lit) signs black.
  [hemi, sunLight, moonLight].forEach((l) => l.layers.enable(1));

  // The sun casts soft shadows over the area in front of the camera.
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -100; sc.right = 100; sc.top = 100; sc.bottom = -100; sc.near = 1; sc.far = 420;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.06;
  sunLight.shadow.radius = 3;
  sunLight.target.position.set(0, 0, -38);

  // Bigger sun and moon, each with a soft additive halo.
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (let i = 0; i <= 40; i++) {                       // a smooth gaussian-like falloff that is eased all the way to nothing at the edge, so the glow has no visible rim
      const r = i / 40, e = Math.min(1, Math.max(0, (r - 0.3) / 0.7)), fade = 1 - e * e * (3 - 2 * e);
      gr.addColorStop(r, `rgba(255,255,255,${(0.95 * Math.exp(-r * r * 4.5) * fade * fade).toFixed(4)})`);
    }
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const halo = (color, scale, opacity) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(scale);
    sp.renderOrder = -10;
    return sp;
  };
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(10, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false, transparent: true, depthTest: false, depthWrite: false }),
  );
  sunMesh.renderOrder = -10;   // behind everything else in this layer, whatever its distance
  sunMesh.add(halo(0xffd890, 64, 0.5));
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(7, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false, transparent: true, depthTest: false, depthWrite: false }),
  );
  moonMesh.renderOrder = -10;
  moonMesh.add(halo(0xaec4ff, 42, 0.35));
  skyScene.add(sunMesh, moonMesh);

  // Stars: points on a big upper hemisphere, faded in at night.
  const N = 450;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(Math.random() * 0.9 + 0.1);
    const r = 280;
    pos[i * 3] = Math.cos(u) * Math.sin(v) * r;
    pos[i * 3 + 1] = Math.cos(v) * r;
    pos[i * 3 + 2] = Math.sin(u) * Math.sin(v) * r - 40;
  }
  // Each star gets its own twinkle: a phase and speed, a brightness and a size, plus a rare sparkle.
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const seed = new Float32Array(N), size = new Float32Array(N), tint = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    seed[i] = Math.random();
    size[i] = Math.random() < 0.15 ? 4.0 + Math.random() * 2.0 : 2.4 + Math.random() * 1.6; // a few bright ones
    const warm = Math.random();
    tint.set([1.0, 0.92 + 0.08 * (1 - warm), 0.82 + 0.18 * (1 - warm) + 0.0], i * 3);       // white to pale gold...
    if (Math.random() < 0.35) tint.set([0.78, 0.88, 1.0], i * 3);                          // ...and some pale blue
  }
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio || 1, 1.5) }, uTwinkle: { value: reduce ? 0 : 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uPx, uTwinkle;
      attribute float aSeed, aSize; attribute vec3 aTint;
      varying vec3 vTint; varying float vBright;
      void main() {
        float speed = 0.7 + aSeed * 2.4;
        float ph = aSeed * 62.8;
        float slow = 0.5 + 0.5 * sin(uTime * speed + ph);                 // gentle breathing
        float fast = 0.5 + 0.5 * sin(uTime * speed * 3.1 + ph * 1.7);     // quicker flutter
        float spark = pow(0.5 + 0.5 * sin(uTime * (0.35 + aSeed) + ph * 2.3), 10.0);   // rare bright flash
        float tw = mix(0.95, 0.4 + 0.5 * slow + 0.25 * fast + 0.7 * spark, uTwinkle);
        vBright = tw;
        vTint = aTint;
        gl_PointSize = aSize * uPx * mix(1.0, 0.75 + 0.35 * tw, uTwinkle);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying vec3 vTint; varying float vBright;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        float core = 1.0 - smoothstep(0.0, 1.0, r);
        float a = clamp((core * 1.25 + exp(-r * r * 5.0) * 0.7) * vBright * uNight, 0.0, 1.0);
        if (a < 0.004) discard;
        gl_FragColor = vec4(vTint, a);
      }`,
  });
  starMat.onBeforeRender = () => { starMat.uniforms.uTime.value = performance.now() / 1000; };
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  skyScene.add(stars);

  // The sky layer has its own (matching) lights so clouds shade correctly day and night.
  const skyHemi = new THREE.HemisphereLight(0xffffff, 0x8aa0c0, 0.8);
  const skySun = new THREE.DirectionalLight(0xffffff, 1);
  skyScene.add(skyHemi, skySun);
  skyScene.fog = fog;

  // ---- Reflection environment: a little sky-gradient dome (plus a bright sun) that is baked
  // into a PMREM map, so glass and roofs pick up the current sky. Rebuilt as the hour moves.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envGeo = new THREE.SphereGeometry(50, 32, 20);
  const envCol = new Float32Array(envGeo.attributes.position.count * 3);
  envGeo.setAttribute('color', new THREE.BufferAttribute(envCol, 3));
  envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  envScene.add(envSun);
  const envGround = new THREE.Color('#6f9a5c');
  let envTarget = null, envHour = -99;
  const _c = new THREE.Color();

  let envAt = 0;
  const _sunTrue = new THREE.Vector3();
  function updateEnv(hour, s, sunPos, night, dim = 0) {
    const dh = ((hour - envHour + 36) % 24) - 12;                          // signed hour difference, midnight-safe
    if (Math.abs(dh) < 0.8 && envTarget) return;                           // close enough: reuse the reflection map
    if (envTarget && dim > 0.01 && dim < 0.99) return;                      // (while a house song is moving the scene into or out of the night the map is left alone: it is rebuilt once the change has settled)
    const nowMs = performance.now();
    if (envTarget && nowMs - envAt < 1600) return;                          // (building the map is costly: while the hour is racing, as when a house song changes the time of day, it is rebuilt at most about every 1.6 s)
    envAt = nowMs;
    envHour = hour;
    const pos = envGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ny = pos.getY(i) / 50;
      if (ny >= 0) _c.copy(s.bot).lerp(s.top, THREE.MathUtils.smoothstep(ny, 0, 0.85));
      else _c.copy(s.bot).lerp(envGround, THREE.MathUtils.smoothstep(-ny, 0, 0.5));
      envCol[i * 3] = _c.r; envCol[i * 3 + 1] = _c.g; envCol[i * 3 + 2] = _c.b;
    }
    envGeo.attributes.color.needsUpdate = true;
    envSun.position.copy(sunPos).setLength(38);
    envSun.material.color.copy(s.sun).multiplyScalar(THREE.MathUtils.lerp(4, 0.15, night)); // HDR glint by day
    const target = pmrem.fromScene(envScene, 0.02);
    envTarget?.dispose();
    envTarget = target;
    scene.environment = target.texture;
  }

  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  /** Apply an hour (0-24). Returns { night } in 0..1 so other objects can react. */
  const warmDark = [new THREE.Color('#33100a'), new THREE.Color('#5a1e0c')];
  // The oval the sun and moon travel (they sit at opposite ends of it). Its half-width is fitted to the screen's width, so on a tall, narrow phone screen the whole oval still fits.
  const SKY_LIFT = 30, SKY_AMP = 45, ORBIT_Z = -95, orbit = { halfW: 70 };
  /** Fit the orbit to the view: `aspect` is width / height, `fov` the camera's vertical field of view in degrees. */
  // The dotted line shown while the time is being dragged is drawn here, in the sky layer, just before the sun and moon, so the real sun and moon pass in front of it (the sky canvas sits behind the
  // landscape, so the part of the line behind the hills is hidden, as the sun and moon are).
  const ORBIT_N = 120, orbitGeo = new THREE.BufferGeometry(), orbitArr = new Float32Array(ORBIT_N * 3), orbitU = { uA: { value: 0 } }, _ov = new THREE.Vector3();
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitArr, 3));
  const orbitDots = new THREE.Points(orbitGeo, new THREE.ShaderMaterial({
    uniforms: orbitU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 10.0; }',
    fragmentShader: 'uniform float uA; void main() { float r = length(gl_PointCoord * 2.0 - 1.0); float core = smoothstep(0.6, 0.38, r), halo = smoothstep(1.0, 0.45, r) * 0.6; float a = max(core, halo) * uA; if (a < 0.01) discard; gl_FragColor = vec4(mix(vec3(0.08, 0.08, 0.2), vec3(1.0), core), a); }',
  }));
  orbitDots.renderOrder = -11; orbitDots.frustumCulled = false; orbitDots.visible = false; skyScene.add(orbitDots);
  function fillOrbit() { for (let i = 0; i < ORBIT_N; i++) { orbitPoint((i / ORBIT_N) * 24 + 6, _ov); orbitArr.set([_ov.x, _ov.y, _ov.z], i * 3); } orbitGeo.attributes.position.needsUpdate = true; }
  /** 0..1: how strongly the dotted orbit of the sun and moon is shown (while the time is dragged). */
  function setOrbitAlpha(a) { orbitU.uA.value = a; orbitDots.visible = a > 0.01; }
  let hintV = 0, hoverSun = 0, hoverMoon = 0;
  /** 0..1 for each: how much the pointer is over the sun / moon (its glow swells and the disc grows a little). */
  function setHover(sun, moon) { hoverSun = sun; hoverMoon = moon; }
  /** 0..1: how strongly the sun's and moon's glow is swelling (a hint that they can be dragged). */
  function setHint(v) { hintV = v; }
  function setView(aspect, fov) { orbit.halfW = THREE.MathUtils.clamp(-ORBIT_Z * Math.tan((fov * Math.PI) / 360) * aspect * 0.82, 28, 70); fillOrbit(); }
  /** Where the sun is on the oval at `hour` (the moon is on the opposite side), written into `out`. */
  function orbitPoint(hour, out) { const a = ((hour - 6) / 12) * Math.PI; return out.set(Math.cos(a) * orbit.halfW, SKY_LIFT + SKY_AMP * Math.sin(a), ORBIT_Z); }
  function set(hour, dim = 0, warm = 0) {
    const s = sample(((hour % 24) + 24) % 24);
    if (dim > 0) {
      s.top.multiplyScalar(1 - 0.94 * dim); s.bot.multiplyScalar(1 - 0.94 * dim);
      if (warm > 0) { s.top.lerp(warmDark[0], 0.5 * warm * dim); s.bot.lerp(warmDark[1], 0.55 * warm * dim); }      // (a warm passage: the dark sky takes on a deep ember tone)
    }          // (the aurora's night: the sky itself nearly black)

    // Sun arcs from east (hour 6) up and over to west (hour 18).
    const a = ((hour - 6) / 12) * Math.PI;
    const sx = Math.cos(a) * 70, sy = Math.sin(a) * 60, sz = -95;
    // The sun and moon are drawn on a higher, flatter arc than the one the light follows: each stays above the hills for about 14 hours, so as one sets behind them the other
    // is already rising on the far side, and the sky is never empty (the light itself, and the environment map, still use the real position).
    const arc = sy / 60, mx = Math.cos(a) * orbit.halfW;
    sunMesh.position.set(mx, SKY_LIFT + SKY_AMP * arc, sz);
    moonMesh.position.set(-mx, SKY_LIFT - SKY_AMP * arc, sz);
    // Light comes from the sun's direction, but never lower than ~12 degrees (keeps shadows sane).
    // The light comes from the side and a little toward the camera (not from behind the village),
    // so facades you look at are modelled by it and roof/eave shadows fall where you can see them.
    const dir = new THREE.Vector3(sx * 1.25, Math.max(sy, 26), 20).normalize();
    sunLight.position.copy(sunLight.target.position).addScaledVector(dir, 180);
    moonLight.position.set(-sx, Math.max(-sy, 6), sz);

    const night = THREE.MathUtils.clamp(1 - (sy + 8) / 18, 0, 1);
    sunLight.color.copy(s.sun);
    sunLight.intensity = s.sunI * 1.75;
    moonLight.intensity = (classic ? 0.35 : 0.6) * night * (1 - 0.99 * dim);
    hemi.intensity = s.hemi * 1.45 * (1 - 0.975 * dim); // soft fill, kept low enough that shadows still read
    hemi.color.copy(s.top).lerp(new THREE.Color(0xffffff), 0.55);
    skyHemi.intensity = hemi.intensity;
    rimLight.position.set(-sx * 0.7, 38, -150);
    rimLight.color.copy(s.sun).lerp(s.top, 0.35);
    rimLight.intensity = classic ? 0 : 0.55 * (1 - night) * Math.min(1, s.sunI + 0.3);
    skyHemi.color.copy(hemi.color);
    skySun.intensity = sunLight.intensity * 0.8;
    skySun.color.copy(sunLight.color);
    skySun.position.set(sx * 1.25, Math.max(sy, 26), 20);
    fog.color.copy(s.bot);
    if (!classic) fog.color.lerp(s.sun, 0.12);
    starMat.uniforms.uNight.value = night * night * (1 - dim);
    // the sun, moon and their glows (and the stars above) fade away while a house song plays, leaving the sky to the aurora
    // Only one of the two is in the sky at a time: the sun is up from 6 am to 6 pm and the moon from 6 pm to 6 am, each rising at the hills as the other sets on the far side, and
    // handing over with a quick cross-fade (the two are never both fully up).
    const hand = THREE.MathUtils.clamp((arc + 0.06) / 0.12, 0, 1);                       // 1 while the sun's turn, 0 while the moon's
    for (const [m, glow, f, halo0, hov] of [[sunMesh, 0.5, hand, 64, hoverSun], [moonMesh, 0.35, 1 - hand, 42, hoverMoon]]) {
      m.material.opacity = (1 - dim) * f;
      if (m.children[0]) { m.children[0].material.opacity = glow * (1 - dim) * f * (1 + 0.6 * hintV + 0.45 * hov); m.children[0].scale.setScalar(halo0 * (1 + 0.3 * hintV + 0.2 * hov)); }      // (hintV: the glow breathes to hint that the sun and moon can be moved; hov: it swells while the pointer is over one)
      m.scale.setScalar(1 + 0.025 * hov);
      m.visible = f > 0.01 && dim < 0.995;
    }

    updateEnv(hour, s, _sunTrue.set(sx, sy, sz), night, dim);

    root.style.setProperty('--sky-top', '#' + s.top.getHexString());
    root.style.setProperty('--sky-bot', '#' + s.bot.getHexString());
    // Ground colour for whatever sits below the scene (under a phone's browser toolbar): green by day, dark at night.
    const ground = _a.set('#2c4a33').lerp(_b.set('#5f9150'), 1 - night);
    root.style.setProperty('--ground', '#' + ground.getHexString());
    // Tint the phone's status bar / address bar to the top of the sky (live).
    if (themeMeta) themeMeta.setAttribute('content', '#' + s.top.getHexString());
    return { night, horizon: s.bot.clone() };
  }

  /** Aim the sun's shadows at a small box (centre x, y, z; half-size `half`) so that small things get crisp shadows (the mini-golf); `shadowReset()` puts the wide view back. */
  const shadowBox = (x, y, z, half) => { sunLight.target.position.set(x, y, z); sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); sunLight.shadow.normalBias = 0.025; };
  const shadowReset = () => { sunLight.target.position.set(0, 0, -38); sc.left = -100; sc.right = 100; sc.top = 100; sc.bottom = -100; sc.updateProjectionMatrix(); sunLight.shadow.normalBias = 0.06; };
  return { set, setHint, setHover, setOrbitAlpha, setView, orbitPoint, shadowBox, shadowReset, bodies: { sun: sunMesh, moon: moonMesh }, lights: { hemi, moon: moonLight, rim: rimLight, fog } };
}
