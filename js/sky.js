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

  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(5, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false }),
  );
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }),
  );
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
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
  );
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
    if (Math.abs(hour - envHour) < 0.5 && envTarget) return;
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
    stars.material.opacity = night * night;
    sunMesh.visible = sy > -6;
    moonMesh.visible = -sy > -6;

    updateEnv(hour, s, sunMesh.position, night);

    root.style.setProperty('--sky-top', '#' + s.top.getHexString());
    root.style.setProperty('--sky-bot', '#' + s.bot.getHexString());
    return { night };
  }

  return { set };
}
