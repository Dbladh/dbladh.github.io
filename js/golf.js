// The hidden mini-golf game. Click the windmill: the camera flies up over the land round it and nine holes rise out of the ground one after another (each patch of ground is levelled into a
// lawn, carved out of the real terrain, see world.carve; golfsites.js says where). Then the camera comes down to the first tee: each hole starts with a view of the whole hole, and the camera
// sweeps round and in to sit behind the ball. After a hole the camera travels on to the next. The finished holes stay where they are.
// Drag back from anywhere and let go to putt (the ball goes the opposite way, further for a longer pull). Each month has its own course, the same for everyone (golfgen.js).
// Orbs lying off the best line give power-ups for a few seconds (see applyPower).
// This module is loaded the first time the windmill is clicked. The shell here (camera, input, HUD, scoring) follows the dirt-bike game's (bikegame.js).
import * as THREE from 'three';
import { courseSeed, holeSeed, makeHole, plainHole, heroOrder, shapeOrder, SHAPES_BAKED, MORE_BAKED, HOLES } from './golfgen.js?v=20261031001653';
import { planCourse, toWorld, YAWS, MARGIN, BLEND } from './golfsites.js?v=20261031001653';
import { newBall, newCtx, shoot, stepBall, ejectBall, inSand, hillH, BALL_R, CUP_R } from './golfphys.js?v=20261031001653';
import { golfCourse, monthLabel, monthKey, MONTH_NAMES } from './monthseed.js?v=20261031001653';
import { makeChallenge, newChalState, chalStatus, holePoints, speedBonus, starsFor, tableBonus, CHAL_POINTS } from './golfchal.js?v=20261031001653';
import { buildScenery, THEME_NAMES } from './golfscenery.js?v=20261031001653';
import { themeOrder, themeOf } from './golfthemes.js?v=20261031001653';
import { createTrail } from './golftrail.js?v=20261031001653';
import { createNeon } from './golfneon.js?v=20261031001653';
import { createFx } from './golffx.js?v=20261031001653';
import { lampSpots, buildLamps } from './golflamps.js?v=20261031001653';
import { buildDecor } from './golfdecor.js?v=20261031001653';
import { M, G, NAMES, EMOJI, COLOURS, buildHoleVisual, buildHamster } from './golfvis.js?v=20261031001653';
import { isLow } from './golfquality.js?v=20261031001653';
import { prepareTable, LAYOUTS } from './pbtable.js?v=20261031001653';
import { createTable } from './pinball.js?v=20261031001653';

const ENTER = 2.6, EXIT = 1.5, RISE_AT = 0.7, RISE_GAP = 0.3, RISE_T = 1.0, TRAVEL = 2.7, OVERVIEW_HOLD = 1.5, SWEEP = 2.3;     // seconds
const MONTHS = MONTH_NAMES;
const HERO_NAMES = { windmill: 'The Windmill', alligator: 'The Alligator', turntable: 'The Turntable', pendulum: 'The Hammers', geyser: 'The Geyser', cannon: 'The Cannon', teleport: 'The Warp Zone', slider: 'The Sliders', bridge: 'The Bridge', drawbridge: 'The Drawbridge', loop: 'The Loop-the-Loop' };
const TABLE_HOLE = HOLES - 1, TABLE_CFG = { name: 'Pinball Golf', objs: ['ramp', 'spin', 'tgt'], tilt: 3.4, par: 3, nudges: 3 };      // (the last hole is the pinball table: balls are its strokes)
const POWER_TIMES = { homing: 10, ghost: 8, bounce: 10, turbo: 10, freeze: 6, mega: 15, hamster: 6 };
const BALL_TINTS = ['#ffffff', '#ffd1d1', '#d1ffd9', '#d1e6ff', '#fff2b5'];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const _rq = new THREE.Quaternion(), _ra = new THREE.Vector3();
/** Roll a ball mesh as it travels: about the horizontal axis at right angles to its velocity (up x v), in its parent's frame, so it turns forward whichever way the hole faces or leans. `d` is the distance travelled. */
function rollBall(mesh, vx, vz, d) { _ra.set(vz, 0, -vx); const l = _ra.length(); if (l < 1e-6) return; _ra.multiplyScalar(1 / l); _rq.setFromAxisAngle(_ra, d / BALL_R); mesh.quaternion.premultiply(_rq); }
export function createGolf(scene, camera, renderer, world, { audio = null, reduceMotion = false, sky = null, lowEnd = false } = {}) {
  const st = { mode: 'off', t: 0, hole: 0, holeT: 0, strokes: 0, scores: [], par: [], order: [], seed: 0, year: 0, month: 0, rollT: 0, idle: 0, hud: { hole: '', strokes: -1, pills: '' }, lastX: 0, lastZ: 0, multi: false, safety: false, cupScale: 1 };
  const fx = { homing: 0, ghost: 0, bounce: 0, turbo: 0, freeze: 0, mega: 0, hamster: 0 };      // seconds left of each power-up
  let holes = [], vises = [], decors = [], sites = [], Ys = [], fxs = null, lamps = null, lampSpotsAll = [], lightHome = [], shown = [];         // every hole of the course, its meshes, where it lies (x, z, heading) and the height of its lawn
  let table = null, tableFrame = null, scenery = null, chals = [], cs = newChalState(), neon = null, neonK = 0, ghostOn = false, ghostVis = null, dbgCam = null, holeGroup = null, vis = null, hole = null, balls = [], drag = null, dots = null, hamster = null, sinkT = 0, ready = false;
  const ballMeshes = [], ballShadows = []; let dimples = null;
  const trail = createTrail();                                  // (the mark the ball leaves on the ground: a groove in snow, a furrow in sand, a faint streak on grass)
  const onTable = () => st.hole === TABLE_HOLE && !!table?.group;
  const ctx = newCtx(), ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0 };
  const up0 = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpM = new THREE.Matrix4();
  const frame = { pos: new THREE.Vector3(), look: new THREE.Vector3(), dist: 40 };           // the full view of the current hole
  const trip = { pos: new THREE.Vector3(), look: new THREE.Vector3(), dist: 40, ctrl: new THREE.Vector3(), from: new THREE.Vector3(), fromLook: new THREE.Vector3(), to: -1 };   // the camera travelling to the next hole
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), vp: new THREE.Vector3(), vl: new THREE.Vector3(), dx: 1, dz: 0, phase: 'overview', t: 0, slow: 0, kk: 0, lead: 0, gy: 0, gyHole: -1 };
  const juice = { kick: 0, shake: 0, stop: 0, wasAir: false, streakT: 0 }, calm = !!reduceMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches), kv = new THREE.Vector3();          // (the punch of a stroke and a hard hit; `calm` switches the camera effects off)
  /** A word that floats up from a point of the hole (and fades), and a trick: a named bonus whose points are added to the hole's score. */
  const _pv = new THREE.Vector3();
  function popAt(text, x, z, y = 0.8, cls = '') {
    if (!holeGroup) return; holeGroup.localToWorld(_pv.set(x, y, z)); _pv.project(camera); if (_pv.z > 1) return;
    const el = document.createElement('div'); el.className = `golf-pop ${cls}`; el.textContent = text; el.style.left = `${(_pv.x * 0.5 + 0.5) * innerWidth}px`; el.style.top = `${(-_pv.y * 0.5 + 0.5) * innerHeight}px`; hud.appendChild(el); setTimeout(() => el.remove(), 1600);
  }
  function trick(text, pts, x, z) { st.trickSeen = st.trickSeen || {}; if (st.trickSeen[text]) return; st.trickSeen[text] = 1; st.trick = (st.trick || 0) + pts; popAt(`${text} +${pts}`, x, z, 1.0, 'trick'); audio?.golf?.('pickup'); }
  const groundCol = () => { const g = themeOf(hole?.theme)?.ground; return g === 'snow' ? '#f2f7ff' : g === 'sand' ? '#e8c98a' : g === 'grass' || g === 'moss' ? '#9ad66a' : '#d8d4cc'; };
  /** One step of a critically damped spring (like SmoothDamp): `cur` moves towards `target` with velocity `vel` in about `smooth` seconds, with no jerk at the start or the end of a move. */
  const springTo = (cur, vel, target, smooth, dt) => {
    const om = 2 / Math.max(0.05, smooth), x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    for (const a of ['x', 'y', 'z']) { const ch = cur[a] - target[a], tmp = (vel[a] + om * ch) * dt; vel[a] = (vel[a] - om * tmp) * e; cur[a] = target[a] + (ch + tmp) * e; }
  };
  const flyFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, home = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const behind = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, want = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const boardRoots = [];                                   // the three billboards: tucked away while golfing
  function setBoards(show) {
    if (!boardRoots.length) for (const b of world.boards) { let o = b.face; while (o && o.parent && o.parent !== scene) o = o.parent; if (o && !boardRoots.includes(o)) boardRoots.push(o); }
    for (const o of boardRoots) { o.visible = show; if (o.userData.s0) o.scale.copy(o.userData.s0); }
  }
  /** The billboards grow back up from the ground as the camera flies home (k 0 to 1), instead of appearing all at once at the end. */
  function growBoards(k) {
    if (!boardRoots.length) setBoards(false);
    for (const o of boardRoots) { if (!o.userData.s0) o.userData.s0 = o.scale.clone(); const s0 = o.userData.s0; o.visible = k > 0.02; o.scale.set(s0.x, s0.y * (0.03 + 0.97 * k), s0.z); }
  }
  const hideExtraBalls = () => { for (let i = 1; i < ballMeshes.length; i++) { ballMeshes[i].visible = false; ballShadows[i].visible = false; } };

  // ---------- the HUD ----------
  const hud = document.createElement('div');
  hud.className = 'golf-hud'; hud.hidden = true;
  hud.innerHTML = '<div class="golf-top"><div class="golf-left"><div class="golf-info"><b data-k="hole"></b><span data-k="par"></span><span data-k="strokes"></span><span data-k="chal" class="golf-chal"></span></div><div class="golf-pills" data-k="pills"></div><div class="pb-lamps" data-k="lamps"></div></div><button class="golf-quit" type="button">Leave</button></div><button class="golf-reset" type="button" hidden>Stuck? Reset ball (+1)</button>' +
    '<div class="pb-help" data-k="help" hidden><h3>How to play</h3><ol><li><b>Putt</b> up the table: drag back, let go</li><li><b>Flip</b>: Space or the FLIP button</li><li><b>Light 3 lamps</b>: ramp, spinner, red targets</li><li><b>Sink the cup</b> once it opens</li></ol><button type="button" data-k="helpok">Got it</button></div>' +
    '<div class="golf-banner" data-k="banner"></div><div class="golf-toast" data-k="toast"></div><div class="golf-power" data-k="power"><i></i></div><div class="pb-dock"><button class="pb-nudge" type="button" data-k="nudge">NUDGE</button><button class="pb-flip" type="button">FLIP</button><button class="pb-q" type="button" data-k="q" aria-label="How to play">?</button></div><div class="golf-score" data-k="score" hidden></div>';
  hud.classList.add('pb-off');
  document.body.append(hud);
  const $ = (k) => hud.querySelector(`[data-k="${k}"]`);
  const elChal = $('chal'), elHole = $('hole'), elPar = $('par'), elStrokes = $('strokes'), elBanner = $('banner'), elToast = $('toast'), elPower = $('power'), elScore = $('score'), elPills = $('pills'), elHelp = $('help');
  const timers = {};
  function placeMsgs() {                                  // the banner and the toast go in the free band between the info column above and the controls below (never over either); a band that is too small shrinks the text
    const H = innerHeight, lb = hud.querySelector('.golf-left').getBoundingClientRect().bottom + 8;
    let lim = H - 8; for (const q of ['.golf-reset:not([hidden])', '.golf-power', '.pb-dock > :not([hidden])']) { const e = hud.querySelector(q); if (e && e.offsetParent !== null) lim = Math.min(lim, e.getBoundingClientRect().top - 8); }
    elBanner.style.setProperty('--ms', 1); elToast.style.setProperty('--ms', 1);
    const bh = elBanner.offsetHeight || 40, th = elToast.offsetHeight || 30, need = bh + th + 6, band = Math.max(40, lim - lb), k = need > band ? Math.max(0.55, band / need) : 1;
    elBanner.style.setProperty('--ms', k); elToast.style.setProperty('--ms', k);
    const bh2 = (elBanner.offsetHeight || 40), th2 = (elToast.offsetHeight || 30), y = Math.max(lb, Math.min(Math.max(H * 0.26, lb), lim - bh2 - th2 - 6));
    elToast.style.visibility = need * 0.55 > band + 4 ? 'hidden' : '';                                       // (no room for both: the banner wins)
    elBanner.style.top = `${y}px`; elToast.style.top = `${y + bh2 + 6}px`;
  }
  window.addEventListener('resize', () => { if (!hud.hidden) placeMsgs(); });
  const say = (el, text, ms, key) => { el.textContent = text; if (el === elBanner || el === elToast) placeMsgs(); el.classList.add('show'); clearTimeout(timers[key]); timers[key] = setTimeout(() => el.classList.remove('show'), ms); };
  hud.querySelector('.golf-quit').addEventListener('click', () => api.stop());
  $('helpok').addEventListener('click', () => { elHelp.hidden = true; }); $('q').addEventListener('click', (e) => { elHelp.hidden = !elHelp.hidden; e.stopPropagation(); }); $('q').addEventListener('pointerdown', (e) => e.stopPropagation());
  const bestKey = () => `golf.best.${monthKey(st)}`;
  const readBest = () => { try { const v = parseInt(localStorage.getItem(bestKey()), 10); return Number.isFinite(v) ? v : null; } catch (e) { return null; } };
  const writeBest = (v) => { try { localStorage.setItem(bestKey(), String(v)); } catch (e) { /* private mode */ } };
  function updateHud() {
    const h = `Hole ${st.hole + 1} of ${HOLES}`;
    if (st.hud.hole !== h) { st.hud.hole = h; elHole.textContent = h; elPar.textContent = `Par ${hole ? hole.par : '-'}`; }
    { const tb = onTable(), t = tb ? `Ball ${Math.max(1, table.st.balls)} · ${table.st.pts} pts` : st.strokes === 1 ? '1 stroke' : `${st.strokes} strokes`; if (st.hud.strokes !== t) { st.hud.strokes = t; elStrokes.textContent = t; } }
    // (once the ball is sinking or the hole is finished, the task shows how it ended: a hole in one used to flash a cross the moment the ball was in the cup)
    if (!onTable()) { const ch = chals[st.hole]; if (ch) { const fin = st.scores[st.hole] !== undefined, stt = fin ? (st.chalDone[st.hole] ? 'done' : 'failed') : chalStatus(ch, cs, hole, st.strokes, st.mode === 'sink', st.mode === 'roll'), t = `${stt === 'failed' ? '✗' : stt === 'done' ? '✓' : '◎'} ${ch.text}`; if (st.hud.chal !== t) { st.hud.chal = t; elChal.textContent = t; elChal.dataset.s = stt; } } }
    let p = '';
    for (const k in fx) if (fx[k] > 0) p += `<span>${EMOJI[k]} ${NAMES[k]} <b>${Math.ceil(fx[k])}</b></span>`;
    if (st.multi) p += `<span>${EMOJI.multi} Multi-ball ready</span>`;
    if (st.safety) p += `<span>${EMOJI.safety} Safety net</span>`;
    if (st.hud.pills !== p) { st.hud.pills = p; elPills.innerHTML = p; }
  }

  // ---------- the balls and the aiming dots (they move from hole to hole) ----------
  function dimpleTexture() {                               // a golf ball's dimples as a normal map: round dents placed evenly over the sphere itself (not over the flat texture), so every one is the same size and a true circle wherever it lies
    const W = 768, H = 384, N = 100, R = 0.162, pts = [], ga = Math.PI * (3 - Math.sqrt(5)), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    for (let i = 0; i < N; i++) { const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = ga * i; pts.push([Math.cos(a) * r, y, Math.sin(a) * r]); }       // (a Fibonacci lattice: evenly spaced points)
    const hgt = new Float32Array(W * H);
    for (let py = 0; py < H; py++) { const lat = (0.5 - (py + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let px = 0; px < W; px++) { const lon = ((px + 0.5) / W) * 6.2832, dx = cl * Math.cos(lon), dz = cl * Math.sin(lon); let best = -1; for (let k = 0; k < N; k++) { const p = pts[k], d = p[0] * dx + p[1] * sl + p[2] * dz; if (d > best) best = d; }
        const ang = Math.acos(Math.min(1, best)); hgt[py * W + px] = ang < R ? 1 - 0.35 * (1 - (ang / R) * (ang / R)) : 1; } }
    const out = c.createImageData(W, H), hAt = (x, y) => hgt[Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)];
    for (let y = 0; y < H; y++) { const lat = (0.5 - (y + 0.5) / H) * Math.PI, k = 1 / Math.max(0.2, Math.cos(lat)), du = 6.2832 / W, dv = Math.PI / H;       // (a step east is shorter nearer the poles: the slope is worked out on the sphere's real surface)
      for (let x = 0; x < W; x++) { const sx = ((hAt(x + 1, y) - hAt(x - 1, y)) / (2 * du)) * k, sy = (hAt(x, y + 1) - hAt(x, y - 1)) / (2 * dv), st = 0.45, nx = -sx * st, ny = sy * st, l = Math.hypot(nx, ny, 1), o = (y * W + x) * 4; out.data[o] = (nx / l * 0.5 + 0.5) * 255; out.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[o + 3] = 255; } }
    c.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  function buildBits() {
    for (let i = 0; i < 5; i++) {                           // the balls (more than one only with the multi-ball power-up) and their shadows
      const m = new THREE.Mesh(G.ball, M.ball.clone()); m.material.color.set(BALL_TINTS[i]); if (!isLow()) { dimples ||= dimpleTexture(); m.material.normalMap = dimples; m.material.normalScale.set(0.45, 0.45); }       // (the mini-golf ball is dimpled; the pinball ball is a smooth steel one, see pinball.js)
      m.userData.mat = m.material; m.castShadow = true; m.visible = false; ballMeshes.push(m);
      const s = new THREE.Mesh(G.disc, M.shadow); s.scale.set(BALL_R * 1.1, 1, BALL_R * 1.1); s.visible = false; ballShadows.push(s);
    }
    dots = new THREE.InstancedMesh(G.dot, M.dot, 16); dots.count = 0; dots.frustumCulled = false;
    hamster = buildHamster(); hamster.visible = false;
    table = createTable({ scene, camera, renderer, world, audio, hud, say, fx: () => fxs, onSunk: () => { if (st.mode === 'table') finishHole(); }, els: { banner: elBanner, toast: elToast, power: elPower, nudge: $('nudge'), lamps: $('lamps'), help: elHelp, msg: elChal, flip: hud.querySelector('.pb-flip') } });
  }

  let prebuilt = null;
  // ---------- the course: all nine holes at once ----------
  function buildCourse() {
    disposeCourse();
    fxs = createFx(lowEnd); scene.add(fxs.group);
    { const themes = themeOrder(st.seed), fx = !!st.random || SHAPES_BAKED;            // (the themes are dealt out like the heroes: nine of the ten, none twice; the new surfaces come with them for random courses, and for the months once they are baked)
      holes = prebuilt && prebuilt.key === st.seed + ':' + (fx ? 1 : 0) ? prebuilt.holes : null; prebuilt = null;           // (a random course comes ready-made from the worker)
      if (!holes) { holes = []; for (let i = 0; i < TABLE_HOLE; i++) { const h = makeHole(holeSeed(st.seed, i), i, st.order[i], st.shapes[i], fx ? { surface: themeOf(themes[i]).surface, theme: themes[i], more: !!st.random || MORE_BAKED } : null); h.theme = themes[i]; holes.push(h); } }
      { const mo = golfCourse(), q = new URLSearchParams(location.search), li = q.has('layout') ? +q.get('layout') : (st.month - 1) % LAYOUTS.length, mir = q.has('mirror') ? q.get('mirror') === '1' : Math.floor((st.month - 1) / LAYOUTS.length) === 1;     // (the table changes with the month)
        const h = plainHole(holeSeed(st.seed, TABLE_HOLE), TABLE_HOLE); tableFrame = prepareTable(h, li, mir, holeSeed(st.seed, TABLE_HOLE)); h.layoutName = LAYOUTS[li % LAYOUTS.length].name; h.par = TABLE_CFG.par; h.theme = themes[TABLE_HOLE]; holes.push(h); } }
    chals = holes.map((h, i) => (i === TABLE_HOLE ? { id: 'table', text: 'Light the lamps to open the cup' } : makeChallenge(h, i, holeSeed(st.seed, i))));
    const plan = planCourse(st.seed, holes); sites = plan.sites;
    const digs = holes.map((h, i) => [...h.sands.map((sd) => { const c = toWorld(sites[i], sd.x, sd.z); return { x: c.x, z: c.z, r: sd.r * 1.19 * 0.95, depth: 0.34 }; }), ...(h.feats || []).filter((f) => f.t === 'gap').map((f) => {              // canyon gaps: where the ground must be dug out, in world coordinates
      const o = toWorld(sites[i], 0, 0), c = toWorld(sites[i], f.x, f.z), u = toWorld(sites[i], f.ux, f.uz), n = toWorld(sites[i], f.nx, f.nz);
      const nx = n.x - o.x, nz = n.z - o.z, cm = (f.c0 + f.c1) / 2; return { x: c.x + nx * cm, z: c.z + nz * cm, ux: u.x - o.x, uz: u.z - o.z, nx, nz, len: f.len + 0.2, wid: (f.c1 - f.c0) / 2 + 0.05, depth: 2.2 };
    })]);
    Ys = world.carve.begin(plan.shapes.map((sh) => sh.map((p) => [p[0], p[1], p[2] + MARGIN])), BLEND, digs);
    vises = holes.map((h, i) => {
      const v = buildHoleVisual(h, { lowEnd, look: world.waterLook, fx: fxs }), g = v.group; g.rotation.y = (sites[i].k * Math.PI) / 4; g.position.set(sites[i].x, Ys[i] + 0.06, sites[i].z); g.scale.set(1, 0.001, 1); scene.add(g); return v;
    });
    table.attach({ hole: holes[TABLE_HOLE], vis: vises[TABLE_HOLE], frame: tableFrame, site: sites[TABLE_HOLE], Y: Ys[TABLE_HOLE], cfg: TABLE_CFG }); table.leanTable();
    // the planting (set in the finished ground, so the ground is brought all the way in for a moment) and the gravel paths between the holes
    const near = (x, z, m) => { for (const sh of plan.shapes) for (const p of sh) { const dx = x - p[0], dz = z - p[1]; if (dx * dx + dz * dz < (p[2] + m) * (p[2] + m)) return true; } return false; };
    world.carve.set(1);
    decors = holes.map((h, i) => { if (i === TABLE_HOLE) return { group: new THREE.Group(), dispose() {} }; const d = buildDecor(h, sites[i], world.carve.groundNow, (x, z) => near(x, z, 0.7), lowEnd ? 0.55 : 1); d.group.visible = false; scene.add(d.group); return d; });
    for (let i = 0; i < HOLES - 1; i++) world.carve.paint(pathBetween(i), 0.95, '#dccb9f', (x, z) => near(x, z, 0.5));
    lampSpotsAll = [];                                     // lamp posts along each hole and one beside each path
    holes.forEach((h, i) => { if (i === TABLE_HOLE) return; const hp = h.hero ? toWorld(sites[i], h.hero.x, h.hero.z) : null; for (const p of lampSpots(h, sites[i], lowEnd ? 3 : 4, (x, z) => near(x, z, 0.6) || (hp && Math.hypot(x - hp.x, z - hp.z) < 5.2))) lampSpotsAll.push({ ...p, hole: i }); });
    for (let i = 0; i < HOLES - 1; i++) {
      const pts = pathBetween(i), a = pts[18], b = pts[22], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      if (!near(a[0] + nx * 1.4, a[1] + nz * 1.4, 0.6)) lampSpotsAll.push({ x: a[0] + nx * 1.4, z: a[1] + nz * 1.4, ax: -nx, az: -nz, hole: i });
    }
    scenery = buildScenery(holes, sites, plan.shapes, world.carve.groundNow, world.waterLook, st.seed, lowEnd, toWorld); scenery.group.visible = false; scene.add(scenery.group);
    lamps = buildLamps(lampSpotsAll, world.carve.groundNow, (x, z) => {                      // (the pools of light lie on whatever is under them: the lawn, or a hill of the hole's own fairway)
      let y = world.carve.groundNow(x, z);
      for (let i = 0; i < TABLE_HOLE; i++) { const S = sites[i], dx = x - S.x, dz = z - S.z; if (dx * dx + dz * dz > 400) continue; const [c, s] = YAWS[S.k], lx = dx * c - dz * s, lz = dx * s + dz * c; y = Math.max(y, Ys[i] + 0.09 + Math.max(0, hillH(holes[i], lx, lz))); }
      return y;
    }); scene.add(lamps.group); shown = [];
    world.carve.set(0);
    neon = createNeon(); for (const v of vises) neon.add(v.group); if (table.wall) neon.add(table.wall); for (const d of decors) neon.add(d.group); if (scenery) neon.add(scenery.group);
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
    table?.dispose(); for (const v of vises) { scene.remove(v.group); v.dispose(); }
    for (const d of decors) { scene.remove(d.group); d.dispose(); }
    occ.pieces.clear(); occ.list = []; occ.hole = -1;
    if (neon) { neon.reset(); neon = null; }
    if (scenery) { scene.remove(scenery.group); scenery.dispose(); scenery = null; }
    if (fxs) { scene.remove(fxs.group); fxs.dispose(); fxs = null; }
    if (lamps) { scene.remove(lamps.group); lamps.dispose(); lamps = null; }
    lights().forEach((l, i) => { if (lightHome[i]) l.position.copy(lightHome[i]); });
    sky?.shadowReset(); sky?.setLampKey(null); decors = []; vises = []; holes = []; holeGroup = null; vis = null; hole = null; ready = false;
  }
  const setRise = (i, k) => { vises[i].group.scale.y = Math.max(0.001, k); if (i === TABLE_HOLE) table.setRise(k); world.carve.set(k, i); { const c = toWorld(sites[i], holes[i].cup.x, holes[i].cup.z); world.carve.setHole(i, c.x, c.z, k > 0.95 ? CUP_R * 0.92 + 0.03 : 0); } if (decors[i]) decors[i].group.visible = k > 0.92; const on = k > 0.92; if (lamps && shown[i] !== on) { shown[i] = on; lamps.showHole(i, on); } };
  const UVC = new THREE.Color('#8a4dff');
  const lights = () => world.lampLights?.() ?? [];
  function assignLights(i) {                               // the village's real lights stand in for the lamps near the hole in play
    const L = lights(); if (!L.length) return; if (!lightHome.length) lightHome = L.map((l) => l.position.clone());
    const mine = lampSpotsAll.filter((p) => p.hole === i || p.hole === i - 1);
    const S = sites[i], c = toWorld(S, holes[i].bounds.cx, holes[i].bounds.cz), near = mine.filter((p) => p.bulb && p.hole === i).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
    if (near) sky?.setLampKey(new THREE.Vector3(near.bulb.x - c.x, Math.max(4.2, near.bulb.y - Ys[i]), near.bulb.z - c.z));
    L.forEach((l, k) => { const p = mine[k]; if (p && p.bulb) { l.position.set(p.bulb.x, p.bulb.y - 0.2, p.bulb.z); l.color.set('#ffc27a'); } else if (lightHome[k]) l.position.copy(lightHome[k]); });
  }
  const aimShadow = (i) => { const S = sites[i], c = toWorld(S, holes[i].bounds.cx, holes[i].bounds.cz); const bd = holes[i].bounds; sky?.shadowBox(c.x, Ys[i], c.z, Math.max(14, Math.min(21, Math.max(bd.hx, bd.hz) + 6)), lowEnd ? 2048 : 4096); };      // (a tighter box and a bigger map when there is room for it: the lamps' low light stretches shadows, and a coarse map shows as stair steps along their edges)      // 0: still hillside, 1: lawn and hole

  // ---------- one hole ----------
  function startHole(i) {
    if (ghostVis) { ghostVis.setGhost(false); ghostVis = null; } ghostOn = false;
    cs = newChalState(); st.chalDone = st.chalDone || []; st.stuck = 0; elReset.hidden = true;
    st.hole = i; st.trick = 0; st.trickSeen = {}; if (i === 0) st.streak = 0; hole = holes[i]; vis = vises[i]; holeGroup = vis.group; { const gr = themeOf(hole.theme)?.ground; trail.attach(holeGroup, hole, gr === 'snow' ? 'snow' : gr === 'sand' ? 'sand' : gr === 'grass' || gr === 'moss' ? 'grass' : 'other'); } st.par[i] = hole.par; st.strokes = 0; st.holeT = 0; st.rollT = 0; drag = null; st.t = 0; st.multi = false; st.safety = false; st.cupScale = 1;
    for (const k in fx) fx[k] = 0;
    holeGroup.add(dots, hamster); ballMeshes.forEach((m, k) => { holeGroup.add(m, ballShadows[k]); m.visible = k === 0; ballShadows[k].visible = k === 0; m.scale.setScalar(1); });
    balls = [newBall(hole)]; st.lastX = balls[0].x; st.lastZ = balls[0].z; hamster.visible = false;
    ctx.gateT = 0; if (i !== TABLE_HOLE) hole.cover = 0; placeBalls(); st.hud.hole = ''; st.hud.strokes = -1; updateHud();
    const P = hole.path, t0 = P[0], t1 = P[Math.min(P.length - 1, 10)], l = Math.hypot(t1.x - t0.x, t1.z - t0.z) || 1; cam.dx = (t1.x - t0.x) / l; cam.dz = (t1.z - t0.z) / l; cam.phase = 'overview'; cam.t = 0;
    st.mode = 'aim'; aimShadow(i); assignLights(i); announce();
    hud.classList.toggle('pb-off', i !== TABLE_HOLE); elHelp.hidden = true; table.setFlip(false);
    if (i === TABLE_HOLE) {                                // the pinball table: its own ball, flippers and camera; the golf ball and aiming dots are put away
      ballMeshes.forEach((m, k) => { m.visible = false; ballShadows[k].visible = false; }); hamster.visible = false; delete elChal.dataset.s; st.hud.chal = ''; table.restart(); table.resetCamera(); st.mode = 'table'; st.tableHelp = !st.tableSeen;
    }
  }
  const MACHINE_HINTS = { runup: 'Run over the boost strip and up the ramp to clear the canyon', vault: 'Roll over the pad to vault the fences', door: 'Roll over the button, then run the gates', bridge: 'The button slides out a bridge over the canyon', rail: 'Roll fast into the rail to cross the canyon', secret: 'Vault the fence from the pad to find the coin', pocket: 'Roll over the button, then straight in through the gate to the coin' };
  const elReset = hud.querySelector('.golf-reset');
  elReset.addEventListener('click', () => { if (st.mode !== 'aim' || !hole) return; const nb = newBall(hole); balls = [nb]; hideExtraBalls(); st.strokes++; st.stuck = 0; st.lastX = nb.x; st.lastZ = nb.z; elReset.hidden = true; say(elToast, 'Ball reset to the tee · +1', 1600, 'toast'); const w = wp(nb.x, 0.3, nb.z); fxs?.sparks(w.x, w.y, w.z, '#ffffff', 16, 2, 2.4, 0.6); });
  function noteRest() {                                    // a ball that stops where it started twice in a row may be penned in: offer a reset to the tee
    const b = balls[0]; if (!b) return; if (st.hole !== TABLE_HOLE && !b.holed && b.cmDip < BALL_R - 0.05 && Math.hypot(b.x - hole.cup.x, b.z - hole.cup.z) < 1.6) say(elToast, 'So close!', 1400, 'toast');          // (it went over the rim and stopped beside the cup)
    if (Math.hypot(b.x - st.lastX, b.z - st.lastZ) < 0.35) st.stuck = (st.stuck || 0) + 1; else st.stuck = 0; elReset.hidden = st.stuck < 2;
  }
  const announce = () => { say(elToast, `Hole ${st.hole + 1} · Par ${hole.par} · ${st.hole === TABLE_HOLE ? 'Pinball Golf' : HERO_NAMES[hole.type] || ''} · ${THEME_NAMES[hole.theme] || ''}`, 2600, 'toast'); const m = (hole.recipes || [])[0], hint = m ? `Machine: ${MACHINE_HINTS[m.kind]}` : hole.chute ? 'Secret chute: roll over the button, then into the gap in the wall' : ''; if (hint) setTimeout(() => { if (st.mode === 'aim' && vis === vises[st.hole]) say(elBanner, hint, 3200, 'banner'); }, 2700); };
  function placeBalls() {
    balls.forEach((b, i) => {
      const m = ballMeshes[i], s = ballShadows[i]; if (!m) return;
      const y = hillH(hole, b.x, b.z) + 0.03;
      m.position.set(b.x, (b.air || b.y < y ? b.y + 0.03 : y) + BALL_R + (b.ly || 0), b.z); s.position.set(b.x, Math.max(y, -0.05) + 0.02, b.z);
      m.visible = !b.holed && !b.sunk && !(i === 0 && fx.hamster > 0); s.visible = m.visible && !(b.ly > 0.1); m.material = fx.ghost > 0 ? M.ghost : m.userData.mat;
    });
    if (fx.hamster > 0 && balls[0]) { hamster.visible = true; hamster.position.set(balls[0].x, hillH(hole, balls[0].x, balls[0].z) + 0.03 + BALL_R * 1.75, balls[0].z); } else hamster.visible = false;
  }
  function finishHole() {
    if (st.hole === TABLE_HOLE) st.strokes = Math.max(1, table.st.balls);          // (the balls used are the strokes)
    if (st.hole === TABLE_HOLE) table.confetti();
    st.scores[st.hole] = st.strokes;
    { const ch = chals[st.hole], ok = ch && chalStatus(ch, cs, hole, st.strokes, true, false) === 'done'; st.chalDone[st.hole] = !!ok; st.pts = st.pts || []; const bonus = st.hole === TABLE_HOLE ? tableBonus(table.st.pts) : 0; st.pts[st.hole] = holePoints(st.strokes, hole.par) + (ok ? CHAL_POINTS : 0) + (cs.secret ? 100 : 0) + bonus + (st.trick || 0); if (bonus) setTimeout(() => say(elToast, `Table bonus +${bonus}`, 1500, 'toast'), 1700); if (ok) setTimeout(() => say(elBanner, `Challenge complete! +${CHAL_POINTS}`, 1800, 'banner'), 700); }
    { const dd = st.strokes - hole.par; st.streak = dd <= 0 ? (st.streak || 0) + 1 : 0;
      if (st.streak >= 2 && st.hole !== TABLE_HOLE) { const sb = Math.round(st.pts[st.hole] * 0.1 * Math.min(4, st.streak - 1)); st.pts[st.hole] += sb; setTimeout(() => say(elBanner, `On fire! ${st.streak} in a row +${sb}`, 1800, 'banner'), 2300); } }
    const d = st.strokes - hole.par, name = st.strokes === 1 ? 'Hole in one!' : d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : `+${d}`;
    say(elToast, name, 1500, 'toast'); st.mode = 'done'; st.t = 0;
    if (fxs && st.hole !== TABLE_HOLE) {                    // the drop: a ripple on the green and confetti; a hole in one gets fireworks over the cup and a long beat of slow motion
      const w = wp(hole.cup.x, 0.1, hole.cup.z), ace = st.strokes === 1; fxs.ring(w.x, w.y, w.z, 1.8, 0.8, '#ffe14a'); fxs.ring(w.x, w.y, w.z, 1.1, 0.6, '#ffffff');
      for (const [c, n] of [['#ffe14a', 16], ['#ff4fb3', 12], ['#4fe3ff', 12]]) fxs.sparks(w.x, w.y + 0.3, w.z, c, n * (ace ? 2 : 1), 3.2, 3.6, 1.1);
      if (ace) { st.moment = Math.max(st.moment || 0, 1.0); for (let k = 0; k < 5; k++) setTimeout(() => { if (st.hole === TABLE_HOLE || !holeGroup || st.mode === 'off') return; const q = wp(hole.cup.x + (Math.random() - 0.5) * 3, 2.2 + Math.random() * 1.5, hole.cup.z + (Math.random() - 0.5) * 3); fxs.sparks(q.x, q.y, q.z, ['#ffe14a', '#ff4fb3', '#4fe3ff', '#7dffb0'][k % 4], 26, 3.6, 1.2, 1.2); }, 200 + k * 260); }
    }
    audio?.golf?.(st.strokes === 1 ? 'ace' : d < 0 ? 'win' : 'cup');
  }
  // ---------- replay of the best hole and sharing ----------
  const rp = { on: false, i: 0, k: 0, t: 0, wait: 0, rest: 0 };
  function bestHole() {                                    // the hole with the best score against par (a hole in one first); not one where multi-ball was used (its other balls are not kept)
    let best = -1, bs = 1e9;
    for (let i = 0; i < st.scores.length; i++) { const sh = st.shots[i]; if (!sh || !sh.length || sh.some((s) => s.multi)) continue; const sc = st.scores[i] === 1 ? -99 : st.scores[i] - st.par[i]; if (sc < bs) { bs = sc; best = i; } }
    return best;
  }
  function startReplay() {
    const i = bestHole(); if (i < 0) return;
    elScore.hidden = true; const keep = { scores: st.scores.slice(), pts: st.pts.slice(), done: st.chalDone.slice(), shots: st.shots, playT: st.playT, par: st.par.slice() };
    startHole(i); Object.assign(st, { scores: keep.scores, pts: keep.pts, chalDone: keep.done, shots: keep.shots, playT: keep.playT, par: keep.par });
    st.mode = 'replay'; toastOff(); rp.on = true; rp.i = i; rp.k = -1; rp.wait = 0.6; cam.phase = 'follow'; cam.t = 0; say(elBanner, `Replay · Hole ${i + 1}`, 2400, 'banner');
  }
  function replayStep(dt) {
    const sh = st.shots[rp.i], sdt = dt * 0.6, b = balls[0];
    if (rp.wait > 0) { rp.wait -= dt; if (rp.wait > 0) return; }
    if (rp.k < 0 || (b.rest || b.holed || b.sunk) && (rp.rest += dt) > 0.5) {
      rp.rest = 0; rp.k++;
      if (rp.k >= sh.length) { rp.on = false; st.mode = 'card'; st.t = 0; elScore.hidden = false; return; }
      const s = sh[rp.k]; balls = [newBall(hole)]; Object.assign(balls[0], { x: s.x, z: s.z, y: hillH(hole, s.x, s.z) }); const l = Math.hypot(s.dx, s.dz) || 1; cam.dx = s.dx / l; cam.dz = s.dz / l;
      Object.assign(ctx, s.f); ctx.t = s.t; ctx.gateT = s.gate || 0; st.holeT = s.t; shoot(balls[0], s.dx, s.dz, s.pw, s.f.turbo); st.rollT = 0; audio?.golf?.('putt', 0.7);
    }
    const bb = balls[0]; if (!bb.holed && !bb.sunk) { stepBall(bb, hole, ctx, sdt, ev); ctx.t += sdt; st.holeT = ctx.t; }
    if (ev.holed) { const m = ballMeshes[0]; m.visible = false; audio?.golf?.('cup'); }
    if (ev.splash) { if (fxs && !ev.fall) { const p = holeGroup.localToWorld(new THREE.Vector3(bb.x, 0.1, bb.z)); fxs.burst('splash', p.x, p.y, p.z); } }
    placeBalls(); const sp = Math.hypot(bb.vx, bb.vz); if (sp > 0.05) { rollBall(ballMeshes[0], bb.vx, bb.vz, sp * sdt); }
  }
  function shareResult(btn) {
    const text = `${st.summary} ${location.origin}${location.pathname}`, done = () => { if (btn) { const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = o; }, 1400); } };
    try { navigator.clipboard.writeText(text).then(done, () => { prompt('Copy your result:', text); }); } catch (e) { prompt('Copy your result:', text); }
  }
  const ptsKey = () => `golf.pts.${monthKey(st)}`;
  const readPts = () => { try { const v = parseInt(localStorage.getItem(ptsKey()), 10); return Number.isFinite(v) ? v : null; } catch (e) { return null; } };
  function showScore() {
    st.mode = 'card';
    const total = st.scores.reduce((a, b) => a + b, 0), par = st.par.reduce((a, b) => a + b, 0), best = readBest();
    let nb = false; if (best === null || total < best) { writeBest(total); nb = true; }
    const bonus = speedBonus(st.playT), pts = st.pts.reduce((a, b) => a + (b || 0), 0) + bonus, stars = starsFor(pts), bestPts = readPts(); let np = false;
    if (bestPts === null || pts > bestPts) { try { localStorage.setItem(ptsKey(), String(pts)); } catch (e) { /* private mode */ } np = true; }
    const mins = Math.floor(st.playT / 60), secs = Math.round(st.playT % 60), done = st.chalDone.filter(Boolean).length;
    const rows = st.scores.map((s, i) => `<tr><td>${i + 1}</td><td>${i === TABLE_HOLE ? `${holes[i].layoutName} Table` : HERO_NAMES[st.order[i]].replace('The ', '')}</td><td>${st.par[i]}</td><td>${s}</td><td title="${chals[i] ? chals[i].text : ''}">${st.chalDone[i] ? '★' : '·'}</td><td>${st.pts[i] || 0}</td></tr>`).join('');
    elScore.innerHTML = `<h2>${MONTHS[st.month - 1]} ${st.year}</h2><p class="golf-stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></p>` +
      `<table><thead><tr><th>#</th><th>Hole</th><th>Par</th><th>You</th><th>◎</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="golf-total">${pts} points <small>${total} strokes (par ${par}) · ${done} of ${HOLES} challenges · ${mins}:${String(secs).padStart(2, '0')}${bonus ? ` · +${bonus} speed` : ''}</small></p>` +
      `<p class="golf-best">${np ? 'A new points best for this month!' : `Your best this month: ${bestPts} points`}${nb ? ' · fewest strokes too!' : ''}</p>` +
      `<div class="golf-btns">${bestHole() >= 0 ? '<button type="button" data-a="replay">Watch best hole</button>' : ''}<button type="button" data-a="share">Copy result</button><button type="button" data-a="again">Play again</button><button type="button" data-a="leave">Leave</button></div>`;
    st.summary = `⛳ ${monthLabel(st)} mini-golf: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · ${pts} points · ${total} strokes (par ${par}) · ${mins}:${String(secs).padStart(2, '0')} · ${done}/${HOLES} challenges`;
    elScore.hidden = false; audio?.golf?.('win');
    { const tot = elScore.querySelector('.golf-total'), t0 = performance.now(); if (tot && tot.firstChild && !calm) { const tick = (now) => { const k = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - k, 3); tot.firstChild.nodeValue = `${Math.round(pts * e)} points `; if (k < 1 && !elScore.hidden) requestAnimationFrame(tick); }; requestAnimationFrame(tick); } }          // (the total counts up)
  }
  elScore.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a === 'replay') startReplay(); else if (a === 'share') shareResult(e.target.closest('button')); else if (a === 'again') { elScore.hidden = true; st.scores = []; st.par = []; st.pts = []; st.chalDone = []; st.shots = []; st.playT = 0; beginTravel(0); } else if (a === 'leave') api.stop(); });

  // ---------- power-ups ----------
  function applyPower(type) {
    audio?.golf?.('pickup'); say(elToast, `${NAMES[type]}!`, 1400, 'toast');
    if (type === 'multi') st.multi = true;
    else if (type === 'safety') st.safety = true;
    else { fx[type] = POWER_TIMES[type]; if (type === 'hamster') { drag = null; if (st.mode === 'aim' || st.mode === 'roll') { st.mode = 'hamster'; balls = [balls[0]]; hideExtraBalls(); balls[0].rest = false; } } }
  }
  const _wp = new THREE.Vector3();
  const wp = (x, y, z) => holeGroup.localToWorld(_wp.set(x, y, z));       // a point of the hole in the world (the same shared vector each time)
  let fxT = 0;
  function powerFx(dt) {                                   // the glow and trails of the active power-ups, round the ball and the cup
    if (!fxs || !balls.length) return; fxT += dt;
    for (const b of balls) {
      if (b.holed || b.sunk) continue; const sp = Math.hypot(b.vx, b.vz), w = wp(b.x, Math.max(b.y, 0) + 0.2, b.z);
      if (neonK > 0.3 && sp > 0.4) fxs.trail(w.x, w.y, w.z, '#7ffcff', dt, 50 * neonK, 0.05);
      if (fx.turbo > 0 && sp > 1) fxs.trail(w.x, w.y, w.z, '#ff8a3d', dt, 90 * Math.min(1, sp / 8), 0.06);
      if (b.loop) fxs.trail(w.x, w.y, w.z, '#bff4ff', dt, 110, 0.07);
      if (fx.freeze > 0) fxs.trail(w.x, w.y + 0.1, w.z, '#bfefff', dt, 22, 0.05);
      if (st.multi && st.mode === 'aim') fxs.trail(w.x, w.y, w.z, '#5cc8ff', dt, 16, 0.05);
      if (fx.bounce > 0 && sp > 2) fxs.trail(w.x, w.y, w.z, '#ff63c0', dt, 20, 0.05);
      if (fx.hamster > 0 && sp > 1.5) fxs.puff(w.x, w.y - 0.1, w.z, 0.4 * dt * 60 > 1 ? 1 : 0, b.vx, b.vz);
    }
    if ((fx.homing > 0 || fx.mega > 0) && fxT > (fx.mega > 0 ? 0.7 : 0.9)) { fxT = 0; const c = wp(hole.cup.x, 0.05, hole.cup.z); fxs.ring(c.x, c.y, c.z, fx.mega > 0 ? 2.6 : 1.6, 0.9, fx.mega > 0 ? COLOURS.mega : COLOURS.homing); }
  }
  function collect() {
    if (!vis) return;
    for (const p of vis.pickups) {
      if (p.taken) continue;
      for (const b of balls) {
        if (b.holed || b.sunk) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        if (dx * dx + dz * dz < 0.62 * 0.62) { p.taken = true; p.mesh.visible = false; if (p.type === 'coin') { cs.secret++; audio?.golf?.('pickup'); say(elBanner, 'Secret found! +100', 1800, 'banner'); if (fxs) { const w = wp(p.x, 0.9, p.z); fxs.sparks(w.x, w.y, w.z, '#ffd23f', 34, 3, 3.8, 0.9, 0.07); fxs.ring(w.x, w.y - 0.8, w.z, 1.6, 0.8, '#ffd23f'); } break; } cs.orbs++; applyPower(p.type); if (fxs) { const w = wp(p.x, 0.7, p.z); fxs.sparks(w.x, w.y, w.z, COLOURS[p.type], 30, 3.2, 3.6, 0.9, 0.07); fxs.ring(w.x, w.y - 0.6, w.z, 1.5, 0.8, COLOURS[p.type]); } break; }
      }
    }
  }
  function tickPowers(dt) {
    for (const k in fx) if (fx[k] > 0) { fx[k] = Math.max(0, fx[k] - dt); if (fx[k] === 0 && k === 'hamster' && st.mode === 'hamster') { st.mode = 'roll'; st.rollT = 0; } }
    ctx.homing = fx.homing > 0; ctx.ghost = fx.ghost > 0; ctx.bounce = fx.bounce > 0; ctx.turbo = fx.turbo > 0; ctx.drive = fx.hamster > 0; ctx.cupR = CUP_R * (fx.mega > 0 ? 2.6 : 1);
    st.cupScale += ((fx.mega > 0 ? 2.6 : 1) - st.cupScale) * Math.min(1, dt * 6); if (vis) vis.cupMesh.scale.set(CUP_R * 0.92 * st.cupScale, 1, CUP_R * 0.92 * st.cupScale)
    if (vis) { const mo = vis.cupMesh.userData.mouth; if (mo) { const k = clamp01((st.cupScale - 1.04) / 0.5); mo.visible = k > 0.01; mo.material.opacity = k; } }
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
    for (let i = 0; i < n; i++) { const dx = b.x + (a.dx / l) * (0.7 + i * 0.62), dz = b.z + (a.dz / l) * (0.7 + i * 0.62); tmpM.makeTranslation(dx, Math.max(0, hillH(hole, dx, dz)) + 0.2, dz); dots.setMatrixAt(i, tmpM); }          // (each dash sits on the ground under it, so the line climbs hills and ramps)
    dots.count = n; dots.instanceMatrix.needsUpdate = true;
  }
  function fire(a) {
    const b = balls[0], l = Math.hypot(a.dx, a.dz) || 1, pw = Math.pow(a.power, 1.15);
    st.lastX = b.x; st.lastZ = b.z; st.strokes++; st.mode = 'roll'; st.rollT = 0; audio?.golf?.('putt', a.power);
    if (fxs) { const w = wp(b.x, 0.12, b.z); fxs.sparks(w.x, w.y, w.z, groundCol(), 4 + Math.round(a.power * 10), 0.7 + a.power * 1.6, 0.9, 0.5); }
    if (!calm) juice.kick = 0.25 + 0.75 * a.power;
    b.cmDip = 9; st.bankN = 0; st.pathLen = 0;
    (st.shots[st.hole] ||= []).push({ x: b.x, z: b.z, dx: a.dx, dz: a.dz, pw, t: ctx.t, gate: ctx.gateT, multi: st.multi, f: { homing: ctx.homing, ghost: ctx.ghost, bounce: ctx.bounce, turbo: ctx.turbo, drive: false, cupR: ctx.cupR } });      // (every stroke is kept so the best hole can be replayed)
    shoot(b, a.dx, a.dz, pw, fx.turbo > 0);
    if (st.multi) {                                        // multi-ball: four more balls fly off at slightly different angles; the one nearest the cup is kept
      st.multi = false;
      for (const k of [-0.22, 0.22, -0.45, 0.45]) { const nb = newBall(hole); nb.x = b.x; nb.z = b.z; const c = Math.cos(k), s = Math.sin(k); shoot(nb, (a.dx * c - a.dz * s) / l, (a.dx * s + a.dz * c) / l, pw, fx.turbo > 0); balls.push(nb); }
      balls.forEach((_, i) => { ballMeshes[i].visible = true; ballShadows[i].visible = true; });
    }
  }
  const onDown = (e) => {
    if (st.mode === 'table') { table.input.down(e); return; }
    if ((st.mode !== 'aim' && st.mode !== 'hamster') || e.button > 0 || e.target?.closest?.('.golf-hud button, .golf-score')) return;
    drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; e.preventDefault();
  };
  const onMove = (e) => { if (st.mode === 'table') { table.input.move(e); return; } if (drag) { drag.x = e.clientX; drag.y = e.clientY; updateAim(); } };
  const onUp = (e) => {
    if (st.mode === 'table') { table.setFlip(false); table.input.up(e); return; }
    if (!drag) return;
    const d = drag; drag = null; updateAim();
    if (st.mode !== 'aim') return;
    const a = aimInfo(d); if (a.power < 0.06) return;
    fire(a);
  };
  const onKey = (e) => { if (st.mode !== 'off' && e.key === 'Escape' && e.type === 'keydown') { api.stop(); e.preventDefault(); } else if (st.mode === 'table') table.input.key(e); };
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('pointerdown', onDown, { passive: false }); window[f]('pointermove', onMove); window[f]('pointerup', onUp); window[f]('pointercancel', onUp); window[f]('keydown', onKey); window[f]('keyup', onKey);
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
    const S = sites[st.hole], P = toWorld(S, b.x - dx * back, b.z - dz * back), L = toWorld(S, b.x + dx * ahead, b.z + dz * ahead), base = Ys[st.hole] + 0.06 + (cam.gyHole === st.hole ? cam.gy : Math.max(0, hillH(hole, b.x, b.z)));
    out.pos.set(P.x, Math.max(base + upH, world.carve.groundNow(P.x, P.z) + 2.4), P.z); out.look.set(L.x, base + 0.3, L.z);
  }
  function tableCamera(dt) {                               // the table: the whole hole at first, a sweep up behind the ball, then the pinball camera (behind while aiming, high above while in play)
    cam.t += dt;
    if (cam.phase === 'overview') {
      framing(); want.pos.copy(frame.pos); want.look.copy(frame.look); if (cam.t > OVERVIEW_HOLD) { cam.phase = 'sweep'; cam.t = 0; }
      cam.slow = Math.max(0, cam.slow - dt); const k = cam.slow > 0 ? 2.2 : 4; cam.pos.lerp(want.pos, 1 - Math.exp(-dt * k)); cam.look.lerp(want.look, 1 - Math.exp(-dt * k)); camera.position.copy(cam.pos); camera.up.copy(up0); camera.lookAt(cam.look);
    } else if (cam.phase === 'sweep') {
      table.holdCamera(); table.poseCamera(behind, dt); framing(); const k = ease(clamp01(cam.t / SWEEP));
      want.pos.lerpVectors(frame.pos, behind.pos, k); want.look.lerpVectors(frame.look, behind.look, k); cam.pos.lerp(want.pos, 1 - Math.exp(-dt * 9)); cam.look.lerp(want.look, 1 - Math.exp(-dt * 9)); camera.position.copy(cam.pos); camera.up.copy(up0); camera.lookAt(cam.look);
      if (cam.t >= SWEEP) { cam.phase = 'follow'; if (st.tableHelp) { st.tableHelp = false; st.tableSeen = true; elHelp.hidden = false; } }
    } else table.frameCamera(dt);
  }
  function followCamera(dt) {
    if (st.hole === TABLE_HOLE && table.group && (st.mode === 'table' || st.mode === 'done')) { tableCamera(dt); return; }
    cam.t += dt; const b = balls[0];
    if (cam.phase === 'overview') { framing(); want.pos.copy(frame.pos); want.look.copy(frame.look); if (cam.t > OVERVIEW_HOLD) { cam.phase = 'sweep'; cam.t = 0; } }
    else {
      const sp = Math.hypot(b.vx, b.vz);
      if (fx.hamster > 0) { if (sp > 0.8) { cam.dx += (b.vx / sp - cam.dx) * Math.min(1, dt * 2.5); cam.dz += (b.vz / sp - cam.dz) * Math.min(1, dt * 2.5); } }
      else if (st.mode === 'aim') { const t = aimTarget(b); let tx = t.x - b.x, tz = t.z - b.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; cam.dx += (tx - cam.dx) * Math.min(1, dt * 1.8); cam.dz += (tz - cam.dz) * Math.min(1, dt * 1.8); }
      const l = Math.hypot(cam.dx, cam.dz) || 1; cam.dx /= l; cam.dz /= l;
      { const gt = Math.max(0, hillH(hole, b.x, b.z)); if (cam.gyHole !== st.hole) { cam.gyHole = st.hole; cam.gy = gt; } else cam.gy += (gt - cam.gy) * (1 - Math.exp(-dt * 2.5)); }      // (the ground under the ball, smoothed so the camera does not bob over hills)
      cam.lead += ((st.mode === 'roll' ? Math.min(1, sp / 10) : 0) - cam.lead) * (1 - Math.exp(-dt * 1.6));         // (look a little further ahead the faster the ball goes)
      if (fx.hamster > 0) behindPose(b, cam.dx, cam.dz, 4.2, 3.4, 4.5, behind); else behindPose(b, cam.dx, cam.dz, 7.2 + 1.2 * cam.lead, 6.0, 6.0 + 2.6 * cam.lead, behind);
      if (cam.phase === 'sweep') {                          // the camera swings from the full view round and in to behind the ball
        framing(); const k = ease(clamp01(cam.t / SWEEP));
        want.pos.lerpVectors(frame.pos, behind.pos, k); want.look.lerpVectors(frame.look, behind.look, k);
        if (cam.t >= SWEEP) cam.phase = 'follow';
      } else { want.pos.copy(behind.pos); want.look.copy(behind.look); }
    }
    cam.slow = Math.max(0, cam.slow - dt);
    const k = cam.phase === 'follow' ? 3.2 : cam.phase === 'overview' ? (cam.slow > 0 ? 2.2 : 4) : 9;
    cam.kk = cam.kk > 0 ? cam.kk + (k - cam.kk) * (1 - Math.exp(-dt * 3)) : k;                                      // (the speed of the camera changes smoothly between phases)
    if (dt > 0.2) { cam.vp.set(0, 0, 0); cam.vl.set(0, 0, 0); }
    springTo(cam.pos, cam.vp, want.pos, 1.5 / cam.kk, dt); springTo(cam.look, cam.vl, want.look, 1.2 / cam.kk, dt);
    camera.position.copy(cam.pos);
    if (!calm && (juice.kick > 0.002 || juice.shake > 0.002)) {                  // (the camera is knocked back a little by a stroke and shaken by a hard hit; both die away quickly)
      kv.subVectors(cam.look, cam.pos).normalize(); camera.position.addScaledVector(kv, -juice.kick * 0.45);
      camera.position.x += (Math.random() - 0.5) * juice.shake; camera.position.y += (Math.random() - 0.5) * juice.shake; camera.position.z += (Math.random() - 0.5) * juice.shake;
      juice.kick *= Math.exp(-dt * 9); juice.shake *= Math.exp(-dt * 11);
    }
    camera.up.copy(up0); camera.lookAt(cam.look);
  }
  function fly(k) {                                        // between the camera we came from (or go back to) and where it is heading
    camera.position.lerpVectors(flyFrom.pos, want.pos, k); tmpV.lerpVectors(flyFrom.look, want.look, k); camera.up.copy(up0); camera.lookAt(tmpV);
  }
  // the trip to the next hole (or back up over the whole course): an arc that rises and comes down again
  function beginTravel(to) {
    trip.to = to; st.mode = to >= HOLES ? 'finale' : 'travel'; if (to >= HOLES) hud.classList.add('pb-off'); st.t = 0; drag = null; if (dots) dots.count = 0; elPower.classList.remove('show');
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
    get leaving() { return st.mode === 'exit'; },
    get focusDistance() { return st.mode === 'enter' || st.mode === 'exit' || st.mode === 'finale' || st.mode === 'card' ? trip.dist : cam.phase === 'overview' || st.mode === 'travel' ? frame.dist : onTable() && cam.phase === 'follow' ? table.focusDistance : 12; },
    onQuit: null,
    /** Debug: hold the camera at `pos` looking at `look` (both [x, y, z]), or let go with no arguments. */
    debugCam(pos, look) { dbgCam = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null; },
    /** Debug: a world point `up` above and `dist` out from the hero of the current hole, as { p: [x, y, z], hero: [x, y, z] }. */
    heroPoint() { const hr = hole.hero; const v = holeGroup.localToWorld(new THREE.Vector3(hr.x, 0, hr.z)); const v2 = holeGroup.localToWorld(new THREE.Vector3(hr.x + hr.ux, 0, hr.z + hr.uz)); return { hero: [v.x, v.y, v.z], dx: v2.x - v.x, dz: v2.z - v.z }; },
    /** Debug: jump straight to hole `i` (0-based). */
    jump(i) { if (ready && st.mode !== 'off' && st.mode !== 'exit' && st.mode !== 'enter') { elScore.hidden = true; startHole(i); framing(); (cam.vp.set(0, 0, 0), cam.vl.set(0, 0, 0)), cam.pos.copy(frame.pos); cam.look.copy(frame.look); } },
    /** Debug: the live state. */
    get debug() { return { st, hole, holes, sites, Ys, balls, ev, frame, cam, fx, ctx, vis, table, trail, trick, popAt }; },
    /** Does the course about to be played have to be searched for (a random one)? Then it is built in a worker first: `prepare(progress)` resolves when it is ready (or at once if it cannot be). */
    needsPrepare() { return !!golfCourse().random; },
    prepare(progress) {
      const c = golfCourse(), seed = courseSeed(c.year, c.month), fx = !!c.random || SHAPES_BAKED, more = !!c.random || MORE_BAKED, order = heroOrder(seed, more), shapes = shapeOrder(seed, fx || undefined), themes = themeOrder(seed);
      return new Promise((resolve) => {
        let w; const got = [], done = () => { try { w && w.terminate(); } catch (err) { /* (ignore) */ } resolve(); };
        try {
          w = new Worker(new URL('./golfworker.js?v=20261031001653', import.meta.url), { type: 'module' });
          w.onmessage = (e) => { const d = e.data; if (d.error) { done(); return; } if (d.done) { prebuilt = { key: seed + ':' + (fx ? 1 : 0), holes: got }; done(); return; } got[d.i] = d.h; progress?.(d.i + 1, TABLE_HOLE); };
          w.onerror = () => done();
          w.postMessage({ seed, order, shapes, themes, fx, more, n: TABLE_HOLE });
        } catch (err) { done(); }
      });
    },
    start(homeCam) {
      if (st.mode !== 'off') return;
      if (!ballMeshes.length) buildBits();
      Object.assign(st, { random: 0 }, golfCourse());                    // (the same course for everyone, all month)
      st.seed = courseSeed(st.year, st.month); st.order = heroOrder(st.seed, !!st.random || MORE_BAKED); st.shapes = shapeOrder(st.seed, !!st.random || undefined); st.scores = []; st.par = []; st.pts = []; st.chalDone = []; st.shots = []; st.playT = 0; st.idle = 0;
      home.pos.copy(homeCam.pos); home.look.copy(homeCam.look); flyFrom.pos.copy(homeCam.pos); flyFrom.look.copy(homeCam.look);
      setBoards(false); buildCourse(); overviewAll(trip);
      document.body.classList.add('game-mode'); hud.hidden = false; elScore.hidden = true;
      startHole(0); st.mode = 'enter'; st.t = 0; toastOff(); framing(); (cam.vp.set(0, 0, 0), cam.vl.set(0, 0, 0)), cam.pos.copy(camera.position); cam.look.copy(frame.look);
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
      dt = Math.min(dt, 0.05); if (juice.stop > 0) { juice.stop -= dt; dt *= 0.08; } if (st.moment > 0) { st.moment -= dt; dt *= 0.5; } st.t += dt; st.idle += dt; if (hole) for (const q of hole.bumpers) if (q.pop) q.pop = q.pop < 0.01 ? 0 : q.pop * Math.exp(-dt * 9); if (table?.group) table.leanTable(); lamps?.update(world.night); fxs?.update(dt); scenery?.update(dt, fxs);
      { const u = Math.min(1, Math.max(0, (world.night - 0.35) / 0.5)); neonK = u * u * (3 - 2 * u); neon?.set(neonK); const L = lights(); if (L.length && lampSpotsAll.length) for (const l of L) l.color.set('#ffc27a').lerp(UVC, neonK); }
      if (st.mode === 'exit') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / EXIT));
        fly(k); for (let i = 0; i < vises.length; i++) setRise(i, 1 - k);
        world.carve.regrow(ease(clamp01((k - 0.15) / 0.85))); growBoards(ease(clamp01((k - 0.3) / 0.7)));            // (the village, plants and billboards come back as the camera flies home)
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
          st.mode = 'aim'; st.t = 0; (cam.vp.set(0, 0, 0), cam.vl.set(0, 0, 0)), cam.pos.copy(camera.position); tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(30).add(camera.position); cam.look.copy(tmpV); cam.slow = 1.8; cam.phase = 'overview'; cam.t = 0;
          for (let i = 0; i < vises.length; i++) setRise(i, 1);
          if (scenery) scenery.group.visible = true;
          announce();
        }
        return true;
      }
      if (st.mode === 'travel' || st.mode === 'finale') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / TRAVEL));
        tripCamera(k);
        if (k >= 1) {
          (cam.vp.set(0, 0, 0), cam.vl.set(0, 0, 0)), cam.pos.copy(camera.position); cam.look.copy(trip.look);
          if (st.mode === 'finale') showScore(); else { startHole(trip.to); (cam.vp.set(0, 0, 0), cam.vl.set(0, 0, 0)), cam.pos.copy(camera.position); cam.look.copy(trip.look); }
        }
        updateScenery(dt); updateOcclusion(dt); updateHud();
        return true;
      }
      if (st.mode === 'replay') { replayStep(dt); }
      if (dbgCam) { camera.position.copy(dbgCam.pos); camera.up.copy(up0); camera.lookAt(dbgCam.look); }
      else if (st.mode !== 'card') followCamera(dt);
      else { overviewAll(trip); camera.position.copy(trip.pos); camera.lookAt(trip.look); }
      if (hole && st.mode === 'replay' && holeGroup) { vis.update(st.holeT, st.holeT, dt, st); }
      if (hole && onTable() && (st.mode === 'table' || st.mode === 'done')) {
        st.holeT += dt; if (st.mode === 'table') { st.playT += dt; cs.clock += dt; cs.lit = table.st.open; } table.tick(dt);
        if (st.mode === 'done' && st.t > 1.7) beginTravel(st.hole + 1);
      } else if (hole && st.mode !== 'card' && st.mode !== 'replay' && holeGroup) {
        st.holeT += dt * (fx.freeze > 0 ? 0.12 : 1); ctx.t = st.holeT;
        tickPowers(dt); powerFx(dt);
        if (st.mode === 'aim' || st.mode === 'roll' || st.mode === 'hamster') { cs.clock += dt; st.playT += dt; }
        { const gp = (hole.feats || []).find((f) => f.t === 'gap'), b0 = balls[0]; if (gp && b0) { const rx = b0.x - gp.x, rz = b0.z - gp.z, s2 = rx * gp.ux + rz * gp.uz, c2 = rx * gp.nx + rz * gp.nz; if (b0.air) { if (Math.abs(s2) < gp.len / 2 && c2 > gp.c0 && c2 < gp.c1) cs.overGap = true; } else if (cs.overGap) { if (s2 > gp.len / 2 + 0.1) cs.jumped = true; cs.overGap = false; } } }
        if ((fx.ghost > 0) !== ghostOn) {                  // the ghost power-up: obstacles go see-through and an eerie fog gathers; when it ends, a ball inside something is lifted out
          ghostOn = fx.ghost > 0; vis.setGhost(ghostOn); ghostVis = vis;
          if (!ghostOn) { if (hole.cage) ctx.gateT = Math.max(ctx.gateT, 5); for (const b of balls) if (!b.holed && !b.sunk) ejectBall(b, hole); }
        }
        if (ghostOn && fxs) {
          const hr = hole.hero; if (hr) { const p = holeGroup.localToWorld(new THREE.Vector3(hr.x, 0.2, hr.z)); fxs.ghostFog(p.x, p.y, p.z, 3.4, dt); }
          const p2 = holeGroup.localToWorld(new THREE.Vector3(balls[0].x, 0.1, balls[0].z)); fxs.ghostFog(p2.x, p2.y, p2.z, 1.1, dt * 0.6);
        }
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
            if (ev.wall > 1.5) cs.wall++; if (ev.splash || (!b.air && inSand(hole, b))) cs.hazard = true;
            if (ev.rim > 0.8) { audio?.golf?.('rim', Math.min(1, ev.rim / 4)); if (!calm) juice.shake = Math.max(juice.shake, 0.02); }          // (the ball knocks the rim of the cup)
            if (ev.lip) { say(elBanner, 'Lip out!', 1400, 'banner'); if (fxs) { const w = wp(hole.cup.x, 0.1, hole.cup.z); fxs.ring(w.x, w.y, w.z, 1.1, 0.6, '#ffffff'); } audio?.golf?.('groan'); }
            if (ev.wall > 8.5 && !calm) { juice.stop = Math.max(juice.stop, 0.04); juice.shake = Math.max(juice.shake, Math.min(0.14, ev.wall / 110)); }          // (a hard hit: a freeze of a few frames and a shake)
            if (ev.wall > 1.2) { audio?.golf?.('wall', Math.min(1, ev.wall / 12)); if (!vis.flashWall(ev.sax, ev.saz, ev.sbx, ev.sbz, ev.wall)) { const sx = ev.sbx - ev.sax, sz = ev.sbz - ev.saz, t = Math.max(0, Math.min(1, ((b.x - ev.sax) * sx + (b.z - ev.saz) * sz) / (sx * sx + sz * sz || 1))); vis.flashHero(ev.sax + sx * t, Math.max(0, b.y) + 0.2, ev.saz + sz * t, ev.wall); } }
            if (ev.post > 1.2) { const bp = hole.bumpers.find((q) => q.x === ev.hx && q.z === ev.hz); if (!vis.flashAt(ev.hx, ev.hz, ev.post)) vis.flashHero(ev.hx, Math.max(0, b.y) + 0.3, ev.hz, ev.post); if (bp) bp.pop = 0.28; } if (ev.post > 1.2) audio?.golf?.('post', Math.min(1, ev.post / 12));
            if (fxs) {                                           // the effects of what the ball hits
              if (ev.wall > 2 && fx.bounce > 0) { const w = wp(b.x, 0.2, b.z); fxs.sparks(w.x, w.y, w.z, COLOURS.bounce, 10, 2.2, 2.2, 0.5); fxs.ring(w.x, w.y, w.z, 0.9, 0.5, COLOURS.bounce); }
              if (ev.post > 2) { const w = wp(b.x, 0.3, b.z), pend = hole.hero && hole.hero.type === 'pendulum' && Math.hypot(b.x - hole.hero.x, b.z - hole.hero.z) < 4; fxs.sparks(w.x, w.y, w.z, pend ? '#ffe27a' : '#ffb25a', pend ? 16 : 9, 2.6, 2.4, 0.45, 0.05); }
              if (ev.fx === 3) { const w = wp(hole.hero.x + hole.hero.ux * 1.2, 0.8, hole.hero.z + hole.hero.uz * 1.2); fxs.puff(w.x, w.y, w.z, 9, b.vx, b.vz); fxs.sparks(w.x, w.y, w.z, '#ffd27a', 18, 3.5, 2.5, 0.5, 0.07); }
              if (ev.fx === 2) { const w = wp(hole.hero.x, 0.6, hole.hero.z); fxs.puff(w.x, w.y, w.z, 4); }
              if (ev.fx === 1) for (const q of [hole.hero.a, hole.hero.b]) { const w = wp(q.x, 0.9, q.z); fxs.sparks(w.x, w.y, w.z, '#7fffd4', 18, 1.6, 3, 0.8, 0.06); fxs.ring(w.x, w.y - 0.85, w.z, 1.2, 0.7, '#7fffd4'); }
              if (ev.fx === 6 || ev.fx === 7 || ev.fx === 10) st.moment = Math.max(st.moment || 0, 0.4);          // (a short slow-motion beat when a machine fires)
              if (ev.fx === 6) { const w = wp(b.x, 0.2, b.z); fxs.sparks(w.x, w.y, w.z, '#ff7fd0', 16, 2.4, 3, 0.6); fxs.ring(w.x, w.y, w.z, 1.2, 0.6, '#ff7fd0'); }
              if (ev.fx === 7) { const bt = (hole.cage && hole.cage.button) || ((hole.doors || []).find((dr) => dr.button && Math.hypot(dr.button.x - b.x, dr.button.z - b.z) < 2) || {}).button || b, w = wp(bt.x, 0.15, bt.z); fxs.sparks(w.x, w.y, w.z, '#6dff9a', 20, 2.2, 2.6, 0.7); fxs.ring(w.x, w.y, w.z, 1.3, 0.7, '#6dff9a'); }
              if (ev.fx === 8) { const w = wp(b.x, 0.2, b.z); fxs.sparks(w.x, w.y, w.z, '#ffe14a', 8, 1.8, 1.2, 0.4); }
              if (ev.fx === 10) { const w = wp(b.x, 0.5, b.z); fxs.sparks(w.x, w.y, w.z, '#7fe9ff', 14, 1.8, 2.2, 0.6); fxs.ring(w.x, w.y - 0.4, w.z, 1.1, 0.6, '#7fe9ff'); }
              if (ev.fx === 11) { const w = wp(b.x, 0.5, b.z); fxs.sparks(w.x, w.y, w.z, '#7fe9ff', 16, 2.0, 2.4, 0.6); fxs.ring(w.x, w.y - 0.3, w.z, 1.2, 0.6, '#7fe9ff'); st.moment = Math.max(st.moment || 0, 0.4); }
              if (ev.fx === 12) { const w = wp(b.x, b.y + 0.3, b.z); fxs.sparks(w.x, w.y, w.z, '#ffe14a', 18, 2.4, 2.0, 0.7); fxs.ring(w.x, w.y - 0.2, w.z, 1.4, 0.7, '#ffe14a'); }
              if (ev.fx === 9) { const w = wp(b.x, 0.3, b.z); fxs.sparks(w.x, w.y, w.z, '#7fe9ff', 14, 2.4, 1.8, 0.6); }
              if (ev.fx === 11) trick('Secret path!', 75, b.x, b.z); if (ev.fx === 4) trick('Loop!', 30, b.x, b.z); if (ev.fx === 10) trick('Rail ride!', 30, b.x, b.z);
              if (ev.fx === 4) { const w = wp(b.x, 0.3, b.z); fxs.sparks(w.x, w.y, w.z, '#bff4ff', 14, 2.4, 2, 0.5); }
            }
            if (ev.fx) audio?.golf?.(ev.fx === 1 ? 'tele' : ev.fx === 2 ? 'load' : ev.fx === 3 ? 'boom' : ev.fx === 4 ? 'loop' : ev.fx === 6 ? 'pickup' : ev.fx === 7 ? 'load' : ev.fx === 8 ? 'wall' : ev.fx === 9 ? 'wall' : ev.fx === 10 || ev.fx === 11 ? 'tele' : ev.fx === 12 ? 'pickup' : 'geyser');
            if (fxs && !b.air && !b.rest) { const sp0 = Math.hypot(b.vx, b.vz); if (sp0 > 0.7 && inSand(hole, b)) { const p = holeGroup.localToWorld(new THREE.Vector3(b.x, b.y + 0.05, b.z)); fxs.sand(p.x, p.y, p.z, b.vx, b.vz, dt); } }
            if (ev.fx === 5 && fxs) { const p = holeGroup.localToWorld(new THREE.Vector3(b.x, 0.2, b.z)); fxs.burst('kick', p.x, p.y, p.z); }
            { const hr = hole.hero; if (hr && hr.type === 'turntable' && !b.rest && (b.x - hr.x) ** 2 + (b.z - hr.z) ** 2 < hr.r * hr.r) { const sp1 = Math.hypot(b.vx, b.vz); if (sp1 > 0.6 && (st.tFlash = (st.tFlash || 0) - dt) <= 0) { st.tFlash = 0.18; vis.flashHeroAll(Math.min(8, 1.5 + sp1)); } } }
            if (ev.splash) { st.fell = ev.fall; audio?.golf?.(ev.fall ? 'wall' : 'splash'); if (fxs && !ev.fall) { const p = holeGroup.localToWorld(new THREE.Vector3(b.x, 0.1, b.z)); fxs.burst('splash', p.x, p.y, p.z); } if (balls.length > 1) { ballMeshes[i].visible = false; ballShadows[i].visible = false; } continue; }
            if (ev.wall > 3) st.bankN = (st.bankN || 0) + 1; if (!b.air) st.pathLen = (st.pathLen || 0) + Math.hypot(b.vx, b.vz) * dt;
            if (ev.holed) { holedBall = b; if (st.hole !== TABLE_HOLE) { if (st.bankN >= 2) trick('Bank shot!', 50, b.x, b.z); if (st.pathLen > 14) trick('Long putt!', 40, b.x, b.z); } continue; }
            if (!b.rest) live++;
            const sp = Math.hypot(b.vx, b.vz); if (sp > 0.05) { rollBall(ballMeshes[i], b.vx, b.vz, sp * dt); }
          }
          collect();
          if (holedBall) { cs.power = Object.keys(fx).some((k) => fx[k] > 0); balls = [holedBall]; hideExtraBalls(); st.mode = 'sink'; sinkT = 0; fx.hamster = 0; }
          else if (balls.every((b) => b.sunk)) {                      // into the water: back to where it was hit from, a stroke more unless the safety net is up
            if (st.safety) { st.safety = false; say(elToast, 'Safety net!', 1300, 'toast'); } else { st.strokes++; say(elToast, st.fell ? 'Into the canyon! +1' : 'Splash! +1', 1300, 'toast'); }
            const nb = newBall(hole); nb.x = st.lastX; nb.z = st.lastZ; balls = [nb]; hideExtraBalls(); fx.hamster = 0; st.mode = 'aim';
          } else if (live === 0 || (st.mode === 'roll' && st.rollT > 14)) {
            const alive = balls.filter((b) => !b.sunk);
            if (alive.length > 1) { alive.sort((p, q) => Math.hypot(p.x - hole.cup.x, p.z - hole.cup.z) - Math.hypot(q.x - hole.cup.x, q.z - hole.cup.z)); balls = [alive[0]]; hideExtraBalls(); } else balls = alive;
            for (const b of balls) { b.vx = b.vz = 0; b.rest = true; }
            st.mode = 'aim'; noteRest();
          }
        } else if (st.mode === 'aim') { stepBall(balls[0], hole, ctx, dt, ev); collect(); }
        if (st.mode === 'sink') {
          sinkT += dt; ballShadows[0].visible = false; const s = clamp01(sinkT / 0.5), m = ballMeshes[0], hb = balls[0], e = ease(clamp01(s * 2.2)), sx = hb.capX ?? hole.cup.x, sz = hb.capZ ?? hole.cup.z; m.scale.setScalar(1 - 0.75 * s); m.position.set(sx + (hole.cup.x - sx) * e, 0.2 - 1.2 * s + BALL_R * (1 - s), sz + (hole.cup.z - sz) * e);       // (the ball drops from where it fell in, not from the middle) m.visible = true; hamster.visible = false;
          if (s >= 1) { m.visible = false; ballShadows[0].visible = false; finishHole(); }
        } else if (st.mode === 'done') { if (st.t > 1.7) beginTravel(st.hole + 1); }
        else { placeBalls(); ballMeshes[0].scale.setScalar(1); }
        if (hamster.visible) { const b = balls[0], sp = Math.hypot(b.vx, b.vz); hamster.userData.run(st.holeT, sp); if (sp > 0.3) hamster.userData.hm.rotation.y = Math.atan2(b.vx, b.vz); }
        if (st.hole !== TABLE_HOLE) trail.update(dt, balls[0]);
        { const b0 = balls[0]; if (b0 && st.mode === 'roll' && fxs) {                     // (a puff where the ball lands, faint streaks behind a fast ball, and the sound of it rolling)
          const sp0 = Math.hypot(b0.vx, b0.vz); juice.streakT += dt;
          if (juice.wasAir && !b0.air && !b0.holed) { const w = wp(b0.x, 0.12, b0.z); fxs.sparks(w.x, w.y, w.z, groundCol(), 8, 1.4, 1.1, 0.5); audio?.golf?.('land', 0.5); }
          juice.wasAir = !!b0.air;
          if (sp0 > 7 && !b0.air && !lowEnd && juice.streakT > 0.045) { juice.streakT = 0; const w = wp(b0.x - b0.vx * 0.04, 0.2, b0.z - b0.vz * 0.04); fxs.sparks(w.x, w.y, w.z, '#ffffff', 1, 0.25, 0.1, 0.3); }
          if (!b0.air && sp0 > 0.8) audio?.golf?.('roll', Math.min(1, sp0 / 12));
          const cdx = hole.cup.x - b0.x, cdz = hole.cup.z - b0.z, cdd = Math.hypot(cdx, cdz);
          if (cdd < 2.4 && sp0 > 0.5 && sp0 < 3.4 && !b0.holed && (b0.vx * cdx + b0.vz * cdz) / (sp0 * cdd + 1e-6) > 0.5) { st.moment = Math.max(st.moment || 0, 0.1); audio?.golf?.('tick', 1 - cdd / 2.4); }          // (a slow ball heading for the cup: a beat of slow motion and a ticking sound)
        } } st.flagNear = balls.some((bb) => !bb.sunk && Math.hypot(bb.x - hole.cup.x, bb.z - hole.cup.z) < ctx.cupR + 1.15); st.gateOpen = ctx.gateT > 0; st.chuteK = balls[0].chute ? balls[0].chute.k : -1; vis.update(st.holeT, st.holeT, dt, st);
      }
      updateScenery(dt); updateOcclusion(dt);
      updateHud();
      return true;
    },
  };
  const toastOff = () => { elToast.classList.remove('show'); };
  // ---------- things between the camera and the ball turn see-through ----------
  const occ = { ray: new THREE.Raycaster(), pieces: new Map(), list: [], from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), tick: 0, hole: -1 };
  const pieceOf = (o, roots) => { while (o && !roots.includes(o.parent)) o = o.parent; return o; };
  function occlusionTargets() {                            // the meshes that may hide the ball: every piece of the hole in play and of the scenery (not the green, the water, the balls or the effects)
    occ.list = []; occ.hole = st.hole; const roots = [holeGroup, scenery && scenery.group].filter(Boolean);
    for (const root of roots) for (const piece of root.children) {
      if (piece === ballMeshes[0] || ballMeshes.includes(piece) || ballShadows.includes(piece) || piece === dots || piece === hamster) continue;
      piece.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry && o.material && !o.material.transparent && !o.material.uniforms && o.material !== M.grass && o.material !== M.cup && o.material !== M.white && o.geometry !== G.disc && !(o.material.vertexColors)) { o.userData.piece = piece; occ.list.push(o); } });
    }
  }
  const fadeMat = (piece, m, store) => { let c = store.get(m); if (!c) { c = m.clone(); c.transparent = true; c.depthWrite = false; store.set(m, c); } return c; };
  function updateOcclusion(dt) {
    if (!holeGroup || !balls.length || st.hole === TABLE_HOLE || !['aim', 'roll', 'hamster', 'sink', 'done', 'replay'].includes(st.mode)) { if (occ.pieces.size) fadeAll(dt, true); return; }
    if (occ.hole !== st.hole || !occ.list.length) occlusionTargets();
    const hits = new Set();
    if ((occ.tick++ & 1) === 0) {
      const b = balls[0], p = wp(b.x, Math.max(b.y, 0) + 0.3, b.z); occ.to.copy(p); occ.from.copy(camera.position); occ.dir.subVectors(occ.to, occ.from); const dist = occ.dir.length(); occ.dir.normalize();
      occ.ray.set(occ.from, occ.dir); occ.ray.near = 0.2; occ.ray.far = Math.max(0, dist - 0.45);
      for (const h of occ.ray.intersectObjects(occ.list, false)) hits.add(h.object.userData.piece);
      for (const [piece, f] of occ.pieces) f.target = hits.has(piece) ? 1 : 0;
      for (const piece of hits) if (!occ.pieces.has(piece)) { if (ghostOn && vis && piece === vis.heroRoot) continue; occ.pieces.set(piece, { k: 0, target: 1, meshes: [], mats: new Map() }); }
    }
    fadeAll(dt, false);
  }
  function fadeAll(dt, force) {
    for (const [piece, f] of occ.pieces) {
      if (force) f.target = 0;
      f.k += (f.target - f.k) * Math.min(1, dt * 9);
      if (!f.meshes.length) piece.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.material && !o.material.uniforms && !Array.isArray(o.material)) f.meshes.push([o, o.material]); });
      if (f.k > 0.02) for (const [o, m] of f.meshes) { if (o.material === m || o.material.userData.fade) { const c = fadeMat(piece, m, f.mats); c.userData.fade = true; c.opacity = 1 - 0.78 * f.k; o.material = c; o.castShadow = o.castShadow; } }
      else if (f.target === 0) { for (const [o, m] of f.meshes) if (o.material.userData && o.material.userData.fade) o.material = m; occ.pieces.delete(piece); }
    }
  }
  function updateScenery(dt) {                             // the holes next to the one in play keep moving (the rest stand still)
    for (const j of [st.hole - 1, st.hole + 1]) if (vises[j]) vises[j].update(st.idle, st.idle, dt, st);
  }
  return api;
}
