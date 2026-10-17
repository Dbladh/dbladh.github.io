// The dirt-bike game: it begins in the real scene. The camera swings side-on to the bike on its lane, the village in front of
// the lane is sliced away, and the ground then carries on to the right as the camera follows the rider (see track.js).
// This module is the shell (enter/exit, camera, HUD, input plumbing); physics and scoring plug into it.
import * as THREE from 'three';
import { buildBike, poseRider, BIKE } from './bike.js?v=20261016201222';
import { createTrack } from './track.js?v=20261016201222';

const ENTER_SECONDS = 1.3;
const SCALE = 1.8;
const GRAV = 24;
const JUMP = 9.5;                // upward kick from the ground
const DIVE_GRAV = 1.2;           // extra gravity while nose-diving
const TAU = Math.PI * 2;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export function createGame(scene, camera, renderer, world, { reduceMotion = false } = {}) {
  const hud = document.getElementById('game-hud');
  const scoreEl = document.getElementById('gh-score');
  const coinsEl = document.getElementById('gh-coins');
  const hint = document.getElementById('gh-hint');
  const toastEl = document.getElementById('gh-toast');

  const laneZ = world.bikeLaneZ;
  const track = createTrack(scene, { laneZ, material: world.terrainMaterial, seed: 1 });
  const bike = buildBike();
  bike.root.scale.setScalar(SCALE);
  bike.root.visible = false;
  scene.add(bike.root);
  const R = BIKE.wheelR * SCALE, HW = ((BIKE.frontX - BIKE.rearX) / 2) * SCALE;   // wheel radius, half wheelbase

  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 60);   // clips everything nearer the camera than the cut
  const CUT = track.cutZ + 0.4;
  const st = {
    mode: 'off', t: 0, from: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    x: 0, y: 0, vx: 8, vy: 0, th: 0, om: 0, grounded: true, coyote: 0, diveOK: false, jumpReq: 0,
    rot: 0, flips: 0, airT: 0, camY: 0, score: 0, coins: 0, down: false, spin: 0, lean: 0.7,
    crashT: 0, inv: 0, boost: 0, startX: 0, best: 0,
    rider: null, onQuit: null, hintT: 0, toastT: 0,
  };
  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const lookV = new THREE.Vector3();
  const events = { onLand: null, onFlip: null, onCrash: null };

  function frame() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = THREE.MathUtils.clamp(30 / (2 * tanH * camera.aspect), 18, 60);
    const ahead = 6 + st.vx * 0.2;
    target.pos.set(st.x + ahead, st.camY + 2.5 + dist * 0.1, laneZ + dist);
    target.look.set(st.x + ahead, st.camY + 3 + dist * 0.05, laneZ);
    return dist;
  }
  function setHud() {
    if (scoreEl) scoreEl.textContent = String(Math.floor(st.score));
    if (coinsEl) coinsEl.textContent = String(st.coins);
  }
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text; toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
  }
  const groundY = (x) => track.laneAt(x);

  /** Where the wheels would sit on the ground under the bike's centre x: height of the axle line and the ground's angle. */
  function groundPose(x) {
    const gR = groundY(x - HW), gF = groundY(x + HW), phi = Math.atan2(gF - gR, 2 * HW);
    return { y: (gR + gF) / 2 + R / Math.cos(phi), phi };
  }

  function startRun(x) {
    st.x = x; st.vx = 8; st.vy = 0; st.om = 0; st.grounded = true; st.rot = 0; st.flips = 0; st.airT = 0; st.mode = 'play'; st.crashT = 0; st.inv = 0; st.boost = 0;
    const p = groundPose(x); st.y = p.y; st.th = p.phi; st.vy = 0; st.camY = st.y;
    if (st.rider) { st.rider.removeFromParent(); bike.model.add(st.rider); st.rider.position.set(0, 0, 0); st.rider.rotation.set(0, 0, 0); st.rider = null; }
  }

  /** One fixed physics step of `h` seconds. */
  function physics(h) {
    const diving = st.down && st.diveOK;
    if (st.mode === 'crash') {
      st.vx *= Math.exp(-2.2 * h);
      st.x += st.vx * h;
      const p = groundPose(st.x);
      st.y = p.y; st.th += wrap(p.phi - st.th) * Math.min(1, h * 6);
      return;
    }
    const dist = Math.max(0, st.x - st.startX);
    const base = 12 + Math.min(6, dist / 350);
    if (st.grounded) {
      const prevY = st.y;
      const p = groundPose(st.x + st.vx * h);
      const slope = Math.tan(p.phi);
      const aim = base + st.boost - Math.max(-3, Math.min(5, slope * 6));
      st.vx += (aim - st.vx) * Math.min(1, 2.5 * h);
      st.x += st.vx * h;
      const q = groundPose(st.x);
      let leaves = false;                                     // would a free-flying bike clear the ground over the next ~0.12 s?
      for (let t = 0.04; t <= 0.121 && !leaves; t += 0.04) leaves = prevY + st.vy * t - 0.5 * GRAV * t * t > groundPose(st.x + st.vx * t).y + 0.1;
      st.coyote = 0.08;
      if (st.jumpReq > 0) {                                   // jump: the carried ground velocity plus a kick
        st.jumpReq = 0; st.grounded = false; st.vy += JUMP; st.om = 0; st.rot = 0; st.airT = 0; st.diveOK = false; st.y = prevY;
        return;
      }
      if (leaves && st.vx > 4) {              // the ground fell away faster than gravity: we take off
        st.grounded = false; st.om = 0; st.rot = 0; st.airT = 0; st.diveOK = false; st.y = prevY;
        return;
      }
      st.vy = (q.y - prevY) / h;
      st.y = q.y;
      st.th += wrap(q.phi - st.th) * Math.min(1, h * 22);
      return;
    }
    // ---- in the air ----
    st.airT += h;
    st.coyote -= h;
    if (st.jumpReq > 0 && st.coyote > 0) { st.jumpReq = 0; st.vy = Math.max(st.vy, 0) + JUMP; st.coyote = 0; }   // a jump pressed just after the lip
    st.vy -= GRAV * (diving ? DIVE_GRAV : 1) * h;
    st.x += st.vx * h; st.y += st.vy * h;
    const want = diving ? -8.5 : 0.7;                          // hold: nose goes down fast; release: it drifts gently back up
    st.om += (want - st.om) * Math.min(1, (diving ? 18 : 3) * h);
    let dth = st.om * h;
    // Landing assist: close to the ground and falling, the suspension and the rider square the bike up with the slope.
    const gp = groundPose(st.x + st.vx * 0.12);
    const above = st.y - R - groundY(st.x);
    if (st.vy < 0 && above < 3.2 && st.airT > 0.2) { const k = Math.min(1, 3.2 * h * (1 - above / 3.2 + 0.3)); dth += wrap(gp.phi - st.th) * k; }
    st.th += dth; st.rot += dth;
    if (st.rot >= TAU - 1.1) { st.rot -= TAU; st.flips++; events.onFlip?.('back'); toast('Backflip!'); }
    else if (st.rot <= -(TAU - 1.1)) { st.rot += TAU; st.flips++; events.onFlip?.('front'); toast('Front flip!'); }
    // wheels
    const c = Math.cos(st.th), s = Math.sin(st.th);
    const rx = st.x - HW * c, ry = st.y - HW * s, fx = st.x + HW * c, fy = st.y + HW * s;
    const clearR = ry - R - groundY(rx), clearF = fy - R - groundY(fx);
    const clear = Math.min(clearR, clearF);
    if (clear <= 0) {
      if (st.airT < 0.25) { st.y -= clear; if (st.vy < 0) st.vy = 0; }   // still scraping the lip: lift clear rather than land
      else if (st.vy <= 0) land();
    }
  }

  function land() {
    const p = groundPose(st.x);
    const delta = wrap(st.th - p.phi);                         // + nose up, - nose down
    st.grounded = true; st.om = 0; st.diveOK = false;
    const air = st.airT;
    if (delta > 1.15 || delta < -0.95) { crash(); return; }
    st.y = p.y;
    st.vy = st.vx * Math.tan(p.phi);
    st.th = p.phi + delta * 0.55;                              // the suspension absorbs part of the angle
    const perfect = Math.abs(delta) < 0.22, rough = Math.abs(delta) > 0.5;
    if (rough) { st.vx *= 0.72; toast('Rough landing'); }
    else { st.boost = Math.min(4, st.boost + (perfect ? 1.2 : 0.5)); if (air > 0.5) toast(perfect ? 'Stuck it!' : 'Clean landing'); }
    st.rot = 0;
    events.onLand?.({ air, delta, perfect, rough, flips: st.flips });
    st.flips = 0;
  }

  function crash() {
    st.mode = 'crash'; st.crashT = 0;
    events.onCrash?.();
    toast('Crash!');
    // the rider is thrown clear (a single tumbling body for now)
    const rg = bike.rider.group;
    bike.root.updateMatrixWorld(true);
    scene.attach(rg);
    st.rider = rg; st.rv = { x: st.vx * 0.9 + 2, y: Math.max(4, st.vy + 5), w: -5 };
  }

  const api = {
    get active() { return st.mode !== 'off'; },
    /** Debug / test access. */
    get state() { return { x: st.x, y: st.y, vx: st.vx, vy: st.vy, th: st.th, grounded: st.grounded, mode: st.mode, flips: st.flips, airT: st.airT }; },
    events,
    focusDistance: 26,
    onQuit: null,
    start(homeCam, startX = 0) {
      if (st.mode !== 'off') return;
      st.t = 0; st.score = 0; st.coins = 0; st.down = false; st.startX = startX;
      st.home = { pos: homeCam.pos.clone(), look: homeCam.look.clone() };
      st.from.pos.copy(homeCam.pos); st.from.look.copy(homeCam.look);
      track.reset(Math.floor(Math.random() * 1e6) + 1);
      const m = /[?&]course=(\d+)/.exec(location.search); if (m) track.reset(parseInt(m[1], 10));
      track.visible = true;
      startRun(startX);
      bike.root.visible = true;
      renderer.clippingPlanes = [clip]; clip.constant = 60;
      document.body.classList.add('game-mode');
      if (hud) hud.hidden = false;
      if (hint) { hint.hidden = false; clearTimeout(st.hintT); st.hintT = setTimeout(() => { hint.hidden = true; }, 6000); }
      setHud();
    },
    stop() {
      if (st.mode === 'off' || st.mode === 'out') return;
      st.mode = 'out'; st.t = 0; st.leaveFrom = { pos: camera.position.clone(), look: lookV.clone() };
      st.down = false;
      if (hud) hud.hidden = true;
      clearTimeout(st.hintT);
      document.body.classList.remove('game-mode');
    },
    /** The one button. On the ground a press jumps; in the air a press (held) dives the nose. */
    press() {
      if (st.mode === 'off' || st.mode === 'out') return;
      st.down = true;
      if (st.grounded || st.coyote > 0) { st.jumpReq = 0.12; st.diveOK = false; }
      else st.diveOK = true;
    },
    release() { st.down = false; st.diveOK = false; },
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
          startRun(0); st.mode = 'off';
          api.onQuit?.();
        }
        return true;
      }
      st.t += dt;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n; i++) {
        physics(h);
        if (st.jumpReq > 0) st.jumpReq -= h;
      }
      if (st.mode === 'play') { st.score = Math.max(st.score, (st.x - st.startX) * 0.5); st.boost *= Math.exp(-0.35 * dt); }
      if (st.mode === 'crash') {
        st.crashT += dt;
        if (st.rider) {                                          // placeholder tumble for the thrown rider
          const rg = st.rider, rv = st.rv;
          rv.y -= GRAV * dt; rg.position.x += rv.x * dt; rg.position.y += rv.y * dt; rg.rotation.z += rv.w * dt;
          const gy = groundY(rg.position.x) + 0.5;
          if (rg.position.y < gy) { rg.position.y = gy; rv.y *= -0.3; rv.x *= 0.6; rv.w *= 0.6; }
        }
        if (st.crashT > 1.7) startRun(st.x + 3);                 // placeholder: ride on (step 5 turns this into game over)
      }
      // looks
      const leanT = st.mode === 'crash' ? 0.2 : st.grounded ? 0.7 : (st.down && st.diveOK ? 1.15 : 0.35);
      st.lean += (leanT - st.lean) * Math.min(1, dt * 8);
      if (!st.rider) poseRider(bike.rider, st.lean);
      st.spin += (st.vx * dt) / R;
      bike.wheels.rear.rotation.z = bike.wheels.front.rotation.z = -st.spin;
      bike.root.position.set(st.x, st.y, laneZ);
      bike.root.rotation.z = st.th;
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
