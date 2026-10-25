// Pinball Golf (a first playable slice): one hole of the month's mini-golf course turned into a pinball table. The tee is at the bottom with two flippers either side of a drain gap, the cup at the top.
// You putt (drag back and let go); the green starts tilted, so a slow ball rolls back down to the flippers, where one button swings both flippers up to knock it up the table again. The tilt
// slowly flattens until the ball stops, you putt again, and if that misses too the table tilts up into pinball: the ball rolls down, bumpers and obstacles knock it about, the flippers keep it
// in play, until the tilt has flattened or it drains (a stroke) or drops in the cup.
import * as THREE from 'three';
import { courseSeed, holeSeed, makeHole, heroOrder } from './golfgen.js?v=20261024225424';
import { newBall, newCtx, shoot, stepBall, collideFlippers, hillH, BALL_R, CUP_R } from './golfphys.js?v=20261024225424';
import { toWorld, MARGIN, BLEND } from './golfsites.js?v=20261024225424';
import { M, G, buildHoleVisual } from './golfvis.js?v=20261024225424';
import { courseMonth } from './monthseed.js?v=20261024225424';
import { prepareTable, stepFlips, isDrained, TABLE, TILT_PUTT1, TILT_PIN, TAU_PUTT1, TAU_PIN, FLIP_RAD } from './pbtable.js?v=20261024225424';

const HOLE_INDEX = 3, SITE = { x: -42, z: -70, k: 2 };         // (heading k = 2 turns the hole so its tee end is nearest the viewer and the cup is up the screen)
const SUB = 4;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createPinball(scene, camera, renderer, world, { audio = null, reduceMotion = false, lowEnd = false } = {}) {
  const st = { mode: 'off', t: 0, strokes: 0, flips: 0, pts: 0, kind: 'putt1', kindT: 0, rollT: 0, flipT: -99, clock: 0 };
  let hole = null, vis = null, group = null, ball = null, ballMesh = null, dots = null, ctx = newCtx(), flips = [], flipMeshes = [], Y = 0, drag = null, flipHeld = false, boards = [], sinkT = 0, shake = 0;
  const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false };
  const tmpV = new THREE.Vector3(), up0 = new THREE.Vector3(0, 1, 0), home = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, from = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, want = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let frame = { u: null, n: null, tee: null };

  // ---------- the HUD ----------
  const hud = document.createElement('div'); hud.className = 'golf-hud'; hud.hidden = true;
  hud.innerHTML = '<div class="golf-top"><div class="golf-left"><div class="golf-info"><b>Pinball Golf</b><span data-k="par"></span><span data-k="strokes"></span><span class="golf-chal" data-k="msg"></span></div></div><button class="golf-quit" type="button">Leave</button></div>' +
    '<div class="golf-banner" data-k="banner"></div><div class="golf-toast" data-k="toast"></div><div class="golf-power" data-k="power"><i></i></div><div class="pb-tilt" data-k="tilt"><i></i><span>TILT</span></div><button class="pb-flip" type="button">FLIP</button><div class="golf-score" data-k="score" hidden></div>';
  document.body.append(hud);
  const $ = (k) => hud.querySelector(`[data-k="${k}"]`), elPar = $('par'), elStrokes = $('strokes'), elMsg = $('msg'), elBanner = $('banner'), elToast = $('toast'), elPower = $('power'), elTilt = $('tilt'), elScore = $('score'), btnFlip = hud.querySelector('.pb-flip');
  const timers = {}, say = (el, text, ms, key) => { el.textContent = text; el.classList.add('show'); clearTimeout(timers[key]); timers[key] = setTimeout(() => el.classList.remove('show'), ms); };
  hud.querySelector('.golf-quit').addEventListener('click', () => api.stop());
  const setBoards = (show) => { if (!boards.length) for (const b of world.boards) { let o = b.face; while (o && o.parent && o.parent !== scene) o = o.parent; if (o && !boards.includes(o)) boards.push(o); } for (const o of boards) o.visible = show; };

  // ---------- the table ----------
  function buildTable() {
    const mo = courseMonth(), cs = courseSeed(mo.year, mo.month), type = heroOrder(cs)[HOLE_INDEX];
    hole = makeHole(holeSeed(cs, HOLE_INDEX), HOLE_INDEX, type);
    frame = prepareTable(hole); flips = frame.flips;
    // levelled ground and the visual
    const toW = (x, z) => toWorld(SITE, x, z), shape = hole.shape.map((p) => { const w = toW(p[0], p[1]); return [w.x, w.z, p[2] + MARGIN]; });
    Y = world.carve.begin([shape], BLEND, [])[0]; world.carve.set(0, 0);
    vis = buildHoleVisual(hole, { lowEnd, look: world.waterLook }); group = vis.group; group.rotation.y = (SITE.k * Math.PI) / 4; group.position.set(SITE.x, Y + 0.06, SITE.z); group.scale.set(1, 0.001, 1); scene.add(group);
    const barM = new THREE.MeshLambertMaterial({ color: '#e8594b' }), capM = new THREE.MeshLambertMaterial({ color: '#fff6e0' });
    flipMeshes = flips.map((f) => {
      const g = new THREE.Group(), bar = new THREE.Mesh(G.box, barM), c0 = new THREE.Mesh(G.sph, capM), c1 = new THREE.Mesh(G.sph, barM);
      bar.scale.set(f.len, 0.3, f.rad * 2); bar.position.x = f.len / 2; c0.scale.setScalar(f.rad * 1.5); c1.scale.setScalar(f.rad * 1.1); c1.position.x = f.len; g.add(bar, c0, c1); g.position.set(f.px, 0.22, f.pz); bar.castShadow = c0.castShadow = c1.castShadow = true; group.add(g); return g;
    });
    dressTable();
    ballMesh = new THREE.Mesh(G.ball, M.ball.clone()); ballMesh.castShadow = true; group.add(ballMesh);
    dots = new THREE.InstancedMesh(G.dot, M.dot, 16); dots.count = 0; dots.frustumCulled = false; group.add(dots);
    { const c = toW(hole.cup.x, hole.cup.z); world.carve.setHole(0, c.x, c.z, CUP_R * 0.92 + 0.03); }
  }
  // the look of a pinball playfield: blue lacquer with printed inserts, glossy rails, slingshots, the drain
  const disposables = [];
  function dressTable() {
    const blue = new THREE.MeshLambertMaterial({ color: '#1d4fb8' }); disposables.push(blue);
    group.traverse((o) => { if (o.isMesh && o.material === M.grass) o.material = blue; });
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 480; const c = cv.getContext('2d'), X = (x) => ((x - TABLE.x0) / 30) * 1024, Z = (z) => ((z + 7) / 14) * 480;
    c.clearRect(0, 0, 1024, 480); c.save(); c.beginPath(); frame.outline = hole.outline; hole.outline.forEach((p, i) => (i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1])))); c.closePath(); c.clip();
    const g = c.createLinearGradient(0, 0, 1024, 0); g.addColorStop(0, '#173f96'); g.addColorStop(0.6, '#2a68d4'); g.addColorStop(1, '#6a3fb5'); c.fillStyle = g; c.fillRect(0, 0, 1024, 480);
    for (let i = 0; i < 90; i++) { const a = i * 2.4, x = X(TABLE.cup.x) + Math.cos(a) * (40 + i * 2.6), y = Z(0) + Math.sin(a) * (40 + i * 2.6); c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }   // (a scatter of stars)
    [[150, '#ffd23f'], [110, '#e8594b'], [70, '#fff6e0']].forEach(([r, col]) => { c.fillStyle = col; c.beginPath(); c.arc(X(TABLE.cup.x), Z(0), (r / 480) * 14 * 34, 0, 7); c.fill(); }); c.fillStyle = '#1d4fb8'; c.beginPath(); c.arc(X(TABLE.cup.x), Z(0), 55, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,214,70,0.9)'; for (let k = 0; k < 5; k++) { const x = X(-3 + k * 3.4); c.beginPath(); c.moveTo(x + 36, Z(0)); c.lineTo(x - 20, Z(0) - 30); c.lineTo(x - 8, Z(0)); c.lineTo(x - 20, Z(0) + 30); c.closePath(); c.fill(); }   // (chevrons pointing up the table)
    c.fillStyle = '#fff6e0'; c.font = '800 70px "Outfit", system-ui, sans-serif'; c.textAlign = 'center'; c.save(); c.translate(X(-9.6), Z(0)); c.rotate(Math.PI / 2); c.fillText('PINBALL', 0, -48); c.fillText('GOLF', 0, 24); c.restore();
    c.restore();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; disposables.push(tex);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(30, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); art.position.set(0, 0.05, 0); disposables.push(art.geometry, art.material); group.add(art);
    const red = new THREE.MeshLambertMaterial({ color: '#e0443f' }), cream = new THREE.MeshLambertMaterial({ color: '#fff1d0' }); disposables.push(red, cream);
    for (const [a, b] of frame.rails) {
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), bar = new THREE.Mesh(G.box, red), cap = new THREE.Mesh(G.box, cream);
      for (const [m, y, h, w] of [[bar, 0.25, 0.5, 0.28], [cap, 0.54, 0.08, 0.34]]) { m.scale.set(l + 0.06, h, w); m.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2); m.rotation.y = Math.atan2(-dz, dx); m.castShadow = true; group.add(m); }
    }
    for (const tr of frame.tris) {                                                     // slingshots: a red wedge with a cream top
      const sh = new THREE.Shape(tr.map((p) => new THREE.Vector2(p[0], -p[1]))), geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false }).rotateX(-Math.PI / 2), m = new THREE.Mesh(geo, red);
      m.scale.set(0.97, 1, 0.97); m.castShadow = true; disposables.push(geo); group.add(m); const top = new THREE.Mesh(geo, cream); top.scale.set(0.93, 0.04, 0.93); top.position.y = 0.52; group.add(top);
    }
    const dr = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: '#07080b' })); dr.scale.set(1.8, 0.04, 3.6); dr.position.set(-13.9, 0.07, 0); group.add(dr);
  }
  function disposeTable() {
    for (const d of disposables.splice(0)) d.dispose?.();
    if (!group) return; scene.remove(group); vis.dispose(); ballMesh.material.dispose(); dots.dispose(); group = vis = hole = ball = ballMesh = dots = null; flips = []; flipMeshes = [];
  }

  // ---------- the camera: behind the flippers, looking up the table ----------
  function tablePose(out) {
    const b = hole.bounds, c = toWorld(SITE, b.cx, b.cz), tan = Math.tan((camera.fov * Math.PI) / 360), pitch = 1.1;
    const long = b.hx > b.hz ? b.hx : b.hz, dist = Math.max((long * Math.sin(pitch) + 2.6) / tan, (Math.min(b.hx, b.hz) + 2) / (tan * camera.aspect)) * 1.05;
    out.pos.set(c.x, Y + dist * Math.sin(pitch), c.z + dist * Math.cos(pitch) + 1.2); out.look.set(c.x, Y + 0.2, c.z + 1.0);
  }

  // ---------- one ball ----------
  function teeBall() { ctx.capV = 13; ctx.cupR = CUP_R * 1.35; ballMesh.visible = true; ball = newBall(hole); ball.y = hillH(hole, ball.x, ball.z); st.kind = 'putt1'; st.kindT = 0; ctx.tilt = TILT_PUTT1; ctx.t = 0; place(); }
  function place() {
    if (!ball) return; const y = hillH(hole, ball.x, ball.z) + 0.03; ballMesh.position.set(ball.x, (ball.air ? ball.y : y) + BALL_R, ball.z);
  }
  function setKind(kind) { st.kind = kind; st.kindT = 0; st.rollT = 0; }
  function afterStop() {                                   // the ball has come to rest short of the cup: what happens next
    if (st.kind === 'pinball') { setKind('putt'); ctx.tilt = 0; say(elBanner, 'Putt again!', 1600, 'banner'); }
    else if (st.kind === 'putt1') { setKind('putt'); ctx.tilt = 0; say(elBanner, 'Putt again!', 1600, 'banner'); }
    else { setKind('pinball'); st.pinT = 0; say(elBanner, 'The table tilts: use the flippers!', 2400, 'banner'); }          // a flat putt that missed: back to pinball
    st.mode = st.kind === 'pinball' ? 'roll' : 'aim'; if (st.kind === 'pinball') { ball.rest = false; ball.still = 0; ball.dawdle = 0; ball.vx = hole.tiltDir.x * 1.5; ball.vz = hole.tiltDir.z * 1.5; ctx.tilt = TILT_PIN * 0.5; }
  }
  const drained = () => isDrained(frame, ball);

  // ---------- aiming (as in the mini-golf: drag back, the ball goes the other way) ----------
  function screenToCourse(sx, sy) {
    const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight; group.updateWorldMatrix(true, false);
    const proj = (p) => { const v = p.project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
    const p0 = proj(group.localToWorld(new THREE.Vector3(ball.x, 0, ball.z))), px = proj(group.localToWorld(new THREE.Vector3(ball.x + 1, 0, ball.z))), pz = proj(group.localToWorld(new THREE.Vector3(ball.x, 0, ball.z + 1)));
    const exx = px[0] - p0[0], exy = px[1] - p0[1], ezx = pz[0] - p0[0], ezy = pz[1] - p0[1], det = exx * ezy - ezx * exy || 1e-6;
    return { dx: (ezy * sx - ezx * sy) / det, dz: (-exy * sx + exx * sy) / det, W, H };
  }
  function aimInfo(d) { const sx = d.x0 - d.x, sy = d.y0 - d.y, v = screenToCourse(sx, sy); return { dx: v.dx, dz: v.dz, power: clamp01(Math.hypot(sx, sy) / (0.3 * Math.min(v.W, v.H))) }; }
  function updateAim() {
    if (!drag || st.mode !== 'aim') { dots.count = 0; elPower.classList.remove('show'); return; }
    const a = aimInfo(drag), l = Math.hypot(a.dx, a.dz) || 1, n = a.power < 0.05 ? 0 : Math.round(3 + a.power * 12), y = hillH(hole, ball.x, ball.z) + 0.25, m = new THREE.Matrix4();
    elPower.classList.add('show'); elPower.firstChild.style.width = `${Math.round(a.power * 100)}%`;
    for (let i = 0; i < n; i++) { m.makeTranslation(ball.x + (a.dx / l) * (0.7 + i * 0.62), y, ball.z + (a.dz / l) * (0.7 + i * 0.62)); dots.setMatrixAt(i, m); }
    dots.count = n; dots.instanceMatrix.needsUpdate = true;
  }
  const onDown = (e) => {
    if (e.button > 0 || e.target?.closest?.('.golf-quit, .golf-score')) return;
    if (e.target?.closest?.('.pb-flip')) { flipHeld = true; e.preventDefault(); return; }
    if (st.mode === 'aim') { drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; e.preventDefault(); }
    else if (st.mode === 'roll') { flipHeld = true; e.preventDefault(); }
  };
  const onMove = (e) => { if (drag) { drag.x = e.clientX; drag.y = e.clientY; updateAim(); } };
  const onUp = () => {
    flipHeld = false; if (!drag) return; const d = drag; drag = null; updateAim(); if (st.mode !== 'aim') return;
    const a = aimInfo(d); if (a.power < 0.06) return;
    st.strokes++; st.mode = 'roll'; st.rollT = 0; shoot(ball, a.dx, a.dz, Math.pow(a.power, 1.15), false); audio?.golf?.('putt', a.power);
  };
  const onKey = (e) => { if (e.code === 'Space') { flipHeld = e.type === 'keydown'; e.preventDefault(); } else if (e.key === 'Escape' && e.type === 'keydown') api.stop(); };
  btnFlip.addEventListener('pointerdown', (e) => { flipHeld = true; e.preventDefault(); e.stopPropagation(); }); btnFlip.addEventListener('pointerup', () => { flipHeld = false; }); btnFlip.addEventListener('pointerleave', () => { flipHeld = false; });
  const noScroll = (e) => { if (st.mode !== 'off' && !e.target?.closest?.('.golf-quit, .golf-score')) e.preventDefault(); };
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('pointerdown', onDown, { passive: false }); window[f]('pointermove', onMove); window[f]('pointerup', onUp); window[f]('pointercancel', onUp); window[f]('keydown', onKey); window[f]('keyup', onKey);
    window[f]('touchmove', noScroll, { passive: false }); window[f]('touchstart', noScroll, { passive: false });
  }

  // ---------- running ----------
  function stepFlippers(h) { stepFlips(flips, flipHeld, h); flips.forEach((f, i) => { flipMeshes[i].rotation.y = -f.a; }); }
  function updateTilt(dt) {
    st.kindT += dt; ctx.fricK = st.kind === 'pinball' ? 0.2 : st.kind === 'putt1' ? 0.45 : 1;          // (in pinball the ball rolls on long, so it can be played about)
    if (st.kind === 'putt1') ctx.tilt = TILT_PUTT1 * Math.exp(-(st.mode === 'roll' ? st.rollT : 0) / TAU_PUTT1);
    else if (st.kind === 'putt') ctx.tilt = 0;
    else { st.pinT = (st.pinT || 0) + dt; ctx.tilt = TILT_PIN * Math.min(1, st.pinT / 0.3) * Math.exp(-st.pinT / TAU_PIN); }
    if (group) {                                                          // (the cup end rises, pivoting about the tee: the table is seen to tilt)
      group.rotation.x = Math.min(0.3, ctx.tilt * 0.06); group.position.set(SITE.x, Y + 0.06, SITE.z); group.updateMatrix();
      const t = toWorld(SITE, frame.bottom.x, frame.bottom.z), w = tmpV.set(frame.bottom.x, 0, frame.bottom.z).applyMatrix4(group.matrix); group.position.add(tmpV.set(t.x - w.x, Y + 0.06 - w.y, t.z - w.z));
    }
    elTilt.firstChild.style.height = `${Math.round(100 * Math.min(1, ctx.tilt / TILT_PIN))}%`;
  }
  function pointsFor() { return st.flipT > st.clock - 5 ? 150 : Math.max(100, 400 - 100 * (st.strokes - 1)) + (st.strokes === 1 ? 300 : 0); }
  function runBall(dt) {
    st.clock += dt; st.rollT += dt; const h = dt / SUB;
    for (let i = 0; i < SUB; i++) {
      stepFlippers(h); ctx.t += h; stepBall(ball, hole, ctx, h, ev);
      const hard = collideFlippers(ball, flips); if (hard > 1.5) { st.flipT = st.clock; st.pts += 5; shake = 0.15; audio?.golf?.('post', Math.min(1, hard / 12)); }
      if (ev.post > 2) { st.pts += 10; audio?.golf?.('post', Math.min(1, ev.post / 12)); }
      if (ev.wall > 1.5) audio?.golf?.('wall', Math.min(1, ev.wall / 12));
      if (ev.holed) { st.mode = 'sink'; sinkT = 0; st.byFlip = st.flipT > st.clock - 5; return; }
      if (ev.splash || drained()) {
        st.strokes++; say(elToast, ev.splash ? 'Splash! +1' : 'Ball lost! +1', 1600, 'toast'); audio?.golf?.(ev.splash ? 'splash' : 'wall'); teeBall(); st.mode = 'aim'; return;
      }
    }
    if (ball.rest && st.mode === 'roll' && st.rollT > 0.6) afterStop();
  }
  function finish() {
    const bonus = st.byFlip ? 150 : Math.max(100, 400 - 100 * (st.strokes - 1)) + (st.strokes === 1 ? 300 : 0), total = st.pts + bonus;
    st.mode = 'card'; elScore.innerHTML = `<h2>${st.byFlip ? 'Holed with the flippers!' : st.strokes === 1 ? 'Hole in one!' : 'Holed out!'}</h2><p class="golf-total">${total} points <small>${st.strokes} stroke${st.strokes === 1 ? '' : 's'} · ${bonus} for the hole · ${st.pts} from the table</small></p><div class="golf-btns"><button type="button" data-a="again">Play again</button><button type="button" data-a="leave">Leave</button></div>`;
    elScore.hidden = false; audio?.golf?.('win');
  }
  elScore.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a === 'again') { elScore.hidden = true; st.strokes = 0; st.pts = 0; st.flips = 0; teeBall(); st.mode = 'aim'; } else if (a === 'leave') api.stop(); });
  function updateHud() {
    elPar.textContent = `Par ${hole.par}`; elStrokes.textContent = st.strokes === 1 ? '1 stroke' : `${st.strokes} strokes`;
    elMsg.textContent = st.mode === 'aim' ? (st.kind === 'putt1' ? '◎ Drag back and putt: the green is tilted' : '◎ Flat green: putt again') : st.kind === 'pinball' ? '◎ Pinball! Hold Space or FLIP' : '◎ Flip it up the table (Space / FLIP)';
  }

  const api = {
    get active() { return st.mode !== 'off'; },
    get focusDistance() { return 30; },
    onQuit: null,
    get debug() { return { st, hole, ball, ctx, flips }; },
    start(homeCam) {
      if (st.mode !== 'off') return;
      home.pos.copy(homeCam.pos); home.look.copy(homeCam.look); from.pos.copy(homeCam.pos); from.look.copy(homeCam.look);
      Object.assign(st, { mode: 'enter', t: 0, strokes: 0, flips: 0, pts: 0, clock: 0, flipT: -99, byFlip: false }); flipHeld = false;
      setBoards(false); buildTable(); teeBall(); tablePose(want);
      document.body.classList.add('game-mode'); hud.hidden = false; elScore.hidden = true; listen(true); audio?.zoom?.('in', 1.7);
      say(elBanner, 'Pinball Golf', 2600, 'banner');
    },
    stop() {
      if (st.mode === 'off' || st.mode === 'exit') return;
      drag = null; if (dots) dots.count = 0; world.carve.setHole(0, 0, 0, 0); elPower.classList.remove('show'); hud.classList.add('leaving'); elScore.hidden = true; flipHeld = false;
      from.pos.copy(camera.position); tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(30).add(camera.position); from.look.copy(tmpV);
      st.mode = 'exit'; st.t = 0; audio?.zoom?.('out', 1.4);
    },
    update(dt) {
      if (st.mode === 'off') return false;
      dt = Math.min(dt, 0.05); st.t += dt;
      if (st.mode === 'exit') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / 1.4)); camera.position.lerpVectors(from.pos, home.pos, k); tmpV.lerpVectors(from.look, home.look, k); camera.up.copy(up0); camera.lookAt(tmpV);
        group.scale.y = Math.max(0.001, 1 - k); world.carve.set(1 - k, 0);
        if (k >= 1) {
          disposeTable(); world.carve.end(); setBoards(true); document.body.classList.remove('game-mode'); hud.hidden = true; hud.classList.remove('leaving'); listen(false); st.mode = 'off'; this.onQuit?.();
        }
        return true;
      }
      tablePose(want);
      if (st.mode === 'enter') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / 2.0)); camera.position.lerpVectors(from.pos, want.pos, k); tmpV.lerpVectors(from.look, want.look, k); camera.up.copy(up0); camera.lookAt(tmpV);
        const r = reduceMotion ? 1 : ease(clamp01((st.t - 0.3) / 1.2)); group.scale.y = Math.max(0.001, r); world.carve.set(r, 0);
        if (st.t >= 2.1 || reduceMotion) { group.scale.y = 1; world.carve.set(1, 0); st.mode = 'aim'; say(elToast, 'Drag back to putt. Space (or FLIP) swings the flippers.', 3200, 'toast'); }
        return true;
      }
      camera.position.copy(want.pos); if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * 0.12; camera.position.y += (Math.random() - 0.5) * 0.12; } camera.up.copy(up0); camera.lookAt(want.look);
      updateTilt(dt);
      if (st.mode === 'roll') runBall(dt);
      else if (st.mode === 'aim') { ctx.t += dt; stepFlippers(dt); if (!ball.rest) { stepBall(ball, hole, ctx, dt, ev); if (ball.vx * ball.vx + ball.vz * ball.vz > 0.01) { st.mode = 'roll'; st.rollT = 0; } } }
      else if (st.mode === 'sink') {
        ctx.t += dt; sinkT += dt; const s = clamp01(sinkT / 0.55); ballMesh.scale.setScalar(1 - 0.7 * s); ballMesh.position.set(hole.cup.x, 0.2 - 1.2 * s + BALL_R * (1 - s), hole.cup.z); stepFlippers(dt);
        if (s >= 1) { ballMesh.visible = false; finish(); }
      } else stepFlippers(dt);
      if (st.mode !== 'sink' && st.mode !== 'card') { place(); ballMesh.scale.setScalar(1); const sp = Math.hypot(ball.vx, ball.vz); if (sp > 0.05) { tmpV.set(-ball.vz, 0, ball.vx).normalize(); ballMesh.rotateOnWorldAxis(tmpV, (sp * dt) / BALL_R); } }
      vis.update(ctx.t, ctx.t, dt, st); updateHud();
      return true;
    },
  };
  return api;
}
