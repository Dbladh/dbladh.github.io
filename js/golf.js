// The hidden mini-golf game. Click the windmill: the camera flies up over the land round it and nine holes rise out of the ground one after another (each patch of ground is levelled into a
// lawn, carved out of the real terrain, see world.carve; golfsites.js says where). Then the camera comes down to the first tee: each hole starts with a view of the whole hole, and the camera
// sweeps round and in to sit behind the ball. After a hole the camera travels on to the next. The finished holes stay where they are.
// Drag back from anywhere and let go to putt (the ball goes the opposite way, further for a longer pull). Each month has its own course, the same for everyone (golfgen.js).
// Orbs lying off the best line give power-ups for a few seconds (see applyPower).
// This module is loaded the first time the windmill is clicked. The shell here (camera, input, HUD, scoring) follows the dirt-bike game's (bikegame.js).
import * as THREE from 'three';
import { courseSeed, holeSeed, makeHole, heroOrder, HOLES } from './golfgen.js?v=20261024155854';
import { planCourse, toWorld, YAWS, MARGIN, BLEND } from './golfsites.js?v=20261024155854';
import { newBall, newCtx, shoot, stepBall, hillH, BALL_R, CUP_R } from './golfphys.js?v=20261024155854';
import { courseMonth, monthLabel, monthKey, MONTH_NAMES } from './monthseed.js?v=20261024155854';
import { lampSpots, buildLamps } from './golflamps.js?v=20261024155854';
import { buildDecor } from './golfdecor.js?v=20261024155854';
import { M, G, NAMES, EMOJI, buildHoleVisual, buildHamster } from './golfvis.js?v=20261024155854';

const ENTER = 2.6, EXIT = 1.5, RISE_AT = 0.7, RISE_GAP = 0.3, RISE_T = 1.0, TRAVEL = 2.7, OVERVIEW_HOLD = 1.5, SWEEP = 2.3;     // seconds
const MONTHS = MONTH_NAMES;
const HERO_NAMES = { windmill: 'The Windmill', alligator: 'The Alligator', turntable: 'The Turntable', pendulum: 'The Hammers', geyser: 'The Geyser', cannon: 'The Cannon', teleport: 'The Pipes', drawbridge: 'The Drawbridge', loop: 'The Loop-the-Loop' };
const POWER_TIMES = { homing: 10, ghost: 8, bounce: 10, turbo: 10, freeze: 6, mega: 15, hamster: 6 };
const BALL_TINTS = ['#ffffff', '#ffd1d1', '#d1ffd9', '#d1e6ff', '#fff2b5'];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createGolf(scene, camera, renderer, world, { audio = null, reduceMotion = false, sky = null, lowEnd = false } = {}) {
  const st = { mode: 'off', t: 0, hole: 0, holeT: 0, strokes: 0, scores: [], par: [], order: [], seed: 0, year: 0, month: 0, rollT: 0, idle: 0, hud: { hole: '', strokes: -1, pills: '' }, lastX: 0, lastZ: 0, multi: false, safety: false, cupScale: 1 };
  const fx = { homing: 0, ghost: 0, bounce: 0, turbo: 0, freeze: 0, mega: 0, hamster: 0 };      // seconds left of each power-up
  let holes = [], vises = [], decors = [], sites = [], Ys = [], lamps = null, lampSpotsAll = [], lightHome = [], shown = [];         // every hole of the course, its meshes, where it lies (x, z, heading) and the height of its lawn
  let holeGroup = null, vis = null, hole = null, balls = [], drag = null, dots = null, hamster = null, sinkT = 0, ready = false;
  const ballMeshes = [], ballShadows = [];
  const ctx = newCtx(), ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0 };
  const up0 = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpM = new THREE.Matrix4();
  const frame = { pos: new THREE.Vector3(), look: new THREE.Vector3(), dist: 40 };           // the full view of the current hole
  const trip = { pos: new THREE.Vector3(), look: new THREE.Vector3(), dist: 40, ctrl: new THREE.Vector3(), from: new THREE.Vector3(), fromLook: new THREE.Vector3(), to: -1 };   // the camera travelling to the next hole
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), dx: 1, dz: 0, phase: 'overview', t: 0, slow: 0 };
  const flyFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, home = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const behind = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, want = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const boardRoots = [];                                   // the three billboards: tucked away while golfing
  function setBoards(show) {
    if (!boardRoots.length) for (const b of world.boards) { let o = b.face; while (o && o.parent && o.parent !== scene) o = o.parent; if (o && !boardRoots.includes(o)) boardRoots.push(o); }
    for (const o of boardRoots) o.visible = show;
  }
  const hideExtraBalls = () => { for (let i = 1; i < ballMeshes.length; i++) { ballMeshes[i].visible = false; ballShadows[i].visible = false; } };

  // ---------- the HUD ----------
  const hud = document.createElement('div');
  hud.className = 'golf-hud'; hud.hidden = true;
  hud.innerHTML = '<div class="golf-top"><div class="golf-left"><div class="golf-info"><b data-k="hole"></b><span data-k="par"></span><span data-k="strokes"></span></div><div class="golf-pills" data-k="pills"></div></div><button class="golf-quit" type="button">Leave</button></div>' +
    '<div class="golf-banner" data-k="banner"></div><div class="golf-toast" data-k="toast"></div><div class="golf-power" data-k="power"><i></i></div><div class="golf-score" data-k="score" hidden></div>';
  document.body.append(hud);
  const $ = (k) => hud.querySelector(`[data-k="${k}"]`);
  const elHole = $('hole'), elPar = $('par'), elStrokes = $('strokes'), elBanner = $('banner'), elToast = $('toast'), elPower = $('power'), elScore = $('score'), elPills = $('pills');
  const timers = {};
  const say = (el, text, ms, key) => { el.textContent = text; el.classList.add('show'); clearTimeout(timers[key]); timers[key] = setTimeout(() => el.classList.remove('show'), ms); };
  hud.querySelector('.golf-quit').addEventListener('click', () => api.stop());
  const bestKey = () => `golf.best.${monthKey(st)}`;
  const readBest = () => { try { const v = parseInt(localStorage.getItem(bestKey()), 10); return Number.isFinite(v) ? v : null; } catch (e) { return null; } };
  const writeBest = (v) => { try { localStorage.setItem(bestKey(), String(v)); } catch (e) { /* private mode */ } };
  function updateHud() {
    const h = `Hole ${st.hole + 1} of ${HOLES}`;
    if (st.hud.hole !== h) { st.hud.hole = h; elHole.textContent = h; elPar.textContent = `Par ${hole ? hole.par : '-'}`; }
    if (st.hud.strokes !== st.strokes) { st.hud.strokes = st.strokes; elStrokes.textContent = st.strokes === 1 ? '1 stroke' : `${st.strokes} strokes`; }
    let p = '';
    for (const k in fx) if (fx[k] > 0) p += `<span>${EMOJI[k]} ${NAMES[k]} <b>${Math.ceil(fx[k])}</b></span>`;
    if (st.multi) p += `<span>${EMOJI.multi} Multi-ball ready</span>`;
    if (st.safety) p += `<span>${EMOJI.safety} Safety net</span>`;
    if (st.hud.pills !== p) { st.hud.pills = p; elPills.innerHTML = p; }
  }

  // ---------- the balls and the aiming dots (they move from hole to hole) ----------
  function buildBits() {
    for (let i = 0; i < 5; i++) {                           // the balls (more than one only with the multi-ball power-up) and their shadows
      const m = new THREE.Mesh(G.ball, M.ball.clone()); m.material.color.set(BALL_TINTS[i]); m.userData.mat = m.material; m.castShadow = true; m.visible = false; ballMeshes.push(m);
      const s = new THREE.Mesh(G.disc, M.shadow); s.scale.set(BALL_R * 1.1, 1, BALL_R * 1.1); s.visible = false; ballShadows.push(s);
    }
    dots = new THREE.InstancedMesh(G.dot, M.dot, 16); dots.count = 0; dots.frustumCulled = false;
    hamster = buildHamster(); hamster.visible = false;
  }

  // ---------- the course: all nine holes at once ----------
  function buildCourse() {
    disposeCourse();
    holes = []; for (let i = 0; i < HOLES; i++) holes.push(makeHole(holeSeed(st.seed, i), i, st.order[i]));
    const plan = planCourse(st.seed, holes); sites = plan.sites;
    Ys = world.carve.begin(plan.shapes.map((sh) => sh.map((p) => [p[0], p[1], p[2] + MARGIN])), BLEND);
    vises = holes.map((h, i) => {
      const v = buildHoleVisual(h, { lowEnd }), g = v.group; g.rotation.y = (sites[i].k * Math.PI) / 4; g.position.set(sites[i].x, Ys[i] + 0.06, sites[i].z); g.scale.set(1, 0.001, 1); scene.add(g); return v;
    });
    // the planting (set in the finished ground, so the ground is brought all the way in for a moment) and the gravel paths between the holes
    const near = (x, z, m) => { for (const sh of plan.shapes) for (const p of sh) { const dx = x - p[0], dz = z - p[1]; if (dx * dx + dz * dz < (p[2] + m) * (p[2] + m)) return true; } return false; };
    world.carve.set(1);
    decors = holes.map((h, i) => { const d = buildDecor(h, sites[i], world.carve.groundNow, (x, z) => near(x, z, 0.7), lowEnd ? 0.55 : 1); d.group.visible = false; scene.add(d.group); return d; });
    for (let i = 0; i < HOLES - 1; i++) world.carve.paint(pathBetween(i), 0.95, '#dccb9f', (x, z) => near(x, z, 0.5));
    lampSpotsAll = [];                                     // lamp posts along each hole and one beside each path
    holes.forEach((h, i) => { for (const p of lampSpots(h, sites[i], lowEnd ? 3 : 4, (x, z) => near(x, z, 0.6))) lampSpotsAll.push({ ...p, hole: i }); });
    for (let i = 0; i < HOLES - 1; i++) {
      const pts = pathBetween(i), a = pts[18], b = pts[22], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      if (!near(a[0] + nx * 1.4, a[1] + nz * 1.4, 0.6)) lampSpotsAll.push({ x: a[0] + nx * 1.4, z: a[1] + nz * 1.4, ax: -nx, az: -nz, hole: i });
    }
    lamps = buildLamps(lampSpotsAll, world.carve.groundNow); scene.add(lamps.group); shown = [];
    world.carve.set(0);
    ready = true;
  }
  function pathBetween(i) {                                // from behind the cup of hole i to behind the tee of the next, in a smooth curve
    const A = holes[i], B = holes[i + 1], SA = sites[i], SB = sites[i + 1], o = (S) => toWorld(S, 0, 0);
    const end = (H, S, last) => {                          // the point just beyond the round green at one end and which way the hole runs there
      const P = H.path, a = last ? P[P.length - 2] : P[1], b = last ? P[P.length - 1] : P[0], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
      const w = H.widths[last ? P.length - 1 : 0] + 0.6, sgn = last ? 1 : -1, pt = toWorld(S, b.x + tx * w * sgn, b.z + tz * w * sgn), z0 = o(S), dz = toWorld(S, tx, tz); return { x: pt.x, z: pt.z, dx: dz.x - z0.x, dz: dz.z - z0.z };
    };
    const p0 = end(A, SA, true), p3 = end(B, SB, false), L = Math.hypot(p3.x - p0.x, p3.z - p0.z) * 0.4, pts = [];
    const p1 = { x: p0.x + p0.dx * L, z: p0.z + p0.dz * L }, p2 = { x: p3.x - p3.dx * L, z: p3.z - p3.dz * L };
    for (let k = 0; k <= 40; k++) { const t = k / 40, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; pts.push([a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.z + b * p1.z + c * p2.z + d * p3.z]); }
    return pts;
  }
  function disposeCourse() {
    if (!ready) return;
    for (const m of ballMeshes) m.parent?.remove(m);
    for (const s of ballShadows) s.parent?.remove(s);
    dots.parent?.remove(dots); hamster.parent?.remove(hamster);
    for (const v of vises) { scene.remove(v.group); v.dispose(); }
    for (const d of decors) { scene.remove(d.group); d.dispose(); }
    if (lamps) { scene.remove(lamps.group); lamps.dispose(); lamps = null; }
    lights().forEach((l, i) => { if (lightHome[i]) l.position.copy(lightHome[i]); });
    sky?.shadowReset(); decors = []; vises = []; holes = []; holeGroup = null; vis = null; hole = null; ready = false;
  }
  const setRise = (i, k) => { vises[i].group.scale.y = Math.max(0.001, k); world.carve.set(k, i); if (decors[i]) decors[i].group.visible = k > 0.92; const on = k > 0.92; if (lamps && shown[i] !== on) { shown[i] = on; lamps.showHole(i, on); } };
  const lights = () => world.lampLights?.() ?? [];
  function assignLights(i) {                               // the village's real lights stand in for the lamps near the hole in play
    const L = lights(); if (!L.length) return; if (!lightHome.length) lightHome = L.map((l) => l.position.clone());
    const mine = lampSpotsAll.filter((p) => p.hole === i || p.hole === i - 1);
    L.forEach((l, k) => { const p = mine[k]; if (p && p.bulb) { l.position.set(p.bulb.x, p.bulb.y - 0.2, p.bulb.z); l.color.set('#ffc27a'); } else if (lightHome[k]) l.position.copy(lightHome[k]); });
  }
  const aimShadow = (i) => { const S = sites[i], c = toWorld(S, holes[i].bounds.cx, holes[i].bounds.cz); sky?.shadowBox(c.x, Ys[i], c.z, 21); };      // 0: still hillside, 1: lawn and hole

  // ---------- one hole ----------
  function startHole(i) {
    st.hole = i; hole = holes[i]; vis = vises[i]; holeGroup = vis.group; st.par[i] = hole.par; st.strokes = 0; st.holeT = 0; st.rollT = 0; drag = null; st.t = 0; st.multi = false; st.safety = false; st.cupScale = 1;
    for (const k in fx) fx[k] = 0;
    holeGroup.add(dots, hamster); ballMeshes.forEach((m, k) => { holeGroup.add(m, ballShadows[k]); m.visible = k === 0; ballShadows[k].visible = k === 0; m.scale.setScalar(1); });
    balls = [newBall(hole)]; st.lastX = balls[0].x; st.lastZ = balls[0].z; hamster.visible = false;
    placeBalls(); st.hud.hole = ''; st.hud.strokes = -1; updateHud();
    const P = hole.path, t0 = P[0], t1 = P[Math.min(P.length - 1, 10)], l = Math.hypot(t1.x - t0.x, t1.z - t0.z) || 1; cam.dx = (t1.x - t0.x) / l; cam.dz = (t1.z - t0.z) / l; cam.phase = 'overview'; cam.t = 0;
    st.mode = 'aim'; aimShadow(i); assignLights(i); announce();
  }
  const announce = () => say(elToast, `Hole ${st.hole + 1} · Par ${hole.par} · ${HERO_NAMES[hole.type] || ''}`, 2200, 'toast');
  function placeBalls() {
    balls.forEach((b, i) => {
      const m = ballMeshes[i], s = ballShadows[i]; if (!m) return;
      const y = hillH(hole, b.x, b.z) + 0.03;
      m.position.set(b.x, y + BALL_R + (b.ly || 0), b.z); s.position.set(b.x, y + 0.02, b.z);
      m.visible = !b.holed && !b.sunk && !(i === 0 && fx.hamster > 0); s.visible = m.visible && !(b.ly > 0.1); m.material = fx.ghost > 0 ? M.ghost : m.userData.mat;
    });
    if (fx.hamster > 0 && balls[0]) { hamster.visible = true; hamster.position.set(balls[0].x, hillH(hole, balls[0].x, balls[0].z) + 0.03 + BALL_R * 1.75, balls[0].z); } else hamster.visible = false;
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
    const rows = st.scores.map((s, i) => `<tr><td>${i + 1}</td><td>${HERO_NAMES[st.order[i]].replace('The ', '')}</td><td>${st.par[i]}</td><td>${s}</td><td>${s - st.par[i] > 0 ? '+' : ''}${s - st.par[i]}</td></tr>`).join('');
    elScore.innerHTML = `<h2>${MONTHS[st.month - 1]} ${st.year}</h2><table><thead><tr><th>#</th><th>Hole</th><th>Par</th><th>You</th><th></th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="golf-total">${total} strokes <small>(par ${par})</small></p><p class="golf-best">${nb ? 'A new best for this month!' : `Your best this month: ${best}`}</p>` +
      '<div class="golf-btns"><button type="button" data-a="again">Play again</button><button type="button" data-a="leave">Leave</button></div>';
    elScore.hidden = false; audio?.golf?.('win');
  }
  elScore.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a === 'again') { elScore.hidden = true; st.scores = []; st.par = []; beginTravel(0); } else if (a === 'leave') api.stop(); });

  // ---------- power-ups ----------
  function applyPower(type) {
    audio?.golf?.('pickup'); say(elToast, `${NAMES[type]}!`, 1400, 'toast');
    if (type === 'multi') st.multi = true;
    else if (type === 'safety') st.safety = true;
    else { fx[type] = POWER_TIMES[type]; if (type === 'hamster') { drag = null; if (st.mode === 'aim' || st.mode === 'roll') { st.mode = 'hamster'; balls = [balls[0]]; hideExtraBalls(); balls[0].rest = false; } } }
  }
  function collect() {
    if (!vis) return;
    for (const p of vis.pickups) {
      if (p.taken) continue;
      for (const b of balls) {
        if (b.holed || b.sunk) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        if (dx * dx + dz * dz < 0.62 * 0.62) { p.taken = true; p.mesh.visible = false; applyPower(p.type); break; }
      }
    }
  }
  function tickPowers(dt) {
    for (const k in fx) if (fx[k] > 0) { fx[k] = Math.max(0, fx[k] - dt); if (fx[k] === 0 && k === 'hamster' && st.mode === 'hamster') { st.mode = 'roll'; st.rollT = 0; } }
    ctx.homing = fx.homing > 0; ctx.ghost = fx.ghost > 0; ctx.bounce = fx.bounce > 0; ctx.turbo = fx.turbo > 0; ctx.drive = fx.hamster > 0; ctx.cupR = CUP_R * (fx.mega > 0 ? 2.6 : 1);
    st.cupScale += ((fx.mega > 0 ? 2.6 : 1) - st.cupScale) * Math.min(1, dt * 6); if (vis) vis.cupMesh.scale.set(CUP_R * 0.92 * st.cupScale, 1, CUP_R * 0.92 * st.cupScale);
  }

  // ---------- aiming ----------
  function screenToCourse(b, sx, sy) {                     // a vector on the screen as a direction on the course
    const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight;
    holeGroup.updateWorldMatrix(true, false);
    const proj = (p) => { const v = p.project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };      // (the hole may be turned, so its own axes are projected)
    const p0 = proj(holeGroup.localToWorld(new THREE.Vector3(b.x, 0, b.z))), px = proj(holeGroup.localToWorld(new THREE.Vector3(b.x + 1, 0, b.z))), pz = proj(holeGroup.localToWorld(new THREE.Vector3(b.x, 0, b.z + 1)));
    const exx = px[0] - p0[0], exy = px[1] - p0[1], ezx = pz[0] - p0[0], ezy = pz[1] - p0[1], det = exx * ezy - ezx * exy || 1e-6;
    return { dx: (ezy * sx - ezx * sy) / det, dz: (-exy * sx + exx * sy) / det, W, H };
  }
  function aimInfo(d) {                                    // the pull-back on screen: the ball goes the other way
    const sx = d.x0 - d.x, sy = d.y0 - d.y, v = screenToCourse(balls[0], sx, sy);
    return { dx: v.dx, dz: v.dz, power: clamp01(Math.hypot(sx, sy) / (0.3 * Math.min(v.W, v.H))) };
  }
  function updateAim() {
    if (!drag || st.mode !== 'aim') { dots.count = 0; elPower.classList.remove('show'); return; }
    const a = aimInfo(drag), l = Math.hypot(a.dx, a.dz) || 1, b = balls[0];
    elPower.classList.add('show'); elPower.firstChild.style.width = `${Math.round(a.power * 100)}%`;
    const n = a.power < 0.05 ? 0 : Math.round(3 + a.power * 12), y = hillH(hole, b.x, b.z) + 0.2;
    for (let i = 0; i < n; i++) { tmpM.makeTranslation(b.x + (a.dx / l) * (0.7 + i * 0.62), y, b.z + (a.dz / l) * (0.7 + i * 0.62)); dots.setMatrixAt(i, tmpM); }
    dots.count = n; dots.instanceMatrix.needsUpdate = true;
  }
  function fire(a) {
    const b = balls[0], l = Math.hypot(a.dx, a.dz) || 1, pw = Math.pow(a.power, 1.15);
    st.lastX = b.x; st.lastZ = b.z; st.strokes++; st.mode = 'roll'; st.rollT = 0; audio?.golf?.('putt', a.power);
    shoot(b, a.dx, a.dz, pw, fx.turbo > 0);
    if (st.multi) {                                        // multi-ball: four more balls fly off at slightly different angles; the one nearest the cup is kept
      st.multi = false;
      for (const k of [-0.22, 0.22, -0.45, 0.45]) { const nb = newBall(hole); nb.x = b.x; nb.z = b.z; const c = Math.cos(k), s = Math.sin(k); shoot(nb, (a.dx * c - a.dz * s) / l, (a.dx * s + a.dz * c) / l, pw, fx.turbo > 0); balls.push(nb); }
      balls.forEach((_, i) => { ballMeshes[i].visible = true; ballShadows[i].visible = true; });
    }
  }
  const onDown = (e) => {
    if ((st.mode !== 'aim' && st.mode !== 'hamster') || e.button > 0 || e.target?.closest?.('.golf-hud button, .golf-score')) return;
    drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; e.preventDefault();
  };
  const onMove = (e) => { if (drag) { drag.x = e.clientX; drag.y = e.clientY; updateAim(); } };
  const onUp = () => {
    if (!drag) return;
    const d = drag; drag = null; updateAim();
    if (st.mode !== 'aim') return;
    const a = aimInfo(d); if (a.power < 0.06) return;
    fire(a);
  };
  const onKey = (e) => { if (st.mode !== 'off' && e.key === 'Escape') { api.stop(); e.preventDefault(); } };
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('pointerdown', onDown, { passive: false }); window[f]('pointermove', onMove); window[f]('pointerup', onUp); window[f]('pointercancel', onUp); window[f]('keydown', onKey);
  }
  const noScroll = (e) => { if (st.mode !== 'off' && !e.target?.closest?.('.golf-hud button, .golf-score')) e.preventDefault(); };

  // ---------- the camera ----------
  const PITCH = 0.98;
  function frameFor(i, out) {                              // the whole of hole `i` in view, whatever the screen's shape (from its side, so it runs across the screen)
    const h = holes[i], S = sites[i], bd = h.bounds, tan = Math.tan((camera.fov * Math.PI) / 360);
    const across = bd.hx + 1.8, along = Math.max(5.5, bd.hz + 0.8);
    const d = Math.max(across / (tan * camera.aspect), along / tan) * 1.05, [c, sn] = YAWS[S.k], ctr = toWorld(S, bd.cx, bd.cz - 0.5);
    out.pos.set(ctr.x + sn * d * Math.cos(PITCH), Ys[i] + d * Math.sin(PITCH), ctr.z + c * d * Math.cos(PITCH)); out.look.set(ctr.x, Ys[i], ctr.z); out.dist = d;
  }
  function framing() { frameFor(st.hole, frame); }
  function overviewAll(out) {                              // the whole course in view from high above
    let cx = 0, cz = 0, cy = 0; for (const S of sites) { cx += S.x; cz += S.z; }
    cx /= sites.length; cz /= sites.length; for (const y of Ys) cy += y; cy /= Ys.length;
    let rx = 0, rz = 0; for (const S of sites) { rx = Math.max(rx, Math.abs(S.x - cx)); rz = Math.max(rz, Math.abs(S.z - cz)); }
    const tan = Math.tan((camera.fov * Math.PI) / 360), pitch = 0.95, d = Math.max((rx + 16) / (tan * camera.aspect), ((rz + 16) * Math.sin(pitch)) / tan) * 1.1;
    out.pos.set(cx, cy + d * Math.sin(pitch), cz + d * Math.cos(pitch)); out.look.set(cx, cy, cz); out.dist = d;
  }
  function aimTarget(b) {                                  // a point further along the corridor, for the camera to look toward
    const P = hole.path; let best = 1e9, bi = 0, bt = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const dx = P[i + 1].x - P[i].x, dz = P[i + 1].z - P[i].z, l2 = dx * dx + dz * dz; let t = ((b.x - P[i].x) * dx + (b.z - P[i].z) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(b.x - (P[i].x + dx * t), b.z - (P[i].z + dz * t)); if (d < best) { best = d; bi = i; bt = t; }
    }
    let ahead = 7, i = bi, t = bt; const out = { x: hole.cup.x, z: hole.cup.z };
    for (;;) {
      const dx = P[i + 1].x - P[i].x, dz = P[i + 1].z - P[i].z, l = Math.hypot(dx, dz), left = l * (1 - t);
      if (ahead <= left) { const tt = t + ahead / l; out.x = P[i].x + dx * tt; out.z = P[i].z + dz * tt; break; }
      ahead -= left; i++; t = 0; if (i >= P.length - 1) break;
    }
    return out;
  }
  function behindPose(b, dx, dz, back, upH, ahead, out) {  // behind the ball, looking the way it will go
    const S = sites[st.hole], P = toWorld(S, b.x - dx * back, b.z - dz * back), L = toWorld(S, b.x + dx * ahead, b.z + dz * ahead), base = Ys[st.hole] + 0.06 + hillH(hole, b.x, b.z);
    out.pos.set(P.x, Math.max(base + upH, world.carve.groundNow(P.x, P.z) + 2.4), P.z); out.look.set(L.x, base + 0.3, L.z);
  }
  function followCamera(dt) {
    cam.t += dt; const b = balls[0];
    if (cam.phase === 'overview') { framing(); want.pos.copy(frame.pos); want.look.copy(frame.look); if (cam.t > OVERVIEW_HOLD) { cam.phase = 'sweep'; cam.t = 0; } }
    else {
      const sp = Math.hypot(b.vx, b.vz);
      if (fx.hamster > 0) { if (sp > 0.8) { cam.dx += (b.vx / sp - cam.dx) * Math.min(1, dt * 2.5); cam.dz += (b.vz / sp - cam.dz) * Math.min(1, dt * 2.5); } }
      else if (st.mode === 'aim') { const t = aimTarget(b); let tx = t.x - b.x, tz = t.z - b.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; cam.dx += (tx - cam.dx) * Math.min(1, dt * 1.8); cam.dz += (tz - cam.dz) * Math.min(1, dt * 1.8); }
      const l = Math.hypot(cam.dx, cam.dz) || 1; cam.dx /= l; cam.dz /= l;
      if (fx.hamster > 0) behindPose(b, cam.dx, cam.dz, 4.2, 3.4, 4.5, behind); else behindPose(b, cam.dx, cam.dz, 7.2, 6.0, 6.0, behind);
      if (cam.phase === 'sweep') {                          // the camera swings from the full view round and in to behind the ball
        framing(); const k = ease(clamp01(cam.t / SWEEP));
        want.pos.lerpVectors(frame.pos, behind.pos, k); want.look.lerpVectors(frame.look, behind.look, k);
        if (cam.t >= SWEEP) cam.phase = 'follow';
      } else { want.pos.copy(behind.pos); want.look.copy(behind.look); }
    }
    cam.slow = Math.max(0, cam.slow - dt);
    const k = cam.phase === 'follow' ? 3.2 : cam.phase === 'overview' ? (cam.slow > 0 ? 2.2 : 4) : 9;
    cam.pos.lerp(want.pos, 1 - Math.exp(-dt * k)); cam.look.lerp(want.look, 1 - Math.exp(-dt * k));
    camera.position.copy(cam.pos); camera.up.copy(up0); camera.lookAt(cam.look);
  }
  function fly(k) {                                        // between the camera we came from (or go back to) and where it is heading
    camera.position.lerpVectors(flyFrom.pos, want.pos, k); tmpV.lerpVectors(flyFrom.look, want.look, k); camera.up.copy(up0); camera.lookAt(tmpV);
  }
  // the trip to the next hole (or back up over the whole course): an arc that rises and comes down again
  function beginTravel(to) {
    trip.to = to; st.mode = to >= HOLES ? 'finale' : 'travel'; st.t = 0; drag = null; if (dots) dots.count = 0; elPower.classList.remove('show');
    trip.from.copy(camera.position); tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(30).add(camera.position); trip.fromLook.copy(tmpV);
    if (to >= HOLES) overviewAll(trip); else frameFor(to, trip);
    trip.ctrl.addVectors(trip.from, trip.pos).multiplyScalar(0.5); trip.ctrl.y += 14 + 0.3 * trip.from.distanceTo(trip.pos);
    audio?.zoom?.('in', 1.4);
  }
  function tripCamera(k) {
    const u = 1 - k; camera.position.set(u * u * trip.from.x + 2 * u * k * trip.ctrl.x + k * k * trip.pos.x, u * u * trip.from.y + 2 * u * k * trip.ctrl.y + k * k * trip.pos.y, u * u * trip.from.z + 2 * u * k * trip.ctrl.z + k * k * trip.pos.z);
    tmpV.lerpVectors(trip.fromLook, trip.look, k); camera.up.copy(up0); camera.lookAt(tmpV);
  }

  // ---------- the API ----------
  const api = {
    get active() { return st.mode !== 'off'; },
    get focusDistance() { return st.mode === 'enter' || st.mode === 'exit' || st.mode === 'finale' || st.mode === 'card' ? trip.dist : cam.phase === 'overview' || st.mode === 'travel' ? frame.dist : 12; },
    onQuit: null,
    /** Debug: jump straight to hole `i` (0-based). */
    jump(i) { if (ready && st.mode !== 'off' && st.mode !== 'exit' && st.mode !== 'enter') { elScore.hidden = true; startHole(i); framing(); cam.pos.copy(frame.pos); cam.look.copy(frame.look); } },
    /** Debug: the live state. */
    get debug() { return { st, hole, holes, sites, Ys, balls, ev, frame, cam, fx, ctx, vis }; },
    start(homeCam) {
      if (st.mode !== 'off') return;
      if (!ballMeshes.length) buildBits();
      Object.assign(st, courseMonth());                    // (the same course for everyone, all month)
      st.seed = courseSeed(st.year, st.month); st.order = heroOrder(st.seed); st.scores = []; st.par = []; st.idle = 0;
      home.pos.copy(homeCam.pos); home.look.copy(homeCam.look); flyFrom.pos.copy(homeCam.pos); flyFrom.look.copy(homeCam.look);
      setBoards(false); buildCourse(); overviewAll(trip);
      document.body.classList.add('game-mode'); hud.hidden = false; elScore.hidden = true;
      startHole(0); st.mode = 'enter'; st.t = 0; toastOff(); framing(); cam.pos.copy(camera.position); cam.look.copy(frame.look);
      listen(true); window.addEventListener('touchmove', noScroll, { passive: false }); window.addEventListener('touchstart', noScroll, { passive: false });
      audio?.zoom?.('in', 1.7);
      say(elBanner, `The ${monthLabel(st)} Course`, 3200, 'banner');
    },
    stop() {
      if (st.mode === 'off' || st.mode === 'exit') return;
      drag = null; if (dots) dots.count = 0; elPower.classList.remove('show'); hud.classList.add('leaving'); elScore.hidden = true;
      flyFrom.pos.copy(camera.position); tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(30).add(camera.position); flyFrom.look.copy(tmpV);
      want.pos.copy(home.pos); want.look.copy(home.look);
      st.mode = 'exit'; st.t = 0; audio?.zoom?.('out', 1.4);
    },
    /** Every frame (after the page has set the camera): moves the game on and, while it is active, owns the camera. */
    update(dt) {
      if (st.mode === 'off') return false;
      dt = Math.min(dt, 0.05); st.t += dt; st.idle += dt; lamps?.update(world.night);
      if (st.mode === 'exit') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / EXIT));
        fly(k); for (let i = 0; i < vises.length; i++) setRise(i, 1 - k);
        if (k >= 1) {
          disposeCourse(); world.carve.end(); setBoards(true); camera.up.copy(up0); document.body.classList.remove('game-mode'); hud.hidden = true; hud.classList.remove('leaving');
          listen(false); window.removeEventListener('touchmove', noScroll); window.removeEventListener('touchstart', noScroll); st.mode = 'off'; this.onQuit?.();
        }
        return true;
      }
      if (st.mode === 'enter') {                           // up over the land, the holes rising one after another, then down to the first tee
        const tAll = RISE_AT + RISE_GAP * (HOLES - 1) + RISE_T, k = reduceMotion ? 1 : ease(clamp01(st.t / ENTER));
        overviewAll(trip); want.pos.copy(trip.pos); want.look.copy(trip.look); fly(k);
        for (let i = 0; i < vises.length; i++) setRise(i, reduceMotion ? 1 : ease(clamp01((st.t - RISE_AT - i * RISE_GAP) / RISE_T)));
        if (st.t >= tAll + 0.5 || reduceMotion) {
          st.mode = 'aim'; st.t = 0; cam.pos.copy(camera.position); tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(30).add(camera.position); cam.look.copy(tmpV); cam.slow = 1.8; cam.phase = 'overview'; cam.t = 0;
          for (let i = 0; i < vises.length; i++) setRise(i, 1);
          announce();
        }
        return true;
      }
      if (st.mode === 'travel' || st.mode === 'finale') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / TRAVEL));
        tripCamera(k);
        if (k >= 1) {
          cam.pos.copy(camera.position); cam.look.copy(trip.look);
          if (st.mode === 'finale') showScore(); else { startHole(trip.to); cam.pos.copy(camera.position); cam.look.copy(trip.look); }
        }
        updateScenery(dt); updateHud();
        return true;
      }
      if (st.mode !== 'card') followCamera(dt);
      else { overviewAll(trip); camera.position.copy(trip.pos); camera.lookAt(trip.look); }
      if (hole && st.mode !== 'card' && holeGroup) {
        st.holeT += dt * (fx.freeze > 0 ? 0.12 : 1); ctx.t = st.holeT;
        tickPowers(dt);
        if (st.mode === 'roll' || st.mode === 'hamster') {
          st.rollT += dt;
          if (st.mode === 'hamster') {
            const b = balls[0]; b.ax = b.az = 0;
            if (drag) { const sx = drag.x - drag.x0, sy = drag.y - drag.y0, v = screenToCourse(b, sx, sy), l = Math.hypot(v.dx, v.dz) || 1, mag = clamp01(Math.hypot(sx, sy) / (0.16 * Math.min(v.W, v.H))); b.ax = (v.dx / l) * 17 * mag; b.az = (v.dz / l) * 17 * mag; }
            b.rest = false; b.still = 0;
          }
          let live = 0, holedBall = null;
          for (let i = balls.length - 1; i >= 0; i--) {
            const b = balls[i]; if (b.holed) { holedBall = b; continue; } if (b.sunk) continue;
            stepBall(b, hole, ctx, dt, ev);
            if (ev.wall > 1.2) audio?.golf?.('wall', Math.min(1, ev.wall / 12)); if (ev.post > 1.2) audio?.golf?.('post', Math.min(1, ev.post / 12));
            if (ev.fx) audio?.golf?.(ev.fx === 1 ? 'tele' : ev.fx === 2 ? 'load' : ev.fx === 3 ? 'boom' : ev.fx === 4 ? 'loop' : 'geyser');
            if (ev.splash) { audio?.golf?.('splash'); if (balls.length > 1) { ballMeshes[i].visible = false; ballShadows[i].visible = false; } continue; }
            if (ev.holed) { holedBall = b; continue; }
            if (!b.rest) live++;
            const sp = Math.hypot(b.vx, b.vz); if (sp > 0.05) { tmpV.set(-b.vz, 0, b.vx).normalize(); ballMeshes[i].rotateOnWorldAxis(tmpV, (sp * dt) / BALL_R); }
          }
          collect();
          if (holedBall) { balls = [holedBall]; hideExtraBalls(); st.mode = 'sink'; sinkT = 0; fx.hamster = 0; }
          else if (balls.every((b) => b.sunk)) {                      // into the water: back to where it was hit from, a stroke more unless the safety net is up
            if (st.safety) { st.safety = false; say(elToast, 'Safety net!', 1300, 'toast'); } else { st.strokes++; say(elToast, 'Splash! +1', 1300, 'toast'); }
            const nb = newBall(hole); nb.x = st.lastX; nb.z = st.lastZ; balls = [nb]; hideExtraBalls(); fx.hamster = 0; st.mode = 'aim';
          } else if (live === 0 || (st.mode === 'roll' && st.rollT > 14)) {
            const alive = balls.filter((b) => !b.sunk);
            if (alive.length > 1) { alive.sort((p, q) => Math.hypot(p.x - hole.cup.x, p.z - hole.cup.z) - Math.hypot(q.x - hole.cup.x, q.z - hole.cup.z)); balls = [alive[0]]; hideExtraBalls(); } else balls = alive;
            for (const b of balls) { b.vx = b.vz = 0; b.rest = true; }
            st.mode = 'aim';
          }
        } else if (st.mode === 'aim') { stepBall(balls[0], hole, ctx, dt, ev); collect(); }
        if (st.mode === 'sink') {
          sinkT += dt; const s = clamp01(sinkT / 0.5), m = ballMeshes[0]; m.scale.setScalar(1 - 0.75 * s); m.position.set(hole.cup.x, 0.2 - 0.5 * s + BALL_R * (1 - s), hole.cup.z); m.visible = true; hamster.visible = false;
          if (s >= 1) { m.visible = false; ballShadows[0].visible = false; finishHole(); }
        } else if (st.mode === 'done') { if (st.t > 1.7) beginTravel(st.hole + 1); }
        else { placeBalls(); ballMeshes[0].scale.setScalar(1); }
        if (hamster.visible) { const b = balls[0], sp = Math.hypot(b.vx, b.vz); hamster.userData.run(st.holeT, sp); if (sp > 0.3) hamster.userData.hm.rotation.y = Math.atan2(b.vx, b.vz); }
        vis.update(st.holeT, st.holeT, dt, st);
      }
      updateScenery(dt);
      updateHud();
      return true;
    },
  };
  const toastOff = () => { elToast.classList.remove('show'); };
  function updateScenery(dt) {                             // the holes next to the one in play keep moving (the rest stand still)
    for (const j of [st.hole - 1, st.hole + 1]) if (vises[j]) vises[j].update(st.idle, st.idle, dt, st);
  }
  return api;
}
