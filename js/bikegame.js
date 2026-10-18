// The dirt-bike game: it begins in the real scene. The camera swings side-on to the bike on its lane, the village in front of
// the lane is sliced away, and the ground then carries on to the right as the camera follows the rider (see track.js).
// This module is the shell (enter/exit, camera, HUD, input plumbing); physics and scoring plug into it.
import * as THREE from 'three';
import { buildBike, poseRider, BIKE } from './bike.js?v=20261018010151';
import { createTrack } from './track.js?v=20261018010151';
import { createRagdoll } from './ragdoll.js?v=20261018010151';
import { createFx } from './fx.js?v=20261018010151';
import { createAudio } from './audio.js?v=20261018010151';
import { createPuffs } from './puffs.js?v=20261018010151';
import { createTracks } from './tracks.js?v=20261018010151';
import { createDirt } from './dirt.js?v=20261018010151';
import { createMudCoat } from './mudcoat.js?v=20261018010151';
import { createCoins } from './coins.js?v=20261018010151';
import { createFuel } from './fuel.js?v=20261018010151';

const ENTER_SECONDS = 1.3;
const SCALE = 1.15;                  // the bike's size in the world (it was 1.8: too big next to the houses)
const GRAV = 24;
const JUMP_MIN = 5.5, JUMP_MAX = 15;   // upward kick: a tap hops, a full charge flies
const FUEL_SECONDS = 40, CAN_FUEL = 25 / 40;   // a full tank lasts this long at a steady throttle; a can gives back this share of it
const CHARGE_TIME = 1.1;               // seconds of holding to reach full charge (it then stays maxed)
const BOOST_CAP = 4.5;                 // extra speed from charging and landings
const BACK_W = 1.7, BACK_RATE = 0.9;   // in the air the nose wants to rotate backward: target rad/s and how fast it gets there
const BUFFER_WINDOW = 0.14;            // a press this close to touchdown is held over and applies on landing
const TAP_KICK = 4.6;                  // nose-down kick of one tap (rad/s, it fades quickly)
const DIVE_GRAV = 4.6;           // gravity while the button is held in the air: the bike drops much faster (ramps in over a moment)
const TAU = Math.PI * 2;
const COMBO_TIME = 6;              // seconds a combo lasts without a trick, a perfect landing or a clean landing
const TRICK_TIME = 0.75;           // every trick takes exactly this long
// The tricks, in the order a double-tap cycles through them (a flip needs enough air left, so it is skipped for the next trick when there is not).
const TRICKS = [
  { id: 'back', flip: 1, label: 'Backflip!', pts: 400 }, { id: 'spin', spin: 1, label: '360 spin!', pts: 300 },
  { id: 'front', flip: -1, label: 'Front flip!', pts: 400 }, { id: 'spinb', spin: -1, label: '360 spin!', pts: 300 },
];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export function createGame(scene, camera, renderer, world, { reduceMotion = false, audio: sharedAudio = null } = {}) {
  const hud = document.getElementById('game-hud');
  const scoreEl = document.getElementById('gh-score');
  const coinsEl = document.getElementById('gh-coins');
  const hint = document.getElementById('gh-hint');
  const hintText = document.getElementById('gh-hint-text');
  const skipBtn = document.getElementById('gh-skip');
  const pauseEl = document.getElementById('game-pause');
  const toastEl = document.getElementById('gh-toast');
  const floatEl = document.getElementById('gh-float');
  let rectCache = null; window.addEventListener('resize', () => { rectCache = null; });
  const canvasRect = () => rectCache || (rectCache = renderer.domElement.getBoundingClientRect());     // (measured once per frame)
  // "JUMP" markers floating over the next obstacles (up to two)
  setInterval(() => { const now = performance.now(); for (const e of jumpEls) if (!e.hidden && now - (e._t || 0) > 250) e.hidden = true; }, 120);     // (a marker nothing is updating is never left behind)
  const jumpEls = [0, 1].map(() => { const d = document.createElement('div'); d.className = 'gh-jump'; d.hidden = true; d.innerHTML = '<span class="t">JUMP</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l7 7 7-7M5 12l7 7 7-7"/></svg>'; (hud || document.body).appendChild(d); return d; });
  const multFxEl = document.getElementById('gh-multfx');
  const grooveEl = document.getElementById('gh-groove');
  const multEl = document.getElementById('gh-mult');
  const overEl = document.getElementById('game-over');
  const $ = (id) => document.getElementById(id);

  const laneZ = world.bikeLaneZ;
  const track = createTrack(scene, { laneZ, material: world.terrainMaterial, world, seed: 1 });
  const coins = createCoins(scene, track, laneZ);
  const fuel = createFuel(scene, track, coins, laneZ);
  const fuelEl = document.getElementById('gh-fuel'), fuelFill = document.getElementById('gh-fuel-fill');
  const bike = buildBike();
  const mudCoat = createMudCoat(bike.root);                                    // mud that sticks to the bike and rider, then dries and falls away
  const puffs = createPuffs(scene);
  const dirt = createDirt(scene, (x) => track.laneAt(x));
  const tracks = createTracks(scene, { groundAt: (x, z) => track.groundAt(x, z), laneZ, width: 1.5, life: 9, strength: 0.6 });       // tyre marks behind the rear wheel
  const audio = sharedAudio || createAudio();
  const juice = createFx(scene, camera, renderer, { low: matchMedia('(max-width: 700px)').matches });
  const baseFov = () => (camera.aspect < 0.8 ? 70 : 55);                    // (the same rule as the page uses when it is resized)
  // Landing indicator: a pulsing circle where the bike will touch down. Its colour says how the landing would go if nothing changes:
  // green for a perfect one, gold for a clean one, orange for a rough one, coral for a crash.
  const landMark = new THREE.Group();
  const landMat = new THREE.MeshBasicMaterial({ color: '#8fd081', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const landDiscMat = landMat.clone();
  const landRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 48).rotateX(-Math.PI / 2), landMat), landDisc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48).rotateX(-Math.PI / 2), landDiscMat);   // lying flat on the ground
  landRing.renderOrder = landDisc.renderOrder = 6; landMark.add(landDisc, landRing); landMark.visible = false; scene.add(landMark);
  const DAZE_TIME = 2.4;                                                  // seconds a rough landing keeps the bike slow
  const LAND_COL = { perfect: new THREE.Color('#8fd081'), clean: new THREE.Color('#e8c24a'), rough: new THREE.Color('#ec8a3c'), crash: new THREE.Color('#d15e4d') };
  const ragdoll = createRagdoll(scene, bike.rider, (x) => track.laneAt(x));
  ragdoll.onBounce = (v) => audio.bounce(v);
  bike.root.scale.setScalar(SCALE);
  bike.root.visible = false;
  scene.add(bike.root);
  let SC = SCALE;                                                                    // the bike is drawn larger on portrait phones
  let R = BIKE.wheelR * SC, HW = ((BIKE.frontX - BIKE.rearX) / 2) * SC;                // wheel radius, half wheelbase
  function setBikeScale() {
    const tall = THREE.MathUtils.clamp((1 - camera.aspect) / 0.5, 0, 1);
    SC = SCALE * (1 + 0.5 * tall); R = BIKE.wheelR * SC; HW = ((BIKE.frontX - BIKE.rearX) / 2) * SC;
    bike.root.scale.setScalar(SC);
  }

  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 60);   // clips the village (everything nearer the camera than the cut); the terrain itself is left whole
  const clipped = [], hiddenObjs = [];
  // The village-slicing plane is wired into every home-scene material once, up front (at constant 60 it clips nothing), so starting the game
  // never has to recompile shaders; the plane is only moved into place while playing.
  renderer.localClippingEnabled = true;
  scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (m === world.terrainMaterial || m.name === 'fx' || m.isShaderMaterial || m.isPointsMaterial || clipped.some((c) => c.m === m)) continue;
      clipped.push({ m }); m.clippingPlanes = [clip]; m.clipShadows = true;
    }
  });
  /** Hide the things that belong to the village (chimney smoke) while the game runs. */
  const castOff = [], villageX = [], boards = [], straddlers = [];                                                                      // meshes that stop casting shadows while the game runs
  function applyClip(on) {
    if (on) {
      const mine = new Set(); bike.root.traverse((o) => mine.add(o));
      scene.traverse((o) => {
        if (o.userData?.hideInGame && o.visible) { o.visible = false; hiddenObjs.push(o); }
        if (o.isMesh && o.castShadow && !mine.has(o)) { o.castShadow = false; castOff.push(o); }   // only the bike casts live shadows in the game: the shadow pass shrinks from ~800 draw calls to a handful
      });
      // Village objects wholly in front of the slicing plane are drawn only to be clipped away: not drawn at all while riding. (Anything animated, such as
      // fireflies and butterflies, is left alone: its bounding box cannot be trusted.)
      const box = new THREE.Box3();
      for (const c of scene.children) {
        if (!c.visible || c === track.group || c.isLight || c.isCamera || mine.has(c)) continue;
        let dynamic = false; c.traverse((o) => { if (o.isPoints || o.userData?.dynamic || o.isSkinnedMesh || (o.isInstancedMesh && o.frustumCulled === false)) dynamic = true; });
        if (dynamic) continue;
        box.setFromObject(c);
        if (box.isEmpty()) continue;
        if (box.min.z > track.cutZ + 1.4) { c.visible = false; hiddenObjs.push(c); }
        else villageX.push({ o: c, x0: box.min.x, x1: box.max.x });                  // (the sign glows are never frustum-culled: they are hidden by distance instead)
      }
      // Trees and bushes that stand across the slicing plane would be cut in half (a crown with its front missing): take those few out for the ride.
      {
        const inTrack = new Set(); track.group.traverse((o) => inTrack.add(o));
        const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
        scene.traverse((o) => {
          if (!o.isInstancedMesh || inTrack.has(o) || mine.has(o) || !o.visible) return;
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          const rad = o.geometry.boundingSphere.radius, cz = o.geometry.boundingSphere.center.z;
          let hit = false;
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m4); const e = m4.elements;
            const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
            if (Math.abs(e[14] + cz * sc - CUT) < rad * sc + 0.4) { straddlers.push({ o, i, m: m4.clone() }); o.setMatrixAt(i, zero); hit = true; }
          }
          if (hit) o.instanceMatrix.needsUpdate = true;
        });
      }
      const bg = scene.getObjectByName('billboards');                           // a billboard standing in the lane slides back out of the rider's way (just the sign structure, never the terrain)
      boards.length = 0;
      if (bg) for (const c of bg.children) {
        box.setFromObject(c); if (box.isEmpty()) continue;
        if (box.max.z > laneZ - 1.8 && box.min.z < laneZ + 1.8 && box.max.x > st.startX - 40 && box.min.x < st.startX + 400 && box.max.x - box.min.x < 40) boards.push({ o: c, z0: c.position.z, back: box.max.z - (laneZ - 1.8) });
      }
    } else {
      for (const o of hiddenObjs) o.visible = true; hiddenObjs.length = 0;
      for (const o of castOff) o.castShadow = true; castOff.length = 0;
      for (const v of villageX) v.o.visible = true; villageX.length = 0;
      for (const b of boards) b.o.position.z = b.z0; boards.length = 0;
      for (const t of straddlers) { t.o.setMatrixAt(t.i, t.m); t.o.instanceMatrix.needsUpdate = true; } straddlers.length = 0;
    }
  }

  const CUT = track.cutZ + 0.4;
  const slideBoards = (k) => { for (const b of boards) b.o.position.z = b.z0 - b.back * k; };     // a billboard standing in the lane slides back out of the rider's way
  const st = {
    mode: 'off', t: 0, from: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    x: 0, y: 0, vx: 8, vy: 0, th: 0, om: 0, grounded: true, coyote: 0, diveOK: false, jumpReq: 0,
    rot: 0, flips: 0, airT: 0, camY: 0, score: 0, coins: 0, down: false, spin: 0, lean: 0.7,
    crashT: 0, inv: 0, boost: 0, startX: 0, best: 0, trickStreak: 0, trickStreakT: -99, nextMile: 500, bestSaid: false, fuel: 1, engineOut: false, outOfFuel: false, lowWarn: false, sputT: 0,
    bonus: 0, dist: 0, mult: 1, comboT: 0, lastTrick: 0, flipsTotal: 0, bestAir: 0, bestMult: 1, overAt: 0,
    bigAir: false, hz: null, viewW: 0, squash: 0, lift: 0, warnedObs: -1, spinA: 0, cx: 0, cy: 0, calmT: 0, warnedX: -1, mudT: 0, zoom: 1, frameDt: 0.016, multT: 0, trick: null, lastAirTap: -9, trickIdx: 0, paused: false, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), guideStep: 0, guideOn: false, guideTapped: false, cleanLandings: 0, impact: null, impactAt: 0, buf: null, charging: false, charge: 0, holdT: 0, jumpVy: 9, airHold: 0, kickW: 0, runT: 0, crouch: 0, maxed: false, spinR: 0, spinF: 0, puffT: 0, camZoom: 0,
    rider: null, onQuit: null, hintT: 0, toastT: 0,
  };
  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const lookV = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const events = { onLand: null, onFlip: null, onCrash: null };

  function frame() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tall = THREE.MathUtils.clamp((1 - camera.aspect) / 0.5, 0, 1);   // portrait phones: closer in, so the bike is not tiny, and the view looks higher so the ground fills more of the screen
    // How much track to show: more at speed, and enough to see the next hazard coming with time to react (about 1.5 s).
    const spK = THREE.MathUtils.clamp((st.vx - 6) / 18, 0, 1), W0 = (27 - 7 * tall) * (1 + 0.1 * tall), bonus = (18 - 9 * tall) * spK * spK * (3 - 2 * spK);   // closer in when slow, well out at full speed
    const needAhead = st.hz ? Math.min(st.hz.x0 - st.cx, 34) / 0.74 : 0;
    // a fuel can in the air or behind a jump: pull back early enough to see the whole set-up and the landing, so there is time to plan
    let canNeed = 0;
    if (st.mode === 'play' && !st.guideOn) for (const c of fuel.all) { if (c.got || c.type === 'ground' || c.x < st.x - 3) continue; if (c.x > st.x + 58) break; canNeed = 52; break; }
    const wipeK = st.mode === 'crash' || st.mode === 'over' ? Math.min(1, st.crashT / 0.8) : 0;
    const Wt = wipeK ? (W0 + bonus * (1 - wipeK)) * (1 - 0.15 * wipeK) : Math.max(W0 + bonus, needAhead, canNeed);   // after a crash the camera eases in on the rider
    st.viewW = st.viewW ? st.viewW + (Wt - st.viewW) * (1 - Math.exp(-(wipeK ? 3.5 : 1.6) * st.frameDt)) : Wt;
    const baseDist = THREE.MathUtils.clamp(st.viewW / (2 * tanH * camera.aspect), 22, 110) * (1 + 0.03 * st.camZoom);
    const c = 0.05 + tall * 0.05;
    // Keep both the bike and the ground in view: if a big jump (or a hill ahead) would push either off the screen, pull back.
    const ref = (x) => { const pt = track.pitSpan(x); return pt ? track.laneAt(pt.x0 - 0.5) - 1.5 : groundY(x); };       // over a gap, the ground to keep in view is the rim, not the bottom of the pit
    const gHere = ref(st.cx), gA = ref(st.cx + 10), gB = ref(st.cx + 22);
    const yLow = Math.min(gHere, gA, gB) - 2.5, yHigh = Math.max(st.cy + 4.5, gA + 3);
    let d = baseDist;
    for (let k = 0; k < 2; k++) {
      const yc = st.camY + 3 + d * c;
      d = Math.max(baseDist, Math.max(yc - yLow, yHigh - yc) / (tanH * 0.9));
    }
    const zoomT = THREE.MathUtils.clamp(d / baseDist, 1, 1.7 - 0.2 * tall);
    st.zoom += (zoomT - st.zoom) * (1 - Math.exp(-(zoomT > st.zoom ? 4 : 1.2) * st.frameDt));   // pulls back quickly, settles back slowly
    const nearK = 1 - 0.32 * THREE.MathUtils.clamp(st.lift / 5, 0, 1);                                          // pulled in closer while the camera is lifted over the start hill
    const dist = Math.min(baseDist * st.zoom, 150) * nearK;
    const wipe = st.mode === 'crash' || st.mode === 'over' ? Math.min(1, st.crashT / 0.8) : 0;
    const ahead = (0.26 * st.viewW + st.vx * 0.08) * (1 - 0.45 * wipe) * nearK;                // (after a crash the camera settles with the rider nearer the middle)                           // look well ahead (the bike sits about a quarter of the way in from the left)
    target.pos.set(st.cx + ahead * (1 + 0.6 * (st.zoom - 1)), st.camY + 2.5 + dist * 0.11, laneZ + dist);
    target.look.set(st.cx + ahead * (1 + 0.6 * (st.zoom - 1)), st.camY + 3 + dist * c, laneZ);
    // A clear view of the rider: if ground nearer the camera (a hill on the slope toward the viewer) would hide the bike, the camera lifts over it.
    {
      const bx = st.cx, by = st.cy + 1.2, tx = target.pos.x, ty = target.pos.y, tz = target.pos.z;
      let need = 0;
      for (let k = 1; k <= 12; k++) {
        const t = k / 14, gx = tx + (bx - tx) * t, gz = tz + (laneZ - tz) * t, yNeed = (track.groundAt(gx, gz) + 0.8 - by * t) / (1 - t);   // the camera height at which the line of sight clears this ground
        if (yNeed - ty > need) need = yNeed - ty;
      }
      need = Math.max(need, track.groundAt(tx, tz) + 1.6 - ty);                                               // (and the camera itself stays above the ground)
      need = Math.min(need, 14);
      st.lift += (need - st.lift) * (1 - Math.exp(-(need > st.lift ? 7 : 2) * st.frameDt));                  // up quickly, down slowly
      target.pos.y += st.lift;
    }
    return dist;
  }
  let warmPromise = null, warmDone = false;
  const hudLast = { fuel: -1, low: null, score: -1, coins: -1, hidden: null, p: '', level: -1, mult: -1 };       // (touch the page only when a value actually changed)
  function setHud() {
    const sc = Math.floor(st.score);
    if (scoreEl && sc !== hudLast.score) { hudLast.score = sc; scoreEl.textContent = String(sc); }
    if (fuelEl) {
      const f = Math.round(st.fuel * 100), low = f < 30, lvl = f >= 70 ? 'ok' : low ? 'low' : 'mid';
      if (f !== hudLast.fuel) { hudLast.fuel = f; fuelFill.style.transform = 'scaleX(' + (f / 100) + ')'; fuelEl.setAttribute('aria-valuenow', String(f)); }
      if (lvl !== hudLast.low) { hudLast.low = lvl; fuelEl.dataset.level = lvl; fuelEl.classList.toggle('low', low); }
    }
    if (coinsEl && st.coins !== hudLast.coins) { hudLast.coins = st.coins; coinsEl.textContent = String(st.coins); }
    if (grooveEl) {
      const hid = st.mode === 'over' || st.mult < 2; if (hid !== hudLast.hidden) { hudLast.hidden = hid; grooveEl.hidden = hid; }
      const p = Math.min(1, Math.max(0, st.comboT / COMBO_TIME)).toFixed(3); if (p !== hudLast.p) { hudLast.p = p; grooveEl.style.setProperty('--p', p); }
      if (st.mult !== hudLast.level) { hudLast.level = st.mult; grooveEl.dataset.level = String(st.mult); }
    }
    if (multEl && st.mult !== hudLast.mult) { hudLast.mult = st.mult; multEl.textContent = '×' + st.mult; }
  }
  /** The multiplier going up pops up right above the rider. */
  function flashMult() {
    if (!multFxEl) return;
    audio.combo(st.mult); juice.flash('#ffd36b', 0.14, 220); juice.halo('#ffcf5a', 5.5, 0.5, 0.55);
    if (grooveEl) { grooveEl.classList.remove('pulse'); void grooveEl.offsetWidth; grooveEl.classList.add('pulse'); }
    multFxEl.textContent = '\u00d7' + st.mult + ' combo!'; multFxEl.hidden = false;
    multFxEl.classList.remove('show'); void multFxEl.offsetWidth; multFxEl.classList.add('show');
    clearTimeout(st.multT); st.multT = setTimeout(() => { multFxEl.hidden = true; }, 1400);
  }
  const scoreNow = () => st.dist * 0.5 + st.bonus;
  /** The combo multiplier (x1 to x5): each trick or perfect landing adds one, a clean landing keeps it alive, and it runs down on a timer. */
  function combo(up) {
    if (up) { if (st.mult < 5) { st.mult++; flashMult(); } st.comboT = COMBO_TIME; }
    else if (st.mult > 1) st.comboT = COMBO_TIME;
    st.bestMult = Math.max(st.bestMult, st.mult);
  }
  function award(points, label) {
    const p = Math.round(points * st.mult);
    st.bonus += p; st.lastTrick = st.t;
    toast(label ? `${label} +${p}${st.mult > 1 ? ' ×' + st.mult : ''}` : '');
  }
  const loadBest = () => { try { return parseInt(localStorage.getItem('dirtbike-best') || '0', 10) || 0; } catch (e) { return 0; } };
  const saveBest = (v) => { try { localStorage.setItem('dirtbike-best', String(v)); } catch (e) { /* private mode */ } };
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text; toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
  }
  const groundY = (x) => track.laneAt(x);

  /** Where the wheels would sit on the ground under the bike's centre x: height of the axle line and the ground's angle. */
  function groundPose(x) {
    let gR = groundY(x - HW), gF = groundY(x + HW);
    const drop = HW * 1.16; gF = Math.max(gF, gR - drop); gR = Math.max(gR, gF - drop);                // at a cliff edge (a gap) the bike tips off it gently instead of nose-diving
    const phi = Math.atan2(gF - gR, 2 * HW);
    return { y: (gR + gF) / 2 + R / Math.cos(phi), phi };
  }

  /** Ground height for the drifting life: over a gap, the rim rather than the bottom of the pit. */
  const lifeGround = (x, z) => { const pt = track.pitSpan(x); return pt ? track.groundAt(pt.x0 - 0.5, z) : track.groundAt(x, z); };

  function startRun(x) {
    st.warnedObs = -1; st.warnedX = -1; st.lift = 0; mudCoat.reset(); tracks.clear();
    st.cpx = undefined; st.daze = 0; st.x = x; st.vx = 8; st.vy = 0; st.om = 0; st.grounded = true; st.rot = 0; st.flips = 0; st.airT = 0; st.mode = 'play'; st.crashT = 0; st.inv = 0; st.boost = 0;
    st.zoom = 1; st.viewW = 0; st.hz = null; st.charging = false; st.charge = 0; st.holdT = 0; st.airHold = 0; st.kickW = 0; st.crouch = 0; st.maxed = false; st.buf = null; st.impact = null; st.trick = null; st.spinA = 0; bike.model.rotation.y = 0; st.lastAirTap = -9; st.trickIdx = 0; puffs.clear(); dirt.clear();
    const p = groundPose(x); st.y = p.y; st.th = p.phi; st.vy = 0; st.camY = st.y;
    ragdoll.restore();
  }

  /** Hide the per-round overlays (the JUMP markers, the toast, the combo pop-up): after a crash, on a restart, and on leaving. */
  function clearRoundUi(hintToo = false) {
    Object.assign(hudLast, { fuel: -1, low: null, score: -1, coins: -1, hidden: null, p: '', level: -1, mult: -1 });         // (the HUD is redrawn from scratch)
    for (const e of jumpEls) e.hidden = true;
    if (toastEl) { toastEl.textContent = ''; toastEl.classList.remove('show'); }
    if (multFxEl) { multFxEl.hidden = true; multFxEl.classList.remove('show'); clearTimeout(st.multT); }
    if (hintToo && hint) { hint.hidden = true; clearTimeout(st.hintT); }
  }
  function newRun() {
    clearRoundUi(!st.guideOn);
    st.score = 0; st.coins = 0; st.bonus = 0; st.dist = 0; st.mult = 1; st.comboT = 0; st.flipsTotal = 0; st.bestAir = 0; st.bestMult = 1; st.lastTrick = 0; st.runT = 0;
    const m = /[?&]course=(\d+)/.exec(location.search);
    const sd = m ? parseInt(m[1], 10) : Math.floor(Math.random() * 1e6) + 1;
    track.reset(sd); track.setTrailStart(st.startX + 84); coins.reset(sd, st.startX); fuel.reset(sd, st.startX);
    st.trickStreak = 0; st.trickStreakT = -99; st.nextMile = 500; st.bestSaid = false;
    st.fuel = 1; st.engineOut = false; st.outOfFuel = false; st.lowWarn = false; st.sputT = 0;
    startRun(st.startX);
    if (overEl) overEl.hidden = true;
    document.body.classList.remove('game-over');
    setHud();
  }

  /** The run is over: tally it up, remember the best, and offer another go. */
  function showOver() {
    st.mode = 'over'; st.overAt = st.t;
    st.score = scoreNow();
    const final = Math.floor(st.score), isBest = final > st.best;
    if (isBest) { st.best = final; saveBest(final); }
    audio.ui('cardIn'); audio.over(isBest && final > 0); for (const e of jumpEls) e.hidden = true;
    if (!overEl) return;
    const goTitle = $('go-title'); if (goTitle) goTitle.textContent = st.outOfFuel ? 'Out of fuel!' : 'Wipeout!';
    $('go-score').textContent = final.toLocaleString();
    $('go-best').textContent = st.best.toLocaleString();
    $('go-dist').textContent = Math.round(st.dist * 0.6).toLocaleString() + ' m';
    $('go-coins').textContent = String(st.coins);
    $('go-flips').textContent = String(st.flipsTotal);
    $('go-air').textContent = st.bestAir.toFixed(1) + ' s';
    $('go-groove').textContent = '×' + st.bestMult;
    $('go-new').hidden = !isBest || final === 0;
    overEl.hidden = false;
    document.body.classList.add('game-over');
    if (grooveEl) grooveEl.hidden = true;
    const again = $('go-again'); again.disabled = true;
    setTimeout(() => { again.disabled = false; if (st.mode === 'over') again.focus({ preventScroll: true }); }, 650);   // so a panicked tap cannot restart at once
  }

  function fireJump() {                                     // jump with the current charge: higher the longer it built
    const c = st.charge;
    st.jumpVy = JUMP_MIN + (JUMP_MAX - JUMP_MIN) * (1 - (1 - c) * (1 - c));
    st.jumpReq = 0.12; st.charging = false; audio.jump(c);
    if (c > 0.35) {                                                                     // a big jump: a ring at the wheels, a stretch, a flick of speed lines
      const kk = SC / SCALE, gy = st.y - R;
      juice.ring(st.x - HW * 0.5, gy + 0.1, laneZ, '#ffd9a0', 0.6, (2.5 + 3 * c) * kk, 0.45, true, 0.8); dirt.burst(st.x - HW * 0.5, gy + 0.2, laneZ, Math.round(6 + 10 * c), 0.55 + 0.5 * c);
      st.squash = -0.5 * c; juice.flick(0.8 * c);
    }
  }

  // ---- guided first run: short coaching tips until each move has been done, remembered across visits ----
  const GUIDE_KEY = 'dirtbike-guide';
  const guideDone = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { return false; } };
  const saveGuideDone = () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) { /* private mode */ } };
  function setCoach(text) {
    if (!hint) return;
    if (!text) { hint.hidden = true; return; }
    if (hintText && hintText.textContent !== text) hintText.textContent = text;
    hint.classList.add('coach'); hint.hidden = false; if (skipBtn) skipBtn.hidden = false;
  }
  function endGuide(done) {
    st.guideOn = false; if (done) { saveGuideDone(); toast("You've got it - ride on!"); } else saveGuideDone();
    if (hint) { hint.hidden = true; hint.classList.remove('coach'); }
  }
  /** Which tip fits what the rider is doing right now? Steps: 0 charge, 1 release, 2 first jumps (air tips), 3 one more smooth landing. */
  function guideTick() {
    if (!st.guideOn || st.mode !== 'play' || st.paused) { if (hint && st.guideOn) hint.hidden = true; return; }
    if (st.runT < 1.2) { setCoach(''); return; }
    if (st.guideStep === 0) {
      setCoach('Press and hold anywhere to crouch and charge a jump');
      if (st.charging && st.charge >= 0.3) st.guideStep = 1;
    } else if (st.guideStep === 1) {
      setCoach(st.charging ? 'Now let go to jump!' : 'Press and hold anywhere to crouch and charge a jump');
      if (!st.grounded) st.guideStep = 2;
      else if (!st.charging) st.guideStep = 0;
    } else if (st.guideStep === 4) {
      setCoach(st.grounded ? 'Last one: jump high, then double-tap quickly in the air for a trick' : 'Double-tap quickly now for a trick!');
    } else {
      if (!st.grounded) {
        const im = st.impact;
        setCoach(im && im.t < 1.6 ? 'Hold or tap to bring the nose down - aim for a green landing circle' : 'The nose tips back in the air: hold or tap to bring it forward');
      } else setCoach(st.guideStep === 2 ? 'Jump again, then hold or tap in the air to land smoothly' : 'Nice! Hold longer for a bigger jump');
    }
  }

  // ---- tricks: double-tap in the air ----
  function trickDone() { if (st.guideOn && st.guideStep >= 4) endGuide(true); }
  const TRICK_COL = { back: '#ff8a72', front: '#ff8a72', spin: '#6fd8c8', spinb: '#6fd8c8' };
  const trickColor = () => TRICK_COL[st.trick?.def?.id] || '#ffd36b';
  /** A trick has been landed: burst, ring, a beat of hit-stop. */
  function trickFx(id) {
    const col = TRICK_COL[id] || '#ffd36b';
    st.trickStreak = st.t - st.trickStreakT < 4 ? st.trickStreak + 1 : 1; st.trickStreakT = st.t; audio.trickDone(st.trickStreak);      // (tricks in a row build the chime)
    juice.burst('trick', st.x, st.y + 0.3, laneZ, 26, col); juice.ring(st.x, st.y + 0.3, laneZ + 0.4, col, 0.8, 4.8, 0.5, false, 0.9);
    juice.halo(col, 7, 0.5, 0.7); juice.hitStop(40); juice.flash(col, 0.12, 160);
  }
  function startTrick() {
    const tti = st.impact ? st.impact.t - (st.t - st.impactAt) : 0;
    let pick = null;
    for (let k = 0; k < TRICKS.length && !pick; k++) {                              // the next trick in the cycle that fits the air left
      const tr = TRICKS[(st.trickIdx + k) % TRICKS.length];
      if (!tr.flip || tti > TRICK_TIME + 0.05) { pick = tr; st.trickIdx = (st.trickIdx + k + 1) % TRICKS.length; }
    }
    if (!pick) return;
    st.trick = pick.flip ? { kind: 'flip', dir: pick.flip, left: TAU, def: pick } : { kind: 'spin', dir: pick.spin, t: 0, dur: TRICK_TIME, def: pick };
    audio.trick(); juice.ring(st.x, st.y + 0.3, laneZ + 0.4, trickColor(), 0.6, 2.6, 0.35, false, 0.8); juice.halo(trickColor(), 5, TRICK_TIME, 0.4);
  }
  function finishPose(award_) {
    const t = st.trick; if (!t || t.kind !== 'spin') return;
    st.trick = null;
    if (award_) { combo(true); award(t.def.pts, t.def.label); trickDone(); trickFx(t.def.id); }
  }

  /** Where and when the bike will touch down if nothing changes (a free-flight estimate). */
  function predictLanding() {
    if (st.grounded || st.mode !== 'play') return null;
    for (let t = 0.03; t <= 3; t += 0.03) {
      const vyT = st.vy - GRAV * t;
      const yy = st.y + st.vy * t - 0.5 * GRAV * t * t, xx = st.x + st.vx * t;
      if ((vyT < 0 || t > 0.4) && yy - R <= groundY(xx)) return { t, x: xx, y: groundY(xx), phi: groundPose(xx).phi };
    }
    return null;
  }

  /** One fixed physics step of `h` seconds. */
  function physics(h) {
    const diving = st.down && st.diveOK && st.airHold > 0.18;   // a hold (not a tap) dives continuously
    if (st.mode === 'crash' || st.mode === 'over') {
      st.vx *= Math.exp(-2.2 * h);
      st.x += st.vx * h;
      const p = groundPose(st.x);
      st.y = p.y; st.th += wrap(p.phi - st.th) * Math.min(1, h * 6);
      return;
    }
    st.daze = Math.max(0, (st.daze || 0) - h);                              // (after a rough landing the bike stays sluggish for a while: see below)
    const dist = Math.max(0, st.x - st.startX);
    const base = (st.guideOn ? 12 : 15) + Math.min(9, dist / 260);          // cruising speed: faster, and it keeps building
    if (st.grounded) {
      const prevY = st.y;
      const p = groundPose(st.x + st.vx * h);
      const slope = Math.tan(p.phi);
      const mud = track.mudAt(st.x);
      const dz = st.daze > 0 ? 0.42 + 0.58 * (1 - st.daze / DAZE_TIME) ** 2 : 1;                 // a rough landing: the bike is held to under half its pace, then slowly gets its speed back
      const aim = st.engineOut ? 0 : (base + st.boost * (st.daze > 0 ? 0.3 : 1) - Math.max(-3, Math.min(5, slope * 6))) * (1 - 0.58 * mud) * dz;               // mud drags the bike down to a crawl
      st.vx += (aim - st.vx) * Math.min(1, (mud > 0.2 ? 4 : st.daze > 0 ? 1.4 : 2.5) * h);
      if (mud > 0.2) st.boost *= Math.exp(-2 * h);
      if (track.inPit(st.x) || track.inPit(st.x - HW * 0.9 + 0.7)) { crash('Into the pit!'); return; }       // driven over the edge of a gap
      st.x += st.vx * h;
      const q = groundPose(st.x);
      if (st.charging && track.laneAt(st.x) - track.laneAt(st.x + HW + 0.5) > 3) fireJump();                  // holding at the lip of a gap: the charge is released for you there
      let leaves = false;                                     // would a free-flying bike clear the ground over the next ~0.12 s?
      for (let t = 0.04; t <= 0.121 && !leaves; t += 0.04) leaves = prevY + st.vy * t - 0.5 * (GRAV * 0.6) * t * t > groundPose(st.x + st.vx * t).y + 0.04;   // eager: bumps and small lifts give a little air even with no button down
      st.coyote = 0.08;
      if (st.jumpReq > 0) {                                   // jump: the carried ground velocity plus a kick
        st.jumpReq = 0; st.grounded = false; st.vy += st.jumpVy; st.om = 0; st.kickW = 0; st.rot = 0; st.airT = 0; st.diveOK = false; st.airHold = 0; st.y = prevY;
        return;
      }
      if (leaves && st.vx > 4 && !st.charging) {
        const lipSlope = track.slopeAt(st.x - 1.2);
        if (lipSlope > 0.35) st.vy += Math.min(8, lipSlope * st.vx * 0.32);                                       // the lip of a big kicker throws you up a little extra   // the ground fell away faster than gravity: we take off (but never while the button is held: charging keeps the bike glued to the ground)
        st.grounded = false; st.om = 0; st.kickW = 0; st.rot = 0; st.airT = 0; st.diveOK = false; st.airHold = 0; st.y = prevY;
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
    if (st.buf && st.t - st.buf.t0 > 0.22) {                    // the landing did not come: treat the held-over press as an ordinary air press
      st.buf = null;
      if (st.down) { st.diveOK = true; st.airHold = 0; }
      st.kickW = Math.max(-6, st.kickW - TAP_KICK);
    }
    if (st.down && st.diveOK) st.airHold += h; else st.airHold = 0;
    if (st.jumpReq > 0 && st.coyote > 0) { st.jumpReq = 0; st.vy = Math.max(st.vy, 0) + st.jumpVy; st.coyote = 0; }   // a jump pressed just after the lip
    const pull = st.down && st.diveOK ? Math.min(1, st.airHold / 0.06) : 0;            // holding pulls the bike down harder, so you choose where it lands
    st.vy -= GRAV * (1 + (DIVE_GRAV - 1) * pull) * h;
    if (st.vy < -75) st.vy = -75;
    st.x += st.vx * h; st.y += st.vy * h;
    // The nose wants to tip backward (softer during the first 45 s of a run); a hold dives it, a tap gives a quick kick forward.
    const back = BACK_W * (0.5 + 0.5 * Math.min(1, st.runT / 45));
    const want = diving ? -3.8 : back;                                 // holding eases the nose forward, slowly
    const rate = diving ? 6 : (st.om < 0 ? 8 : BACK_RATE);
    st.om += (want - st.om) * Math.min(1, rate * h);
    st.kickW *= Math.exp(-7 * h);
    let dth = (st.om + st.kickW) * h, assistOn = true;
    if (st.trick && st.trick.kind === 'flip') {                          // a backflip trick: a controlled full turn
      const step = Math.min(st.trick.left, (TAU / TRICK_TIME) * h); st.trick.left -= step;
      dth = step * st.trick.dir; assistOn = false; st.om = 0; st.kickW = 0;
      if (st.trick.left <= 1e-6) st.trick = null;
    } else if (st.trick && st.trick.kind === 'spin') {
      st.trick.t += h;
      if (st.trick.t >= st.trick.dur) finishPose(true);
    }
    // Landing assist: close to the ground and falling, the suspension and the rider square the bike up with the slope.
    const gp = groundPose(st.x + st.vx * 0.12);
    const above = st.y - R - groundY(st.x);
    if (assistOn && st.vy < 0 && above < 2.4 && st.airT > 0.2) { const k = Math.min(1, 2.0 * h * (1 - above / 2.4 + 0.3)); dth += wrap(gp.phi - st.th) * k; }
    st.th += dth; st.rot += dth;
    if (st.rot >= TAU - 1.1) { st.rot -= TAU; st.flips++; st.flipsTotal++; events.onFlip?.('back'); combo(true); award(400, 'Backflip!'); trickDone(); trickFx(st.trick?.def?.id || 'back'); }
    else if (st.rot <= -(TAU - 1.1)) { st.rot += TAU; st.flips++; st.flipsTotal++; events.onFlip?.('front'); combo(true); award(400, 'Front flip!'); trickDone(); trickFx(st.trick?.def?.id || 'front'); }
    // wheels
    const c = Math.cos(st.th), s = Math.sin(st.th);
    const rx = st.x - HW * c, ry = st.y - HW * s, fx = st.x + HW * c, fy = st.y + HW * s;
    const clearR = ry - R - groundY(rx), clearF = fy - R - groundY(fx);
    const clear = Math.min(clearR, clearF);
    if (clear <= 0) {
      if (st.airT < 0.12) { st.y -= clear; if (st.vy < 0) st.vy = 0; }   // still scraping the lip: lift clear rather than land
      else if (st.vy <= 0) land();
    }
  }

  /** Feedback for touching down: bigger and greener the better the landing. */
  function landFx(air, perfect, rough) {
    const gy = groundY(st.x), kk = SC / SCALE;
    const dust = (n, spread, color, a) => { for (let i = 0; i < n; i++) { const dir = i % 2 ? 1 : -1; puffs.emit(st.x + (Math.random() - 0.5) * 1.2, gy + 0.2, laneZ + 0.3, dir * (spread * (0.4 + Math.random())), 0.8 + Math.random() * 2, 0.5 * kk, 1.5 * kk, 0.7, color, a); } };
    if (air > 0.45 && perfect) {
      audio.land('perfect', air); dirt.burst(st.x, gy, laneZ, 10, 0.8);
      juice.ring(st.x, gy + 0.15, laneZ, '#8fd081', 0.7, 6.5 * kk, 0.65);
      juice.ring(st.x, gy + 0.15, laneZ, '#e8f7c8', 0.4, 4 * kk, 0.45, true, 0.7);
      juice.burst('perfect', st.x, gy + 0.6, laneZ, 40, '#d9f7a0'); juice.burst('perfect', st.x, gy + 1.0, laneZ, 18, '#fff2b0'); juice.halo('#9ff09a', 7.5, 0.7, 0.8);
      juice.ring(st.x, gy + 0.15, laneZ, '#c8ffb0', 0.3, 9 * kk, 0.8, true, 0.55); juice.flick(2);
      dust(10, 6, '#b79b78', 0.55); st.squash = 1; juice.bump(-0.5); juice.hitStop(55); juice.flash('#a8e89a', 0.22, 170); juice.flick(1);
    } else if (air > 0.45 && !rough) {
      audio.land('clean', air); dirt.burst(st.x, gy, laneZ, 6, 0.6);
      juice.ring(st.x, gy + 0.15, laneZ, '#e8c24a', 0.6, 4 * kk, 0.5, true, 0.8); juice.burst('clean', st.x, gy + 0.5, laneZ, 9, '#ffe9a0');
      dust(6, 4.5, '#b79b78', 0.5); st.squash = 0.6; juice.bump(-0.25);
    } else if (rough && air > 0.3) {
      audio.land('rough', air); dirt.burst(st.x, gy, laneZ, 14, 1, 0.3);
      dust(8, 5, '#8a6b4c', 0.6); st.squash = 0.8; juice.shake(0.35, 220); juice.bump(-0.5);
    } else if (air > 0.2) { audio.land('small', air); dust(3, 3, '#b79b78', 0.4); st.squash = 0.3; }
  }

  function land() {
    const p = groundPose(st.x);
    const delta = wrap(st.th - p.phi);                         // + nose up, - nose down
    st.grounded = true; st.om = 0; st.kickW = 0; st.diveOK = false;
    const air = st.airT;
    if (track.inPit(st.x) || track.inPit(st.x - HW * Math.cos(st.th) * 0.9 + 0.7)) { crash('Into the pit!'); return; }   // fell short of the far bank
    if (st.trick) { if (st.trick.kind === 'spin' && st.trick.t > 0.35) finishPose(true); st.trick = null; }
    if (delta > 1.15 || delta < -0.95) { crash(); return; }
    st.y = p.y;
    st.vy = st.vx * Math.tan(p.phi);
    st.th = p.phi + delta * 0.55;                              // the suspension absorbs part of the angle
    const perfect = Math.abs(delta) < 0.22, rough = Math.abs(delta) > 0.5;
    st.bestAir = Math.max(st.bestAir, air);
    if (rough && air > 0.3) { if (st.mult > 1) audio.comboLost(); st.vx *= 0.45; st.boost *= 0.3; st.daze = DAZE_TIME; juice.shake(0.35, 260); st.mult = Math.max(1, st.mult - 1); st.comboT = st.mult > 1 ? COMBO_TIME : 0; toast('Rough landing'); }   // (small hops over bumps are never punished)
    else {
      if (air > 0.45) {
        st.boost = Math.min(BOOST_CAP, st.boost + (perfect ? 2.6 : 0.5)); if (perfect) st.vx += 2.5;       // a perfect landing: a real kick of speed
        combo(perfect);
        award((perfect ? 150 : 60) + Math.max(0, air - 0.5) * 90, perfect ? 'Stuck it!' : 'Clean landing');
      }
    }
    st.rot = 0;
    if (st.guideOn && st.guideStep >= 2 && air > 0.4 && !rough) {   // a smooth landing counts toward finishing the tips
      if (st.guideStep < 4) st.guideStep++;
    }
    if (st.buf) {                                               // a press just before touchdown: apply it now
      const b = st.buf; st.buf = null;
      if (b.rel) {                                         // released already: the jump goes off the moment the wheels touch
        const c = Math.min(1, b.held / CHARGE_TIME);
        st.jumpVy = JUMP_MIN + (JUMP_MAX - JUMP_MIN) * (1 - (1 - c) * (1 - c)); st.jumpReq = 0.12;
      } else { st.charging = true; st.holdT = st.t - b.t0; }    // still down: the charge has already started
    } else if (st.down) { st.charging = true; st.holdT = 0; }   // still holding at touchdown: start charging the next jump straight away
    landFx(air, perfect, rough);
    events.onLand?.({ air, delta, perfect, rough, flips: st.flips });
    st.flips = 0;
  }

  // ---- obstacles on the trail: clear them with a jump; hit one slowly and you stumble, hit one fast and you crash ----
  const cruiseSpeed = () => (st.guideOn ? 12 : 15) + Math.min(9, Math.max(0, st.x - st.startX) / 260);
  function checkObstacles() {
    const list = track.obstaclesIn(st.x - 6, st.x + 6); if (!list.length) return;
    const c = Math.cos(st.th), sn = Math.sin(st.th);
    for (const o of list) {                                                              // a close call: cleared with the wheels less than a metre above it
      if (o.hit || o.near) continue;
      if (Math.abs(st.x - o.x) < o.hw + 1.2) o.minClear = Math.min(o.minClear ?? 9, st.y - R - (track.laneAt(o.x) + o.h));
      else if (st.x > o.x && o.minClear !== undefined) { o.near = true; if (o.minClear < 0.9 && o.minClear > -0.2) { audio.nearMiss(); st.bonus += 40 * st.mult; toast('Close call!'); } }
    }
    for (const o of list) {
      if (o.hit) continue;
      const top = track.laneAt(o.x) + o.h;
      for (const sg of [-1, 1]) {                                                        // each wheel against the obstacle's top (a little forgiving at the edges)
        const wx = st.x + sg * HW * c, wy = st.y + sg * HW * sn;
        if (Math.abs(wx - o.x) < o.hw + R * 0.5 && wy - R < top - 0.14) { hitObstacle(o); return; }
      }
    }
  }
  function hitObstacle(o) {
    o.hit = true;
    const fast = st.vx > cruiseSpeed() + (o.big ? 0.8 : 2.4);                           // boosted and fast: a crash; at cruising pace: a stumble
    const gy = track.laneAt(o.x), kk = SC / SCALE;
    dirt.burst(o.x, gy + 0.2, laneZ, fast ? 16 : 10, fast ? 1.1 : 0.8, 0.2);
    if (fast) { crash(`Hit a ${o.label.toLowerCase()}!`); return; }
    st.vx = Math.max(7, st.vx * 0.55); st.boost = 0; st.charging = false; st.charge = 0;
    st.mult = Math.max(1, st.mult - 1); st.comboT = st.mult > 1 ? COMBO_TIME : 0;
    st.squash = 1; st.kickW = Math.max(-6, st.kickW - 3.5);
    juice.shake(0.4, 220); juice.bump(-0.45); juice.flash('#ffffff', 0.12, 120); audio.stumble(); if (st.mult > 1) audio.comboDrop();
    toast('Stumble! Jump the next one');
  }

  function crash(msg = 'Crash!') {
    st.mode = 'crash'; st.crashT = 0; st.calmT = 0; st.mult = 1; st.comboT = 0; st.trickStreak = 0;
    events.onCrash?.();
    toast(msg);
    const pit = /pit/i.test(msg); audio.crash(pit);
    for (const e of jumpEls) e.hidden = true;
    juice.flash(pit ? '#10161c' : '#ffffff', pit ? 0.35 : 0.34, pit ? 220 : 120); juice.slowmo(0.35, 450); juice.shake(0.7, 380);
    if (pit) dirt.burst(st.x, st.y, laneZ, 28, 1.1, 0.8); else { juice.burst('crash', st.x, st.y, laneZ, 18, '#ffd9a0'); dirt.burst(st.x, groundY(st.x), laneZ, 18, 1, 0.2); } juice.ring(st.x, groundY(st.x) + 0.2, laneZ, '#ffffff', 0.6, 5, 0.5, true, 0.7);
    for (let i = 0; i < 12; i++) puffs.emit(st.x + (Math.random() - 0.5) * 2, st.y - 0.4, laneZ + 0.3, (Math.random() - 0.5) * 10, 1 + Math.random() * 4, 0.7, 2.2, 0.9, pit ? '#6b5238' : '#b79b78', 0.6);
    // the rider is thrown clear: every body part goes its own way
    bike.root.updateMatrixWorld(true);
    ragdoll.detach(st.vx, Math.max(st.vy, 0));
  }

  $('gp-resume')?.addEventListener('click', () => { audio.ui('tap'); api.resume(); });
  $('gp-quit')?.addEventListener('click', () => { audio.ui('back'); api.stop(); });
  $('gh-pause')?.addEventListener('click', () => { audio.ui('tap'); api.pause(); });
  const soundBtn = $('gh-sound');
  const showSound = () => { if (!soundBtn) return; soundBtn.setAttribute('aria-pressed', String(audio.enabled)); soundBtn.setAttribute('aria-label', audio.enabled ? 'Sound on' : 'Sound off'); };
  soundBtn?.addEventListener('click', () => { audio.unlock(); audio.enabled = !audio.enabled; showSound(); if (audio.enabled) audio.ui('tap'); });
  audio.onChange(showSound); showSound();
  skipBtn?.addEventListener('click', () => endGuide(false));
  window.addEventListener('blur', () => api.pause());                          // auto-pause: losing the window, or the tab going to the background
  document.addEventListener('visibilitychange', () => { if (document.hidden) api.pause(); });
  $('go-again')?.addEventListener('click', () => { if (st.mode === 'over') { audio.ui('confirm'); newRun(); } });
  $('go-quit')?.addEventListener('click', () => { audio.ui('back'); api.stop(); });
  const api = {
    get active() { return st.mode !== 'off'; },
    /** Debug / test access. */
    get state() { return { lift: st.lift, trick: st.trick && (st.trick.def.id), jumpVy: st.jumpVy, impact: st.impact, buf: !!st.buf, charge: st.charge, charging: st.charging, om: st.om, boost: st.boost, x: st.x, y: st.y, vx: st.vx, vy: st.vy, th: st.th, grounded: st.grounded, mode: st.mode, flips: st.flips, airT: st.airT }; },
    events,
    focusDistance: 26,
    onQuit: null,
    start(homeCam, startX = 0) {
      if (st.mode !== 'off') return;
      st.t = 0; st.down = false; st.startX = startX; st.best = loadBest();
      st.home = { pos: homeCam.pos.clone(), look: homeCam.look.clone() };
      st.from.pos.copy(homeCam.pos); st.from.look.copy(homeCam.look);
      setBikeScale();
      track.visible = true; coins.visible = true; fuel.visible = true; puffs.visible = true; dirt.visible = true; juice.reset(); juice.visible = true;
      audio.unlock(); audio.start();
      newRun();
      bike.root.visible = true;
      clip.constant = 60; applyClip(true);
      document.body.classList.add('game-mode');
      document.activeElement?.blur?.();                        // keyboard focus must not stay on a button that is about to disappear: Space has to reach the game
      if (hud) hud.hidden = false;
      const gq = /[?&]guide=(\d)/.exec(location.search);
      st.guideOn = gq ? gq[1] === '1' : !guideDone(); st.guideStep = 0;
      if (hint) {
        clearTimeout(st.hintT);
        if (st.guideOn) { hint.hidden = true; hint.classList.add('coach'); }
        else { hint.classList.remove('coach'); if (hintText) hintText.textContent = 'Hold to crouch, release to jump \u00b7 in the air: hold to drop faster, double-tap for tricks'; if (skipBtn) skipBtn.hidden = true; hint.hidden = false; st.hintT = setTimeout(() => { hint.hidden = true; }, 6000); }
      }
      st.paused = false; if (pauseEl) pauseEl.hidden = true; document.body.classList.remove('game-paused');
      setHud();
    },
    stop() {
      if (st.mode === 'off' || st.mode === 'out') return;
      clearRoundUi(true);
      st.mode = 'out'; st.t = 0; st.leaveFrom = { pos: camera.position.clone(), look: lookV.clone() };
      st.down = false;
      if (hud) hud.hidden = true;
      if (overEl) overEl.hidden = true;
      st.paused = false; if (pauseEl) pauseEl.hidden = true; document.body.classList.remove('game-paused');
      if (hint) hint.hidden = true;
      st.guideOn = false;
      document.body.classList.remove('game-over');
      clearTimeout(st.hintT);
      document.body.classList.remove('game-mode');
    },
    get coinsDebug() { return coins; },
    get fuelDebug() { return fuel; },
    /** (for tests) set the tank (0..1). */
    setFuel(v) { st.fuel = v; st.lowWarn = false; },
    get fuelLevel() { return st.fuel; },
    get track() { return track; },
    get audioDebug() { return audio; },
    get mudCoatDebug() { return mudCoat; },
    get ragdollDebug() { return ragdoll; },                                                                     // (for tests)
    /** Compile the game's own shaders (bike, coins, puffs, mud, landing circle) in the background, so the first click does not stall the scene. */
    /** True once the background preparation (shader compile, the houses) has finished: the first ride then starts without a stall. */
    get ready() { return warmDone; },
    /** Resolves when it is ready (starting the preparation now if it has not begun). */
    whenReady() { return warmDone ? Promise.resolve() : api.warmUp(); },
    /** main.js sets this to compile against the offscreen target the scene is really drawn into. */
    compileHook: null,
    warmUp() {
      if (warmPromise) return warmPromise;
      if (st.mode !== 'off') return Promise.resolve();
      st.warmed = true;
      warmPromise = (async () => {
        const prev = bike.root.position.y;
        bike.root.position.y = -800; landMark.position.y = -800;
        bike.root.visible = true; landMark.visible = true; coins.visible = true; fuel.visible = true; puffs.visible = true; dirt.visible = true; track.visible = true; track.prewarm(true);
        try { if (api.compileHook) await api.compileHook(scene, camera); else if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch (e) { /* not fatal */ }
        if (st.mode === 'off') { bike.root.visible = false; landMark.visible = false; coins.visible = false; fuel.visible = false; puffs.visible = false; dirt.visible = false; track.visible = false; }
        track.prewarm(false);
        bike.root.position.y = prev;
        for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 90)); if (!world.warmHouse?.()) break; }      // the background houses, built one at a time while idle
        warmDone = true;
      })();
      return warmPromise;
    },
    get paused() { return st.paused; },
    /** Freeze the ride (auto on losing focus, the pause button or P) and show the pause card. */
    pause() {
      if (st.mode !== 'play' || st.paused) return;
      st.paused = true; st.down = false; st.charging = false; st.buf = null; st.charge = 0; audio.pause(); for (const e of jumpEls) e.hidden = true;
      if (hint) hint.hidden = true;
      document.body.classList.add('game-paused');
      if (pauseEl) { pauseEl.hidden = false; setTimeout(() => { if (st.paused) document.getElementById('gp-resume')?.focus({ preventScroll: true }); }, 50); }
    },
    resume() {
      if (!st.paused) return;
      st.paused = false; st.down = false; audio.resume();
      if (pauseEl) pauseEl.hidden = true;
      document.body.classList.remove('game-paused');
    },
    togglePause() { if (st.paused) api.resume(); else api.pause(); },
    /** Ride again (the buttons on the game-over panel). */
    again() { if (st.mode === 'over') newRun(); },
    /** The one button. On the ground: hold to crouch and charge, release to jump. In the air: tap to kick the nose down, hold to dive. */
    press() {
      if (st.mode === 'off' || st.mode === 'out' || st.mode === 'over' || st.paused) return;
      st.down = true; audio.unlock();
      if (st.grounded || st.coyote > 0) {
        st.charging = true; st.holdT = 0; st.diveOK = false;
      }
      else if (st.impact && st.impact.t - (st.t - st.impactAt) < BUFFER_WINDOW && st.vy < 0) { st.buf = { t0: st.t, rel: false, held: 0 }; st.diveOK = false; }   // about to land: keep it for the landing
      else if (!st.trick && st.t - st.lastAirTap < 0.3 && st.airT > 0.12) { startTrick(); st.lastAirTap = -9; st.diveOK = false; st.kickW = 0; }   // a quick second tap: a trick
      else { st.lastAirTap = st.t; st.diveOK = true; st.airHold = 0; st.kickW = Math.max(-6, st.kickW - TAP_KICK); }
    },
    release() {
      if (st.charging) fireJump();                                        // let go to jump
      if (st.buf && !st.buf.rel) { st.buf.rel = true; st.buf.held = st.t - st.buf.t0; }
      st.down = false; st.diveOK = false;
    },
    update(dt, cam) {
      if (st.mode === 'off') return false;
      rectCache = null;                                                        // (measured again each frame: the canvas can change size without a window resize, and a stale box put the markers in the wrong place)
      if (st.mode === 'out') {
        st.t += dt;
        const k = reduceMotion ? 1 : ease(Math.min(1, st.t / (ENTER_SECONDS * 0.8)));
        cam.position.lerpVectors(st.leaveFrom.pos, st.home.pos, k);
        lookV.lerpVectors(st.leaveFrom.look, st.home.look, k); cam.lookAt(lookV);
        clip.constant = THREE.MathUtils.lerp(CUT, 60, k); track.setTrailFade(1 - k); slideBoards(1 - k);
        if (k >= 1) {
          st.mode = 'off'; world.setFollow(false); applyClip(false); juice.reset(); juice.visible = false; audio.stop(); camera.fov = baseFov(); camera.updateProjectionMatrix(); track.visible = false; coins.visible = false; fuel.visible = false; puffs.visible = false; dirt.visible = false; bike.root.visible = false; landMark.visible = false;
          startRun(0); st.mode = 'off';
          api.onQuit?.();
        }
        return true;
      }
      if (st.paused) {                                                         // frozen: keep the camera exactly where it was
        cam.position.copy(st.camPos); cam.lookAt(st.camLook);
        return true;
      }
      juice.tick(dt); dt *= juice.timeScale;                                   // feedback runs on real time; hit-stop and slow motion scale the game's
      st.t += dt; if (st.mode === 'play') st.runT += dt;
      if (st.charging && st.grounded && st.mode === 'play') {
        st.holdT += dt; st.charge = Math.min(1, st.holdT / CHARGE_TIME);
        st.boost = Math.min(BOOST_CAP, st.boost + 2.5 * dt);                 // the bike slowly speeds up while crouched
        if (st.charge >= 1 && !st.maxed) { st.maxed = true; audio.chargeReady(); juice.halo('#ff8a6a', 4.5, 0.4, 0.5); juice.ring(st.x - HW, st.y - R, laneZ + 0.3, '#ffb089', 0.5, 2.6, 0.4, false, 0.8); juice.shake(0.06, 160); try { navigator.vibrate?.(10); } catch (e) { /* not supported */ } }
      } else { st.charge = Math.max(0, st.charge - dt * 6); if (!st.charging) st.maxed = false; }
      if (st.mode !== 'play') st.charging = false;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n; i++) {
        physics(h);
        if (st.jumpReq > 0) st.jumpReq -= h;
      }
      st.impact = predictLanding(); st.impactAt = st.t;
      juice.setIntensity(st.mode === 'play' ? THREE.MathUtils.clamp((st.vx - 13) / 11, 0, 1) : 0, st.boost / BOOST_CAP, st.charge); juice.setAnchor(st.x, st.y + 0.3, laneZ - 0.6);
      audio.update({ air: st.grounded ? 0 : st.airT, playing: st.mode === 'play' && !st.engineOut, speedK: THREE.MathUtils.clamp((st.vx - 13) / 11, 0, 1), charge: st.charging && st.grounded ? st.charge : 0, boost: st.boost / BOOST_CAP, grounded: st.grounded, mud: st.grounded ? track.mudAt(st.x) : 0, camDist: cam.position.z - laneZ, dt });
      mudCoat.update(dt, st.mode === 'play' && st.grounded ? track.mudAt(st.x) : 0);
      if (mudCoat.coat > 0.15 && st.mode === 'play') { st.flakeT = (st.flakeT || 0) - dt; if (st.flakeT <= 0) { st.flakeT = 0.4 / mudCoat.coat; dirt.burst(st.x - 0.4 + Math.random() * 0.8, st.y - R * 0.9, laneZ + 0.3, 1, 0.3, 1); } }                       // lumps drop off as it dries
      if (st.mode === 'play') {
        st.dist = Math.max(st.dist, st.x - st.startX); st.boost *= Math.exp(-0.35 * dt);
        if (st.dist * 0.6 >= st.nextMile) { audio.milestone(); toast(st.nextMile + ' m!'); st.nextMile += 500; }
        if (!st.bestSaid && st.best > 0 && scoreNow() > st.best) { st.bestSaid = true; audio.newBest(); toast('New best!'); }
        checkObstacles();
        // (swept: a slow frame must not let the bike step over a coin, so the path since the last frame is checked in short hops)
        let got = 0, fuelGot = 0; const taken = [], fuelHits = []; const hops = st.cpx === undefined || Math.abs(st.x - st.cpx) > 12 ? 1 : Math.min(10, Math.ceil(Math.hypot(st.x - st.cpx, st.y - st.cpy) / 1.0));
        for (let h = 1; h <= hops; h++) { const f = h / hops; got += coins.collect(st.cpx === undefined || hops === 1 ? st.x : st.cpx + (st.x - st.cpx) * f, st.cpy === undefined || hops === 1 ? st.y : st.cpy + (st.y - st.cpy) * f, SC / SCALE, dt / hops, st.vx); for (const hh of coins.hits) taken.push({ x: hh.x, y: hh.y });
          if (!st.guideOn) { fuelGot += fuel.collect(st.cpx === undefined || hops === 1 ? st.x : st.cpx + (st.x - st.cpx) * f, st.cpx === undefined || hops === 1 ? st.y : st.cpy + (st.y - st.cpy) * f, SC / SCALE); for (const hh of fuel.hits) fuelHits.push({ x: hh.x, y: hh.y }); } }
        st.cpx = st.x; st.cpy = st.y;
        if (got) {
          for (let i = 0; i < Math.min(got, 3); i++) audio.coin();
          st.coins += got; st.bonus += 25 * got * st.mult;
          for (const hit of taken) juice.burst('coin', hit.x, hit.y, laneZ, 7, '#ffd54a');
          if (coinsEl) { coinsEl.classList.remove('bump'); void coinsEl.offsetWidth; coinsEl.classList.add('bump'); }
        }
        // ---- fuel: always draining, faster while the button is held (crouching/charging); cans refill it; an empty tank kills the engine ----
        if (!st.guideOn) {
          const creep = 1 + 0.6 * Math.min(1, st.dist / 3000);
          if (!st.engineOut) st.fuel = Math.max(0, st.fuel - (dt / FUEL_SECONDS) * creep * (st.charging ? 1.9 : 1));
          if (fuelGot) {
            st.fuel = Math.min(1, st.fuel + fuelGot * CAN_FUEL); st.lowWarn = false; st.bonus += 50 * fuelGot * st.mult;
            audio.fuelUp(); toast('+FUEL'); for (const hh of fuelHits) { juice.burst('coin', hh.x, hh.y, laneZ, 12, '#ff9a4a'); juice.ring(hh.x, hh.y, laneZ, '#ffb066', 0.5, 2.4, 0.35, false, 0.8); }
          }
          if (st.fuel < 0.25 && !st.lowWarn && !st.engineOut) { st.lowWarn = true; toast('Low fuel!'); audio.lowFuel(); }
          if (st.fuel < 0.25 && !st.engineOut) { const u = 1 - st.fuel / 0.25; st.sputT -= dt; if (st.sputT <= 0) { st.sputT = 1.05 - 0.93 * Math.pow(u, 0.8); audio.fuelBeep(u); } }       // a dashboard beep that comes faster and higher the closer the tank is to empty
          if (st.fuel <= 0 && !st.engineOut) { st.engineOut = true; st.charging = false; st.charge = 0; toast('Out of fuel!'); audio.outOfFuel(); }
          if (st.engineOut && st.grounded && st.vx < 1.2) { st.outOfFuel = true; st.mult = 1; st.comboT = 0; for (const e of jumpEls) e.hidden = true; st.crashT = 0; showOver(); }
        }
        if (st.mult > 1) {                                                                  // the combo runs down; at zero it drops a step
          st.comboT -= dt;
          if (st.comboT <= 0) { st.mult--; st.comboT = st.mult > 1 ? 4 : 0; audio.comboDrop(); }
        }
        st.score = scoreNow();
        const hz = track.hazardAhead(st.x, 60); st.hz = hz;                                  // a heads-up before each hazard
        const ob = hz ? null : track.obstacleAhead(st.x, 80);
        if (ob && ob.id !== st.warnedObs && !ob.hit) { st.warnedObs = ob.id; toast(ob.big ? `${ob.label} ahead - charge a big jump!` : `${ob.label} ahead - hop it!`); }
        if (hz && hz.x0 !== st.warnedX) { st.warnedX = hz.x0; toast(hz.type === 'gap' ? 'Gap ahead - charge a jump!' : 'Mud ahead - jump it or slow down!'); }
        const mudNow = st.grounded ? track.mudAt(st.x) : 0;
        if (mudNow > 0.3) {                                                                   // mud spray from the rear wheel
          juice.shake(0.05, 120);
          st.mudT = (st.mudT ?? 0) - dt;
          if (st.mudT <= 0) {
            st.mudT = 0.035;
            const c = Math.cos(st.th), s2 = Math.sin(st.th);
            puffs.emit(st.x - HW * c, st.y - HW * s2 - R * 0.6, laneZ + 0.2, -4 - Math.random() * 4, 3 + Math.random() * 4, 0.9, 2.6, 0.8, '#33251a', 0.8);
          }
        }
      }
      if (st.mode === 'crash' || st.mode === 'over') {
        st.crashT += dt;
        ragdoll.update(dt);
        if (st.mode === 'crash') {                                                     // the card waits until the rider has all but come to a stop
          st.calmT = ragdoll.speed < 1.4 ? st.calmT + dt : 0;
          if ((st.crashT > 1.0 && st.calmT > 0.45) || st.crashT > 7) showOver();
        }
      }
      // looks
      const leanT = st.mode === 'crash' ? 0.2 : st.grounded ? 0.7 : (st.down && st.diveOK ? 1.15 : 0.35);
      st.lean += (leanT - st.lean) * Math.min(1, dt * 8);
      const crouchT = st.charging && st.grounded ? st.charge : 0;
      st.crouch += (crouchT - st.crouch) * Math.min(1, dt * (crouchT > st.crouch ? 6 : 14));
      if (!ragdoll.active) {
        poseRider(bike.rider, st.lean, st.crouch, 0, '');
        const shake = st.maxed ? (Math.sin(st.t * 70) * 0.012) : 0;           // at full charge the rider trembles, ready to go
        bike.rider.group.position.y = shake;
      }
      const sp = st.trick && st.trick.kind === 'spin' ? st.trick : null;                // the sideways spin turns the whole bike about its vertical axis (eases back to straight if cut short by the landing)
      if (sp) st.spinA = sp.dir * TAU * ease(Math.min(1, sp.t / sp.dur)); else st.spinA = wrap(st.spinA) * Math.exp(-14 * dt);
      bike.model.rotation.y = ragdoll.active ? 0 : st.spinA;
      st.squash *= Math.exp(-11 * dt);
      bike.model.scale.y = (1 - 0.05 * st.crouch) * (1 - 0.14 * st.squash);   // the bike squats on its suspension (and squashes on a landing, stretches off a big jump)
      if (st.trick && st.mode === 'play') { const c0 = Math.cos(st.th), s0 = Math.sin(st.th); juice.trail(st.x - 0.9 * c0, st.y - 0.9 * s0, laneZ - 0.2, trickColor()); juice.trail(st.x + 0.9 * c0, st.y + 0.9 * s0, laneZ - 0.2, trickColor()); }
      st.spinF += (st.vx * dt) / R;
      st.spinR += (st.vx * (1 + 1.6 * st.crouch) * dt) / R;                    // the rear wheel spins up while charging
      bike.wheels.rear.rotation.z = -st.spinR; bike.wheels.front.rotation.z = -st.spinF;
      // dirt kicked from the rear wheel and a little exhaust while charging
      const spK = THREE.MathUtils.clamp((st.vx - 13) / 11, 0, 1), dustK = Math.max(st.charge, spK * 0.7);
      if (st.grounded && st.mode === 'play') {                                            // clods of dirt thrown back from the wheels (darker, bigger and more in mud)
        const mudD = THREE.MathUtils.clamp(track.mudAt(st.x), 0, 1), power = Math.max(st.charge, THREE.MathUtils.clamp((st.vx - 7) / 15, 0, 1) * 0.85), cc = Math.cos(st.th), ss = Math.sin(st.th);
        dirt.spray(dt, st.x - HW * cc, st.y - HW * ss - R * 0.95, laneZ + 0.2, st.vx, power, mudD);
        if (mudD > 0.2) dirt.spray(dt, st.x + HW * cc, st.y + HW * ss - R * 0.95, laneZ + 0.2, st.vx, power * 0.8, mudD, true);
      }
      if (st.grounded && st.mode === 'play' && dustK > 0.05 && (st.charging || st.vx > 14)) {
        st.puffT -= dt;
        if (st.puffT <= 0) {
          st.puffT = 0.15 - 0.09 * dustK;
          const c = Math.cos(st.th), s2 = Math.sin(st.th);
          const wx = st.x - HW * c, wy = st.y - HW * s2 - R * 0.7;
          puffs.emit(wx, wy, laneZ + 0.2, -3 - 4 * dustK - spK * 3 + (Math.random() - 0.5) * 2, 1.5 + 2.5 * dustK, 0.55, 1.5 + dustK, 0.8, '#a98a63', 0.62);
        }
      }
      if (st.mode === 'play') {                                                           // exhaust: thin grey-blue smoke from the pipe that drifts back and rises (more, darker and denser on the throttle)
        st.exhT = (st.exhT || 0) - dt;
        if (st.exhT <= 0) {
          const th = Math.max(st.charge, spK * 0.6, st.grounded ? 0.12 : 0.5), ce = Math.cos(st.th), se = Math.sin(st.th);
          st.exhT = 0.14 - 0.09 * th;
          puffs.emit(st.x - HW * ce * 1.35 + se * 0.1, st.y - HW * se * 1.35 + 0.28 * ce, laneZ - 0.1, -1.6 - st.vx * 0.1 - 2.2 * th + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.7 + th, 0.2, 0.8 + 0.7 * th, 0.9 + 0.5 * th, th > 0.5 ? '#6f7882' : '#a1a9b2', 0.3 + 0.25 * th, 1.5);
        }
      }
      st.camZoom += (st.crouch - st.camZoom) * Math.min(1, dt * 3);
      { const px = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); puffs.update(dt, px); dirt.update(dt, px); tracks.update(dt); tracks.add(st.x - HW * Math.cos(st.th), st.mode === 'play' && st.grounded); }
      bike.root.position.set(st.x, st.y, laneZ);
      bike.root.rotation.z = st.th;
      setHud();
      // camera
      const wiping = (st.mode === 'crash' || st.mode === 'over') && ragdoll.hip;           // after a crash the camera follows the tumbling rider, not the bike
      if (wiping) { const hp = ragdoll.hip, kf = 1 - Math.exp(-6 * dt); st.cx += (hp.x - st.cx) * kf; st.cy += (hp.y - st.cy) * kf; } else { st.cx = st.x; st.cy = st.y; }
      st.camY += (st.cy - st.camY) * Math.min(1, dt * (wiping ? 4 : 2.2));
      st.frameDt = dt; api.focusDistance = frame();
      const k = reduceMotion ? 1 : ease(Math.min(1, st.t / ENTER_SECONDS));
      cam.position.lerpVectors(st.from.pos, target.pos, k);
      lookV.lerpVectors(st.from.look, target.look, k);
      const fovT = baseFov() + juice.fovAdd; if (Math.abs(cam.fov - fovT) > 0.02) { cam.fov = fovT; cam.updateProjectionMatrix(); }       // the field of view pushes out with boost
      const ox = juice.shakeX, oy = juice.shakeY + juice.bumpY;
      cam.position.x += ox; cam.position.y += oy; lookV.x += ox; lookV.y += oy;
      cam.lookAt(lookV);
      clip.constant = THREE.MathUtils.lerp(60, CUT, k); track.setTrailFade(k); slideBoards(k);
      st.camPos.copy(cam.position); st.camLook.copy(lookV);
      for (const v of villageX) { const far = cam.position.x - 90 > v.x1 || cam.position.x + 90 < v.x0; if (v.o.visible === far) v.o.visible = !far; }     // the village is only drawn while the camera is near it
      track.update(cam.position.x, st.camY);
      coins.update(cam.position.x, st.t); fuel.update(cam.position.x, st.t);
      guideTick();
      world.setFollow(true, cam.position.x, lifeGround, laneZ + 10);                      // fireflies and butterflies live in the game's world (the player rides past them)
      if (floatEl) {                                                                      // alerts, warnings and the multiplier float right above the rider
        cam.updateMatrixWorld();
        pv.set(st.x, st.y + 3.4 * (SC / SCALE), laneZ).project(cam);
        const rc = canvasRect();
        const half = Math.max(60, floatEl.offsetWidth / 2) + 8;                              // keep the whole message on screen
        const px = THREE.MathUtils.clamp(rc.left + (pv.x * 0.5 + 0.5) * rc.width, rc.left + half, rc.right - half);
        const py = THREE.MathUtils.clamp(rc.top + (-pv.y * 0.5 + 0.5) * rc.height, rc.top + 150, rc.bottom - 120);
        floatEl.style.left = px + 'px'; floatEl.style.top = py + 'px';
      }
      {                                                                                   // the JUMP markers over the next obstacles
        const rc = canvasRect();
        // The next obstacles ahead (within 50 units). Once the rider has passed an obstacle, the rest of its tight group is part of the same jump and gets no marker of its own.
        let upcoming = [];
        if (st.mode === 'play' && !st.paused) {
          const passed = track.obstaclesIn(st.x - 14, st.x - 1).pop();
          if (!(passed && st.x - passed.x < 8)) upcoming = track.obstaclesIn(st.x - 1, st.x + 50).filter((o) => track.obstacleShown(o) && o.x > st.x - 1 && !(passed && o.x - passed.x < 12));   // (and none for a moment after passing one, so each marker visibly goes away)
        }
        let k = 0;
        for (let i = 0; i < upcoming.length && k < 2; i++) {
          const o = upcoming[i]; if (i && o.x - upcoming[i - 1].x < 12) continue;               // the rest of a tight group is one jump
          let group = 1; for (let j = i + 1; j < upcoming.length && upcoming[j].x - upcoming[j - 1].x < 12; j++) group++;
          const big = o.big || group > 1 || upcoming.slice(i, i + group).some((q) => q.big), el = jumpEls[k++];
          pv.set(o.x, track.laneAt(o.x) + o.h + 2.2 * (SC / SCALE), laneZ).project(cam);
          el.hidden = pv.z > 1 || pv.x < -1.05 || pv.x > 1.0; el._t = performance.now();                 // (only over an obstacle that is on screen: nothing pinned to an edge)
          el.firstChild.textContent = big ? 'BIG JUMP' : 'JUMP'; el.classList.toggle('big', big); el.classList.remove('edge');
          el.style.left = THREE.MathUtils.clamp((pv.x * 0.5 + 0.5) * innerWidth, 50, innerWidth - 50) + 'px';       // (viewport coordinates, like the fixed marker itself)
          el.style.top = THREE.MathUtils.clamp((-pv.y * 0.5 + 0.5) * innerHeight, 120, innerHeight - 140) + 'px';
        }
        for (; k < 2; k++) jumpEls[k].hidden = true;
      }
      // landing indicator
      const im = st.impact;
      if (st.grounded) st.bigAir = false;
      else if (!st.bigAir) {                                                       // only real jumps get a landing circle, not bumps: the flight has to climb well clear of the ground
        const h = st.y - R - groundY(st.x), apex = h + (st.vy > 0 ? (st.vy * st.vy) / (2 * GRAV) : 0);
        if (apex > 1.7) st.bigAir = true;
      }
      if (st.bigAir && im && im.t < 1.8 && st.airT > 0.15 && st.mode === 'play') {
        const d = wrap(st.th - im.phi), ad = Math.abs(d);
        const q = d > 1.15 || d < -0.95 ? 'crash' : ad > 0.5 ? 'rough' : ad < 0.22 ? 'perfect' : 'clean';
        landMat.color.lerp(LAND_COL[q], Math.min(1, dt * 12)); landDiscMat.color.copy(landMat.color);
        const a = Math.min(1, (1.8 - im.t) / 0.5);
        const pulse = 1 + 0.14 * Math.sin(st.t * (7 + 8 * Math.max(0, 1 - im.t)));   // pulses faster as touchdown nears
        landMark.visible = true;
        landMark.position.set(im.x, im.y + 0.12, laneZ);
        landMark.rotation.set(0, 0, im.phi);                                     // tilted to the slope it will land on
        landMark.scale.setScalar(2.3 * (SC / SCALE) * pulse);
        landMat.opacity = 0.95 * a; landDiscMat.opacity = (0.22 + 0.12 * Math.sin(st.t * 9)) * a;
      } else landMark.visible = false;
      return true;
    },
  };
  return api;
}
