// The home-scene easter egg: now and then a dirt bike rides across the hills (left to right), follows the ground,
// jumps off crests, and sometimes throws a backflip. Clicking it starts the game (see bikegame.js).
import * as THREE from 'three';
import { PAL } from './palette.js?v=20261017150131';
import { heightAt } from './world.js?v=20261017150131';
import { buildBike, poseRider, BIKE } from './bike.js?v=20261017150131';

const SCALE = 1.15;          // the bike is small on screen from the overview, so the toy is drawn bigger than life
const SPEED = 9;            // world units per second
const GRAV = 18;

export function createRide(scene, world, camera, { force = false } = {}) {
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

  // Sparkles around the bike on the first pass, so there is a hint that it can be clicked.
  const sparkN = 7;
  const sparkTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, '#fff'); g.addColorStop(0.3, 'rgba(255,240,190,.9)'); g.addColorStop(1, 'rgba(255,220,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparkN * 3), 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    map: sparkTex, size: 0.7, sizeAttenuation: true, transparent: true, depthWrite: false, color: new THREE.Color(PAL.gold),
    blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false; sparks.visible = false;
  scene.add(sparks);

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
    sparks.visible = st.first;
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

  function update(dt, active) {
    if (!active) { if (st.state === 'ride') { st.state = 'wait'; root.visible = false; hit.visible = false; sparks.visible = false; } return; }
    if (st.state === 'wait') {
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
    root.scale.setScalar(S * (1 + st.hover * 0.06));
    const dist = Math.hypot(camera.position.x - st.x, camera.position.y - st.y, camera.position.z - laneZ);
    const k = Math.max(1, (dist * 0.1) / 3.4);                                        // never smaller than ~10% of the distance: easy to tap far away
    hit.scale.set(4 * k, 3.4 * k, 3);
    hit.position.set(st.x, st.y + 1.0 * k, laneZ);
    if (sparks.visible) {
      const p = sparkGeo.attributes.position, t = performance.now() / 1000;
      for (let i = 0; i < sparkN; i++) {
        const a = t * 1.4 + (i / sparkN) * Math.PI * 2, r = 1.5 + Math.sin(t * 2.3 + i * 1.7) * 0.3;
        p.setXYZ(i, st.x + Math.cos(a) * r * 1.5, st.y + 1.0 + Math.sin(a * 1.3) * r * 0.6, laneZ + 0.5);
      }
      p.needsUpdate = true;
      sparks.material.opacity = 0.65 + 0.35 * Math.sin(t * 5);
    }
    if (st.x > st.endX) { st.state = 'wait'; st.timer = force ? 10 : rnd(40, 60); st.first = false; root.visible = false; hit.visible = false; sparks.visible = false; }
  }
  let hoverNow = false;

  hit.visible = false;
  return {
    update,
    /** Is the bike on screen right now (and so worth offering a keyboard button for)? */
    get riding() { return st.state === 'ride'; },
    get hitTarget() { return hit; },
    get root() { return root; },
    get position() { return root.position; },
    set hover(v) { hoverNow = !!v; },
    /** Forget the wait and send it now (the ?bike=1 test switch). */
    sendNow() { if (st.state === 'wait') st.timer = 0; },
    /** Back to waiting (after the game, or when the view changes): hides the bike and queues the next pass. */
    reset() { st.state = 'wait'; st.timer = force ? 4 : rnd(15, 30); root.visible = false; hit.visible = false; sparks.visible = false; },
    /** Clicked: the bike pops a wheelie hop and the game can start. */
    poke() { if (st.state === 'ride' && st.grounded) launch(9, 0); },
  };
}
