// The dirt-bike game: it begins in the real scene. The camera swings side-on to the bike on its lane, the village in front of
// the lane is sliced away, and the ground then carries on to the right as the camera follows the rider (see track.js).
// This module is the shell (enter/exit, camera, HUD, input plumbing); physics and scoring plug into it.
import * as THREE from 'three';
import { buildBike, poseRider, BIKE } from './bike.js?v=20261016225440';
import { createTrack } from './track.js?v=20261016225440';
import { createRagdoll } from './ragdoll.js?v=20261016225440';
import { createPuffs } from './puffs.js?v=20261016225440';
import { createCoins } from './coins.js?v=20261016225440';

const ENTER_SECONDS = 1.3;
const SCALE = 1.8;
const GRAV = 24;
const JUMP_MIN = 5.5, JUMP_MAX = 15;   // upward kick: a tap hops, a full charge flies
const CHARGE_TIME = 1.1;               // seconds of holding to reach full charge (it then stays maxed)
const BOOST_CAP = 4.5;                 // extra speed from charging and landings
const BACK_W = 2.2, BACK_RATE = 1.2;   // in the air the nose wants to rotate backward: target rad/s and how fast it gets there
const BUFFER_WINDOW = 0.14;            // a press this close to touchdown is held over and applies on landing
const TAP_KICK = 3.4;                  // nose-down kick of one tap (rad/s, it fades quickly)
const DIVE_GRAV = 1.1;           // extra gravity while nose-diving
const TAU = Math.PI * 2;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export function createGame(scene, camera, renderer, world, { reduceMotion = false } = {}) {
  const hud = document.getElementById('game-hud');
  const scoreEl = document.getElementById('gh-score');
  const coinsEl = document.getElementById('gh-coins');
  const hint = document.getElementById('gh-hint');
  const hintText = document.getElementById('gh-hint-text');
  const skipBtn = document.getElementById('gh-skip');
  const pauseEl = document.getElementById('game-pause');
  const modeBtn = document.getElementById('gh-mode');
  const switches = ['gp-mode', 'go-mode'].map((id) => document.getElementById(id)).filter(Boolean);
  const toastEl = document.getElementById('gh-toast');
  const grooveEl = document.getElementById('gh-groove');
  const multEl = document.getElementById('gh-mult');
  const overEl = document.getElementById('game-over');
  const $ = (id) => document.getElementById(id);

  const laneZ = world.bikeLaneZ;
  const track = createTrack(scene, { laneZ, material: world.terrainMaterial, world, seed: 1 });
  const coins = createCoins(scene, track, laneZ);
  const bike = buildBike();
  const puffs = createPuffs(scene);
  // Landing indicator: a pulsing circle where the bike will touch down. Its colour says how the landing would go if nothing changes:
  // green for a perfect one, gold for a clean one, orange for a rough one, coral for a crash.
  const landMark = new THREE.Group();
  const landMat = new THREE.MeshBasicMaterial({ color: '#8fd081', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const landDiscMat = landMat.clone();
  const landRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 48).rotateX(-Math.PI / 2), landMat), landDisc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48).rotateX(-Math.PI / 2), landDiscMat);   // lying flat on the ground
  landRing.renderOrder = landDisc.renderOrder = 6; landMark.add(landDisc, landRing); landMark.visible = false; scene.add(landMark);
  const LAND_COL = { perfect: new THREE.Color('#8fd081'), clean: new THREE.Color('#e8c24a'), rough: new THREE.Color('#ec8a3c'), crash: new THREE.Color('#d15e4d') };
  const ragdoll = createRagdoll(scene, bike.rider, (x) => track.laneAt(x));
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
  function applyClip(on) {
    if (on) {
      renderer.localClippingEnabled = true;
      scene.traverse((o) => {
        if (o.userData?.hideInGame && o.visible) { o.visible = false; hiddenObjs.push(o); return; }
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) {
          if (m === world.terrainMaterial || m.isShaderMaterial || m.isPointsMaterial || clipped.some((c) => c.m === m)) continue;
          clipped.push({ m, planes: m.clippingPlanes, shadows: m.clipShadows }); m.clippingPlanes = [clip]; m.clipShadows = true;
        }
      });
    } else {
      for (const c of clipped) { c.m.clippingPlanes = c.planes; c.m.clipShadows = c.shadows; }
      clipped.length = 0;
      for (const o of hiddenObjs) o.visible = true;
      hiddenObjs.length = 0;
      renderer.localClippingEnabled = false;
    }
  }
  const CUT = track.cutZ + 0.4;
  const st = {
    mode: 'off', t: 0, from: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    x: 0, y: 0, vx: 8, vy: 0, th: 0, om: 0, grounded: true, coyote: 0, diveOK: false, jumpReq: 0,
    rot: 0, flips: 0, airT: 0, camY: 0, score: 0, coins: 0, down: false, spin: 0, lean: 0.7,
    crashT: 0, inv: 0, boost: 0, startX: 0, best: 0,
    bonus: 0, dist: 0, mult: 1, meter: 0, lastTrick: 0, flipsTotal: 0, bestAir: 0, bestMult: 1, overAt: 0,
    toggle: false, bigAir: false, hz: null, viewW: 0, warnedX: -1, mudT: 0, zoom: 1, frameDt: 0.016, trick: null, lastAirTap: -9, poseCycle: 0, paused: false, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), guideStep: 0, guideOn: false, guideTapped: false, cleanLandings: 0, impact: null, impactAt: 0, buf: null, charging: false, charge: 0, holdT: 0, jumpVy: 9, airHold: 0, kickW: 0, runT: 0, crouch: 0, maxed: false, spinR: 0, spinF: 0, puffT: 0, camZoom: 0,
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
    const W0 = 40 - 10 * tall, bonus = THREE.MathUtils.clamp((st.vx - 14) * 1.1, 0, 12);
    const needAhead = st.hz ? Math.min(st.hz.x0 - st.x, 52) / 0.72 : 0;
    const Wt = Math.max(W0 + bonus, needAhead);
    st.viewW = st.viewW ? st.viewW + (Wt - st.viewW) * (1 - Math.exp(-2 * st.frameDt)) : Wt;
    const baseDist = THREE.MathUtils.clamp(st.viewW / (2 * tanH * camera.aspect), 22, 110) * (1 + 0.03 * st.camZoom);
    const c = 0.05 + tall * 0.16;
    // Keep both the bike and the ground in view: if a big jump (or a hill ahead) would push either off the screen, pull back.
    const gHere = groundY(st.x), gA = groundY(st.x + 10), gB = groundY(st.x + 22);
    const yLow = Math.min(gHere, gA, gB) - 2.5, yHigh = Math.max(st.y + 4.5, gA + 3);
    let d = baseDist;
    for (let k = 0; k < 2; k++) {
      const yc = st.camY + 3 + d * c;
      d = Math.max(baseDist, Math.max(yc - yLow, yHigh - yc) / (tanH * 0.9));
    }
    const zoomT = THREE.MathUtils.clamp(d / baseDist, 1, 2.6);
    st.zoom += (zoomT - st.zoom) * (1 - Math.exp(-(zoomT > st.zoom ? 4 : 1.2) * st.frameDt));   // pulls back quickly, settles back slowly
    const dist = Math.min(baseDist * st.zoom, 150);
    const ahead = 0.26 * st.viewW + st.vx * 0.08;                           // look well ahead (the bike sits about a quarter of the way in from the left)
    target.pos.set(st.x + ahead * (1 + 0.6 * (st.zoom - 1)), st.camY + 2.5 + dist * 0.11, laneZ + dist);
    target.look.set(st.x + ahead * (1 + 0.6 * (st.zoom - 1)), st.camY + 3 + dist * c, laneZ);
    return dist;
  }
  function setHud() {
    if (scoreEl) scoreEl.textContent = String(Math.floor(st.score));
    if (coinsEl) coinsEl.textContent = String(st.coins);
    if (grooveEl) { grooveEl.hidden = st.mode === 'over' || (st.mult < 2 && st.meter < 0.05); grooveEl.style.setProperty('--p', Math.min(1, st.meter).toFixed(3)); grooveEl.dataset.level = String(st.mult); }
    if (multEl) multEl.textContent = '×' + st.mult;
  }
  const scoreNow = () => st.dist * 0.5 + st.bonus;
  function groove(add) {
    st.meter += add;
    while (st.meter >= 1 && st.mult < 5) { st.mult++; st.meter -= 0.7; }
    if (st.meter > 1) st.meter = 1;
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
    gF = Math.max(gF, gR - 1.4); gR = Math.max(gR, gF - 1.4);                // at a cliff edge (a gap) the bike tips off it gently instead of nose-diving
    const phi = Math.atan2(gF - gR, 2 * HW);
    return { y: (gR + gF) / 2 + R / Math.cos(phi), phi };
  }

  function startRun(x) {
    st.x = x; st.vx = 8; st.vy = 0; st.om = 0; st.grounded = true; st.rot = 0; st.flips = 0; st.airT = 0; st.mode = 'play'; st.crashT = 0; st.inv = 0; st.boost = 0;
    st.zoom = 1; st.viewW = 0; st.hz = null; st.charging = false; st.charge = 0; st.holdT = 0; st.airHold = 0; st.kickW = 0; st.crouch = 0; st.maxed = false; st.buf = null; st.impact = null; st.trick = null; st.lastAirTap = -9; puffs.clear();
    const p = groundPose(x); st.y = p.y; st.th = p.phi; st.vy = 0; st.camY = st.y;
    ragdoll.restore();
  }

  function newRun() {
    st.score = 0; st.coins = 0; st.bonus = 0; st.dist = 0; st.mult = 1; st.meter = 0; st.flipsTotal = 0; st.bestAir = 0; st.bestMult = 1; st.lastTrick = 0; st.runT = 0;
    const m = /[?&]course=(\d+)/.exec(location.search);
    const sd = m ? parseInt(m[1], 10) : Math.floor(Math.random() * 1e6) + 1;
    track.reset(sd); coins.reset(sd, st.startX);
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
    if (!overEl) return;
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

  // ---- tap mode: one tap starts the charge, the next tap jumps (for anyone who cannot or would rather not hold) ----
  const TOGGLE_KEY = 'dirtbike-toggle';
  const loadToggle = () => { try { return localStorage.getItem(TOGGLE_KEY) === '1'; } catch (e) { return false; } };
  function setToggle(on, save = true) {
    st.toggle = on;
    if (save) { try { localStorage.setItem(TOGGLE_KEY, on ? '1' : '0'); } catch (e) { /* private mode */ } }
    for (const b of switches) b.setAttribute('aria-checked', String(on));
    if (modeBtn) modeBtn.textContent = on ? 'Use hold mode' : 'Use tap mode';
    st.charging = false;                                    // switching mid-charge simply cancels it
  }
  function fireJump() {                                     // jump with the current charge: higher the longer it built
    const c = st.charge;
    st.jumpVy = JUMP_MIN + (JUMP_MAX - JUMP_MIN) * (1 - (1 - c) * (1 - c));
    st.jumpReq = 0.12; st.charging = false;
  }

  // ---- guided first run: short coaching tips until each move has been done, remembered across visits ----
  const GUIDE_KEY = 'dirtbike-guide';
  const guideDone = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { return false; } };
  const saveGuideDone = () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) { /* private mode */ } };
  function setCoach(text) {
    if (!hint) return;
    if (!text) { hint.hidden = true; return; }
    if (hintText && hintText.textContent !== text) hintText.textContent = text;
    hint.classList.add('coach'); hint.hidden = false; if (skipBtn) skipBtn.hidden = false; if (modeBtn) modeBtn.hidden = false;
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
      setCoach(st.toggle ? 'Tap anywhere once to crouch and charge a jump' : 'Press and hold anywhere to crouch and charge a jump');
      if (st.charging && st.charge >= 0.3) st.guideStep = 1;
    } else if (st.guideStep === 1) {
      setCoach(st.charging ? (st.toggle ? 'Now tap again to jump!' : 'Now let go to jump!') : (st.toggle ? 'Tap anywhere once to crouch and charge a jump' : 'Press and hold anywhere to crouch and charge a jump'));
      if (!st.grounded) st.guideStep = 2;
      else if (!st.charging) st.guideStep = 0;
    } else if (st.guideStep === 4) {
      setCoach(st.grounded ? 'Last one: jump high, then double-tap quickly in the air for a trick' : 'Double-tap quickly now for a trick!');
    } else {
      if (!st.grounded) {
        const im = st.impact;
        setCoach(im && im.t < 1.6 ? 'Hold or tap to bring the nose down - aim for a green landing circle' : 'The nose tips back in the air: hold or tap to bring it forward');
      } else setCoach(st.guideStep === 2 ? 'Jump again, then hold or tap in the air to land smoothly' : (st.toggle ? 'Nice! Wait longer before the second tap for a bigger jump' : 'Nice! Hold longer for a bigger jump'));
    }
  }

  // ---- tricks: double-tap in the air ----
  function trickDone() { if (st.guideOn && st.guideStep >= 4) endGuide(true); }
  function startTrick() {
    const tti = st.impact ? st.impact.t - (st.t - st.impactAt) : 0;
    if (tti > 0.78) st.trick = { kind: 'flip', left: TAU };                       // plenty of air: a backflip
    else { st.trick = { kind: 'pose', pose: st.poseCycle++ % 2 ? 'super' : 'hands', t: 0, dur: 0.7 }; }   // less air: a pose trick
  }
  function finishPose(award_) {
    const t = st.trick; if (!t || t.kind !== 'pose') return;
    st.trick = null;
    if (award_) { groove(0.25); award(150, t.pose === 'super' ? 'Superman!' : 'No-hander!'); trickDone(); }
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
    const dist = Math.max(0, st.x - st.startX);
    const base = (st.guideOn ? 12 : 15) + Math.min(9, dist / 260);          // cruising speed: faster, and it keeps building
    if (st.grounded) {
      const prevY = st.y;
      const p = groundPose(st.x + st.vx * h);
      const slope = Math.tan(p.phi);
      const mud = track.mudAt(st.x);
      const aim = (base + st.boost - Math.max(-3, Math.min(5, slope * 6))) * (1 - 0.58 * mud);               // mud drags the bike down to a crawl
      st.vx += (aim - st.vx) * Math.min(1, (mud > 0.2 ? 4 : 2.5) * h);
      if (mud > 0.2) st.boost *= Math.exp(-2 * h);
      if (track.inPit(st.x) || track.inPit(st.x - HW * 0.9 + 0.7)) { crash('Into the pit!'); return; }       // driven over the edge of a gap
      st.x += st.vx * h;
      const q = groundPose(st.x);
      if (st.charging && track.laneAt(st.x) - track.laneAt(st.x + 0.9) > 3) fireJump();                  // holding at the lip of a gap: the charge is released for you there
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
    st.vy -= GRAV * (diving ? DIVE_GRAV : 1) * h;
    st.x += st.vx * h; st.y += st.vy * h;
    // The nose wants to tip backward (softer during the first 45 s of a run); a hold dives it, a tap gives a quick kick forward.
    const back = BACK_W * (0.5 + 0.5 * Math.min(1, st.runT / 45));
    const want = diving ? -2.8 : back;                                 // holding eases the nose forward, slowly
    const rate = diving ? 4 : (st.om < 0 ? 6 : BACK_RATE);
    st.om += (want - st.om) * Math.min(1, rate * h);
    st.kickW *= Math.exp(-7 * h);
    let dth = (st.om + st.kickW) * h, assistOn = true;
    if (st.trick && st.trick.kind === 'flip') {                          // a backflip trick: a controlled full turn
      const step = Math.min(st.trick.left, 8.6 * h); st.trick.left -= step;
      dth = step; assistOn = false; st.om = 0; st.kickW = 0;
      if (st.trick.left <= 1e-6) st.trick = null;
    } else if (st.trick && st.trick.kind === 'pose') {
      st.trick.t += h;
      if (st.trick.t >= st.trick.dur) finishPose(true);
    }
    // Landing assist: close to the ground and falling, the suspension and the rider square the bike up with the slope.
    const gp = groundPose(st.x + st.vx * 0.12);
    const above = st.y - R - groundY(st.x);
    if (assistOn && st.vy < 0 && above < 2.4 && st.airT > 0.2) { const k = Math.min(1, 2.0 * h * (1 - above / 2.4 + 0.3)); dth += wrap(gp.phi - st.th) * k; }
    st.th += dth; st.rot += dth;
    if (st.rot >= TAU - 1.1) { st.rot -= TAU; st.flips++; st.flipsTotal++; events.onFlip?.('back'); groove(0.4); award(400, 'Backflip!'); trickDone(); }
    else if (st.rot <= -(TAU - 1.1)) { st.rot += TAU; st.flips++; st.flipsTotal++; events.onFlip?.('front'); groove(0.4); award(400, 'Front flip!'); trickDone(); }
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

  function land() {
    const p = groundPose(st.x);
    const delta = wrap(st.th - p.phi);                         // + nose up, - nose down
    st.grounded = true; st.om = 0; st.kickW = 0; st.diveOK = false;
    const air = st.airT;
    if (track.inPit(st.x) || track.inPit(st.x - HW * Math.cos(st.th) * 0.9 + 0.7)) { crash('Into the pit!'); return; }   // fell short of the far bank
    if (st.trick) { if (st.trick.kind === 'pose' && st.trick.t > 0.35) finishPose(true); st.trick = null; }
    if (delta > 1.15 || delta < -0.95) { crash(); return; }
    st.y = p.y;
    st.vy = st.vx * Math.tan(p.phi);
    st.th = p.phi + delta * 0.55;                              // the suspension absorbs part of the angle
    const perfect = Math.abs(delta) < 0.22, rough = Math.abs(delta) > 0.5;
    st.bestAir = Math.max(st.bestAir, air);
    if (rough && air > 0.3) { st.vx *= 0.72; st.mult = Math.max(1, st.mult - 1); st.meter = 0; toast('Rough landing'); }   // (small hops over bumps are never punished)
    else {
      if (air > 0.45) {
        st.boost = Math.min(BOOST_CAP, st.boost + (perfect ? 1.2 : 0.5));
        groove(perfect ? 0.34 : 0.2);
        award((perfect ? 150 : 60) + Math.max(0, air - 0.5) * 90, perfect ? 'Stuck it!' : 'Clean landing');
      }
    }
    st.rot = 0;
    if (st.guideOn && st.guideStep >= 2 && air > 0.4 && !rough) {   // a smooth landing counts toward finishing the tips
      if (st.guideStep < 4) st.guideStep++;
    }
    if (st.buf) {                                               // a press just before touchdown: apply it now
      const b = st.buf; st.buf = null;
      if (st.toggle) { st.charging = true; st.holdT = st.t - b.t0; }   // tap mode: that tap started the charge
      else if (b.rel) {                                         // released already: the jump goes off the moment the wheels touch
        const c = Math.min(1, b.held / CHARGE_TIME);
        st.jumpVy = JUMP_MIN + (JUMP_MAX - JUMP_MIN) * (1 - (1 - c) * (1 - c)); st.jumpReq = 0.12;
      } else { st.charging = true; st.holdT = st.t - b.t0; }    // still down: the charge has already started
    } else if (st.down && !st.toggle) { st.charging = true; st.holdT = 0; }   // still holding at touchdown: start charging the next jump straight away
    events.onLand?.({ air, delta, perfect, rough, flips: st.flips });
    st.flips = 0;
  }

  function crash(msg = 'Crash!') {
    st.mode = 'crash'; st.crashT = 0; st.mult = 1; st.meter = 0;
    events.onCrash?.();
    toast(msg);
    // the rider is thrown clear: every body part goes its own way
    bike.root.updateMatrixWorld(true);
    ragdoll.detach(st.vx, Math.max(st.vy, 0));
  }

  $('gp-resume')?.addEventListener('click', () => api.resume());
  $('gp-quit')?.addEventListener('click', () => api.stop());
  $('gh-pause')?.addEventListener('click', () => api.pause());
  skipBtn?.addEventListener('click', () => endGuide(false));
  modeBtn?.addEventListener('click', () => setToggle(!st.toggle));
  for (const b of switches) b.addEventListener('click', () => setToggle(!st.toggle));
  window.addEventListener('blur', () => api.pause());                          // auto-pause: losing the window, or the tab going to the background
  document.addEventListener('visibilitychange', () => { if (document.hidden) api.pause(); });
  $('go-again')?.addEventListener('click', () => { if (st.mode === 'over') newRun(); });
  $('go-quit')?.addEventListener('click', () => api.stop());
  const api = {
    get active() { return st.mode !== 'off'; },
    /** Debug / test access. */
    get tapMode() { return st.toggle; },
    get state() { return { impact: st.impact, buf: !!st.buf, charge: st.charge, charging: st.charging, om: st.om, boost: st.boost, x: st.x, y: st.y, vx: st.vx, vy: st.vy, th: st.th, grounded: st.grounded, mode: st.mode, flips: st.flips, airT: st.airT }; },
    events,
    focusDistance: 26,
    onQuit: null,
    start(homeCam, startX = 0) {
      if (st.mode !== 'off') return;
      st.t = 0; st.down = false; st.startX = startX; st.best = loadBest();
      st.home = { pos: homeCam.pos.clone(), look: homeCam.look.clone() };
      st.from.pos.copy(homeCam.pos); st.from.look.copy(homeCam.look);
      setBikeScale();
      track.visible = true; coins.visible = true; puffs.visible = true;
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
        else { hint.classList.remove('coach'); if (hintText) hintText.textContent = 'Hold to crouch, release to jump \u00b7 in the air: hold to tilt forward, double-tap for tricks'; if (skipBtn) skipBtn.hidden = true; if (modeBtn) modeBtn.hidden = true; hint.hidden = false; st.hintT = setTimeout(() => { hint.hidden = true; }, 6000); }
      }
      st.paused = false; if (pauseEl) pauseEl.hidden = true; document.body.classList.remove('game-paused');
      const tq = /[?&]toggle=(\d)/.exec(location.search);
      setToggle(tq ? tq[1] === '1' : loadToggle(), !tq);
      setHud();
    },
    stop() {
      if (st.mode === 'off' || st.mode === 'out') return;
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
    get track() { return track; },                                                                     // (for tests)
    get paused() { return st.paused; },
    /** Freeze the ride (auto on losing focus, the pause button or P) and show the pause card. */
    pause() {
      if (st.mode !== 'play' || st.paused) return;
      st.paused = true; st.down = false; st.charging = false; st.buf = null; st.charge = 0;
      if (hint) hint.hidden = true;
      document.body.classList.add('game-paused');
      if (pauseEl) { pauseEl.hidden = false; setTimeout(() => { if (st.paused) document.getElementById('gp-resume')?.focus({ preventScroll: true }); }, 50); }
    },
    resume() {
      if (!st.paused) return;
      st.paused = false; st.down = false;
      if (pauseEl) pauseEl.hidden = true;
      document.body.classList.remove('game-paused');
    },
    togglePause() { if (st.paused) api.resume(); else api.pause(); },
    /** Ride again (the buttons on the game-over panel). */
    again() { if (st.mode === 'over') newRun(); },
    /** The one button. On the ground: hold to crouch and charge, release to jump. In the air: tap to kick the nose down, hold to dive. */
    press() {
      if (st.mode === 'off' || st.mode === 'out' || st.mode === 'over' || st.paused) return;
      st.down = true;
      if (st.grounded || st.coyote > 0) {
        if (st.toggle && st.charging) { fireJump(); st.diveOK = false; }                      // tap mode: the second tap jumps
        else { st.charging = true; st.holdT = 0; st.diveOK = false; }
      }
      else if (st.impact && st.impact.t - (st.t - st.impactAt) < BUFFER_WINDOW && st.vy < 0) { st.buf = { t0: st.t, rel: false, held: 0 }; st.diveOK = false; }   // about to land: keep it for the landing
      else if (!st.trick && st.t - st.lastAirTap < 0.3 && st.airT > 0.12) { startTrick(); st.lastAirTap = -9; st.diveOK = false; st.kickW = 0; }   // a quick second tap: a trick
      else { st.lastAirTap = st.t; st.diveOK = true; st.airHold = 0; st.kickW = Math.max(-6, st.kickW - TAP_KICK); }
    },
    release() {
      if (st.charging && !st.toggle) fireJump();                          // hold mode: let go to jump
      if (st.buf && !st.buf.rel) { st.buf.rel = true; st.buf.held = st.t - st.buf.t0; }
      st.down = false; st.diveOK = false;
    },
    update(dt, cam) {
      if (st.mode === 'off') return false;
      if (st.mode === 'out') {
        st.t += dt;
        const k = reduceMotion ? 1 : ease(Math.min(1, st.t / (ENTER_SECONDS * 0.8)));
        cam.position.lerpVectors(st.leaveFrom.pos, st.home.pos, k);
        lookV.lerpVectors(st.leaveFrom.look, st.home.look, k); cam.lookAt(lookV);
        clip.constant = THREE.MathUtils.lerp(CUT, 60, k);
        if (k >= 1) {
          st.mode = 'off'; applyClip(false); track.visible = false; coins.visible = false; puffs.visible = false; bike.root.visible = false; landMark.visible = false;
          startRun(0); st.mode = 'off';
          api.onQuit?.();
        }
        return true;
      }
      if (st.paused) {                                                         // frozen: keep the camera exactly where it was
        cam.position.copy(st.camPos); cam.lookAt(st.camLook);
        return true;
      }
      st.t += dt; if (st.mode === 'play') st.runT += dt;
      if (st.charging && st.grounded && st.mode === 'play') {
        st.holdT += dt; st.charge = Math.min(1, st.holdT / CHARGE_TIME);
        st.boost = Math.min(BOOST_CAP, st.boost + 2.5 * dt);                 // the bike slowly speeds up while crouched
        if (st.charge >= 1 && !st.maxed) { st.maxed = true; try { navigator.vibrate?.(10); } catch (e) { /* not supported */ } }
      } else { st.charge = Math.max(0, st.charge - dt * 6); if (!st.charging) st.maxed = false; }
      if (st.mode !== 'play') st.charging = false;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n; i++) {
        physics(h);
        if (st.jumpReq > 0) st.jumpReq -= h;
      }
      st.impact = predictLanding(); st.impactAt = st.t;
      if (st.mode === 'play') {
        st.dist = Math.max(st.dist, st.x - st.startX); st.boost *= Math.exp(-0.35 * dt);
        const got = coins.collect(st.x, st.y, SC / SCALE);
        if (got) { st.coins += got; st.bonus += 25 * got * st.mult; st.lastTrick = st.t; groove(0.05 * got); }
        if (st.t - st.lastTrick > 5 && (st.mult > 1 || st.meter > 0)) {                // the groove fades if nothing happens for a while
          st.meter -= 0.14 * dt;
          if (st.meter < 0) { if (st.mult > 1) { st.mult--; st.meter = 0.6; } else st.meter = 0; }
        }
        st.score = scoreNow();
        const hz = track.hazardAhead(st.x, 60); st.hz = hz;                                  // a heads-up before each hazard
        if (hz && hz.x0 !== st.warnedX) { st.warnedX = hz.x0; toast(hz.type === 'gap' ? 'Gap ahead - charge a jump!' : 'Mud ahead - jump it or slow down!'); }
        const mudNow = st.grounded ? track.mudAt(st.x) : 0;
        if (mudNow > 0.3) {                                                                   // mud spray from the rear wheel
          st.mudT = (st.mudT ?? 0) - dt;
          if (st.mudT <= 0) {
            st.mudT = 0.06;
            const c = Math.cos(st.th), s2 = Math.sin(st.th);
            puffs.emit(st.x - HW * c, st.y - HW * s2 - R * 0.6, laneZ + 0.2, -4 - Math.random() * 3, 3 + Math.random() * 3, 0.6, 1.5, 0.7, '#4a3a2a', 0.7);
          }
        }
      }
      if (st.mode === 'crash' || st.mode === 'over') {
        st.crashT += dt;
        ragdoll.update(dt);
        if (st.mode === 'crash' && st.crashT > 1.5) showOver();
      }
      // looks
      const leanT = st.mode === 'crash' ? 0.2 : st.grounded ? 0.7 : (st.down && st.diveOK ? 1.15 : 0.35);
      st.lean += (leanT - st.lean) * Math.min(1, dt * 8);
      const crouchT = st.charging && st.grounded ? st.charge : 0;
      st.crouch += (crouchT - st.crouch) * Math.min(1, dt * (crouchT > st.crouch ? 6 : 14));
      if (!ragdoll.active) {
        const tr = st.trick && st.trick.kind === 'pose' ? st.trick : null;
        poseRider(bike.rider, st.lean, st.crouch, tr ? Math.sin(Math.PI * Math.min(1, tr.t / tr.dur)) : 0, tr ? tr.pose : '');
        const shake = st.maxed ? (Math.sin(st.t * 70) * 0.012) : 0;           // at full charge the rider trembles, ready to go
        bike.rider.group.position.y = shake;
      }
      bike.model.scale.y = 1 - 0.05 * st.crouch;                              // the bike squats on its suspension
      st.spinF += (st.vx * dt) / R;
      st.spinR += (st.vx * (1 + 1.6 * st.crouch) * dt) / R;                    // the rear wheel spins up while charging
      bike.wheels.rear.rotation.z = -st.spinR; bike.wheels.front.rotation.z = -st.spinF;
      // dirt kicked from the rear wheel and a little exhaust while charging
      if (st.charging && st.grounded && st.mode === 'play' && st.charge > 0.05) {
        st.puffT -= dt;
        if (st.puffT <= 0) {
          st.puffT = 0.11 - 0.07 * st.charge;
          const c = Math.cos(st.th), s2 = Math.sin(st.th);
          const wx = st.x - HW * c, wy = st.y - HW * s2 - R * 0.7;
          puffs.emit(wx, wy, laneZ + 0.2, -3 - 4 * st.charge + (Math.random() - 0.5) * 2, 1.5 + 2.5 * st.charge, 0.5, 1.3 + st.charge, 0.7, '#a98a63', 0.55);
          puffs.emit(st.x - HW * c * 1.5, st.y - HW * s2 * 0.4 + 0.5, laneZ - 0.3, -2.2 - 2 * st.charge, 0.9 + st.charge, 0.35, 0.9, 0.8, '#efeee5', 0.38);
        }
      }
      st.camZoom += (st.crouch - st.camZoom) * Math.min(1, dt * 3);
      puffs.update(dt, renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
      bike.root.position.set(st.x, st.y, laneZ);
      bike.root.rotation.z = st.th;
      setHud();
      // camera
      st.camY += (st.y - st.camY) * Math.min(1, dt * 2.2);
      st.frameDt = dt; api.focusDistance = frame();
      const k = reduceMotion ? 1 : ease(Math.min(1, st.t / ENTER_SECONDS));
      cam.position.lerpVectors(st.from.pos, target.pos, k);
      lookV.lerpVectors(st.from.look, target.look, k); cam.lookAt(lookV);
      clip.constant = THREE.MathUtils.lerp(60, CUT, k);
      st.camPos.copy(cam.position); st.camLook.copy(lookV);
      track.update(cam.position.x, st.camY);
      coins.update(cam.position.x, st.t);
      guideTick();
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
