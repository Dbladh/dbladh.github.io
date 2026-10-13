// Time of day: one number (hour 0-24) drives the sky gradient (CSS), sun/moon,
// lights, fog and star visibility. The sky itself is a CSS gradient on <body>,
// which lets the big "Danny Bladh" title sit *behind* the 3D hills.
import * as THREE from 'three';

// hour, sky top, sky bottom (horizon), sun color, sun intensity, hemisphere intensity
const KEYS = [
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

const _a = new THREE.Color();
const _b = new THREE.Color();

function sample(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && hour > KEYS[i + 1].h) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
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
export function createSky(scene, skyScene, renderer) {
  const fog = new THREE.Fog(0xcfe9fb, 60, 230);
  scene.fog = fog;

  // Sky-tinted fill from above, warm grass bounce from below.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8aa860, 0.8);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0);
  scene.add(hemi, sunLight, sunLight.target, moonLight, moonLight.target);
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
    for (let i = 0; i <= 16; i++) {                       // smooth gaussian-like falloff, no visible rim
      const r = i / 16;
      gr.addColorStop(r, `rgba(255,255,255,${(0.95 * Math.exp(-r * r * 5.5)).toFixed(3)})`);
    }
    gr.addColorStop(1, 'rgba(255,255,255,0)');
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
    new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false, depthTest: false, depthWrite: false }),
  );
  sunMesh.renderOrder = -10;   // behind everything else in this layer, whatever its distance
  sunMesh.add(halo(0xffd890, 64, 0.5));
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(7, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false, depthTest: false, depthWrite: false }),
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

  function updateEnv(hour, s, sunPos, night) {
    const dh = ((hour - envHour + 36) % 24) - 12;                          // signed hour difference, midnight-safe
    if (Math.abs(dh) < 0.8 && envTarget) return;                           // close enough: reuse the reflection map
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
  function set(hour) {
    const s = sample(((hour % 24) + 24) % 24);

    // Sun arcs from east (hour 6) up and over to west (hour 18).
    const a = ((hour - 6) / 12) * Math.PI;
    const sx = Math.cos(a) * 70, sy = Math.sin(a) * 60, sz = -95;
    sunMesh.position.set(sx, sy, sz);
    moonMesh.position.set(-sx, -sy, sz);
    // Light comes from the sun's direction, but never lower than ~12 degrees (keeps shadows sane).
    // The light comes from the side and a little toward the camera (not from behind the village),
    // so facades you look at are modelled by it and roof/eave shadows fall where you can see them.
    const dir = new THREE.Vector3(sx * 1.25, Math.max(sy, 26), 20).normalize();
    sunLight.position.copy(sunLight.target.position).addScaledVector(dir, 180);
    moonLight.position.set(-sx, Math.max(-sy, 6), sz);

    const night = THREE.MathUtils.clamp(1 - (sy + 8) / 18, 0, 1);
    sunLight.color.copy(s.sun);
    sunLight.intensity = s.sunI * 1.75;
    moonLight.intensity = 0.35 * night;
    hemi.intensity = s.hemi * 1.45; // soft fill, kept low enough that shadows still read
    hemi.color.copy(s.top).lerp(new THREE.Color(0xffffff), 0.55);
    skyHemi.intensity = hemi.intensity;
    skyHemi.color.copy(hemi.color);
    skySun.intensity = sunLight.intensity * 0.8;
    skySun.color.copy(sunLight.color);
    skySun.position.set(sx * 1.25, Math.max(sy, 26), 20);
    fog.color.copy(s.bot);
    starMat.uniforms.uNight.value = night * night;
    sunMesh.visible = sy > -6;
    moonMesh.visible = -sy > -6;

    updateEnv(hour, s, sunMesh.position, night);

    root.style.setProperty('--sky-top', '#' + s.top.getHexString());
    root.style.setProperty('--sky-bot', '#' + s.bot.getHexString());
    // Ground colour for whatever sits below the scene (under a phone's browser toolbar): green by day, dark at night.
    const ground = _a.set('#2c4a33').lerp(_b.set('#5f9150'), 1 - night);
    root.style.setProperty('--ground', '#' + ground.getHexString());
    // Tint the phone's status bar / address bar to the top of the sky (live).
    if (themeMeta) themeMeta.setAttribute('content', '#' + s.top.getHexString());
    return { night, horizon: s.bot.clone() };
  }

  return { set };
}
