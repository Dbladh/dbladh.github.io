// The home-scene easter egg: now and then a dirt bike rides across the hills (left to right), follows the ground,
// jumps off crests, and sometimes throws a backflip. Clicking it starts the game (see bikegame.js).
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261018014159';
import { heightAt } from './world.js?v=20261018014159';
import { buildBike, poseRider, BIKE } from './bike.js?v=20261018014159';
import { createTracks } from './tracks.js?v=20261018014159';
import { createDirt } from './dirt.js?v=20261018014159';
import { createPuffs } from './puffs.js?v=20261018014159';

const SCALE = 1.15;          // the bike is small on screen from the overview, so the toy is drawn bigger than life
const SPEED = 9;            // world units per second
const GRAV = 18;

export function createRide(scene, world, camera, { force = false, renderer = null } = {}) {
  const laneZ = world.bikeLaneZ;
  const bike = buildBike();
  const root = bike.root;
  root.scale.setScalar(SCALE);
  root.visible = false;
  scene.add(root);

  // An invisible, generous click target (bigger than the bike so it is easy to hit on a phone).
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
  hit.scale.set(4, 3.4, 3);
  hit.userData.bike = true;
  scene.add(hit);


  const st = {
    state: 'wait', timer: force ? 1 : 8, first: true,
    x: 0, y: 0, vy: 0, grounded: true, pitch: 0, endX: 0,
    hop: 2, flip: 0, airT: 0, airDur: 1, launchPitch: 0, landPitch: 0, lean: 0.7, hover: 0, wheelSpin: 0,
  };
  let S = SCALE;                                              // drawn larger on narrow phone screens, where everything is small
  let rear = BIKE.rearX * S, frontX = BIKE.frontX * S, axle = BIKE.wheelR * S;
  const groundAt = (x) => heightAt(x, laneZ);
  const slopeAt = (x) => (groundAt(x + 0.6) - groundAt(x - 0.6)) / 1.2;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function start() {
    const tall = Math.min(1, Math.max(0, (1 - camera.aspect) / 0.5));
    S = SCALE * (1 + 0.9 * tall); rear = BIKE.rearX * S; frontX = BIKE.frontX * S; axle = BIKE.wheelR * S;
    const halfW = (camera.position.z - laneZ) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    st.x = -halfW - 6; st.endX = halfW + 7;
    st.grounded = true; st.vy = 0; st.pitch = 0; st.hop = rnd(1.5, 3); st.flip = 0; st.lean = 0.7;
    st.state = 'ride';
    root.visible = true; hit.visible = true;
    placeOnGround(true);
  }
  function placeOnGround(snap) {
    const yr = groundAt(st.x + rear), yf = groundAt(st.x + frontX);
    st.y = (yr + yf) / 2 + axle;
    const target = Math.atan2(yf - yr, frontX - rear);
    st.pitch = snap ? target : st.pitch + (target - st.pitch) * 0.35;
  }
  function launch(vy, flip) {
    st.grounded = false; st.vy = vy;
    st.airDur = (2 * vy) / GRAV; st.airT = 0; st.flip = flip;
    st.launchPitch = st.pitch;
    const lx = st.x + SPEED * st.airDur;
    st.landPitch = Math.atan2(groundAt(lx + frontX) - groundAt(lx + rear), frontX - rear);
  }

  // Dirt kicked up and dust, as in the game (the same particle systems), so the bike looks alive as it rides through.
  const dirt = createDirt(scene, (x) => groundAt(x)), puffs = createPuffs(scene);
  dirt.visible = true; puffs.visible = true;
  const tracks = createTracks(scene, { groundAt: (x, z) => heightAt(x, z), laneZ, width: 1.0, life: 10, strength: 0.45 });
  let dustT = 0;
  function particles(dt) {
    const px = (renderer ? renderer.domElement.height : innerHeight * Math.min(devicePixelRatio || 1, 2)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    puffs.update(dt, px); dirt.update(dt, px); tracks.update(dt);
  }
  let hold = false;
  function update(dt, active) {
    particles(dt);
    if (!active) { if (st.state === 'ride') { st.state = 'wait'; root.visible = false; hit.visible = false; } return; }
    if (st.state === 'wait') {
      if (hold) { st.timer = Math.max(st.timer, 3); return; }                // (music mode: no new bike until it is over; one already riding carries on to the end of its pass)
      st.timer -= dt;
      if (st.timer > 0) return;
      start();                                              // (carry straight on into the riding code, so the bike is placed before the frame is drawn: no flash at the origin)
    }
    // ---- riding ----
    st.x += SPEED * dt;
    if (st.grounded) {
      placeOnGround(false);
      st.hop -= dt;
      const drop = slopeAt(st.x - 1.2) - slopeAt(st.x + 1.8);
      if (drop > 0.3) launch(Math.max(2, SPEED * slopeAt(st.x - 0.8)) + 2, 0);          // off a crest
      else if (st.hop <= 0 && st.x < st.endX - 12) {                                      // a deliberate hop, sometimes with a backflip
        const big = Math.random() < 0.3;
        launch(big ? 12.5 : rnd(8, 10.5), big ? 1 : 0);
        if (big) {                                                                        // only flip where the landing is level enough
          const lx = st.x + SPEED * st.airDur;
          if (Math.abs(groundAt(lx) - groundAt(st.x)) > 2.2 || Math.abs(slopeAt(lx)) > 0.35) st.flip = 0;
        }
        st.hop = rnd(2.5, 5);
      }
    } else {
      st.vy -= GRAV * dt; st.y += st.vy * dt; st.airT += dt;
      const u = Math.min(1, st.airT / st.airDur);
      st.pitch = THREE.MathUtils.lerp(st.launchPitch, st.landPitch, u) + st.flip * Math.PI * 2 * (u * u * (3 - 2 * u));
      const ground = (groundAt(st.x + rear) + groundAt(st.x + frontX)) / 2 + axle;
      if (st.vy < 0 && st.y <= ground) {
        st.grounded = true; st.y = ground; st.pitch = Math.atan2(groundAt(st.x + frontX) - groundAt(st.x + rear), frontX - rear);
      }
    }
    // looks
    st.hover += ((hoverNow ? 1 : 0) - st.hover) * Math.min(1, dt * 10);
    const leanT = st.grounded ? 0.7 : (st.flip ? 1.25 : 0.45);
    st.lean += (leanT - st.lean) * Math.min(1, dt * 8);
    poseRider(bike.rider, st.lean);
    st.wheelSpin += (SPEED * dt) / axle;
    bike.wheels.rear.rotation.z = bike.wheels.front.rotation.z = -st.wheelSpin;
    root.position.set(st.x, st.y, laneZ);
    root.rotation.z = st.pitch;
    if (st.grounded) {                                                                // the rear wheel throws dirt and a little dust
      const wx = st.x + rear, wy = groundAt(wx) + 0.1;
      tracks.add(wx, true);
      dirt.spray(dt, wx, wy, laneZ + 0.2, SPEED * 1.7, 0.55, 0);
      dustT -= dt; if (dustT <= 0) { dustT = 0.07; puffs.emit(wx, wy + 0.2, laneZ + 0.2, -2.5 - Math.random() * 2, 1 + Math.random() * 1.5, 0.5, 1.4, 0.8, '#a98a63', 0.5); }
    }
    if (st.wasAir && st.grounded) { dirt.burst(st.x, groundAt(st.x) + 0.1, laneZ, 9, 0.8, 0); for (let i = 0; i < 5; i++) puffs.emit(st.x + (Math.random() - 0.5), groundAt(st.x) + 0.3, laneZ + 0.2, (Math.random() - 0.5) * 6, 1 + Math.random() * 2, 0.6, 1.8, 0.8, '#a98a63', 0.55); }
    if (!st.grounded) tracks.add(0, false);
    st.wasAir = !st.grounded;
    root.scale.setScalar(S * (1 + st.hover * 0.06));
    const dist = Math.hypot(camera.position.x - st.x, camera.position.y - st.y, camera.position.z - laneZ);
    const k = Math.max(1, (dist * 0.1) / 3.4);                                        // never smaller than ~10% of the distance: easy to tap far away
    hit.scale.set(4 * k, 3.4 * k, 3);
    hit.position.set(st.x, st.y + 1.0 * k, laneZ);
    if (st.x > st.endX) { st.state = 'wait'; st.timer = force ? 10 : rnd(40, 60); st.first = false; root.visible = false; hit.visible = false; }
  }
  let hoverNow = false;

  hit.visible = false;
  return {
    update,
    /** Is the bike on screen right now (and so worth offering a keyboard button for)? */
    get riding() { return st.state === 'ride'; },
    /** While true no new bike is sent (music mode); a bike already on its way is left alone. */
    set hold(v) { hold = !!v; },
    get hitTarget() { return hit; },
    get root() { return root; },
    get position() { return root.position; },
    set hover(v) { hoverNow = !!v; },
    /** Forget the wait and send it now (the ?bike=1 test switch). */
    sendNow() { if (st.state === 'wait') st.timer = 0; },
    /** Back to waiting (after the game, or when the view changes): hides the bike and queues the next pass. */
    reset() { tracks.clear(); st.state = 'wait'; st.timer = force ? 4 : rnd(15, 30); root.visible = false; hit.visible = false; },
    /** Clicked: the bike pops a wheelie hop and the game can start. */
    poke() { if (st.state === 'ride' && st.grounded) launch(9, 0); },
  };
}
