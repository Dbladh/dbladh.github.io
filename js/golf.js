// The hidden mini-golf game. Click the windmill: the camera flies over to its hill, the ground there is levelled into a lawn (carved out of the real terrain, see world.carve) and a course of holes appears on it, one hole at a time.
// Drag back from anywhere and let go to putt (the ball goes the opposite way, further for a longer pull). Each month has its own course (the same for everyone), see golfgen.js.
// This module is loaded the first time the windmill is clicked. The shell here (camera, input, HUD, scoring) follows the dirt-bike game's (bikegame.js).
import * as THREE from 'three';
import { heightAt } from './world.js?v=20261024095655';
import { courseSeed, holeSeed, makeHole, HOLES, TRAY_R } from './golfgen.js?v=20261024095655';
import { newBall, shoot, stepBall, hillH, BALL_R, CUP_R } from './golfphys.js?v=20261024095655';

const CX = -40, CZ = -68;                                  // the site: on the hillside in front of the windmill, clear of the signs and of the windmill itself
const ENTER = 1.9, EXIT = 1.4, RISE = 1.3, GROW = 0.55;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const M = {                                                // shared materials (made once)
  grass: new THREE.MeshLambertMaterial({ vertexColors: true }), rail: new THREE.MeshLambertMaterial({ color: '#c88b55' }),
  post: new THREE.MeshLambertMaterial({ color: '#e8594b' }), cup: new THREE.MeshBasicMaterial({ color: '#17171c' }), white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  pole: new THREE.MeshLambertMaterial({ color: '#f4f1e8' }), flag: new THREE.MeshBasicMaterial({ color: '#ef5b4d', side: THREE.DoubleSide }),
  body: new THREE.MeshLambertMaterial({ color: '#f1e8cf' }), roof: new THREE.MeshLambertMaterial({ color: '#d9534f' }), sail: new THREE.MeshLambertMaterial({ color: '#fffaf0' }),
  ball: new THREE.MeshLambertMaterial({ color: '#ffffff' }), dot: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }), shadow: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }),
};
const G = {                                                // shared geometries
  box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(BALL_R, 16, 12), dot: new THREE.SphereGeometry(0.1, 8, 6), disc: new THREE.CircleGeometry(1, 24),
};
G.disc.rotateX(-Math.PI / 2);

export function createGolf(scene, camera, renderer, world, { audio = null, reduceMotion = false } = {}) {
  const st = { mode: 'off', t: 0, hole: 0, holeT: 0, strokes: 0, scores: [], par: [], seed: 0, year: 0, month: 0, rollT: 0, sinkT: 0, hud: { hole: '', strokes: -1 } };
  const Y = { top: 0 };                                      // the height of the levelled lawn
  let tray = null, holeGroup = null, rotor = null, ballMesh = null, ballShadow = null, dots = null, hole = null, ball = null, drag = null;
  const ev = { wall: 0, post: 0, holed: false }, up0 = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
  const frame = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), dist: 40 };
  const disposables = [];
  const boardRoots = [];                                   // the three billboards: tucked away while golfing
  function setBoards(show) {
    if (!boardRoots.length) for (const b of world.boards) { let o = b.face; while (o && o.parent && o.parent !== scene) o = o.parent; if (o && !boardRoots.includes(o)) boardRoots.push(o); }
    for (const o of boardRoots) o.visible = show;
  }

  // ---------- the HUD ----------
  const hud = document.createElement('div');
  hud.className = 'golf-hud'; hud.hidden = true;
  hud.innerHTML = '<div class="golf-top"><div class="golf-info"><b data-k="hole"></b><span data-k="par"></span><span data-k="strokes"></span></div><button class="golf-quit" type="button">Leave</button></div>' +
    '<div class="golf-banner" data-k="banner"></div><div class="golf-toast" data-k="toast"></div><div class="golf-power" data-k="power"><i></i></div><div class="golf-score" data-k="score" hidden></div>';
  document.body.append(hud);
  const $ = (k) => hud.querySelector(`[data-k="${k}"]`);
  const elHole = $('hole'), elPar = $('par'), elStrokes = $('strokes'), elBanner = $('banner'), elToast = $('toast'), elPower = $('power'), elScore = $('score');
  const say = (el, text, ms, key) => { el.textContent = text; el.classList.add('show'); clearTimeout(say[key]); say[key] = setTimeout(() => el.classList.remove('show'), ms); };
  hud.querySelector('.golf-quit').addEventListener('click', () => api.stop());
  const bestKey = () => `golf.best.${st.year}-${String(st.month).padStart(2, '0')}`;
  const readBest = () => { try { const v = parseInt(localStorage.getItem(bestKey()), 10); return Number.isFinite(v) ? v : null; } catch (e) { return null; } };
  const writeBest = (v) => { try { localStorage.setItem(bestKey(), String(v)); } catch (e) { /* private mode */ } };

  function updateHud() {
    const h = `Hole ${st.hole + 1} of ${HOLES}`;
    if (st.hud.hole !== h) { st.hud.hole = h; elHole.textContent = h; elPar.textContent = `Par ${hole ? hole.par : '-'}`; }
    if (st.hud.strokes !== st.strokes) { st.hud.strokes = st.strokes; elStrokes.textContent = st.strokes === 1 ? '1 stroke' : `${st.strokes} strokes`; }
  }

  // ---------- the site (the group the holes are built in; the ground itself is levelled by world.carve) ----------
  function buildTray() { tray = new THREE.Group(); tray.position.set(CX, 0, CZ); tray.visible = false; scene.add(tray); }

  // ---------- one hole's meshes ----------
  function disposeHole() {
    if (holeGroup) { tray.remove(holeGroup); holeGroup = null; }
    for (const d of disposables) d.dispose();
    disposables.length = 0; rotor = null; ballMesh = null; ballShadow = null; dots = null;
  }
  function buildHole(h) {
    const g = new THREE.Group(); g.position.y = 0.06;
    // the fairway: a strip of green along the corridor, in mown stripes, raised and lowered by the hills
    const pos = [], col = [], idx = [], c1 = new THREE.Color('#5fc65f'), c2 = new THREE.Color('#52b955');
    const COLS = 4; let along = 0;
    for (let i = 0; i < h.path.length - 1; i++) {
      const L0 = h.left[i], L1 = h.left[i + 1], R0 = h.right[i], R1 = h.right[i + 1], len = Math.hypot(h.path[i + 1].x - h.path[i].x, h.path[i + 1].z - h.path[i].z), steps = Math.ceil(len / 0.8), base = pos.length / 3;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        for (let c = 0; c <= COLS; c++) {
          const u = c / COLS, x = L0.x + (L1.x - L0.x) * t + ((R0.x + (R1.x - R0.x) * t) - (L0.x + (L1.x - L0.x) * t)) * u, z = L0.z + (L1.z - L0.z) * t + ((R0.z + (R1.z - R0.z) * t) - (L0.z + (L1.z - L0.z) * t)) * u;
          pos.push(x, hillH(h, x, z) + 0.03, z);
          const k = (Math.floor((along + len * t) / 1.5) & 1) ? c1 : c2; col.push(k.r, k.g, k.b);
        }
      }
      for (let s = 0; s < steps; s++) for (let c = 0; c < COLS; c++) { const a = base + s * (COLS + 1) + c, b = a + 1, d = a + COLS + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
      along += len;
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); fg.setIndex(idx); fg.computeVertexNormals();
    disposables.push(fg); const fairway = new THREE.Mesh(fg, M.grass); fairway.castShadow = fairway.receiveShadow = false; g.add(fairway);
    // the walls: one instanced box per rail
    const vis = h.walls.filter((w) => w[4]);
    const rails = new THREE.InstancedMesh(G.box, M.rail, vis.length); rails.castShadow = rails.receiveShadow = false;
    vis.forEach((w, i) => {
      const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.hypot(dx, dz);
      tmpQ.setFromAxisAngle(up0, Math.atan2(-dz, dx)); tmpM.compose(tmpV.set((w[0] + w[2]) / 2, 0.12, (w[1] + w[3]) / 2), tmpQ, new THREE.Vector3(l + 0.3, 0.9, 0.3)); rails.setMatrixAt(i, tmpM);
    });
    rails.instanceMatrix.needsUpdate = true; g.add(rails);
    // tee, cup, flag, posts
    const tee = new THREE.Mesh(G.disc, M.white); tee.scale.set(0.55, 1, 0.55); tee.position.set(h.tee.x + 0.9, 0.06, h.tee.z); g.add(tee);
    const cup = new THREE.Mesh(G.disc, M.cup); cup.scale.set(CUP_R * 0.92, 1, CUP_R * 0.92); cup.position.set(h.cup.x, 0.07, h.cup.z); g.add(cup);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), M.pole); pole.position.set(h.cup.x, 1.2, h.cup.z); g.add(pole); disposables.push(pole.geometry);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.6), M.flag); flag.position.set(h.cup.x + 0.48, 2.1, h.cup.z); g.add(flag); disposables.push(flag.geometry);
    for (const p of h.posts) { const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 1.0, 14), M.post); m.position.set(p.x, 0.45, p.z); g.add(m); disposables.push(m.geometry); }
    // the windmill: a solid base either side of a low opening, a roof, and four sails that sweep across the opening
    if (h.hero && h.hero.type === 'windmill') {
      const hr = h.hero, w = new THREE.Group(); w.position.set(hr.x, 0, hr.z); w.rotation.y = Math.atan2(-hr.uz, hr.ux);
      const lat0 = hr.gap, lat1 = hr.hw + 0.3;
      for (const s of [-1, 1]) { const b = new THREE.Mesh(G.box, M.body); b.scale.set(hr.half * 2, 3.6, lat1 - lat0); b.position.set(0, 0.7, s * (lat0 + lat1) / 2); w.add(b); }
      const lintel = new THREE.Mesh(G.box, M.body); lintel.scale.set(hr.half * 2, 1.2, lat0 * 2); lintel.position.set(0, 1.9, 0); w.add(lintel);
      const roofG = new THREE.ConeGeometry(2.7, 1.5, 4); disposables.push(roofG); const roof = new THREE.Mesh(roofG, M.roof); roof.position.y = 3.65; roof.rotation.y = Math.PI / 4; w.add(roof);
      rotor = new THREE.Group(); rotor.position.set(-(hr.half + 0.12), 1.7, 0); w.add(rotor);
      for (let k = 0; k < 4; k++) {
        const pivot = new THREE.Group(); pivot.rotation.x = (k * Math.PI) / 2;
        const arm = new THREE.Mesh(G.box, M.sail); arm.scale.set(0.1, 1.65, 0.3); arm.position.y = -0.82; pivot.add(arm);
        const tip = new THREE.Mesh(G.box, M.roof); tip.scale.set(0.12, 0.25, 0.34); tip.position.y = -1.6; pivot.add(tip); rotor.add(pivot);
      }
      const hub = new THREE.Mesh(G.box, M.roof); hub.scale.set(0.3, 0.3, 0.3); rotor.add(hub);
      g.add(w);
    }
    // the ball and its shadow, and the dots that show the aim
    ballMesh = new THREE.Mesh(G.ball, M.ball); g.add(ballMesh);
    ballShadow = new THREE.Mesh(G.disc, M.shadow); ballShadow.scale.set(BALL_R * 1.1, 1, BALL_R * 1.1); g.add(ballShadow);
    dots = new THREE.InstancedMesh(G.dot, M.dot, 16); dots.count = 0; dots.frustumCulled = false; g.add(dots);
    g.scale.set(1, 0.001, 1); g.visible = true; tray.add(g); holeGroup = g;
  }
  function placeBall() {
    const y = hillH(hole, ball.x, ball.z) + 0.03;
    ballMesh.position.set(ball.x, y + BALL_R, ball.z); ballShadow.position.set(ball.x, y + 0.02, ball.z);
  }

  // ---------- flow ----------
  function startHole(i) {
    disposeHole();
    st.hole = i; hole = makeHole(holeSeed(st.seed, i), i); ball = newBall(hole); st.par[i] = hole.par; st.strokes = 0; st.holeT = 0; st.rollT = 0; drag = null; st.mode = 'grow'; st.t = 0;
    buildHole(hole); placeBall(); st.hud.hole = ''; st.hud.strokes = -1; updateHud();
  }
  function finishHole() {
    st.scores[st.hole] = st.strokes;
    const d = st.strokes - hole.par, name = st.strokes === 1 ? 'Hole in one!' : d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : `+${d}`;
    say(elToast, name, 1500, 'toast'); st.mode = 'done'; st.t = 0;
    audio?.golf?.(st.strokes === 1 || d < 0 ? 'win' : 'cup');
  }
  function showScore() {
    st.mode = 'card';
    const total = st.scores.reduce((a, b) => a + b, 0), par = st.par.reduce((a, b) => a + b, 0), best = readBest();
    let nb = false; if (best === null || total < best) { writeBest(total); nb = true; }
    const rows = st.scores.map((s, i) => `<tr><td>${i + 1}</td><td>${st.par[i]}</td><td>${s}</td><td>${s - st.par[i] > 0 ? '+' : ''}${s - st.par[i]}</td></tr>`).join('');
    elScore.innerHTML = `<h2>${MONTHS[st.month - 1]} ${st.year}</h2><table><thead><tr><th>Hole</th><th>Par</th><th>You</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="golf-total">${total} strokes <small>(par ${par})</small></p><p class="golf-best">${nb ? 'A new best for this month!' : `Your best this month: ${best}`}</p>` +
      '<div class="golf-btns"><button type="button" data-a="again">Play again</button><button type="button" data-a="leave">Leave</button></div>';
    elScore.hidden = false; audio?.golf?.('win');
  }
  elScore.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a === 'again') { elScore.hidden = true; st.scores = []; st.par = []; startHole(0); } else if (a === 'leave') api.stop(); });

  // ---------- aiming ----------
  function aimInfo(d) {                                    // the pull-back on screen, as a direction on the course and a power
    const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight;
    holeGroup.updateWorldMatrix(true, false); const wp = holeGroup.localToWorld(tmpV.set(ball.x, 0, ball.z)).clone();
    const proj = (p) => { const v = p.clone().project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
    const p0 = proj(wp), px = proj(wp.clone().add(new THREE.Vector3(1, 0, 0))), pz = proj(wp.clone().add(new THREE.Vector3(0, 0, 1)));
    const exx = px[0] - p0[0], exy = px[1] - p0[1], ezx = pz[0] - p0[0], ezy = pz[1] - p0[1], det = exx * ezy - ezx * exy || 1e-6;
    const sx = d.x0 - d.x, sy = d.y0 - d.y, len = Math.hypot(sx, sy);
    return { dx: (ezy * sx - ezx * sy) / det, dz: (-exy * sx + exx * sy) / det, power: clamp01(len / (0.3 * Math.min(W, H))) };
  }
  function updateAim() {
    if (!drag) { dots.count = 0; elPower.classList.remove('show'); return; }
    const a = aimInfo(drag), l = Math.hypot(a.dx, a.dz) || 1;
    elPower.classList.add('show'); elPower.firstChild.style.width = `${Math.round(a.power * 100)}%`;
    const n = a.power < 0.05 ? 0 : Math.round(3 + a.power * 12), y = hillH(hole, ball.x, ball.z) + 0.2;
    for (let i = 0; i < n; i++) { tmpM.makeTranslation(ball.x + (a.dx / l) * (0.7 + i * 0.62), y, ball.z + (a.dz / l) * (0.7 + i * 0.62)); dots.setMatrixAt(i, tmpM); }
    dots.count = n; dots.instanceMatrix.needsUpdate = true;
  }
  const onDown = (e) => {
    if (st.mode !== 'aim' || e.button > 0 || e.target?.closest?.('.golf-hud button, .golf-score')) return;
    drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; e.preventDefault();
  };
  const onMove = (e) => { if (drag) { drag.x = e.clientX; drag.y = e.clientY; updateAim(); } };
  const onUp = () => {
    if (!drag) return;
    const a = aimInfo(drag); drag = null; updateAim();
    if (st.mode !== 'aim' || a.power < 0.06) return;
    shoot(ball, a.dx, a.dz, Math.pow(a.power, 1.15)); st.strokes++; st.mode = 'roll'; st.rollT = 0; audio?.golf?.('putt', a.power);
  };
  const onKey = (e) => { if (st.mode !== 'off' && e.key === 'Escape') { api.stop(); e.preventDefault(); } };
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('pointerdown', onDown, { passive: false }); window[f]('pointermove', onMove); window[f]('pointerup', onUp); window[f]('pointercancel', onUp); window[f]('keydown', onKey);
  }
  const noScroll = (e) => { if (st.mode !== 'off' && !e.target?.closest?.('.golf-hud button, .golf-score')) e.preventDefault(); };

  // ---------- the camera ----------
  function framing() {                                     // fit the whole course on screen, whatever the screen's shape
    const tan = Math.tan((camera.fov * Math.PI) / 360), portrait = camera.aspect < 0.9;
    const across = portrait ? 9.5 : 14.2, along = portrait ? 14.4 : 9.6;
    const d = Math.max(across / (tan * camera.aspect), along / tan) * 1.05, pitch = 0.98, horiz = d * Math.cos(pitch), vert = d * Math.sin(pitch);
    if (portrait) { frame.pos.set(CX - horiz, Y.top + vert, CZ); frame.look.set(CX + 0.5, Y.top, CZ); frame.up.set(1, 0, 0); }
    else { frame.pos.set(CX, Y.top + vert, CZ + horiz); frame.look.set(CX, Y.top, CZ - 0.5); frame.up.set(0, 1, 0); }
    frame.dist = d;
  }
  const home = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, flyFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  function fly(k) {                                        // between the camera we came from (or go back to) and the course view
    camera.position.lerpVectors(flyFrom.pos, frame.pos, k); tmpV.lerpVectors(flyFrom.look, frame.look, k);
    camera.up.lerpVectors(flyFrom.up, frame.up, k).normalize(); camera.lookAt(tmpV);
  }

  // ---------- the API ----------
  const api = {
    get active() { return st.mode !== 'off'; },
    get focusDistance() { return frame.dist; },
    onQuit: null,
    /** Debug: the live state. */
    get debug() { return { st, hole, ball, ev, frame }; },
    start(homeCam) {
      if (st.mode !== 'off') return;
      if (!tray) buildTray();
      const now = new Date(), m = /[?&]golfmonth=(\d{4})-(\d{1,2})/.exec(location.search);
      st.year = m ? +m[1] : now.getUTCFullYear(); st.month = m ? +m[2] : now.getUTCMonth() + 1;      // (the same course for everyone, all month)
      st.seed = courseSeed(st.year, st.month); st.scores = []; st.par = [];
      home.pos.copy(homeCam.pos); home.look.copy(homeCam.look); flyFrom.pos.copy(homeCam.pos); flyFrom.look.copy(homeCam.look); flyFrom.up.set(0, 1, 0);
      setBoards(false); Y.top = world.carve.begin(CX, CZ, TRAY_R, 9); tray.position.y = Y.top; tray.visible = true; framing();
      document.body.classList.add('game-mode'); hud.hidden = false; elScore.hidden = true;
      st.mode = 'enter'; st.t = 0; startHole(0); st.mode = 'enter'; st.t = 0;
      listen(true); window.addEventListener('touchmove', noScroll, { passive: false }); window.addEventListener('touchstart', noScroll, { passive: false });
      audio?.zoom?.('in', 1.7);
      say(elBanner, `The ${MONTHS[st.month - 1]} ${st.year} Course`, 2800, 'banner');
    },
    stop() {
      if (st.mode === 'off' || st.mode === 'exit') return;
      drag = null; if (dots) dots.count = 0; elPower.classList.remove('show'); hud.classList.add('leaving'); elScore.hidden = true;
      flyFrom.pos.copy(camera.position); tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(30).add(camera.position); flyFrom.look.copy(tmpV); flyFrom.up.copy(camera.up);
      frame.pos.copy(home.pos); frame.look.copy(home.look); frame.up.set(0, 1, 0);
      st.mode = 'exit'; st.t = 0; audio?.zoom?.('out', 1.4);
    },
    /** Every frame (after the page has set the camera): moves the game on and, while it is active, owns the camera. */
    update(dt, cam) {
      if (st.mode === 'off') return false;
      dt = Math.min(dt, 0.05); st.t += dt;
      if (st.mode === 'exit') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / EXIT));
        fly(k); world.carve.set(1 - k);
        if (k >= 1) {
          disposeHole(); world.carve.end(); setBoards(true); tray.visible = false; camera.up.set(0, 1, 0); document.body.classList.remove('game-mode'); hud.hidden = true; hud.classList.remove('leaving');
          listen(false); window.removeEventListener('touchmove', noScroll); window.removeEventListener('touchstart', noScroll); st.mode = 'off'; this.onQuit?.();
        }
        return true;
      }
      if (st.mode === 'enter') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / ENTER)), r = reduceMotion ? 1 : ease(clamp01((st.t - 0.25) / RISE));
        framing(); fly(k); world.carve.set(r);
        if (st.t >= ENTER + 0.1 || reduceMotion) { st.mode = 'grow'; st.t = 0; }
      } else {
        framing(); camera.position.copy(frame.pos); camera.up.copy(frame.up); camera.lookAt(frame.look);
      }
      // the hole growing in, playing, and sinking away
      const hh = holeGroup;
      if (st.mode === 'grow') { const g = reduceMotion ? 1 : ease(clamp01(st.t / GROW)); hh.scale.y = Math.max(0.001, g); if (g >= 1) { st.mode = 'aim'; } }
      else if (st.mode === 'shrink') { const g = 1 - (reduceMotion ? 1 : ease(clamp01(st.t / 0.45))); hh.scale.y = Math.max(0.001, g); if (g <= 0.002) { if (st.hole + 1 < HOLES) { startHole(st.hole + 1); st.mode = 'grow'; st.t = 0; say(elToast, `Hole ${st.hole + 1} · Par ${hole.par}`, 1500, 'toast'); } else showScore(); } }
      if (hole && st.mode !== 'shrink' && st.mode !== 'card' && st.mode !== 'enter') {
        st.holeT += dt;
        if (st.mode === 'roll') {
          st.rollT += dt; stepBall(ball, hole, st.holeT, dt, ev);
          if (ev.wall > 1.2) audio?.golf?.('wall', Math.min(1, ev.wall / 12)); if (ev.post > 1.2) audio?.golf?.('post', Math.min(1, ev.post / 12));
          if (ev.holed) { st.mode = 'sink'; st.t = 0; }
          else if (ball.rest || st.rollT > 14) { ball.vx = ball.vz = 0; ball.rest = true; st.mode = 'aim'; }
          const sp = Math.hypot(ball.vx, ball.vz); if (sp > 0.05) { tmpV.set(-ball.vz, 0, ball.vx).normalize(); ballMesh.rotateOnWorldAxis(tmpV, (sp * dt) / BALL_R); }
        } else if (st.mode === 'aim' || st.mode === 'grow') { stepBall(ball, hole, st.holeT, dt, ev); }
        if (st.mode === 'sink') {
          const s = clamp01(st.t / 0.5); ballMesh.scale.setScalar(1 - 0.75 * s); ballMesh.position.set(hole.cup.x, 0.2 - 0.5 * s + BALL_R * (1 - s), hole.cup.z);
          if (s >= 1) { ballMesh.visible = false; ballShadow.visible = false; finishHole(); }
        } else if (st.mode === 'done') { if (st.t > 1.7) { st.mode = 'shrink'; st.t = 0; } }
        else placeBall();
      }
      if (rotor && hole.hero) rotor.rotation.x = st.holeT * hole.hero.w + hole.hero.phase;
      updateHud();
      return true;
    },
  };
  return api;
}
