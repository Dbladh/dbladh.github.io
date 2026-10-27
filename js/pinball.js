// Pinball Golf: a compact pinball table where golf is the skill shot. You putt the ball up the table (drag back and let go, as in the mini-golf), then it is pinball: one button swings the flippers,
// bumpers, slingshots, a spinner, drop targets and ramps knock it about. Light the three lamps (reach the deck by a ramp, spin the spinner, clear the drop targets) and the cup on the raised deck opens;
// sink it to finish. A ball that drops into a lock saucer is held for an aimed putt, so the golf skill pays off inside the pinball. Balls are the strokes.
import * as THREE from 'three';
import { courseSeed, holeSeed, makeHole, heroOrder } from './golfgen.js?v=20261026203519';
import { newBall, newCtx, shoot, stepBall, collideFlippers, hillH, BALL_R, CUP_R } from './golfphys.js?v=20261026203519';
import { toWorld, MARGIN, BLEND } from './golfsites.js?v=20261026203519';
import { M, G, buildHoleVisual } from './golfvis.js?v=20261026203519';
import { courseMonth } from './monthseed.js?v=20261026203519';
import { prepareTable, LAYOUTS, stepFlips, isDrained, TABLE, PLAT_H, TILT, SPIN_NEED, SAVE_TIME } from './pbtable.js?v=20261026203519';

const HOLE_INDEX = 3, SITE = { x: -42, z: -70, k: 2 };         // (heading k = 2 turns the hole so its tee end is nearest the viewer and the cup is up the screen)
const TRAIL = 22, SUB = 4, LAMPS = ['ramp', 'spin', 'tgt'], LAMP_TEXT = { ramp: 'RAMP', spin: 'SPIN', tgt: 'TARGETS' };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createPinball(scene, camera, renderer, world, { audio = null, reduceMotion = false, lowEnd = false } = {}) {
  const st = { mode: 'off', t: 0, balls: 0, pts: 0, clock: 0, shotT: 99, combo: 0, lastHit: -99, flipT: -99, nudges: 3, spins: 0, lamps: {}, open: false, skill: false, stuckT: 0, locked: null, sp: null };
  let hole = null, vis = null, group = null, wall = null, ball = null, ballMesh = null, dots = null, ctx = newCtx(), flips = [], flipMeshes = [], Y = 0, drag = null, flipHeld = false, boards = [], sinkT = 0, shake = 0;
  const ev = { wall: 0, post: 0, holed: false, splash: false, fx: 0, fall: false };
  const tmpV = new THREE.Vector3(), up0 = new THREE.Vector3(0, 1, 0), home = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, from = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, want = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let frame = { u: null, n: null, tee: null };

  // ---------- the HUD ----------
  const hud = document.createElement('div'); hud.className = 'golf-hud'; hud.hidden = true;
  hud.innerHTML = '<div class="golf-top"><div class="golf-left"><div class="golf-info"><b>Pinball Golf</b><span data-k="par"></span><span data-k="strokes"></span><span class="golf-chal" data-k="msg"></span></div></div><button class="golf-quit" type="button">Leave</button></div>' +
    '<div class="pb-lamps" data-k="lamps">' + LAMPS.map((k) => `<i data-l="${k}"><b>${LAMP_TEXT[k]}</b><small></small></i>`).join('') + '<i data-l="cup"><b>CUP</b><small></small></i></div>' +
    '<div class="pb-help" data-k="help" hidden><h3>How to play</h3><ol><li><b>Putt</b> up the table: drag back, let go</li><li><b>Flip</b>: Space or the FLIP button</li><li><b>Light 3 lamps</b>: ramp, spinner, red targets</li><li><b>Sink the cup</b> once it opens</li></ol><button type="button" data-k="helpok">Got it</button></div><button class="pb-q" type="button" data-k="q" aria-label="How to play">?</button>' +
    '<div class="golf-banner" data-k="banner"></div><div class="golf-toast" data-k="toast"></div><div class="golf-power" data-k="power"><i></i></div><button class="pb-nudge" type="button" data-k="nudge">NUDGE</button><button class="pb-flip" type="button">FLIP</button><div class="golf-score" data-k="score" hidden></div>';
  document.body.append(hud);
  const $ = (k) => hud.querySelector(`[data-k="${k}"]`), elPar = $('par'), elStrokes = $('strokes'), elMsg = $('msg'), elBanner = $('banner'), elToast = $('toast'), elPower = $('power'), elNudge = $('nudge'), elScore = $('score'), btnFlip = hud.querySelector('.pb-flip'), elLamps = $('lamps'), elHelp = $('help'), elQ = $('q');
  const timers = {}, say = (el, text, ms, key) => { el.textContent = text; el.classList.add('show'); clearTimeout(timers[key]); timers[key] = setTimeout(() => el.classList.remove('show'), ms); };
  hud.querySelector('.golf-quit').addEventListener('click', () => api.stop());
  $('helpok').addEventListener('click', () => { elHelp.hidden = true; }); elQ.addEventListener('click', (e) => { elHelp.hidden = !elHelp.hidden; e.stopPropagation(); }); elQ.addEventListener('pointerdown', (e) => e.stopPropagation());
  const setBoards = (show) => { if (!boards.length) for (const b of world.boards) { let o = b.face; while (o && o.parent && o.parent !== scene) o = o.parent; if (o && !boards.includes(o)) boards.push(o); } for (const o of boards) o.visible = show; };
  const showLamps = (flash) => { for (const k of LAMPS) { const e = elLamps.querySelector(`[data-l="${k}"]`), was = e.classList.contains('on'); e.classList.toggle('on', !!st.lamps[k]); if (flash && st.lamps[k] && !was) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); } } const c = elLamps.querySelector('[data-l="cup"]'); c.classList.toggle('on', st.open); if (flash && st.open) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } };

  // ---------- the table ----------
  const disposables = [];
  let spots = [], spotMeshes = [], spotShow = 0, spotTarget = 0, pulses = [], tgMeshes = [], tgDown = new Set(), tgAll = 0, spin = null, spinMesh = null, coverMesh = null, coverRing = null, coverK = 1, trailMesh = null, slowK = 1, labels = {}, beacons = []; const trail = [], tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const tgRed = new THREE.MeshLambertMaterial({ color: '#e8594b' }), tgWhite = new THREE.MeshLambertMaterial({ color: '#fff6e0' });
  function buildTable() {
    const mo = courseMonth(), cs = courseSeed(mo.year, mo.month), type = heroOrder(cs)[HOLE_INDEX];
    hole = makeHole(holeSeed(cs, HOLE_INDEX), HOLE_INDEX, type);
    const q = new URLSearchParams(location.search), li = q.has('layout') ? +q.get('layout') : (mo.month - 1) % LAYOUTS.length, mir = q.has('mirror') ? q.get('mirror') === '1' : Math.floor((mo.month - 1) / LAYOUTS.length) === 1;      // (the table changes with the month)
    frame = prepareTable(hole, li, mir); flips = frame.flips; st.layout = LAYOUTS[li % LAYOUTS.length].name;
    const toW = (x, z) => toWorld(SITE, x, z), shape = hole.shape.map((p) => { const w = toW(p[0], p[1]); return [w.x, w.z, p[2] + MARGIN]; });
    Y = world.carve.begin([shape], BLEND, [])[0]; world.carve.set(0, 0);
    vis = buildHoleVisual(hole, { lowEnd, look: world.waterLook }); group = vis.group; group.rotation.y = (SITE.k * Math.PI) / 4; group.position.set(SITE.x, Y + 0.06, SITE.z); group.scale.set(1, 0.001, 1); scene.add(group);
    const deckY = hillH(hole, hole.cup.x, hole.cup.z);
    if (vis.flag) vis.flag.position.y = deckY;                                                                    // (the cup is on the raised deck)
    for (const b of hole.elevated) { hole.bumpers.push(b); const y0 = hillH(hole, b.x, b.z), bm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20), M.bumper), cp = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20), M.white); disposables.push(bm.geometry, cp.geometry); bm.scale.set(b.r, 0.8, b.r); bm.position.set(b.x, y0 + 0.4, b.z); cp.scale.set(b.r * 1.05, 0.12, b.r * 1.05); cp.position.set(b.x, y0 + 0.62, b.z); bm.castShadow = true; group.add(bm, cp); }
    const barM = new THREE.MeshLambertMaterial({ color: '#e8594b' }), capM = new THREE.MeshLambertMaterial({ color: '#fff6e0' }); disposables.push(barM, capM);
    flipMeshes = flips.map((f) => {
      const g = new THREE.Group(), bar = new THREE.Mesh(G.box, barM), c0 = new THREE.Mesh(G.sph, capM), c1 = new THREE.Mesh(G.sph, barM);
      bar.scale.set(f.len, 0.3, f.rad * 2); bar.position.x = f.len / 2; c0.scale.setScalar(f.rad * 1.5); c1.scale.setScalar(f.rad * 1.1); c1.position.x = f.len; g.add(bar, c0, c1); g.position.set(f.px, 0.22, f.pz); bar.castShadow = c0.castShadow = c1.castShadow = true; group.add(g); return g;
    });
    dressTable();
    // the spinner: a bar turning freely about its middle (two arms for the physics)
    { const sp = hole.spinner, bm = new THREE.MeshLambertMaterial({ color: '#ffd23f' }); disposables.push(bm); spin = { a: 0.6, w: 0, turns: 0, arms: [0, Math.PI].map((o) => ({ px: sp.x, pz: sp.z, len: sp.len, rad: sp.rad, a: 0.6 + o, w: 0, o })) };
      spinMesh = new THREE.Group(); const bar = new THREE.Mesh(G.box, bm), hub = new THREE.Mesh(G.sph, tgWhite); bar.scale.set(sp.len * 2, 0.3, sp.rad * 2); hub.scale.setScalar(0.3); spinMesh.add(bar, hub); spinMesh.position.set(sp.x, 0.45, sp.z); bar.castShadow = true; group.add(spinMesh); }
    // the cup cover: a steel plate over the hole until the lamps are lit
    { const cm = new THREE.MeshLambertMaterial({ color: '#c24a41' }); disposables.push(cm); coverMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28), cm); disposables.push(coverMesh.geometry); coverMesh.scale.set(hole.cover.r * 1.05, 0.12, hole.cover.r * 1.05); coverMesh.position.set(hole.cup.x, deckY + 0.1, hole.cup.z); group.add(coverMesh);
      const rgm = new THREE.MeshBasicMaterial({ color: '#ff6a5f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), rgg = new THREE.RingGeometry(0.7, 1.0, 40).rotateX(-Math.PI / 2); disposables.push(rgm, rgg); coverRing = new THREE.Mesh(rgg, rgm); coverRing.position.set(hole.cup.x, deckY + 0.12, hole.cup.z); group.add(coverRing); }
    { const dg = new THREE.CircleGeometry(0.62, 32).rotateX(-Math.PI / 2), rg = new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2), gg = new THREE.RingGeometry(0.9, 1.12, 40).rotateX(-Math.PI / 2); disposables.push(dg, rg, gg);
      spots = hole.saucers; spotMeshes = spots.map((sp) => {                                    // (a lock saucer: a hole in the ground with a white rim; it is dark and glowing while the ball is in play)
        const g = new THREE.Group(), dm = new THREE.MeshBasicMaterial({ color: '#3f9a4a' }), rm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }), gm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); disposables.push(rm, gm, dm);
        const d = new THREE.Mesh(dg, dm), r = new THREE.Mesh(rg, rm), gl = new THREE.Mesh(gg, gm); r.position.y = 0.01; gl.position.y = 0.02; g.add(d, r, gl); g.position.set(sp.x, hillH(hole, sp.x, sp.z) + 0.065, sp.z); g.userData = { rm, gm, gl, dm }; group.add(g); return g;
      }); spotShow = 0; spotTarget = 0; }
    tgMeshes = hole.targets.map((t) => { const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14), tgRed), top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14), tgWhite); disposables.push(body.geometry, top.geometry); body.scale.set(t.r, 0.75, t.r); body.position.y = 0.375; top.scale.set(t.r * 1.02, 0.12, t.r * 1.02); top.position.y = 0.78; g.add(body, top); g.position.set(t.x, 0, t.z); body.castShadow = true; group.add(g); return g; });
    { const rg = new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2); disposables.push(rg); pulses = Array.from({ length: 12 }, () => { const mt = new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); disposables.push(mt); const m = new THREE.Mesh(rg, mt); m.visible = false; group.add(m); return { m, t: 9, r: 1 }; }); }
    buildGuides(deckY);
    ballMesh = new THREE.Mesh(G.ball, M.ball.clone()); ballMesh.castShadow = true; group.add(ballMesh);
    { const tg = new THREE.SphereGeometry(1, 8, 6), tm = new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }); disposables.push(tg, tm); trailMesh = new THREE.InstancedMesh(tg, tm, TRAIL); trailMesh.count = 0; trailMesh.frustumCulled = false; group.add(trailMesh); trail.length = 0; }
    dots = new THREE.InstancedMesh(G.dot, M.dot, 16); dots.count = 0; dots.frustumCulled = false; group.add(dots);
    { const c = toW(hole.cup.x, hole.cup.z); world.carve.setHole(0, c.x, c.z, CUP_R * 0.92 + 0.03); }
    hole.posts.push(hole.cover); ctx.cupR = 0; coverK = 1;                                                   // (the cup is covered: nothing can drop in until the lamps are lit)
  }
  // the look of the playfield: the putting green with painted arrows, wooden rails, red slingshots, the drain
  function dressTable() {
    const { x0, x1, W } = TABLE, cw = 1024, ch = Math.round((cw * 2 * W) / (x1 - x0)), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const c = cv.getContext('2d'), X = (x) => ((x - x0) / (x1 - x0)) * cw, Z = (z) => ((z + W) / (2 * W)) * ch;
    c.clearRect(0, 0, cw, ch); c.save(); c.beginPath(); hole.outline.forEach((p, i) => (i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1])))); c.closePath(); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.5)'; for (let k = 0; k < 3; k++) { const x = X(-3.2 + k * 1.7); c.beginPath(); c.moveTo(x + 34, Z(0)); c.lineTo(x - 18, Z(0) - 28); c.lineTo(x - 7, Z(0)); c.lineTo(x - 18, Z(0) + 28); c.closePath(); c.fill(); }   // (arrows pointing up the table)
    c.restore();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; disposables.push(tex);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 2 * W).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); art.position.set(0, 0.05, 0); disposables.push(art.geometry, art.material); group.add(art);
    const red = new THREE.MeshLambertMaterial({ color: '#bd5a3e' }), cream = new THREE.MeshLambertMaterial({ color: '#e8dcc6' }); disposables.push(red, cream);
    {                                                                              // the rails: planks like the mini-golf's border, in short pieces that follow the ground up the ramps (two instanced meshes, not hundreds)
      const pieces = [], eul = new THREE.Euler(0, 0, 0, 'YZX'), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), mm = new THREE.Matrix4();
      for (const [a, b] of frame.rails) {
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / 0.6));
        for (let i = 0; i < n; i++) {
          const x0_ = a.x + (dx * i) / n, z0_ = a.z + (dz * i) / n, x1_ = a.x + (dx * (i + 1)) / n, z1_ = a.z + (dz * (i + 1)) / n, h0 = hillH(hole, x0_, z0_), h1 = hillH(hole, x1_, z1_);
          pieces.push([(x0_ + x1_) / 2, (h0 + h1) / 2, (z0_ + z1_) / 2, Math.atan2(-dz, dx), Math.atan2(h1 - h0, L / n), L / n]);
        }
      }
      const plank = new THREE.InstancedMesh(G.box, M.rail, pieces.length), capm = new THREE.InstancedMesh(G.box, cream, pieces.length); plank.castShadow = true; plank.frustumCulled = capm.frustumCulled = false;
      pieces.forEach((p, i) => { eul.set(0, p[3], p[4]); q.setFromEuler(eul); plank.setMatrixAt(i, mm.compose(ps.set(p[0], p[1] + 0.25, p[2]), q, sc.set(p[5] + 0.06, 0.5, 0.3))); capm.setMatrixAt(i, mm.compose(ps.set(p[0], p[1] + 0.54, p[2]), q, sc.set(p[5] + 0.06, 0.08, 0.36))); });
      plank.instanceMatrix.needsUpdate = capm.instanceMatrix.needsUpdate = true; group.add(plank, capm); disposables.push(plank, capm);
    }
    { const rg = new THREE.RingGeometry(1.0, 1.12, 48).rotateX(-Math.PI / 2), rg2 = new THREE.RingGeometry(0.7, 0.8, 40).rotateX(-Math.PI / 2), wm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); disposables.push(rg, rg2, wm);
      for (const g of [rg, rg2]) { const m = new THREE.Mesh(g, wm); m.position.set(hole.cup.x, hillH(hole, hole.cup.x, hole.cup.z) + 0.07, hole.cup.z); group.add(m); } }          // (painted rings round the hole on the deck)
    for (const tr of frame.tris) {                                                     // slingshots: a red wedge with a cream top
      const sh = new THREE.Shape(tr.map((p) => new THREE.Vector2(p[0], -p[1]))), geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false }).rotateX(-Math.PI / 2), m = new THREE.Mesh(geo, red);
      m.scale.set(0.97, 1, 0.97); m.castShadow = true; disposables.push(geo); group.add(m); const top = new THREE.Mesh(geo, cream); top.scale.set(0.93, 0.04, 0.93); top.position.y = 0.52; group.add(top);
    }
    buildWall();
    const dr = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: '#07080b' })); dr.scale.set(1.2, 0.04, 3.4); dr.position.set(-9.0, 0.07, 0); group.add(dr);
  }
  // the wall round the play area: it stays put while the table leans, and rises towards the far end so it is still taller than the lifted table (the near end is low so it never hides the flippers)
  function buildWall() {
    wall = new THREE.Group(); wall.rotation.y = (SITE.k * Math.PI) / 4; wall.position.set(SITE.x, Y + 0.06, SITE.z); wall.scale.set(1, 0.001, 1); scene.add(wall);
    const O = 0.85, edge = [];
    for (let i = 0; i < hole.outline.length; i++) edge.push([hole.outline[i], hole.outline[(i + 1) % hole.outline.length]]);
    const cap = new THREE.MeshLambertMaterial({ color: '#e8dcc6' }); disposables.push(cap);
    const segs = edge.filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-3), stone = new THREE.InstancedMesh(G.box, M.stone, segs.length), tops = new THREE.InstancedMesh(G.box, cap, segs.length), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    segs.forEach(([a, b], i) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      let nx = dz / l, nz = -dx / l; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }        // (the outward side)
      const H = 1.1 + (mx - TABLE.x0) * 0.17, px = mx + nx * (O + 0.45), pz = mz + nz * (O + 0.45); q.setFromAxisAngle(up0, Math.atan2(-dz, dx));
      stone.setMatrixAt(i, mm.compose(ps.set(px, H / 2, pz), q, sc.set(l + 0.12, H, 0.9))); tops.setMatrixAt(i, mm.compose(ps.set(px, H + 0.07, pz), q, sc.set(l + 0.14, 0.14, 1.1)));
    });
    stone.castShadow = stone.receiveShadow = true; stone.frustumCulled = tops.frustumCulled = false; stone.instanceMatrix.needsUpdate = tops.instanceMatrix.needsUpdate = true; wall.add(stone, tops); disposables.push(stone, tops);
  }
  function disposeTable() {
    if (wall) { scene.remove(wall); wall = null; }
    for (const d of disposables.splice(0)) d.dispose?.();
    if (!group) return; scene.remove(group); vis.dispose(); ballMesh.material.dispose(); dots.dispose(); group = vis = hole = ball = ballMesh = dots = null; flips = []; flipMeshes = []; spin = spinMesh = coverMesh = coverRing = trailMesh = null; tgDown.clear(); trail.length = 0; slowK = 1;
  }

  // ---------- the camera: behind the ball while aiming a putt, high above the table while the ball is in play ----------
  const cam = { mix: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false }, behindP = { pos: new THREE.Vector3(), look: new THREE.Vector3() }, topP = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  function topPose(out) {
    const b = hole.bounds, c = toWorld(SITE, b.cx, b.cz), tan = Math.tan((camera.fov * Math.PI) / 360), pitch = 1.38;
    const dist = Math.max((b.hx * Math.sin(pitch) + 2.4) / tan, (b.hz + 1.6) / (tan * camera.aspect)) * 1.08;
    out.pos.set(c.x, Y + dist * Math.sin(pitch), c.z + dist * Math.cos(pitch) + 0.4); out.look.set(c.x, Y + 0.2, c.z + 0.2);
  }
  function behindPose(out) {                                 // behind the ball (down the table from it), looking up the table
    const b = toWorld(SITE, ball.x, ball.z), gy = Y + 0.06 + Math.max(0, hillH(hole, ball.x, ball.z));
    out.pos.set(b.x, gy + 5.2, b.z + 7); out.look.set(b.x, gy + 0.4, b.z - 6);
  }
  function camPose(out, dt) {
    const goTop = st.mode === 'play' || st.mode === 'sink';
    if (st.mode !== 'card') cam.mix += ((goTop ? 1 : 0) - cam.mix) * (1 - Math.exp(-dt * 3.4));
    behindPose(behindP); topPose(topP); const k = ease(clamp01(cam.mix));
    tmpV.lerpVectors(behindP.pos, topP.pos, k); const lk = out.look.lerpVectors(behindP.look, topP.look, k); out.pos.copy(tmpV);
    if (!cam.init) { cam.pos.copy(out.pos); cam.look.copy(lk); cam.init = true; } else { const f = 1 - Math.exp(-dt * 4.5); cam.pos.lerp(out.pos, f); cam.look.lerp(lk, f); }
    out.pos.copy(cam.pos); out.look.copy(cam.look);
  }

  // ---------- one ball ----------
  function teeBall() {                                      // a fresh ball on the tee, ready for the skill shot
    resetTargets(); ctx.capV = 13; ctx.fricK = 0.3; ctx.tilt = TILT; ballMesh.visible = true; ball = newBall(hole); ball.y = hillH(hole, ball.x, ball.z); ctx.t = 0; st.locked = null; st.nudges = 3; st.shotT = 99; st.skill = false; st.stuckT = 0; setSpots(false); place();
  }
  function place() {
    if (!ball) return; const y = hillH(hole, ball.x, ball.z) + 0.03; ballMesh.position.set(ball.x, (ball.air ? ball.y : y) + BALL_R, ball.z);
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
    if (e.button > 0 || e.target?.closest?.('.golf-quit, .golf-score, .pb-nudge, .pb-q, .pb-help')) return;
    if (e.target?.closest?.('.pb-flip')) { flipHeld = true; e.preventDefault(); return; }
    if (st.mode === 'aim') { drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; e.preventDefault(); }
    else if (st.mode === 'play') { flipHeld = true; e.preventDefault(); }
  };
  const onMove = (e) => { if (drag) { drag.x = e.clientX; drag.y = e.clientY; updateAim(); } };
  const onUp = () => {
    flipHeld = false; if (!drag) return; const d = drag; drag = null; updateAim(); if (st.mode !== 'aim') return;
    const a = aimInfo(d); if (a.power < 0.06) return;
    elHelp.hidden = true; const fromTee = !st.locked; if (fromTee) st.balls++;
    st.mode = 'play'; st.shotT = 0; st.skill = fromTee; st.locked = null; setSpots(true); shoot(ball, a.dx, a.dz, Math.pow(a.power, 1.05), false); audio?.golf?.('putt', a.power);
  };
  function nudge() {
    if (st.mode !== 'play' || st.nudges <= 0) return; st.nudges--; ball.vx += 2.4; ball.vz += (Math.random() - 0.5) * 2.4; ball.rest = false; shake = 0.28; audio?.golf?.('pbkick'); say(elToast, st.nudges ? `Nudge! ${st.nudges} left` : 'Nudge! none left', 800, 'toast');
  }
  const onKey = (e) => {
    if (e.code === 'Space') { flipHeld = e.type === 'keydown'; e.preventDefault(); }
    else if (e.key === 'Escape' && e.type === 'keydown') api.stop();
    else if ((e.key === 'n' || e.key === 'N' || e.key === 'Shift') && e.type === 'keydown' && !e.repeat) nudge();
  };
  btnFlip.addEventListener('pointerdown', (e) => { flipHeld = true; e.preventDefault(); e.stopPropagation(); }); btnFlip.addEventListener('pointerup', () => { flipHeld = false; }); btnFlip.addEventListener('pointerleave', () => { flipHeld = false; });
  elNudge.addEventListener('pointerdown', (e) => { nudge(); e.preventDefault(); e.stopPropagation(); });
  const noScroll = (e) => { if (st.mode !== 'off' && !e.target?.closest?.('.golf-quit, .golf-score')) e.preventDefault(); };
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('pointerdown', onDown, { passive: false }); window[f]('pointermove', onMove); window[f]('pointerup', onUp); window[f]('pointercancel', onUp); window[f]('keydown', onKey); window[f]('keyup', onKey);
    window[f]('touchmove', noScroll, { passive: false }); window[f]('touchstart', noScroll, { passive: false });
  }

  // ---------- showing what to do: floating labels on the things to hit, pulsing rings on the next target ----------
  function makeLabel(w, h) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
    const sp = new THREE.Sprite(mat); sp.scale.set(w, h, 1); sp.renderOrder = 20; disposables.push(tex, mat); group.add(sp); return { sp, cv, tex, key: '', w, h };
  }
  function setLabel(L, text, ok) {
    const key = `${text}|${ok}`; if (L.key === key) return; L.key = key; const c = L.cv.getContext('2d'); c.clearRect(0, 0, 256, 72);
    c.fillStyle = ok ? 'rgba(18,110,62,0.94)' : 'rgba(18,22,34,0.86)'; c.strokeStyle = ok ? '#8dffbc' : '#ffd23f'; c.lineWidth = 5; c.beginPath(); if (c.roundRect) c.roundRect(4, 4, 248, 64, 22); else c.rect(4, 4, 248, 64); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.font = '800 31px "Outfit", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 38); L.tex.needsUpdate = true;
  }
  function buildGuides(deckY) {
    const mk = (key, x, y, z, w, h) => { const L = makeLabel(w, h); L.sp.position.set(x, y, z); labels[key] = L; return L; }, tx = hole.targets.reduce((a, t) => a + t.x, 0) / hole.targets.length, tz = hole.targets.reduce((a, t) => a + t.z, 0) / hole.targets.length;
    labels = {}; mk('spin', hole.spinner.x, 1.9, hole.spinner.z, 2.5, 0.7); mk('tgt', tx - 0.2, 1.7, tz, 2.7, 0.7); mk('ramp', hole.lanes[0].pts[0][0] + 0.9, 2.1, 0, 2.2, 0.62); mk('cup', hole.cup.x, deckY + 2.2, hole.cup.z, 2.8, 0.7);
    hole.saucers.forEach((sp, i) => mk(`lock${i}`, sp.x, 1.25, sp.z, 1.3, 0.4));
    const rg = new THREE.RingGeometry(0.86, 1, 44).rotateX(-Math.PI / 2); disposables.push(rg); beacons = [];
    const add = (key, x, z, r) => { const mt = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); disposables.push(mt); const m = new THREE.Mesh(rg, mt); m.position.set(x, hillH(hole, x, z) + 0.09, z); m.scale.setScalar(r); group.add(m); beacons.push({ key, m, r }); };
    add('spin', hole.spinner.x, hole.spinner.z, 1.35); for (const t of hole.targets) add('tgt', t.x, t.z, 0.8);
    hole.lanes.forEach((L, i) => { if (i === 1) return; add('ramp', L.pts[0][0] + (i === 0 ? 0.3 : 0), L.pts[0][1], i === 0 ? 1.5 : 1.15); });
  }
  const nextLamp = () => LAMPS.find((k) => !st.lamps[k]) || null;
  function updateGuides(dt) {
    const pl = 0.5 + 0.5 * Math.sin(st.clock * 5 + 0.1), nx = nextLamp();
    const txt = { spin: [`SPIN ${Math.min(st.spins, SPIN_NEED)}/${SPIN_NEED}`, st.lamps.spin], tgt: [`TARGETS ${tgDown.size}/${hole.targets.length}`, st.lamps.tgt], ramp: ['RAMP ▲', st.lamps.ramp], cup: [st.open ? 'CUP OPEN' : 'CUP LOCKED', st.open] };
    for (const k of Object.keys(txt)) { const L = labels[k]; setLabel(L, st.lamps[k] && k !== 'cup' ? txt[k][0].replace(/ .*/, '') + ' ✓' : txt[k][0], txt[k][1]); const grow = !txt[k][1] && (k === nx || (k === 'cup' && st.open)) ? 0.12 * pl : 0.04 * pl; L.sp.scale.set(L.w * (1 + grow), L.h * (1 + grow), 1); }
    hole.saucers.forEach((_, i) => setLabel(labels[`lock${i}`], 'LOCK', false));
    for (const b of beacons) { const lit = st.lamps[b.key], on = !lit && st.mode !== 'card'; b.m.material.opacity += ((on ? (b.key === nx ? 0.55 + 0.4 * pl : 0.22 + 0.15 * pl) : 0) - b.m.material.opacity) * Math.min(1, dt * 8); b.m.scale.setScalar(b.r * (1 + 0.1 * pl)); b.m.visible = b.m.material.opacity > 0.02; b.m.material.color.set(b.key === nx ? '#ffffff' : '#ffd23f'); }
  }
  // ---------- the action: scoring with a combo, floating points, rings that flash where the ball hit ----------
  function resetTargets() { for (const t of tgDown) if (!hole.posts.includes(t)) hole.posts.push(t); tgDown.clear(); tgAll = 0; }
  function knockTarget(t) {
    hole.posts.splice(hole.posts.indexOf(t), 1); tgDown.add(t); addScore(200, t.x, t.z, 0.5); audio?.golf?.('pbbump', st.combo); shake = 0.1;
    if (tgDown.size === hole.targets.length) { tgAll = st.clock; lamp('tgt'); }
  }
  function updateTargets(dt) {
    if (tgAll && st.clock - tgAll > 5) resetTargets();
    hole.targets.forEach((t, i) => { const g = tgMeshes[i], want = tgDown.has(t) ? -0.9 : 0; g.position.y += (want - g.position.y) * Math.min(1, dt * 14); });
  }
  function lamp(k) {                                       // a lamp is lit for the rest of the hole; all three open the cup
    if (st.lamps[k]) return; st.lamps[k] = true; st.pts += 300; popup('+300', hole.cup.x - 2.2, 0, 4); audio?.golf?.('pickup'); say(elBanner, `${LAMP_TEXT[k]} LIT!`, 1400, 'banner'); showLamps(true); pulse(hole.cup.x, hole.cup.z, 1.2); shake = 0.12;
    if (LAMPS.every((l) => st.lamps[l]) && !st.open) openCup();
  }
  function openCup() {
    st.open = true; const i = hole.posts.indexOf(hole.cover); if (i >= 0) hole.posts.splice(i, 1); ctx.cupR = CUP_R * 1.8; ctx.homing = true; showLamps(true); flashScreen();
    say(elBanner, 'CUP OPEN! Sink it!', 2400, 'banner'); audio?.golf?.('win'); shake = 0.3; pulse(hole.cup.x, hole.cup.z, 1.6);
  }
  function updateCover(dt) {
    coverK += ((st.open ? 0 : 1) - coverK) * Math.min(1, dt * 5); coverMesh.visible = coverK > 0.02; coverMesh.scale.set(hole.cover.r * 1.05 * coverK, 0.12, hole.cover.r * 1.05 * coverK);
    const pl = 0.5 + 0.5 * Math.sin(st.clock * 6); coverRing.material.color.set(st.open ? '#7dffb0' : '#ff6a5f'); coverRing.material.opacity = (st.open ? 0.5 : 0.3) + 0.4 * pl * (st.open ? 1 : 0.6); coverRing.scale.setScalar(1 + 0.2 * pl);
  }
  function addScore(base, x, z, r) {
    st.combo = st.clock - st.lastHit < 2.2 ? Math.min(5, st.combo + 1) : 1; st.lastHit = st.clock;
    const pts = base * st.combo; st.pts += pts; pulse(x, z, r); popup(`+${pts}`, x, z, st.combo);
    if (st.combo >= 2) say(elToast, `Combo x${st.combo}!`, 900, 'toast');
  }
  function pulse(x, z, r) { const p = pulses.find((q) => q.t > 0.5) || pulses[0]; p.t = 0; p.r = r + 0.3; p.m.position.set(x, hillH(hole, x, z) + 0.75, z); p.m.visible = true; }
  function popup(text, x, z, combo) {
    const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight, v = group.localToWorld(new THREE.Vector3(x, 1.2, z)).project(camera);
    const el = document.createElement('div'); el.className = `pb-pop c${combo}`; el.textContent = text; el.style.left = `${(v.x * 0.5 + 0.5) * W}px`; el.style.top = `${(-v.y * 0.5 + 0.5) * H}px`; hud.appendChild(el); setTimeout(() => el.remove(), 900);
  }
  function updatePulses(dt) { for (const p of pulses) { if (p.t > 0.5) { p.m.visible = false; continue; } p.t += dt; const k = p.t / 0.5; p.m.scale.setScalar(p.r * (1 + 1.6 * k)); p.m.material.opacity = 0.9 * (1 - k); } }
  function setSpots(on) { spotTarget = on ? 1 : 0; }
  function updateSpots(dt) {
    spotShow += (spotTarget - spotShow) * (1 - Math.exp(-dt * 3)); const pl = 0.5 + 0.5 * Math.sin(st.clock * 6);
    for (const g of spotMeshes) { const u = g.userData; u.dm.color.setRGB(0.25 - 0.22 * spotShow, 0.6 - 0.56 * spotShow, 0.29 - 0.25 * spotShow); u.rm.opacity = 0.85 + 0.15 * spotShow; u.gm.opacity = spotShow * (0.35 + 0.5 * pl); u.gl.scale.setScalar(1 + 0.12 * pl * spotShow); u.gl.visible = spotShow > 0.02; }
  }
  function lockBall(sp) {                                  // the ball drops into a lock saucer: it is held, and the player gets an aimed putt out of it
    st.mode = 'lock'; st.sp = sp; sinkT = 0; ball.vx = ball.vz = 0; setSpots(false); pulse(sp.x, sp.z, 1.1); st.pts += 100; popup('+100', sp.x, sp.z, 3); audio?.golf?.('pickup'); shake = 0.1; say(elBanner, 'LOCKED! Aim your shot', 1800, 'banner');
  }
  function stepSpinner(h) {                                // the spinner: the ball turns it, it turns the ball away
    spin.a += spin.w * h; spin.arms.forEach((r) => { r.a = spin.a + r.o; r.w = spin.w; });
    const vx0 = ball.vx, vz0 = ball.vz; collideFlippers(ball, spin.arms);
    const dvx = ball.vx - vx0, dvz = ball.vz - vz0; if (dvx || dvz) { const rx = ball.x - hole.spinner.x, rz = ball.z - hole.spinner.z; spin.w += (rx * -dvz - rz * -dvx) * 2.2; spin.w = Math.max(-22, Math.min(22, spin.w)); }
    spin.w *= Math.exp(-0.35 * h);
    const turns = Math.floor(Math.abs(spin.a) / Math.PI); if (turns !== spin.turns) { spin.turns = turns; st.spins++; st.pts += 10; if (st.spins % 3 === 0) { popup('+30', hole.spinner.x, hole.spinner.z, 1); audio?.golf?.('pbbump', 1); } if (st.spins >= SPIN_NEED) lamp('spin'); }
  }
  // ---------- running ----------
  let lastHeld = false;
  function stepFlippers(h) { if (flipHeld !== lastHeld) { lastHeld = flipHeld; if (flipHeld) audio?.golf?.('pbflip'); } stepFlips(flips, flipHeld, h); flips.forEach((f, i) => { flipMeshes[i].rotation.y = -f.a; }); }
  function leanTable(dt) {                                  // the cup end rises, pivoting about the bottom edge: the table is seen to lean (and to shake when nudged)
    group.rotation.x = 0.115 + (shake > 0 ? (Math.random() - 0.5) * 0.02 * Math.min(1, shake * 4) : 0); group.position.set(SITE.x, Y + 0.06, SITE.z); group.updateMatrix();
    const t = toWorld(SITE, frame.bottom.x, frame.bottom.z), w = tmpV.set(frame.bottom.x, 0, frame.bottom.z).applyMatrix4(group.matrix); group.position.add(tmpV.set(t.x - w.x, Y + 0.06 - w.y, t.z - w.z));
  }
  function updateTrail(dt) {                                // a glowing trail behind a fast ball
    const sp = Math.hypot(ball.vx, ball.vz), live = st.mode === 'play' && sp > 2.5;
    if (live) { trail.unshift({ x: ball.x, y: (ball.air ? ball.y : hillH(hole, ball.x, ball.z)) + BALL_R, z: ball.z }); if (trail.length > TRAIL) trail.pop(); } else if (trail.length) trail.pop();
    trailMesh.count = trail.length; trail.forEach((p, i) => { const k = (1 - i / TRAIL) * Math.min(1, sp / 8); tmpS.setScalar(Math.max(0.01, BALL_R * 0.85 * k)); trailMesh.setMatrixAt(i, tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ, tmpS)); }); trailMesh.instanceMatrix.needsUpdate = true;
  }
  function confetti() {                                      // a burst of paper when the cup is sunk
    const cols = ['#ffd23f', '#e8594b', '#7dffb0', '#6ec8ff', '#ff8ad4'];
    for (let i = 0; i < 46; i++) { const el = document.createElement('i'); el.className = 'pb-conf'; const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 260; el.style.setProperty('--dx', `${Math.cos(a) * r}px`); el.style.setProperty('--dy', `${Math.sin(a) * r * 0.6 - 120}px`); el.style.background = cols[i % cols.length]; el.style.animationDelay = `${Math.random() * 0.15}s`; hud.appendChild(el); setTimeout(() => el.remove(), 1700); }
  }
  function flashScreen() { const el = document.createElement('div'); el.className = 'pb-flash'; hud.appendChild(el); setTimeout(() => el.remove(), 700); }
  function runBall(dt) {
    st.clock += dt; st.shotT += dt; const h = dt / SUB;
    for (let i = 0; i < SUB; i++) {
      stepFlippers(h); ctx.t += h; stepSpinner(h); stepBall(ball, hole, ctx, h, ev);
      const hard = collideFlippers(ball, flips); if (hard > 1.5) { st.flipT = st.clock; st.pts += 5; shake = 0.1; audio?.golf?.('wall', Math.min(1, hard / 12)); }
      if (ev.hr && ev.post > 2) {
        const tg = hole.targets.find((t) => t.x === ev.hx && t.z === ev.hz);
        if (tg) knockTarget(tg);
        else if (ev.hx === hole.cover.x && ev.hz === hole.cover.z) { audio?.golf?.('wall', 0.8); shake = 0.12; if (!st.open && st.clock - (st.coverSay || -9) > 4) { st.coverSay = st.clock; say(elBanner, 'CUP LOCKED: light RAMP, SPIN and TARGETS', 2600, 'banner'); } }
        else if (hole.bumpers.some((b) => b.x === ev.hx && b.z === ev.hz)) { addScore(100, ev.hx, ev.hz, ev.hr); shake = 0.16; audio?.golf?.('pbbump', st.combo); }
        else { addScore(25, ev.hx, ev.hz, ev.hr); audio?.golf?.('post', Math.min(1, ev.post / 12)); }
      }
      if (ev.kick) { addScore(20, ev.kx, ev.kz, 0.9); shake = 0.09; audio?.golf?.('pbkick'); }
      if (ev.wall > 1.5) audio?.golf?.('wall', Math.min(1, ev.wall / 12));
      if (ev.holed) { st.mode = 'sink'; sinkT = 0; return; }
      if (drained()) {
        if (st.shotT < SAVE_TIME && st.skill) { st.balls--; say(elBanner, 'BALL SAVED!', 1600, 'banner'); } else { say(elToast, 'Ball lost', 1400, 'toast'); }
        audio?.golf?.('pbdrain'); teeBall(); st.mode = 'aim'; return;
      }
    }
    if (!ball.air && ball.y > PLAT_H * 0.9 && !st.lamps.ramp) { lamp('ramp'); if (st.skill && st.shotT < 6) { st.pts += 500; popup('SKILL SHOT +500', hole.cup.x - 3, 0, 5); } }
    if (!ball.air && Math.hypot(ball.vx, ball.vz) < 7.5 && st.shotT > 0.6) { for (const sp of spots) if (Math.hypot(ball.x - sp.x, ball.z - sp.z) < 0.45) { lockBall(sp); return; } }
    if (ball.rest) { st.stuckT += dt; if (st.stuckT > 1.2) { st.stuckT = 0; ball.rest = false; ball.still = 0; ball.dawdle = 0; ball.vx += 3; ball.vz += (Math.random() - 0.5) * 2; } } else st.stuckT = 0;       // (a ball that comes to rest in play is knocked on)
  }
  function finish() {
    const bonus = st.balls <= 1 ? 1500 : st.balls === 2 ? 800 : st.balls === 3 ? 400 : 150, total = st.pts + bonus, stars = st.balls <= 2 ? 3 : st.balls <= 4 ? 2 : 1;
    st.mode = 'card'; elScore.innerHTML = `<h2>${st.balls === 1 ? 'Hole in one ball!' : 'Cup sunk!'}</h2><p class="golf-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p><p class="golf-total">${total} points <small>${st.balls} ball${st.balls === 1 ? '' : 's'} · ${bonus} for the hole · ${st.pts} from the table</small></p><div class="golf-btns"><button type="button" data-a="again">Play again</button><button type="button" data-a="leave">Leave</button></div>`;
    elScore.hidden = false; audio?.golf?.('win'); confetti();
  }
  elScore.addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.a; if (a === 'again') { elScore.hidden = true; resetHole(); } else if (a === 'leave') api.stop(); });
  function resetHole() { Object.assign(st, { balls: 0, pts: 0, combo: 0, lastHit: -99, spins: 0, lamps: {}, open: false }); spin.w = 0; spin.turns = 0; if (!hole.posts.includes(hole.cover)) hole.posts.push(hole.cover); ctx.cupR = 0; ctx.homing = false; ballMesh.visible = true; ballMesh.scale.setScalar(1); teeBall(); showLamps(); st.mode = 'aim'; }
  function updateHud() {
    elPar.textContent = `Par ${hole.par}`; elStrokes.textContent = `${st.balls === 1 ? 'Ball 1' : `Ball ${Math.max(1, st.balls)}`} · ${st.pts} pts`;
    elNudge.textContent = `NUDGE ${st.nudges}`; elNudge.disabled = st.mode !== 'play' || st.nudges <= 0;
    const nx = nextLamp(), chip = (k) => elLamps.querySelector(`[data-l="${k}"]`), set = (k, t) => { const sm = chip(k).querySelector('small'); if (sm.textContent !== t) sm.textContent = t; };
    set('ramp', st.lamps.ramp ? 'done' : 'roll up a ramp'); set('spin', st.lamps.spin ? 'done' : `hit the spinner ${Math.min(st.spins, SPIN_NEED)}/${SPIN_NEED}`); set('tgt', st.lamps.tgt ? 'done' : `knock down ${tgDown.size}/${hole.targets.length}`); set('cup', st.open ? 'sink it!' : 'locked');
    for (const k of LAMPS) chip(k).classList.toggle('next', k === nx); chip('cup').classList.toggle('next', st.open);
    const goal = st.open ? '◎ The cup is OPEN: send the ball up the middle ramp' : nx === 'spin' ? `◎ Hit the yellow SPINNER (${Math.min(st.spins, SPIN_NEED)}/${SPIN_NEED})` : nx === 'tgt' ? '◎ Knock down both red TARGETS' : nx === 'ramp' ? '◎ Roll the ball up a RAMP to the top deck' : '';
    elMsg.textContent = st.mode === 'aim' ? (st.locked ? '◎ Locked! Aim your putt out (drag back)' : st.balls === 0 ? '◎ Skill shot: drag back and let go to putt up the table' : '◎ Drag back and let go to putt') : st.mode === 'play' ? goal : '';
  }

  const api = {
    get active() { return st.mode !== 'off'; },
    get focusDistance() { return 24; },
    onQuit: null,
    get debug() { return { st, hole, ball, ctx, flips, spin, lamp, openCup }; },
    start(homeCam) {
      if (st.mode !== 'off') return;
      home.pos.copy(homeCam.pos); home.look.copy(homeCam.look); from.pos.copy(homeCam.pos); from.look.copy(homeCam.look);
      Object.assign(st, { mode: 'enter', t: 0, balls: 0, pts: 0, clock: 0, flipT: -99, combo: 0, lastHit: -99, spins: 0, lamps: {}, open: false }); flipHeld = false;
      setBoards(false); buildTable(); teeBall(); showLamps(); cam.mix = 0; cam.init = false; camPose(want, 0.016);
      document.body.classList.add('game-mode'); hud.hidden = false; elScore.hidden = true; elHelp.hidden = true; listen(true); audio?.zoom?.('in', 1.7);
      say(elBanner, `Pinball Golf · ${st.layout}`, 2600, 'banner');
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
        group.scale.y = Math.max(0.001, 1 - k); wall.scale.y = group.scale.y; world.carve.set(1 - k, 0);
        if (k >= 1) {
          disposeTable(); world.carve.end(); setBoards(true); document.body.classList.remove('game-mode'); hud.hidden = true; hud.classList.remove('leaving'); listen(false); st.mode = 'off'; this.onQuit?.();
        }
        return true;
      }
      if (st.mode === 'enter') cam.init = false;
      camPose(want, dt);
      if (st.mode === 'enter') {
        const k = reduceMotion ? 1 : ease(clamp01(st.t / 2.0)); camera.position.lerpVectors(from.pos, want.pos, k); tmpV.lerpVectors(from.look, want.look, k); camera.up.copy(up0); camera.lookAt(tmpV);
        const r = reduceMotion ? 1 : ease(clamp01((st.t - 0.3) / 1.2)); group.scale.y = Math.max(0.001, r); wall.scale.y = group.scale.y; world.carve.set(r, 0); leanTable(dt);
        if (st.t >= 2.1 || reduceMotion) { group.scale.y = wall.scale.y = 1; world.carve.set(1, 0); st.mode = 'aim'; elHelp.hidden = false; }
        return true;
      }
      camera.position.copy(want.pos); if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * 0.5 * Math.min(0.4, shake + 0.1); camera.position.y += (Math.random() - 0.5) * 0.5 * Math.min(0.4, shake + 0.1); } camera.up.copy(up0); camera.lookAt(want.look);
      leanTable(dt);
      const toCup = st.mode === 'play' && st.open && ball.y > PLAT_H * 0.8 && Math.hypot(hole.cup.x - ball.x, hole.cup.z - ball.z) < 2.0 && Math.hypot(ball.vx, ball.vz) > 4 && (ball.vx * (hole.cup.x - ball.x) + ball.vz * (hole.cup.z - ball.z)) > 0;        // (slow motion as a ball heads for the open cup)
      slowK += ((toCup ? 0.5 : 1) - slowK) * (1 - Math.exp(-dt * 12));
      if (st.mode === 'play') runBall(dt * slowK);
      else if (st.mode === 'aim') { ctx.t += dt; stepFlippers(dt); stepSpinner(dt); }
      else if (st.mode === 'sink') {
        ctx.t += dt; sinkT += dt; const s = clamp01(sinkT / 0.55); ballMesh.scale.setScalar(1 - 0.7 * s); ballMesh.position.set(hole.cup.x, hillH(hole, hole.cup.x, hole.cup.z) + 0.2 - 1.2 * s + BALL_R * (1 - s), hole.cup.z); stepFlippers(dt);
        if (s >= 1) { ballMesh.visible = false; finish(); }
      } else if (st.mode === 'lock') {
        ctx.t += dt; sinkT += dt; const s = clamp01(sinkT / 0.65), sp = st.sp, down = s < 0.45 ? s / 0.45 : 1 - (s - 0.45) / 0.55;
        ballMesh.scale.setScalar(1 - 0.85 * down); ballMesh.position.set(sp.x, hillH(hole, sp.x, sp.z) + 0.03 + BALL_R * (1 - 0.85 * down) - 0.5 * down, sp.z); stepFlippers(dt);
        if (s >= 1) { ball.x = sp.x; ball.z = sp.z; ball.vx = ball.vz = 0; ball.rest = true; ball.still = 0; ball.air = false; ball.y = hillH(hole, sp.x, sp.z); st.locked = sp; st.mode = 'aim'; ballMesh.scale.setScalar(1); }
      } else stepFlippers(dt);
      if (st.mode !== 'sink' && st.mode !== 'card' && st.mode !== 'lock') { place(); ballMesh.scale.setScalar(1); const sp = Math.hypot(ball.vx, ball.vz); if (sp > 0.05) { tmpV.set(-ball.vz, 0, ball.vx).normalize(); ballMesh.rotateOnWorldAxis(tmpV, (sp * dt) / BALL_R); } }
      updateTrail(dt); spinMesh.rotation.y = -spin.a; vis.update(ctx.t, ctx.t, dt, st); updatePulses(dt); updateTargets(dt); updateSpots(dt); updateCover(dt); updateGuides(dt); updateHud();
      return true;
    },
  };
  return api;
}
