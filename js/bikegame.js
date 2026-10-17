// The dirt-bike game: it begins in the real scene. The camera swings side-on to the bike on its lane, the village in front of
// the lane is sliced away, and the ground then carries on to the right as the camera follows the rider (see track.js).
// This module is the shell (enter/exit, camera, HUD, input plumbing); physics and scoring plug into it.
import * as THREE from 'three';
import { buildBike, poseRider, BIKE } from './bike.js?v=20261016200529';
import { createTrack } from './track.js?v=20261016200529';

const ENTER_SECONDS = 1.3;
const SCALE = 1.8;
const SPEED = 13;
const GRAV = 22;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createGame(scene, camera, renderer, world, { reduceMotion = false } = {}) {
  const hud = document.getElementById('game-hud');
  const scoreEl = document.getElementById('gh-score');
  const coinsEl = document.getElementById('gh-coins');
  const hint = document.getElementById('gh-hint');

  const laneZ = world.bikeLaneZ;
  const track = createTrack(scene, { laneZ, material: world.terrainMaterial, seed: 1 });
  const bike = buildBike();
  bike.root.scale.setScalar(SCALE);
  bike.root.visible = false;
  scene.add(bike.root);
  const axle = BIKE.wheelR * SCALE, rearX = BIKE.rearX * SCALE, frontX = BIKE.frontX * SCALE;

  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 60);   // clips everything nearer the camera than the cut
  const CUT = track.cutZ + 0.4;
  const st = {
    mode: 'off', t: 0, from: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    x: 0, y: 0, vy: 0, pitch: 0, grounded: true, camY: 0, score: 0, coins: 0, down: false, hop: 2, spin: 0, lean: 0.7,
    onQuit: null, hintT: 0,
  };
  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const lookV = new THREE.Vector3();

  /** Camera for the current screen: wide enough to always show ~30 world units of ground. Returns the distance to the lane. */
  function frame() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = THREE.MathUtils.clamp(30 / (2 * tanH * camera.aspect), 18, 60);
    const ahead = 8;
    target.pos.set(st.x + ahead, st.camY + 2.5 + dist * 0.1, laneZ + dist);
    target.look.set(st.x + ahead, st.camY + 3 + dist * 0.05, laneZ);
    return dist;
  }
  function setHud() {
    if (scoreEl) scoreEl.textContent = String(Math.floor(st.score));
    if (coinsEl) coinsEl.textContent = String(st.coins);
  }
  const groundY = (x) => track.laneAt(x);
  function sit() {                       // put the bike on the ground under it
    const yr = groundY(st.x + rearX), yf = groundY(st.x + frontX);
    st.y = (yr + yf) / 2 + axle;
    st.pitch = Math.atan2(yf - yr, frontX - rearX);
  }

  const api = {
    get active() { return st.mode !== 'off'; },
    focusDistance: 26,
    onQuit: null,
    /** Begin from the camera the overview is using and the bike's current spot on its lane. */
    start(homeCam, startX = 0) {
      if (st.mode !== 'off') return;
      st.mode = 'in'; st.t = 0; st.x = startX; st.vy = 0; st.grounded = true; st.score = 0; st.coins = 0; st.down = false; st.hop = 2; st.spin = 0; st.lean = 0.7;
      st.home = { pos: homeCam.pos.clone(), look: homeCam.look.clone() };
      st.from.pos.copy(homeCam.pos); st.from.look.copy(homeCam.look);
      track.reset(Math.floor(Math.random() * 1e6) + 1);
      const m = /[?&]course=(\d+)/.exec(location.search); if (m) track.reset(parseInt(m[1], 10));
      track.visible = true;
      sit(); st.camY = st.y;
      bike.root.visible = true;
      renderer.clippingPlanes = [clip]; clip.constant = 60;
      document.body.classList.add('game-mode');
      if (hud) hud.hidden = false;
      if (hint) { hint.hidden = false; clearTimeout(st.hintT); st.hintT = setTimeout(() => { hint.hidden = true; }, 6000); }
      setHud();
    },
    /** Head back to the overview (the camera swings home and the village returns). */
    stop() {
      if (st.mode === 'off' || st.mode === 'out') return;
      st.mode = 'out'; st.t = 0; st.leaveFrom = { pos: camera.position.clone(), look: lookV.clone() };
      st.down = false;
      if (hud) hud.hidden = true;
      clearTimeout(st.hintT);
      document.body.classList.remove('game-mode');
    },
    press() { st.down = true; },
    release() { st.down = false; },
    /** Drives the game and the camera. Returns true while the game owns the camera. */
    update(dt, cam) {
      if (st.mode === 'off') return false;
      if (st.mode === 'out') {
        st.t += dt;
        const k = reduceMotion ? 1 : ease(Math.min(1, st.t / (ENTER_SECONDS * 0.8)));
        cam.position.lerpVectors(st.leaveFrom.pos, st.home.pos, k);
        lookV.lerpVectors(st.leaveFrom.look, st.home.look, k); cam.lookAt(lookV);
        clip.constant = THREE.MathUtils.lerp(CUT, 60, k);
        if (k >= 1) {
          st.mode = 'off'; renderer.clippingPlanes = []; track.visible = false; bike.root.visible = false;
          api.onQuit?.();
        }
        return true;
      }
      st.t += dt;
      // the ride (a stand-in for the real physics: follows the ground, leaves it at crests, hops now and then)
      st.x += SPEED * dt;
      if (st.grounded) {
        sit();
        st.hop -= dt;
        const drop = track.slopeAt(st.x - 1.2) - track.slopeAt(st.x + 1.8);
        if (drop > 0.3 || st.hop <= 0) { st.grounded = false; st.vy = Math.max(7, SPEED * track.slopeAt(st.x - 0.8) * 1.0 + 4); st.hop = 3 + Math.random() * 3; }
      } else {
        st.vy -= GRAV * dt; st.y += st.vy * dt;
        const gy = (groundY(st.x + rearX) + groundY(st.x + frontX)) / 2 + axle;
        const want = Math.atan2(groundY(st.x + frontX) - groundY(st.x + rearX), frontX - rearX);
        st.pitch += (want + 0.15 - st.pitch) * Math.min(1, dt * 2.5);
        if (st.vy < 0 && st.y <= gy) { st.grounded = true; sit(); }
      }
      st.score += dt * 10;
      st.lean += ((st.grounded ? 0.7 : 0.45) - st.lean) * Math.min(1, dt * 8);
      poseRider(bike.rider, st.lean);
      st.spin += (SPEED * dt) / axle;
      bike.wheels.rear.rotation.z = bike.wheels.front.rotation.z = -st.spin;
      bike.root.position.set(st.x, st.y, laneZ);
      bike.root.rotation.z = st.pitch;
      setHud();
      // camera
      st.camY += (st.y - st.camY) * Math.min(1, dt * 2.2);
      api.focusDistance = frame();
      const k = reduceMotion ? 1 : ease(Math.min(1, st.t / ENTER_SECONDS));
      cam.position.lerpVectors(st.from.pos, target.pos, k);
      lookV.lerpVectors(st.from.look, target.look, k); cam.lookAt(lookV);
      clip.constant = THREE.MathUtils.lerp(60, CUT, k);
      track.update(cam.position.x, st.camY);
      return true;
    },
  };
  return api;
}
