// The dirt-bike game: the camera swings side-on, the village steps aside and a ridden track takes over.
// This module is the shell (enter/exit, camera, HUD, input plumbing); the track, physics and scoring plug into it.
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261016195828';
import { buildBike, poseRider, BIKE } from './bike.js?v=20261016195828';

export const GAME_Z = 0;                  // the plane the bike rides in
const ENTER_SECONDS = 1.2;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createGame(scene, camera, { reduceMotion = false } = {}) {
  const hud = document.getElementById('game-hud');
  const scoreEl = document.getElementById('gh-score');
  const coinsEl = document.getElementById('gh-coins');
  const quitBtn = document.getElementById('gh-quit');
  const hint = document.getElementById('gh-hint');

  const world = new THREE.Group();        // everything the game adds to the scene
  const bike = buildBike();
  const SCALE = 1.8;
  bike.root.scale.setScalar(SCALE);
  world.add(bike.root);
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(400, 6, 10),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(PAL.leaf), flatShading: true }),
  );
  ground.position.set(0, -3, 0); world.add(ground);

  const hidden = [];                      // home-scene objects switched off while the game runs
  const st = {
    on: false, t: 0, from: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    x: 0, y: 0, score: 0, coins: 0, down: false, onQuit: null,
  };
  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

  /** Camera for the current screen: wide enough to always show ~30 world units of track. */
  function frame() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = THREE.MathUtils.clamp(30 / (2 * tanH * camera.aspect), 16, 60);
    const ahead = 8;                                                       // the bike sits left of centre
    target.pos.set(st.x + ahead, st.y + 2 + dist * 0.1, GAME_Z + dist);
    target.look.set(st.x + ahead, st.y + 2.5 + dist * 0.06, GAME_Z);
    return dist;
  }

  function setHud() {
    if (scoreEl) scoreEl.textContent = String(Math.floor(st.score));
    if (coinsEl) coinsEl.textContent = String(st.coins);
  }

  const api = {
    get active() { return st.on; },
    /** Camera distance to the track plane (used as the depth-of-field focus). */
    focusDistance: 26,
    start(homeCam) {
      if (st.on) return;
      st.on = true; st.t = 0; st.x = 0; st.y = BIKE.wheelR * SCALE; st.score = 0; st.coins = 0; st.down = false;
      st.from.pos.copy(homeCam.pos); st.from.look.copy(homeCam.look);
      // Step the village aside: every home-scene object except the lights goes invisible until we come back.
      hidden.length = 0;
      for (const o of scene.children) if (!o.isLight && o.visible) { hidden.push(o); o.visible = false; }
      scene.add(world);
      document.body.classList.add('game-mode');
      if (hud) hud.hidden = false;
      if (hint) { hint.hidden = false; clearTimeout(st.hintT); st.hintT = setTimeout(() => { hint.hidden = true; }, 6000); }
      setHud();
      quitBtn?.focus({ preventScroll: true });
    },
    stop() {
      if (!st.on) return;
      st.on = false;
      scene.remove(world);
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      document.body.classList.remove('game-mode');
      if (hud) hud.hidden = true;
      clearTimeout(st.hintT);
      st.onQuit?.();
    },
    set onQuit(fn) { st.onQuit = fn; },
    /** The one button: down = pressed, up = released. */
    press() { st.down = true; },
    release() { st.down = false; },
    /** Drives the game and the camera. Returns true while the game owns the camera. */
    update(dt, cam) {
      if (!st.on) return false;
      st.t += dt;
      // idle ride for now: the bike rolls along the flat strip
      st.x += 9 * dt;
      st.score += dt * 10;
      bike.root.position.set(st.x, st.y, GAME_Z);
      bike.wheels.rear.rotation.z = bike.wheels.front.rotation.z = -st.x / (BIKE.wheelR * SCALE);
      poseRider(bike.rider, 0.7);
      ground.position.x = st.x;
      setHud();
      api.focusDistance = frame();
      const k = reduceMotion ? 1 : ease(Math.min(1, st.t / ENTER_SECONDS));
      cam.position.lerpVectors(st.from.pos, target.pos, k);
      cam.lookAt(new THREE.Vector3().lerpVectors(st.from.look, target.look, k));
      return true;
    },
  };
  return api;
}
