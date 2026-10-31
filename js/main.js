// Wires everything together: renderer, camera stops, navigation, time-of-day,
// simple-view toggle. The page works as plain HTML if anything here fails.
import { initQuality, isLow, saveQuality } from './golfquality.js?v=20261030232841';
import { courseMonth, monthLabel, setRandomCourse, randomCourseCode, newRandomCode } from './monthseed.js?v=20261030232841';
import * as THREE from 'three';
import { createPrecip } from './precip.js?v=20261030232841';
import { createWeather } from './weather.js?v=20261030232841';
import { PAL } from './palette.js?v=20261030232841';
import { buildWorld } from './world.js?v=20261030232841';
import { createSky } from './sky.js?v=20261030232841';
import { createDOF } from './dof.js?v=20261030232841';
import { createRide } from './ride.js?v=20261030232841';
import { createGame } from './bikegame.js?v=20261030232841';
import { createAurora, setWarm } from './aurora.js?v=20261030232841';
import { createAudio, pickFlicker } from './audio.js?v=20261030232841';

const body = document.body;
const canvas = document.getElementById('scene');
const skyCanvas = document.getElementById('sky');
const live = document.getElementById('live');
const nav = document.getElementById('stopnav');
// The town palette becomes CSS variables (--pal-cream, --pal-coral ...), so the stylesheet and the 3D scene share colours.
for (const [k, v] of Object.entries(PAL)) document.documentElement.style.setProperty('--pal-' + k, v);
// The big name: split into letters so they can rise in one after another (on load, and when returning to the overview).
const nameEl = document.querySelector('.hero h1');
if (nameEl && !nameEl.querySelector('.ch')) {
  const txt = nameEl.textContent.trim();
  nameEl.setAttribute('aria-label', txt);
  nameEl.innerHTML = [...txt].map((ch, i) => `<span class="ch" aria-hidden="true" style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
}
function riseName() {
  if (!nameEl) return;
  nameEl.classList.remove('rise'); void nameEl.offsetWidth; nameEl.classList.add('rise');
}
riseName();
/** Slides the gold marker behind the current tab (and keeps that tab in view when the pill scrolls on phones). */
function placeNavMarker() {
  const cur = nav.querySelector('a[aria-current="page"]') || nav.querySelector('a');
  if (!cur) return;
  nav.style.setProperty('--ind-x', cur.offsetLeft + 'px');
  nav.style.setProperty('--ind-w', cur.offsetWidth + 'px');
  if (nav.scrollWidth > nav.clientWidth) cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
window.addEventListener('resize', placeNavMarker);
if (window.ResizeObserver) { const ro = new ResizeObserver(placeNavMarker); nav.querySelectorAll('a').forEach((a) => ro.observe(a)); }
document.fonts?.ready.then(placeNavMarker);
const controls = document.getElementById('controls');
const timeInput = document.getElementById('time');
const timeLabel = document.getElementById('time-label');
const simpleBtn = document.getElementById('simple-toggle');
const tagline = document.getElementById('tagline');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ORDER = ['home', 'creativity', 'ai', 'about'];

/** Lift the start-up splash (see index.html / the #boot rules in styles.css): fade it out, then let the page show. */
let bootLifted = false;
function hideBoot() {
  const d = document.documentElement; if (bootLifted || !d.classList.contains('boot')) return; bootLifted = true;
  document.getElementById('boot')?.classList.add('done');
  setTimeout(() => d.classList.remove('boot'), 600);
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode etc. */ } },
};

// ---- Section data comes straight from the HTML (single source of truth) ----
const sections = {};
document.querySelectorAll('.stop').forEach((el) => {
  sections[el.dataset.stop] = { el, title: el.dataset.title, teaser: el.dataset.teaser };
});

// Demo videos have no controls: they play on their own while on screen. With reduced motion (or no IntersectionObserver) they never
// auto-play, so they get controls instead.
{
  const vids = [...document.querySelectorAll('video.app-video')];
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.5) e.target.play().catch(() => {});
        else e.target.pause();
      }
    }, { threshold: [0, 0.5, 1] });
    vids.forEach((v) => io.observe(v));
  } else {
    vids.forEach((v) => { v.controls = true; });
  }
}

// Skill chips: tap, click or press Enter to open the short note about how I use the tool; one note per group at a time.
document.querySelectorAll('.about-skills .chips').forEach((list) => {
  list.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const open = chip.getAttribute('aria-expanded') === 'true';
    list.querySelectorAll('.chip').forEach((b) => {
      b.setAttribute('aria-expanded', 'false');
      document.getElementById(b.getAttribute('aria-controls')).hidden = true;
    });
    if (!open) {
      chip.setAttribute('aria-expanded', 'true');
      document.getElementById(chip.getAttribute('aria-controls')).hidden = false;
    }
  });
});

// Image viewer: any picture inside a section (except the little app icons) opens full screen on click, tap, Enter or Space.
// Click anywhere, the close button or Esc dismisses it, and focus goes back to the picture.
{
  const box = document.getElementById('lightbox');
  const big = box?.querySelector('img');
  const cap = box?.querySelector('figcaption');
  const sel = '.stop img:not(.app-icon):not(.inline-icon)';
  let from = null;
  const open = (img) => {
    from = img;
    big.src = img.currentSrc || img.src;
    big.alt = img.alt;
    cap.textContent = img.closest('figure')?.querySelector('figcaption')?.textContent || '';
    box.showModal();
  };
  if (box && typeof box.showModal === 'function') {
    document.querySelectorAll(sel).forEach((img) => {
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'View full size: ' + (img.alt || 'image'));
    });
    document.addEventListener('click', (e) => { const img = e.target.closest?.(sel); if (img) open(img); });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.(sel)) { e.preventDefault(); open(e.target); }
    });
    box.addEventListener('click', () => box.close());
    box.addEventListener('keydown', (e) => e.stopPropagation());       // the arrow keys must not move the camera behind the viewer
    box.addEventListener('close', () => { big.removeAttribute('src'); from?.focus({ preventScroll: true }); from = null; });
  }
}

// Each section is a labelled region (screen readers announce its heading).
document.querySelectorAll('.stop').forEach((el) => {
  const h2 = el.querySelector('h2');
  if (h2) { h2.id = h2.id || el.id + '-title'; el.setAttribute('role', 'region'); el.setAttribute('aria-labelledby', h2.id); }
});

// ---- Renderer (fall back to the plain page if WebGL isn't available) ----
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  console.warn('WebGL unavailable, staying in simple view.', err);
}

if (renderer) start(); else hideBoot(); // otherwise the plain HTML page is all there is

function start() {
  // Pixels drawn are capped (see pixelRatioFor): a big window on a 2x display would otherwise be 8+ megapixels.
  renderer.setClearColor(0x000000, 0); // transparent: CSS sky + title show through
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The sun barely moves, so the shadow map is refreshed a few times a second instead of every frame
  // (see frame()); the DOF pass's second render never re-renders it either.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.info.autoReset = false;                 // several renders per frame: reset once, in draw()
  const perf = { cpu: 0, fps: 60 };
  // ?perf=1 profiler: a ring of the last ~2.5 s of real frame times, where the CPU time goes, and how often the shadow map was redrawn
  const prof = { ft: new Float32Array(150), n: 0, shadow: 0, sec: { time: 0, game: 0, world: 0 } };
  const secT = (k, t0) => { prof.sec[k] += (performance.now() - t0 - prof.sec[k]) * 0.1; };
  let shadowTick = 0;

  // Weaker machines get fewer real lights (each one costs every pixel).
  const forced = new URLSearchParams(location.search).get('detail'); // ?detail=high|low, handy for testing
  const lowEnd = forced ? forced === 'low' : (navigator.hardwareConcurrency || 4) <= 4 || matchMedia('(max-width: 700px)').matches;
  initQuality(lowEnd);                                                                        // (how much detail the golf games are drawn with: the device's default, or the saved choice from the windmill menu)

  // Two layers so the sun, moon, stars and clouds sit *behind* the big title while the
  // hills stay in front of it: #sky (below the text) and #scene (above the text).
  const skyRenderer = new THREE.WebGLRenderer({ canvas: skyCanvas, antialias: true, alpha: true });
  skyRenderer.setClearColor(0x000000, 0);
  skyRenderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const skyScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);
  camera.layers.enable(1); // billboards live on layer 1 (see dof.js)
  const classic = new URLSearchParams(location.search).get('look') === 'classic'; // A/B: the original look
  const sky = createSky(scene, skyScene, renderer, { classic });
  const weather = createWeather({ calm: matchMedia('(prefers-reduced-motion: reduce)').matches });
  const precip = createPrecip({ low: lowEnd }); scene.add(precip.group);
  // ?seed=NN pins the village's look; otherwise every visit gets a new one.
  const seedParam = parseInt(new URLSearchParams(location.search).get('seed'), 10);
  const seed = Number.isFinite(seedParam) ? seedParam >>> 0 : Math.floor(Math.random() * 1e6);
  const aurora = createAurora(skyScene, camera, { low: lowEnd, scene });
  const zoomCam = new THREE.PerspectiveCamera(), zoomPos = new THREE.Vector3(), zoomV = new THREE.Vector3(), zoomLook = new THREE.Vector3();
  /** Would all three billboards still be wholly on screen with the camera at `pos` (looking at `look`)? `margin`: how close to the screen edge they may come (1 = the very edge). */
  function boardsInView(pos, margin, lk = look) {
    zoomCam.fov = camera.fov; zoomCam.aspect = camera.aspect; zoomCam.near = camera.near; zoomCam.far = camera.far; zoomCam.position.copy(pos); zoomCam.lookAt(lk);
    zoomCam.updateProjectionMatrix(); zoomCam.updateMatrixWorld(true);
    for (const b of world.boards) {
      b.face.updateWorldMatrix(true, false);
      for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) { zoomV.set(sx, sy, 0); b.face.localToWorld(zoomV); zoomV.project(zoomCam); if (Math.abs(zoomV.x) > margin || Math.abs(zoomV.y) > margin) return false; }
    }
    return true;
  }
  const songNotes = { rh: [0, 0, 0], lh: [0, 0, 0], lhN: 0, lhZone: 0, lhVel: 0, recent: [], pe: new Float32Array(128), clN: 0, clDur: 0, clPitch: 0, clVel: 0, st: 0, sweep: 0, chord: -1, root: 0, minor: 0 };       // (the notes sounding in the song now, from its MIDI)
  const spec = { bass: 0, mid: 0, treble: 0, energy: 0, centroid: 0, beat: 0 };
  const world = buildWorld(scene, sections, { maxLights: lowEnd ? 4 : 9, skyScene, low: lowEnd, seed, classic });
  console.info(`Village seed ${seed} (${world.themeName}); add ?seed=${seed} to the URL to keep it.`);
  const dof = reduceMotion ? null : createDOF(renderer, { half: lowEnd, classic }); // soft focus is skipped for reduced motion
  let focus = 60;
  // Easter egg: a dirt bike now and then rides across the hills (?bike=1 sends one straight away and keeps them coming).
  const bikeForce = /[?&]bike=1\b/.test(location.search);
  const ride = reduceMotion ? null : createRide(scene, world, camera, { force: bikeForce, renderer });
  const bikeBtn = document.getElementById('bike-play'), bikeHint = document.getElementById('bike-hint');
  const audio = createAudio();                       // one sound system for the landscape and the game (silent until the player turns it on)
  const game = reduceMotion || !dof ? null : createGame(scene, camera, renderer, world, { audio });
  if (game) game.compileHook = (sc, cam) => dof.compileAsync(sc, cam);        // (programs for the offscreen target the scene is drawn into)

  // ---- Camera stops ----
  const HOME = { pos: new THREE.Vector3(0, 7, 22), look: new THREE.Vector3(0, 17, -40) };
  const stops = { home: HOME };
  const tmpCam = new THREE.PerspectiveCamera();

  /** Park each stop's camera square-on, close enough that the sign fills the screen. */
  function layoutStops() {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (const b of world.boards) {
      const distV = (b.height / 2) / (tanHalf * 0.8);                  // sign takes ~80% of the height
      const distH = (b.width / 2) / (tanHalf * camera.aspect * 0.95);  // or ~95% of the width
      stops[b.id] = {
        pos: b.center.clone().addScaledVector(b.normal, Math.max(distV, distH)),
        look: b.center.clone(),
      };
    }
  }

  const cur = { pos: HOME.pos.clone(), look: HOME.look.clone() };
  let tween = null;
  let active = 'home';
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let parallax = 1; // 1 on the overview, 0 when zoomed in
  let heroName = 0, heroTag = 0; // current opacity of the big name and the tagline
  const heroEl = document.querySelector('.hero h1');

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const boardOf = (id) => world.boards.find((b) => b.id === id);
  const lerpLayout = (a, b, k) => {
    const ab = a.bar ?? 0.0694 * a.h, bb = b.bar ?? 0.0694 * b.h;
    return {
      w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k,
      ox: a.ox + (b.ox - a.ox) * k, oy: a.oy + (b.oy - a.oy) * k,
      bar: ab + (bb - ab) * k,
    };
  };

  /** Lay a section's text exactly over the sign face (found by projecting its corners). */
  function placeOnBoard(id) {
    const b = boardOf(id), st = stops[id], el = sections[id]?.el;
    if (!b || !st || !el) return;
    tmpCam.fov = camera.fov; tmpCam.aspect = camera.aspect; tmpCam.near = camera.near; tmpCam.far = camera.far;
    tmpCam.position.copy(st.pos); tmpCam.lookAt(st.look);
    tmpCam.updateProjectionMatrix(); tmpCam.updateMatrixWorld(true);
    b.face.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) {
      v.set(sx, sy, 0);
      b.face.localToWorld(v);
      v.project(tmpCam);
      const px = (v.x * 0.5 + 0.5) * VW(), py = (-v.y * 0.5 + 0.5) * VH();
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const fw = x1 - x0, fh = y1 - y0;
    const barPx = Math.min(fh * 0.5, (b.layout.bar / b.layout.h) * fh);
    const fy0 = y0;                                                                 // (the face runs a little past the screen edges: keep the text on screen)
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(VW(), x1); y1 = Math.min(VH(), y1);
    const w = x1 - x0, h = y1 - y0, barVis = Math.max(0, fy0 + barPx - y0);
    // The scrolling text starts *below* the coloured bar, so it slides underneath it...
    el.style.left = x0 + 'px'; el.style.top = (y0 + barVis) + 'px';
    el.style.width = w + 'px'; el.style.height = (h - barVis) + 'px';
    el.style.fontSize = Math.min(24, Math.max(15, w / 52)) + 'px';
    // ...and the back link is pinned inside the bar.
    const back = el.querySelector('.back');
    if (back) {
      back.style.position = 'fixed';
      back.style.left = (x0 + Math.max(10, w * 0.025)) + 'px';
      back.style.top = (y0 + barVis / 2) + 'px';
      back.style.transform = 'translateY(-50%)';
      back.style.margin = '0';
      back.style.zIndex = '2';
    }
  }

  /** Where an open sign ends up: stretched past every edge of the screen, so only its face shows (no frame, posts or scenery). */
  function fitLayout(b) {
    const vw = VW(), vh = VH();
    const BLEED = 6;                                                                // px beyond each edge: the rim, lamps and posts all end up off screen
    const st = stops[b.id];
    const dist = st.pos.distanceTo(st.look);
    const upp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / vh; // world units per CSS px
    const hPx = vh + 2 * BLEED;
    const barPx = Math.min(78, Math.max(68, hPx * 0.0694)) + BLEED;                 // tall enough to hold a 56px back button with air (the bleed hides the top few px)
    return { w: (vw + 2 * BLEED) * upp, h: hPx * upp, ox: 0, oy: 0, bar: barPx * upp };
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let morph = null;   // the sign currently changing size
  let openId = null;  // billboard whose content is open (or opening)
  let navToken = 0;   // bumps on every navigation so stale transitions stop themselves

  function morphBoard(b, to, dur) {
    morph?.resolve();
    if (!dur || reduceMotion) { morph = null; b.setLayout(to); return Promise.resolve(); }
    return new Promise((resolve) => { morph = { b, from: { ...b.layout }, to, t: 0, dur, resolve }; });
  }

  function flyTo(target, quick) {
    tween?.done();
    if (!quick) audio.zoom(target === stops.home ? 'out' : cur.pos.distanceTo(stops.home.pos) < 2 ? 'in' : 'across', 1.6);
    if (quick) { cur.pos.copy(target.pos); cur.look.copy(target.look); tween = null; return Promise.resolve(); }
    return new Promise((resolve) => {
      tween = { fromP: cur.pos.clone(), fromL: cur.look.clone(), to: target, t: 0, dur: 1.6, done: resolve };
    });
  }

  function showText(id) {
    const el = sections[id].el;
    Object.values(sections).forEach((s) => { if (s.el !== el) s.el.classList.remove('is-open', 'is-shown'); });
    placeOnBoard(id);
    el.scrollTop = 0;
    el.classList.add('is-open');
    requestAnimationFrame(() => el.classList.add('is-shown'));
    el.querySelector('h2')?.focus({ preventScroll: true });
  }

  async function hideText(id, quick) {
    const el = sections[id]?.el;
    if (!el) return;
    el.classList.remove('is-shown');
    if (!quick) await wait(150);
    el.classList.remove('is-open');
  }

  /**
   * Navigate. Sequence: fade the open text out -> the sign shrinks back to its original size ->
   * the camera flies -> the new sign stretches to fit -> its text fades in.
   * A newer call cancels an older one at its next step (navToken).
   */
  async function goTo(id, { instant = false, silent = false, record = true } = {}) {
    if (!stops[id]) id = 'home';
    if (id === openId && !instant && !tween && !morph) return; // already here
    const token = ++navToken;
    const quick = instant || reduceMotion;
    active = id;
    body.dataset.stop = id;
    body.classList.remove('sign-full');                                              // (the edge-to-edge look waits until the sign has filled the screen)
    // The top controls leave as soon as we start heading to a sign (the zoom), and return when
    // we head back to the overview. The open sign then gets the full height.
    body.classList.toggle('sign-open', id !== 'home');
    nav.querySelectorAll('a').forEach((a) => {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    placeNavMarker();
    if (id === 'home') riseName();
    if (!silent) live.textContent = id === 'home' ? 'Back to the landscape overview' : `Opened: ${sections[id].title}`;
    if (record && location.hash !== '#' + id) history.pushState(null, '', '#' + id); // Back button closes a sign

    // 1. Close whatever is open.
    if (openId) {
      const prev = openId, b = boardOf(prev);
      const hadFocus = sections[prev]?.el.contains(document.activeElement);
      await hideText(prev, quick);
      if (token !== navToken) return;
      await morphBoard(b, { w: b.width, h: b.height, ox: 0, oy: 0 }, quick ? 0 : 0.4);
      if (token !== navToken) return;
      b.setOpen(false);
      openId = null;
      if (hadFocus) nav.querySelector(`a[href="#${id}"]`)?.focus();
    }

    // 2. Fly the camera. (The name and tagline fade with this flight; see the frame loop.)
    await flyTo(stops[id], quick);
    if (token !== navToken) return;

    // 3. Open the new sign: stretch to fit, then show its text.
    if (id !== 'home') {
      const b = boardOf(id);
      openId = id;
      b.setOpen(true);
      await morphBoard(b, fitLayout(b), quick ? 0 : 0.45);
      if (token !== navToken) return;
      document.documentElement.style.setProperty('--sign-accent', b.accent || '#fff');
      body.classList.add('sign-full');
      showText(id);
    }
  }

  // ---- Simple view toggle ----
  let simple = false;
  function setSimple(on) {
    simple = on;
    body.classList.toggle('scene-mode', !on);
    simpleBtn.setAttribute('aria-pressed', String(on));
    simpleBtn.textContent = on ? 'Back to the landscape' : 'Simple view';
    store.set('simple', on ? '1' : '0');
    Object.values(sections).forEach((s) => s.el.classList.remove('is-open', 'is-shown'));
    body.classList.remove('sign-open');
    if (on) { heroEl.style.opacity = ''; tagline.style.opacity = ''; }
    if (openId) { const b = boardOf(openId); b.setLayout({ w: b.width, h: b.height, ox: 0, oy: 0 }); b.setOpen(false); openId = null; }
    if (!on) { onResize(); goTo(active, { instant: true, silent: true, record: false }); }
  }

  // ---- Sizing ----
  // The scene is drawn to the LARGE viewport (100lvh): on phones the browser's bottom toolbar floats over the
  // page, and a canvas sized to the small viewport would leave a band of plain background underneath it.
  // UI that must stay clear of the toolbar (the nav, an open sign) still uses window.innerHeight.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const VW = () => probe.offsetWidth || window.innerWidth;
  const VH = () => probe.offsetHeight || window.innerHeight;
  // ?debug=1 shows a small readout of the viewport numbers (for diagnosing mobile browser toolbars).
  if (/[?&](debug|perf)\b/.test(location.search)) {
    const mk = (u) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;top:0;width:1px;height:100${u};visibility:hidden;pointer-events:none`; document.body.appendChild(d); return d; };
    const probes = { svh: mk('svh'), dvh: mk('dvh'), lvh: mk('lvh'), vh: mk('vh') };
    const out = document.createElement('pre');
    out.style.cssText = 'position:fixed;left:6px;top:150px;z-index:9999;margin:0;padding:8px;background:rgba(0,0,0,.78);color:#7CFC9A;font:11px/1.35 ui-monospace,Menlo,monospace;border-radius:8px;pointer-events:none;white-space:pre-wrap;max-width:92vw';
    document.body.appendChild(out);
    const css = [...document.styleSheets].map((x) => (x.href || '').split('/').pop()).filter(Boolean).join(',');
    let lastSh = 0, lastShT = performance.now(), shadowPS = 0;
    const tick = () => {
      const m = Math.min(prof.n, prof.ft.length), a = Array.from(prof.ft.slice(0, m)).sort((x, y) => x - y);
      const fa = m ? a.reduce((x, y) => x + y, 0) / m : 16.7, p95 = m ? a[Math.floor(m * 0.95)] : 0, worst = m ? a[m - 1] : 0, longN = a.filter((v) => v > 20).length;
      const nowT = performance.now(); shadowPS = ((prof.shadow - lastSh) * 1000) / Math.max(1, nowT - lastShT); lastSh = prof.shadow; lastShT = nowT;
      const cv = canvas.getBoundingClientRect(), sk = skyCanvas.getBoundingClientRect(), nv = nav.getBoundingClientRect();
      const vv = window.visualViewport;
      out.textContent = [
        `inner ${innerWidth}x${innerHeight}  screen ${screen.width}x${screen.height}  dpr ${devicePixelRatio}`,
        `visualViewport ${vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' top ' + Math.round(vv.offsetTop) : 'n/a'}`,
        `svh ${probes.svh.offsetHeight}  dvh ${probes.dvh.offsetHeight}  lvh ${probes.lvh.offsetHeight}  vh ${probes.vh.offsetHeight}`,
        `probe(VH) ${VH()}  buffer ${canvas.width}x${canvas.height}`,
        `scene css ${Math.round(cv.top)}..${Math.round(cv.bottom)}  sky ${Math.round(sk.top)}..${Math.round(sk.bottom)}`,
        `nav ${Math.round(nv.top)}..${Math.round(nv.bottom)}`,
        `html ${document.documentElement.clientHeight}  body ${document.body.clientHeight}  scrollY ${Math.round(scrollY)}`,
        `frame ${fa.toFixed(1)}ms avg  p95 ${p95.toFixed(1)}  worst ${worst.toFixed(1)}  (${(1000 / fa).toFixed(0)} fps)   long(>20ms) ${longN}/${m}`,
        `track(max): ${game?.active ? Object.entries(game.track.profile).map(([k, v]) => k + ' ' + v.toFixed(1)).join('  ') : 'game off'}`,
        `cpu: time ${prof.sec.time.toFixed(2)}  game ${prof.sec.game.toFixed(2)}  world ${prof.sec.world.toFixed(2)}  draw ${perf.cpu.toFixed(2)}ms   shadow redraws ${shadowPS.toFixed(1)}/s   scale ${quality.scale.toFixed(2)}x${dyn.scale.toFixed(2)}  ratio ${renderer.getPixelRatio().toFixed(2)}`,
        `perf ${perf.fps.toFixed(0)}fps  cpu ${perf.cpu.toFixed(1)}ms  calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k  geo ${renderer.info.memory.geometries}`,
        `village seed ${seed} (${world.themeName})`,
        `css ${css}`,
        `ua ${navigator.userAgent.replace(/^Mozilla\/5.0 /, '').slice(0, 70)}`,
      ].join('\n');
    };
    setInterval(tick, 500);                                       // (the first readout comes after start-up, once everything it reads exists)
  }
  const PIXEL_BUDGET = lowEnd ? 1.1e6 : 2.6e6;     // drawing-buffer pixels we are willing to shade per frame
  const GAME_PIXEL_BUDGET = lowEnd ? 0.8e6 : 2.2e6;  // the dirt-bike game is soft-focus and busy: fewer pixels keep it smooth
  let gameWasActive = false, skyN = 0, halfForced = false;   // (the game blurs at half resolution and drops bloom: much cheaper, looks the same)
  const quality = { scale: 1 };
  // The game's own, quicker resolution controller (see frame()): nudges the drawing resolution so the frame time stays near 60 fps on whatever machine this is.
  const dyn = { scale: 1, t: 0, n: 0, stable: 0, wait: 8, lastUp: 0 };
  const DYN_MIN = 0.62;                     // the watchdog lowers this before it ever drops depth of field
  function pixelRatioFor(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = Math.sqrt((game?.active ? GAME_PIXEL_BUDGET : PIXEL_BUDGET) / (w * h));
    return Math.max(0.55, Math.min(dpr, budget) * quality.scale * (game?.active ? dyn.scale : 1));
  }
  /** Only the drawing resolution (the game draws fewer pixels than the overview): no relayout. */
  function applyPixelRatio() {
    const w = VW(), h = VH(), ratio = pixelRatioFor(w, h);
    renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
    skyRenderer.setPixelRatio(Math.min(ratio, game?.active ? 0.6 : 1)); skyRenderer.setSize(w, h, false); skyRenderer.render(skyScene, camera);       // (resizing clears it: redraw at once)
    clearTimeout(dofTimer); dofTimer = setTimeout(() => dof?.resize(), 120);
    slow.t = 0; slow.n = 0; slow.strikes = 0; slow.hold = performance.now() + 2000;
  }
  function onResize() {
    const w = VW(), h = VH();
    sky.setView(w / h, camera.fov);
    const ratio = pixelRatioFor(w, h);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    skyRenderer.setPixelRatio(Math.min(ratio, game?.active ? 0.6 : 1));  // the sky is soft clouds and glows: full res buys nothing (in the game it is drawn smaller still, which also softens it)
    skyRenderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the view wide enough on portrait phones.
    camera.fov = w / h < 0.8 ? 70 : 55;
    camera.updateProjectionMatrix();
    // Reallocating the depth-of-field target is the expensive part: do it once resizing settles
    // (the pass just stretches the old target meanwhile), but immediately on the first call.
    if (!dofSized) { dof?.resize(); dofSized = true; }
    else { clearTimeout(dofTimer); dofTimer = setTimeout(() => dof?.resize(), 120); }
    slow.t = 0; slow.n = 0; slow.strikes = 0; slow.hold = performance.now() + 2000; // resizing is not "slow"
    // Portrait: tilt the overview camera down a little so the signs ride higher, under the name.
    const compact = matchMedia('(max-height: 600px)').matches;   // short screen: the name moves into the top row
    HOME.look.y = 17 - 8 * (1 - THREE.MathUtils.smoothstep(camera.aspect, 0.55, 1.0)) - (compact ? 13 : 0);
    if (!tween && active === 'home') cur.look.copy(HOME.look);
    world.placeBoards(camera.aspect, camera.fov, HOME.pos, HOME.look); // slide/stagger the signs for this screen shape
    layoutStops();
    if (!simple && active !== 'home' && !tween) { // keep a zoomed-in sign filling the screen
      cur.pos.copy(stops[active].pos); cur.look.copy(stops[active].look);
      if (openId && !morph) {
        const b = boardOf(openId);
        b.setLayout(fitLayout(b));
        if (sections[openId].el.classList.contains('is-open')) placeOnBoard(openId);
      }
    }
    // Setting the canvas size clears it. Repaint right now, in the same task, so the browser
    // never gets to show an empty or stretched frame in between.
    if (!simple) draw(0);
  }
  let dofSized = false, dofTimer = 0;
  const slow = { t: 0, n: 0, strikes: 0, hold: 0, retryAt: 0, backoff: 30000 }; // frame-rate watch (see end of frame())
  document.addEventListener('visibilitychange', () => {
    slow.t = 0; slow.n = 0; slow.strikes = 0; slow.hold = performance.now() + 2500;
    if (!document.hidden && dof && !dof.enabled) { dof.enabled = true; slow.retryAt = performance.now(); }
  });
  window.addEventListener('resize', onResize);

  // ---- Input ----
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / VW()) * 2 - 1;
    pointer.y = (e.clientY / VH()) * 2 - 1;
  });

  const ray = new THREE.Raycaster();
  ray.layers.enable(1);
  const ndc = new THREE.Vector2();
  const faces = world.boards.map((b) => b.face);
  function pickBike(e) {
    if (!ride || !ride.riding || active !== 'home' || openId) return false;
    ndc.set((e.clientX / VW()) * 2 - 1, -(e.clientY / VH()) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(ride.hitTarget, false).length > 0;
  }
  let starting = false;
  // ---- Hints that something here can be played with (without saying what): a label on the riding bike, a note drifting up from a house now and then, and a swell in the sun's and moon's glow.
  // Each stops once that thing has been used during this visit, and all of them wait while a section is open, the game runs or music mode is on.
  // (Remembered for this visit only, not in the browser: after a reload or a new visit the hints are back.)
  let golf = null, golfLoading = false;                                       // (the mini-golf at the windmill: loaded the first time it is clicked)
  const busy = () => !!(game?.active || golf?.active);                        // (a game is running: the landscape's other interactions wait)
  const seen = { bike: false, house: false, dial: false };
  const markSeen = (k) => { seen[k] = true; };
  const hintsOn = () => active === 'home' && !openId && !tween && !busy() && songDark < 0.05 && !document.hidden;
  let hintBikeT = 0, hintBikeOn = false, hintBikeD = 0, hintHouseT = 9 + Math.random() * 4, hintClock = 0, hintSun = 0;
  const hintV = new THREE.Vector3();
  function hintTick(dt) {
    const on = hintsOn();
    // the bike: a ring and a label that follow it while it is on screen
    if (bikeHint) {
      let show = false;
      if (ride && ride.riding && on && !seen.bike) {
        hintV.copy(ride.position); hintV.y += 0.9; const dist = camera.position.distanceTo(hintV); hintV.project(camera);
        const px = (hintV.x * 0.5 + 0.5) * VW(), py = (-hintV.y * 0.5 + 0.5) * VH();
        if (hintV.z < 1 && px > 40 && px < VW() - 40 && py > 90 && py < VH() - 40) {
          hintBikeT += dt; show = hintBikeT > 1;
          if (show) {
            const d = Math.max(44, Math.min(150, (4.4 * (VH() / 2)) / (Math.tan((camera.fov * Math.PI) / 360) * dist)));
            if (Math.abs(d - hintBikeD) > 2) { hintBikeD = d; bikeHint.style.setProperty('--d', d.toFixed(0) + 'px'); }
            bikeHint.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
          }
        } else hintBikeT = 0;
      } else hintBikeT = 0;
      if (show !== hintBikeOn) { hintBikeOn = show; bikeHint.classList.toggle('on', show); }
    }
    // a house: a glowing note drifts up from one that is on screen every 10 to 15 seconds
    hintHouseT -= dt;
    if (hintHouseT <= 0) {
      hintHouseT = 10 + Math.random() * 5;
      if (on && !seen.house && !ride?.riding && songHouse < 0) {
        const ok = [];
        for (let i = 0; i < world.houseCount; i++) { const hi = world.houseInfo(i); if (!hi) continue; hintV.set(hi.x, hi.y, hi.z).project(camera); if (hintV.z < 1 && Math.abs(hintV.x) < 0.85 && hintV.y > -0.6 && hintV.y < 0.9) ok.push(i); }
        if (ok.length) { world.houseHint(ok[(Math.random() * ok.length) | 0]); audio.chime(); }
      }
    }
    // the sun and moon: their glow swells for a few seconds every so often (after the first few seconds on the page)
    hintClock += dt;
    const want = on && !seen.dial && !dialOn && !reduceMotion && hintClock > 8 ? Math.max(0, Math.sin(Math.PI * Math.min(1, (hintClock % 20) / 6))) : 0;
    hintSun += (want - hintSun) * (1 - Math.exp(-dt * 3)); sky.setHint(hintSun);
  }
  // the windmill asks to play the mini-golf (and which course and graphics)
  const modeBox = document.createElement('div'); modeBox.className = 'mode-pick'; modeBox.hidden = true;
  modeBox.innerHTML = '<div class="mode-card"><h2>Windmill games</h2><button type="button" data-g="golf"><b>Mini-golf</b><span>Nine holes round the windmill, the last one a pinball table</span></button>' +
    '<div class="mode-seed"><span data-k="seed"></span><div><button type="button" data-g="seedtoggle"></button><button type="button" data-g="shuffle">Shuffle</button></div></div><div class="mode-seed"><span data-k="gfx"></span><div><button type="button" data-g="gfxtoggle"></button></div></div><button type="button" class="mode-x" data-g="">Not now</button></div>';
  document.body.appendChild(modeBox);
  const seedEl = modeBox.querySelector('[data-k="seed"]'), seedBtn = modeBox.querySelector('[data-g="seedtoggle"]'), shuffleBtn = modeBox.querySelector('[data-g="shuffle"]');
  try { const c = +sessionStorage.getItem('golf.seed'); if (c > 0) setRandomCourse(c); } catch (err) { /* (no storage: the monthly course) */ }
  const gfxEl = modeBox.querySelector('[data-k="gfx"]'), gfxBtn = modeBox.querySelector('[data-g="gfxtoggle"]');
  const gfxUI = () => { gfxEl.textContent = `Graphics: ${isLow() ? 'Low' : 'High'}`; gfxBtn.textContent = isLow() ? 'Switch to High' : 'Switch to Low'; };
  const seedUI = () => {                                                       // which course both mini-golf games play: the month's, or a random one
    const code = randomCourseCode(); seedEl.textContent = code ? `Course: Random #${code}` : `Course: ${monthLabel(courseMonth())}`; seedBtn.textContent = code ? 'Back to monthly' : 'Random course'; shuffleBtn.hidden = !code;
    try { if (code) sessionStorage.setItem('golf.seed', String(code)); else sessionStorage.removeItem('golf.seed'); } catch (err) { /* (ignore) */ }
  };
  const pickMode = () => { if (golf?.active || golfLoading || game?.active || starting || active !== 'home' || openId) return; seedUI(); gfxUI(); modeBox.hidden = false; };
  modeBox.addEventListener('click', (e) => {
    const b = e.target.closest('button'); e.stopPropagation();
    if (b?.dataset.g === 'seedtoggle') { setRandomCourse(randomCourseCode() ? 0 : newRandomCode()); seedUI(); return; }
    if (b?.dataset.g === 'gfxtoggle') { saveQuality(isLow() ? 'high' : 'low'); location.reload(); return; }          // (the textures and materials are built once, so the page starts again with the other tier)
    if (b?.dataset.g === 'shuffle') { setRandomCourse(newRandomCode()); seedUI(); return; }
    if (b || e.target === modeBox) { modeBox.hidden = true; if (b?.dataset.g === 'golf') playGolf(); }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modeBox.hidden) modeBox.hidden = true; });
  const loadBox = document.createElement('div'); loadBox.className = 'mode-load'; loadBox.hidden = true; document.body.appendChild(loadBox);
  async function playGolf() {
    if (golf?.active || golfLoading || game?.active || starting || active !== 'home' || openId) return;
    golfLoading = true;
    try {
      if (!golf) {
        const mod = await import('./golf.js?v=20261030232841');
        golf = mod.createGolf(scene, camera, renderer, world, { audio, reduceMotion, sky, lowEnd });
        golf.onQuit = () => { ride?.reset(); riseName(); };
      }
    } catch (err) { console.warn('mini-golf could not load', err); return; } finally { golfLoading = false; }
    if (active !== 'home' || openId || game?.active) return;
    if (golf.needsPrepare?.()) {                                                    // a random course is searched for in a worker: say so, and wait for it
      golfLoading = true; loadBox.hidden = false; loadBox.textContent = 'Building the course…';
      try { await golf.prepare((n, of) => { loadBox.textContent = `Building the course… ${n}/${of}`; }); } finally { golfLoading = false; loadBox.hidden = true; }
      if (active !== 'home' || openId || game?.active) return;
    }
    stopSong(); audio.unlock(); audio.autoOn(); ride?.reset();
    golf.start({ pos: camera.position.clone(), look: look.clone() });
  }
  let millT = -1e9, millHit = false;
  function windmillHit(e) {                                                   // is the pointer over the windmill in the background?
    ndc.set((e.clientX / VW()) * 2 - 1, -(e.clientY / VH()) * 2 + 1); ray.setFromCamera(ndc, camera);
    return world.windmillAt(ray);
  }
  function overMill(e) {                                                      // (for the pointer cursor: checked at most every 90 ms)
    if (e.timeStamp - millT < 90) return millHit;
    millT = e.timeStamp; millHit = !busy() && active === 'home' && !openId && !tween && windmillHit(e);
    return millHit;
  }
  async function playBike() {
    if (!game || game.active || golf?.active || golfLoading || starting || active !== 'home' || openId) return;
    markSeen('bike');
    const bx = ride?.riding ? ride.position.x : 0, homeCam = { pos: camera.position.clone(), look: look.clone() };
    if (!game.ready) {                                   // clicked before the background preparation finished: a short loading card instead of a stall
      starting = true; const card = document.getElementById('gh-loading'); if (card) card.hidden = false;
      try { await Promise.race([game.whenReady(), new Promise((r) => setTimeout(r, 8000))]); } finally { if (card) card.hidden = true; starting = false; }
      if (game.active || active !== 'home' || openId) return;
    }
    stopSong(); audio.unlock(); audio.autoOn(); audio.easter();                    // a chime: the easter egg was found (sound comes on for the visit unless the player turned it off)
    ride?.reset();
    game.start(homeCam, bx);
  }
  bikeBtn?.addEventListener('click', playBike);
  if (game) {
    game.onQuit = () => { ride?.reset(); riseName(); };
    document.getElementById('gh-quit')?.addEventListener('click', () => game.stop());
    // The single button: mouse/touch anywhere in the game, or space/enter.
    const gameDown = (e) => { if (game.active && !e.target.closest('button, .gh-panel')) { game.press(); e.preventDefault(); } };
    window.addEventListener('pointerdown', gameDown);
    // iOS shows its magnifier loupe / text-selection bubble when a finger rests on the screen: stop the touch's default action while playing (buttons keep working).
    const notUi = (e) => !e.target.closest?.('button, a, input, .gh-panel');
    window.addEventListener('touchstart', (e) => { if (game.active && notUi(e)) { e.preventDefault(); getSelection()?.removeAllRanges(); } }, { passive: false });
    window.addEventListener('touchmove', (e) => { if (game.active && notUi(e)) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => { if (game.active) e.preventDefault(); });
    document.addEventListener('selectstart', (e) => { if (game.active) e.preventDefault(); });
    document.addEventListener('gesturestart', (e) => { if (game.active) e.preventDefault(); });
    window.addEventListener('pointerup', () => game.release());
    window.addEventListener('pointercancel', () => game.release());
    window.addEventListener('keydown', (e) => {
      if (!game.active) return;
      if (e.key === 'Escape') { game.stop(); e.preventDefault(); }
      else if ((e.key === 'p' || e.key === 'P') && !e.repeat) { game.togglePause(); e.preventDefault(); }
      else if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest('button')) { if (!e.repeat) game.press(); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') game.release(); });
    window.addEventListener('blur', () => game.release());
    if (/[?&]game=1\b/.test(location.search)) setTimeout(playBike, 600);
  }
  function pick(e) {
    ndc.set((e.clientX / VW()) * 2 - 1, -(e.clientY / VH()) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(faces, false)[0];
    return hit ? hit.object.userData.stopId : null;
  }
  let songHouse = -1, songSeen = false, songAt = 0;
  const songV = new THREE.Vector3();
  function stopSong() { if (songHouse < 0) return; audio.songStop(); world.setMusicHouse(null); songHouse = -1; }
  audio.onChange((on) => { if (!on) stopSong(); });
  function toggleHouseSong(i) {
    markSeen('house'); audio.unlock(); audio.autoOn();
    if (songHouse === i) { stopSong(); return; }
    if (!audio.enabled) return;                                              // (sound is off on purpose: nothing to hear, so nothing to show)
    const hi = world.houseInfo(i); songV.set(hi.x, hi.y, hi.z).project(camera);
    stopSong(); audio.songStart(songV.x); audio.ui('tap'); world.setMusicHouse(i); songHouse = i; songSeen = false; songAt = performance.now();
  }
  canvas.addEventListener('click', (e) => {
    if (suppressClick) return;
    if (active !== 'home' || busy()) return;
    if (pickBike(e)) { playBike(); return; }
    const id = pick(e);
    if (id) { goTo(id); return; }
    if (openId) return;
    if (windmillHit(e)) { pickMode(); return; }
    const hi = world.houseAt(ray);                                           // a hidden extra: click a house and it plays a song, faint and far away
    if (hi >= 0) toggleHouseSong(hi);
  });
  let lastHover = null;
  canvas.addEventListener('pointermove', (e) => {
    const overBike = pickBike(e);
    if (ride) ride.hover = overBike;
    const hoverId = !busy() && active === 'home' && !openId && e.pointerType === 'mouse' ? pick(e) : null;
    if (hoverId !== lastHover) {
      if (hoverId) { const pat = pickFlicker(hoverId); audio.flicker(pat); world.setHover(hoverId, pat.events); }
      else { world.setHover(null); audio.flickerOff(); }
      lastHover = hoverId;
    }
    hoverBody = dialOn ? hoverBody : bodyAt(e);
    if (!dialOn) canvas.style.cursor = !busy() && active === 'home' && (overBike || hoverId || pick(e) || (e.pointerType === 'mouse' && overMill(e))) ? 'pointer' : hoverBody ? 'grab' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { hoverBody = null; world.setHover(null); if (lastHover) audio.flickerOff(); lastHover = null; });
  // Canvas covers the page, so let clicks on empty sky/hills go back "home" when zoomed in.
  canvas.addEventListener('dblclick', () => { if (!busy()) goTo('home'); });

  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || simple) return; // in simple view, plain anchors scroll
    e.preventDefault();
    goTo(a.getAttribute('href').slice(1));
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.back');
    if (a && !simple) { e.preventDefault(); goTo('home'); nav.querySelector('a')?.focus(); }
  });

  window.addEventListener('keydown', (e) => {
    if (simple || busy() || e.target.closest('input, button')) return;
    const i = ORDER.indexOf(active);
    if (e.key === 'ArrowRight') { goTo(ORDER[(i + 1) % ORDER.length]); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { goTo(ORDER[(i + ORDER.length - 1) % ORDER.length]); e.preventDefault(); }
    else if (e.key === 'Escape') goTo('home');
  });
  window.addEventListener('hashchange', () => { if (!simple) goTo(location.hash.slice(1) || 'home', { record: false }); });

  // ---- Time of day ----
  function fmt(h) {
    const hh = Math.floor(h) % 24, mm = Math.round((h % 1) * 60);
    const ap = hh >= 12 ? 'pm' : 'am';
    return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`;
  }
  // The clock: starts at the visitor's real time and then runs on its own, a whole day in DAY_SECONDS.
  // Dragging the slider sets the time; the clock carries on from there (and waits while you drag).
  const DAY_SECONDS = 300;
  let hour = 12, shownMinute = -1, dragging = false, lightsWarm = false, idleReady = false;
  // While a house song plays the whole scene turns to night (so the aurora is the star): the sky is shown at a later hour, eased in and out with the aurora.
  // Between 1:10 and 1:26 of the song the colours turn warm (yellows, oranges and reds instead of greens, blues and magentas) and the camera slowly moves in on the scene (keeping all
  // three billboards in view); from there it slowly eases back out until the song ends. `songWarm` is eased in and out over a few seconds.
  let songDark = 0, songWarm = 0, songZoom = 0, songRoom = 0, songRoomWant = 0, songRoomT = 0, songFade = 1;
  // The camera's shot across the song: key times (seconds), how far in (fraction of the way to the look point), sideways and up. Joined with smooth cubic curves (no sudden starts or stops).
  const SHOT = [[0, 0, 0, 0], [10, 0.03, -1.5, 0.2], [32, 0.1, -4, 0.7], [54, 0.13, 2, 1.1], [70, 0.16, 3.2, 0.7], [86, 0.4, 0, 0], [100, 0.2, -3, 0.8], [113, 0.07, -1, 1.3], [123, 0, 0, 0.2]];
  const songShot = { z: 0, x: 0, y: 0, on: false }, songShotS = { z: 0, x: 0, y: 0 };
  function songShotAt(st) {
    if (st < 0) { songShot.z = songShot.x = songShot.y = 0; songShot.on = false; return; }
    const n = SHOT.length; let i = 0; while (i < n - 2 && st >= SHOT[i + 1][0]) i++;
    const p0 = SHOT[i], p1 = SHOT[i + 1], h = p1[0] - p0[0], u = Math.min(1, Math.max(0, (st - p0[0]) / h)), u2 = u * u, u3 = u2 * u;
    const pm = SHOT[i - 1] || p0, pn = SHOT[i + 2] || p1;
    for (let c = 1; c <= 3; c++) {
      const m0 = i > 0 ? (p1[c] - pm[c]) / (p1[0] - pm[0]) * h : 0, m1 = i < n - 2 ? (pn[c] - p0[c]) / (pn[0] - p0[0]) * h : 0;     // (tangents from the neighbours: Catmull-Rom)
      const v = (2 * u3 - 3 * u2 + 1) * p0[c] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1[c] + (u3 - u2) * m1;
      if (c === 1) songShot.z = Math.min(0.4, Math.max(0, v)); else if (c === 2) songShot.x = v; else songShot.y = v;
    }
    songShot.on = true;
  } const cineEl = document.getElementById('cine'), fadeEl = document.getElementById('cine-fade'), specA = { bass: 0, mid: 0, treble: 0, energy: 0, centroid: 0, beat: 0 }; let songBlack = 0, songBlackV = 0; let cineK = 0, cineV = 0.5, cineVs = 0.5; const songDrift = { x: 0, y: 0, swell: 0, roll: 0, env: 0, bars: 0 };                               // how far the scene is into the night, into the warm passage, and into the camera's move
  const smooth01 = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const songHour = (h) => {
    if (songDark < 0.002) return h;
    const e = songDark * songDark * (3 - 2 * songDark), target = h < 7 ? 0 : 23.5;                    // (from before dawn it goes back to the small hours; otherwise on through sunset to night)
    return h + (target - h) * e;
  };
  let songDimmed = false;
  const songDim = () => {
    const k = songDark;
    if (k < 0.002) { if (songDimmed) { songDimmed = false; world.setSongDim(0); } return 0; }          // (the song is over: the clouds, signs and lights are back to normal)
    const e = k * k * (3 - 2 * k); songDimmed = true; world.setSongDim(e); return e;
  };
  let nightK = 0; const sndV = new THREE.Vector3(), sndB = new THREE.Vector3();
  function setTime(h) {
    hour = ((h % 24) + 24) % 24;
    const { night, horizon } = sky.set(songHour(hour), songDim(), songWarm, game?.active || golf?.active ? null : weather.state); nightK = night;
    if (!lightsWarm && idleReady && night < 0.02) prewarmLights?.();                       // (it was night at start-up: do it at the first daylight)
    world.setNight(night);
    world.setClouds(night, horizon, game?.active || golf?.active ? null : weather.state);
    world.setWeather(game?.active || golf?.active ? null : { wet: weather.state.wet, cover: weather.state.cover, roof: weather.state.roof, tree: weather.state.tree, rain: weather.state.rain, fogK: sky.fogK });
    dof?.setLook(horizon, lowEnd || quality.scale < 1 || game?.active ? 0 : 1);
    const minute = Math.floor(hour * 60);
    if (minute !== shownMinute) {                       // touch the DOM only when the shown minute changes
      shownMinute = minute;
      const label = fmt(hour);
      timeLabel.textContent = 'Time: ' + label;
      timeInput.setAttribute('aria-valuetext', label);
    }
    updateDial();
  }
  // ---- The sun and moon dial: press the sun or moon in the sky and drag round the ring to change the time ----
  const dialEl = document.getElementById('sundial'), dialTime = document.getElementById('dial-time');
  const bodyV = new THREE.Vector3(), ORBIT_N = 144, orbitPx = new Float32Array(ORBIT_N * 2);
  let dialOn = false, dialLastH = 0, suppressClick = false, orbitA = 0, hoverBody = null, hoverSunV = 0, hoverMoonV = 0;
  function updateDial() { if (dialOn) dialTime.textContent = fmt(hour); }
  /** The oval the sun and moon travel, as it looks from the camera right now: used to turn a pointer position into a time (the dotted line itself is drawn in the sky layer). */
  function computeOrbit() {
    const W = VW(), H = VH(); camera.updateMatrixWorld(); let cx = 0, cy = 0;
    for (let i = 0; i < ORBIT_N; i++) {
      sky.orbitPoint((i / ORBIT_N) * 24 + 6, bodyV).project(camera);
      const px = (bodyV.x * 0.5 + 0.5) * W, py = (-bodyV.y * 0.5 + 0.5) * H;
      orbitPx[i * 2] = px; orbitPx[i * 2 + 1] = py; cx += px; cy += py;
    }
    dialTime.style.left = (cx / ORBIT_N).toFixed(0) + 'px'; dialTime.style.top = (cy / ORBIT_N).toFixed(0) + 'px';          // (the time sits in the middle of the oval)
  }
  /** The time (hour 0-24) at the point of the oval nearest the pointer. */
  function orbitHourAt(e) {
    let bi = 0, bd = 1e12;
    for (let i = 0; i < ORBIT_N; i++) { const dx = e.clientX - orbitPx[i * 2], dy = e.clientY - orbitPx[i * 2 + 1], dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bi = i; } }
    return (bi / ORBIT_N) * 24 + 6;
  }
  /** Which of the sun / moon is under the pointer (null for none): only a body that is up and not faded away (music mode hides them). */
  function bodyAt(e) {
    if (active !== 'home' || openId || tween || busy() || songDark > 0.05) return null;
    let best = null, bestD = 1e9;
    for (const [name, mesh, r] of [['sun', sky.bodies.sun, 10], ['moon', sky.bodies.moon, 7]]) {
      if (!mesh.visible || mesh.material.opacity < 0.3) continue;
      bodyV.copy(mesh.position).project(camera);
      if (bodyV.z > 1) continue;
      const px = (bodyV.x * 0.5 + 0.5) * VW(), py = (-bodyV.y * 0.5 + 0.5) * VH();
      const rad = Math.max(34, 1.6 * (r / mesh.position.distanceTo(camera.position)) * (VH() / 2) / Math.tan((camera.fov * Math.PI) / 360));
      const d = Math.hypot(e.clientX - px, e.clientY - py);
      if (d < rad && d < bestD) { best = name; bestD = d; }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || pickBike(e) || pick(e) || world.houseAt(ray) >= 0 || !bodyAt(e)) return;
    hoverBody = bodyAt(e); markSeen('dial'); dragging = true; dialOn = true; suppressClick = true; computeOrbit(); dialLastH = orbitHourAt(e); updateDial();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer is gone */ }
    dialEl.classList.add('on'); canvas.style.cursor = 'grabbing'; e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dialOn) return;
    const eh = orbitHourAt(e); let d = ((eh - dialLastH + 36) % 24) - 12; dialLastH = eh;           // (the time moves by how far the pointer has moved along the oval, so the body stays under it)
    if (Math.abs(d) > 5) return;                                                                      // (a jump to the far side of the oval: ignore it)
    setTime(hour + d); timeInput.value = hour;
  });
  const endDial = () => { if (!dialOn) return; dialOn = false; dragging = false; dialEl.classList.remove('on'); canvas.style.cursor = 'default'; setTimeout(() => { suppressClick = false; }, 60); };
  canvas.addEventListener('pointerup', endDial); canvas.addEventListener('pointercancel', endDial); canvas.addEventListener('lostpointercapture', endDial);
  timeInput.step = 'any';                               // smooth slider while the clock runs
  timeInput.addEventListener('input', () => setTime(parseFloat(timeInput.value)));
  timeInput.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  timeInput.addEventListener('keydown', () => { dragging = true; setTimeout(() => { dragging = false; }, 1200); });

  simpleBtn.addEventListener('click', () => setSimple(!simple));
  // The landscape's sound button (sound is off until it is pressed)
  // ---- the weather chip: an icon for what the weather is (and the temperature when it is the visitor's own), and a small menu to choose ----
  { const chip = document.getElementById('wx-chip'), ico = document.getElementById('wx-ico'), tmp = document.getElementById('wx-temp'), menu = document.getElementById('wx-menu'), note = document.getElementById('wx-note');
    const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`, CLOUD = 'M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18z';
    const ICONS = {
      sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>'),
      moon: P('<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>'),
      partly: P('<circle cx="8.5" cy="8.5" r="2.8"/><path d="M8.5 2.5v1.2M2.5 8.5h1.2M4.3 4.3l.9.9M12.7 4.3l-.9.9"/><path d="M9 19h8.5a3.6 3.6 0 0 0 .5-7.15A4.8 4.8 0 0 0 9.4 12.2 3.4 3.4 0 0 0 9 19z"/>'),
      cloud: P(`<path d="${CLOUD}"/>`),
      rain: P(`<path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 6.5 4.3 4.3 0 0 0 7 15z"/><path d="M8.5 18l-1 2.2M12.5 18l-1 2.2M16.5 18l-1 2.2"/>`),
      storm: P(`<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 6 4.3 4.3 0 0 0 7 14.5z"/><path d="M12.5 14l-2.5 4h3l-1.5 4"/>`),
      snow: P(`<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M9.6 4.6L12 6.5l2.4-1.9M9.6 19.4L12 17.5l2.4 1.9"/>`),
      fog: P(`<path d="M7 12h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 3.5 4.3 4.3 0 0 0 7 12z"/><path d="M4 16h16M6 19.5h12"/>`),
    }, LABEL = { sun: 'Clear', moon: 'Clear night', partly: 'Partly cloudy', cloud: 'Cloudy', rain: 'Rain', storm: 'Storm', snow: 'Snow', fog: 'Fog' };
    let shown = ''; const useF = /^en-(US|LR)|^my/i.test(navigator.language || ''), deg = (c) => Math.round(useF ? c * 9 / 5 + 32 : c);          // (Fahrenheit where it is the custom)
    const refresh = () => {
      const k = weather.kind(nightK > 0.5), mine = weather.mode === 'local' && weather.temp !== null; if (k !== shown) { shown = k; ico.innerHTML = ICONS[k]; }
      tmp.hidden = !mine; if (mine) tmp.textContent = `${deg(weather.temp)}°`;
      const what = mine ? `${LABEL[k]} where you are, ${deg(weather.temp)} degrees` : weather.mode === 'auto' ? `${LABEL[k]} (seasonal)` : LABEL[k]; chip.title = chip.ariaLabel = `Weather: ${what}`;
      for (const b of menu.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.wx === (weather.mode === 'preset' ? weather.name : weather.mode)));
    };
    weather.onChange(refresh); setInterval(refresh, 4000); refresh();
    const close = () => { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); };
    chip.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; chip.setAttribute('aria-expanded', String(open)); if (open) { note.hidden = true; menu.querySelector('button')?.focus(); } });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('#wx')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); chip.focus(); } });
    menu.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-wx]'); if (!b) return; const m = b.dataset.wx; audio.ui('click');
      if (m === 'local') { note.hidden = false; note.textContent = 'Asking where you are (rounded to about 10 km)...'; const r = await weather.setMode('local'); if (r === 'ok') { close(); refresh(); } else note.textContent = r === 'denied' ? 'Location is off for this site, so I can’t check your weather.' : 'Couldn’t reach the weather service. Try again later.'; return; }
      await weather.setMode(m); close(); refresh();
    });
  }
  const sndBtn = document.getElementById('scene-sound');
  const showSnd = () => { if (!sndBtn) return; sndBtn.setAttribute('aria-pressed', String(audio.enabled)); sndBtn.setAttribute('aria-label', audio.enabled ? 'Sound on' : 'Sound off'); };
  sndBtn?.addEventListener('click', () => { audio.unlock(); audio.enabled = !audio.enabled; if (audio.enabled) audio.ui('tap'); showSnd(); });
  audio.onChange(showSnd); showSnd();
  window.addEventListener('pointerdown', () => { if (audio.enabled) audio.unlock(); }, { once: true, capture: true });
  // Hover and click ticks on the landscape's buttons (a mouse only: touch has no hover)
  const UI_SEL = '#stopnav a, #simple-toggle, #scene-sound, .back, #bike-play, .gh-pausebtn, .gh-panel button';
  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const t = e.target.closest?.(UI_SEL); if (t && !t.contains(e.relatedTarget)) audio.ui('hover'); });
  document.addEventListener('click', (e) => { const t = e.target.closest?.('#stopnav a, #simple-toggle, .back'); if (t) audio.ui('click'); }, true);

  // ---- Rotating tagline (static when reduced motion is on) ----
  // The phrase lives in an inner span so its fade does not fight the tagline's own
  // opacity, which follows the camera (see the frame loop).
  const phrases = (tagline.dataset.phrases || '').split('|').filter(Boolean);
  if (phrases.length && !reduceMotion) {
    const span = document.createElement('span');
    span.className = 'phrase';
    span.textContent = phrases[0];
    tagline.textContent = '';
    tagline.appendChild(span);
    let i = 0;
    setInterval(() => {
      span.classList.add('fade');
      setTimeout(() => {
        i = (i + 1) % phrases.length;
        span.textContent = phrases[i];
        span.classList.remove('fade');
      }, 380);
    }, 3200);
  }

  // ---- Boot ----
  controls.hidden = false;
  // Start at the visitor's actual local time (rounded to the slider's quarter-hour steps).
  const nowD = new Date();
  const nowHour = nowD.getHours() + nowD.getMinutes() / 60 + nowD.getSeconds() / 3600;
  timeInput.value = nowHour;
  setTime(nowHour);
  onResize();

  const initial = location.hash.slice(1); // read before setSimple() rewrites the hash
  active = stops[initial] ? initial : 'home';
  const startSimple = store.get('simple') === '1' || (store.get('simple') === null && reduceMotion);
  setSimple(startSimple); // when not simple, this also moves the camera to `active`

  // Compile the dirt-bike game's shaders in the background once the page has settled, so clicking the bike does not stall the scene.
  // By day the nine point lights (intensity 0) are switched off, which saves a loop iteration per lit pixel per light; the shaders for both states are compiled
  // at idle first (so the switch at dusk or dawn never freezes a frame). Only done by day, when switching them is invisible.
  const prewarmLights = async () => {
    if (lightsWarm || !idleReady || !dof || world.night > 0.02) return;
    lightsWarm = true;
    try { await dof.compileAsync(scene, camera); world.lightsSleep(true); await dof.compileAsync(scene, camera); } catch (e) { lightsWarm = false; }
  };
  window.__prewarmLights = prewarmLights;
  if (game) setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(() => { dof?.warm(); game.warmUp(); idleReady = true; prewarmLights(); }, { timeout: 4000 }) : (dof?.warm(), game.warmUp(), idleReady = true, prewarmLights())), 3500);

  // ---- Render loop ----
  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  /** Render both layers. `dt` only drives the focus easing, so 0 means "repaint as is". */
  function draw(dt) {
    renderer.info.reset();
    const t0 = performance.now();
    if (!game?.active || (skyN++ % 3) === 0) skyRenderer.render(skyScene, camera);          // in the game the soft sky only needs every third frame
    if (dof && dof.enabled) {
      // Depth of field: on the overview, focus mid-village so nearby houses blur and the middle ones stay crisp.
      const want = game?.active ? game.focusDistance : golf?.active ? golf.focusDistance : active === 'home' ? (camera.aspect < 0.8 ? 30 : 54) : camera.position.distanceTo(cur.look);   // portrait: focus closer so the foreground planting stays readable
      dof.setBlur(golf?.active ? 0.5 : 1);
      focus += (want - focus) * Math.min(1, dt * 4);
      dof.setHazeNear(game?.active ? Math.max(55, game.focusDistance * 1.3 + 12) : 55);
      if (scene.fog) { const fn = game?.active ? Math.max(48, game.focusDistance * 1.15) : 48, wk = game?.active || golf?.active ? Math.min(0.3, sky.fogK) : sky.fogK; scene.fog.near = fn * (1 - 0.65 * wk); scene.fog.far = fn + 167 - (fn + 167 - 40) * 0.6 * wk; }          // (the weather pulls the fog in)   // the game's camera sits further back: start the fog beyond the ride itself
      world.setView({ ...dof.params, focus });
      dof.render(scene, camera, focus, world.signMats);
    } else {
      world.setView({ height: canvas.height, focus, aperture: 0, maxBlur: 0 });
      renderer.render(scene, camera);
    }
    perf.cpu += (performance.now() - t0 - perf.cpu) * 0.1;
  }

  /** In the game: keep the frame time near 60 fps by nudging the resolution (down fast when slow, back up slowly and carefully when it has been smooth). */
  function dynTick(rawDt) {
    if (!(game?.active && !game.paused && !tween && !morph && performance.now() >= slow.hold)) return;
    dyn.t += rawDt; dyn.n++; if (rawDt > 0.25) dyn.bad = true;
    if (dyn.t < 1) return;
    const avg = (dyn.t / dyn.n) * 1000, now = performance.now(), bad = dyn.bad; dyn.t = 0; dyn.n = 0; dyn.bad = false;
    if (bad) return;
    if (avg > 19.5 && dyn.scale > DYN_MIN) {
      if (now - dyn.lastUp < 7000) dyn.wait = Math.min(64, dyn.wait * 2);                    // lowering soon after raising: wait longer before trying again
      dyn.scale = Math.max(DYN_MIN, dyn.scale * (avg > 28 ? 0.84 : 0.92)); dyn.stable = 0; applyPixelRatio();
    } else if (avg <= 17.6) {
      if (++dyn.stable >= dyn.wait && dyn.scale < 1) { dyn.scale = Math.min(1, dyn.scale * 1.05); dyn.stable = 0; dyn.lastUp = now; applyPixelRatio(); }
    } else dyn.stable = 0;
  }
  function frame() {
    requestAnimationFrame(frame);
    if (simple || document.hidden) { clock.getDelta(); return; }
    const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.1);
    prof.ft[prof.n++ % prof.ft.length] = rawDt * 1000;

    weather.tick(dt); weather.update(dt, () => { if (weather.quiet) audio.thunder(2 + Math.random() * 4, 0.35); else if (!reduceMotion) audio.thunder(1 + Math.random() * 4, 0.7 + Math.random() * 0.4); else audio.thunder(2 + Math.random() * 4, 0.6); }); { const inGame = !!(game?.active || golf?.active); weather.quiet = inGame; precip.update(dt, camera, weather.state, inGame && lowEnd, canvas.height, reduceMotion, inGame ? 0.5 : 1); }          // (in the games: half the rain and snow, and none at all on a weak machine) if ((reduceMotion || dragging) && weather.busy) setTime(hour);                    // (the weather eases; with the day held still it still needs the sky redrawn)
    // Let the day run: 24 hours in DAY_SECONDS. (Held still for reduced motion, and while the slider is being used.)
    if (!reduceMotion && !dragging) {
      const sT = performance.now(); setTime(hour + (dt * 24) / DAY_SECONDS); secT('time', sT);
      timeInput.value = hour;
    }

    if (tween) {
      tween.t += dt / tween.dur;
      const k = ease(Math.min(tween.t, 1));
      cur.pos.lerpVectors(tween.fromP, tween.to.pos, k);
      cur.look.lerpVectors(tween.fromL, tween.to.look, k);
      if (tween.t >= 1) { const d = tween.done; tween = null; d(); }
    }

    if (morph) {
      morph.t += dt / morph.dur;
      const k = ease(Math.min(morph.t, 1));
      morph.b.setLayout(lerpLayout(morph.from, morph.to, k));
      if (morph.t >= 1) { const r = morph.resolve; morph = null; r(); }
    }

    // Subtle parallax from pointer position, only on the overview. It fades fully to zero
    // when zoomed in on a billboard (and for reduced motion), then eases back on return.
    const target = reduceMotion || active !== 'home' || openId ? 0 : 1;
    parallax += (target - parallax) * Math.min(1, dt * 4);
    pointer.sx += (pointer.x - pointer.sx) * 0.04;
    pointer.sy += (pointer.y - pointer.sy) * 0.04;
    camera.position.copy(cur.pos);
    camera.position.x += pointer.sx * 0.9 * parallax;
    camera.position.y += -pointer.sy * 0.4 * parallax;
    look.copy(cur.look);
    look.x += pointer.sx * 0.5 * parallax;
    if ((songShot.on || songShotS.z > 0.0005 || Math.abs(songShotS.x) > 0.01) && active === 'home' && !openId && !tween && !busy()) {       // the camera's shot across the song: a slow push, an orbit to one side and the other, the 1:10 push-in, then a long pull-back (all three billboards stay in view)
      const base = camera.position.clone(), T = songShot;
      if (songRoomT <= 0 || performance.now() - songRoomT > 400) {                                    // (how much of the shot fits with all three billboards in view: bisected a few times a second from the fixed view, so it cannot jitter)
        songRoomT = performance.now();
        const fits = (s) => { zoomPos.copy(cur.pos).lerp(cur.look, T.z * s); zoomPos.x += T.x * s; zoomPos.y += T.y * s; zoomLook.copy(cur.look); zoomLook.x += T.x * s * 0.5; return boardsInView(zoomPos, 0.96, zoomLook); };
        let lo = 0, hi = 1;
        if (fits(1)) lo = 1; else for (let it = 0; it < 8; it++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
        songRoomWant = lo;
      }
      songRoom += (songRoomWant - songRoom) * (1 - Math.exp(-dt * 1));
      const k = 1 - Math.exp(-dt * 1.6), S = songShotS;                                                // (and the shot itself is low-passed once more)
      S.z += (T.z * songRoom - S.z) * k; S.x += (T.x * songRoom - S.x) * k; S.y += (T.y * songRoom - S.y) * k; songZoom = S.z;
      camera.position.lerp(look, S.z); camera.position.x += S.x; camera.position.y += S.y; look.x += S.x * 0.5;
    }
    let songRoll = 0;
    if ((songDark > 0.01 || songDrift.env > 0.002) && active === 'home' && !openId && !tween && !busy()) {   // the film-style drift: a slow, heavily smoothed sway and a very gentle swell once a bar, all counted in beats (so it slows with the final ritardando)
      const bp = audio.songBeatPos(), D = songDrift;
      const on = bp >= 0 ? songDark * Math.max(0, 1 - songZoom * 2.5) : 0;                                 // (it gives way to the push-in, so the billboards stay in view)
      const bars = bp >= 0 ? bp / 3 : D.bars;
      const sway = Math.sin(bars * 0.31) * 0.8 + Math.sin(bars * 0.13 + 1.3) * 0.5, lift = Math.sin(bars * 0.21 + 0.6) * 0.22;
      const swell = 0.5 - 0.5 * Math.cos((bars % 1) * Math.PI * 2), roll = Math.sin(bars * 0.17 + 2) * 0.003;   // (a smooth cosine, no sharp attack)
      const k = 1 - Math.exp(-dt * 1.4);                                                                   // (every channel is low-passed again, so nothing can jerk)
      D.bars = bars; D.env += (on - D.env) * (1 - Math.exp(-dt * 0.8));
      D.x += (sway - D.x) * k; D.y += (lift - D.y) * k; D.swell += (swell - D.swell) * k; D.roll += (roll - D.roll) * k;
      camera.position.x += D.x * D.env; camera.position.y += D.y * D.env; look.x += D.x * 0.3 * D.env;
      camera.position.lerp(look, D.swell * 0.0025 * D.env);
      songRoll = D.roll * D.env;
    }
    camera.lookAt(look); camera.rotation.z += songRoll;
    const gT = performance.now(); game?.update(dt, camera); golf?.update(dt, camera); secT('game', gT);
    {                                                                          // the aurora dances to the song (and lights the world while it does)
      const playing = songHouse >= 0 && audio.songPlaying;
      const st = playing ? audio.songTime() : -1;
      const warmT = st < 0 ? 0 : smooth01(70, 72, st) * (1 - smooth01(84, 86, st)); songWarm += (warmT - songWarm) * (1 - Math.exp(-dt * 5));
      songShotAt(st);
      setWarm(songWarm); world.setWarm(songWarm);
      const darkTarget = playing ? 1 : 0; songDark += (darkTarget - songDark) * (1 - Math.exp(-dt * (darkTarget > songDark ? 0.55 : 0.5)));
      if (cineEl) {                                                                                      // letterbox bars, vignette and grain follow how far into the night the scene is
        const cv = songDark < 0.003 ? 0 : songDark * songDark * (3 - 2 * songDark);
        if (Math.abs(cv - cineK) > 0.002 || (cv === 0 && cineK !== 0)) { cineK = cv; cineEl.style.setProperty('--cine', cv.toFixed(3)); cineEl.classList.toggle('on', cv > 0); }
        cineVs += (0.5 + 0.4 * spec.energy - cineVs) * (1 - Math.exp(-dt * 1.2)); if (cv > 0 && Math.abs(cineVs - cineV) > 0.01) { cineV = cineVs; cineEl.style.setProperty('--cine-v', cineVs.toFixed(2)); }
      }
      if (playing) audio.songSpectrum(spec, dt); else { spec.bass = spec.mid = spec.treble = spec.energy = spec.centroid = spec.beat = 0; }
      // The song's sections (see the tempo map: a quiet opening, the full band from bar ~11, the warm lift, a calmer release, a swelling finale, then the last note at 1:55 that holds):
      // each gets its own amount of aurora and its own pace of light show, so the visuals are composed rather than only reactive.
      let amp = 1, pace = 1, curtains = lowEnd ? 2 : 3;
      if (playing) {
        amp = (0.5 + 0.5 * smooth01(4, 26, st)) * (1 - 0.2 * smooth01(86, 94, st)) * (1 + 0.3 * smooth01(106, 113, st));
        pace = (0.75 + 0.25 * smooth01(8, 30, st)) * (1 - 0.15 * smooth01(86, 94, st)) * (1 + 0.4 * smooth01(106, 113, st));
        curtains = Math.min(curtains, 1 + smooth01(6, 20, st) + smooth01(20, 34, st));
      }
      specA.bass = Math.min(1, spec.bass * amp); specA.mid = Math.min(1, spec.mid * amp); specA.treble = Math.min(1, spec.treble * amp); specA.energy = Math.min(1, spec.energy * amp); specA.centroid = spec.centroid; specA.beat = spec.beat;
      aurora.layers = curtains;
      const visualsOn = playing && st < 115;                                                       // the last note (1:55) starts the fade: the aurora, fireflies and lights all ease away...
      audio.songNotes(songNotes);
      aurora.update(dt, specA, nightK, visualsOn, playing ? audio.songBeatPos() : -1, songNotes);
      world.setNotes(songNotes);
      world.setDance(aurora.level < 0.002 ? 0 : aurora.level * aurora.level * (3 - 2 * aurora.level), specA, audio.songBeatPos(), pace);
      if (fadeEl) {                                                                                // ...and the scene sinks almost to black, then comes back to normal as the song ends
        const bt = playing ? 0.94 * smooth01(115.5, 122, st) : 0;
        songBlack += (bt - songBlack) * (1 - Math.exp(-dt * (bt > songBlack ? 3 : 0.55)));
        if (Math.abs(songBlack - songBlackV) > 0.004 || (songBlack < 0.004 && songBlackV !== 0)) { songBlackV = songBlack < 0.004 ? 0 : songBlack; fadeEl.style.opacity = songBlackV.toFixed(3); fadeEl.style.visibility = songBlackV > 0 ? 'visible' : 'hidden'; }
      }
      songFade += ((playing ? 1 - 0.45 * smooth01(112, 123, st) : 1) - songFade) * (1 - Math.exp(-dt * (playing ? 2 : 0.5)));   // the light sinks a little over the closing ritardando
      dof?.setGlow(aurora.level * songFade);
      if (aurora.level > 0) { aurora.light(sky.lights, world, lowEnd); sky.lights.hemi.intensity *= songFade; sky.lights.moon.intensity *= songFade; sky.lights.rim.intensity *= songFade; }
      else if (aurora.strength !== 0) { aurora.strength = 0; world.setAurora(null, 0); setTime(hour); }       // (the lights are put back as the sky sets them)
    }
    if (songHouse >= 0) {                                                     // the house's song: follow it on screen, and let the glow end with the song
      if (audio.songPlaying) {
        songSeen = true; const hi = world.houseInfo(songHouse); if (hi) { songV.set(hi.x, hi.y, hi.z).project(camera); audio.songPan(songV.x); }
      } else if (songSeen || performance.now() - songAt > 9000) stopSong();
    }
    if (audio.enabled) {                                                      // the landscape's sound: day/night, the windmill, the far-off bike
      const gameOn = busy();
      if (!gameOn) { sndV.set(-23, 10, -92).project(camera); }
      let bike = null;
      if (!gameOn && ride?.riding) {
        sndB.copy(ride.position); const d = camera.position.distanceTo(sndB); sndB.project(camera);
        const q = Math.max(0, 1 - d / 190); bike = { gain: 0.38 * Math.pow(q, 1.5), pan: sndB.x };
      }
      audio.sceneUpdate({ night: nightK, quiet: gameOn, windPan: sndV.x, bike, wx: weather.state });
    }
    if (!!game?.active !== gameWasActive) { gameWasActive = !!game?.active; applyPixelRatio(); if (dof) { dof.samples = gameWasActive ? 0 : 2; dof.half = gameWasActive || halfForced; dof.setLook(null, gameWasActive || lowEnd || quality.scale < 1 ? 0 : 1); } }          // the game draws fewer pixels

    const wT = performance.now(); if (!reduceMotion) world.update(dt, camera); secT('world', wT);
    if (ride) {
      ride.hold = songDark > 0.02 || (songHouse >= 0 && audio.songPlaying);                          // music mode: no new bike (one already riding carries on)
      ride.update(dt, active === 'home' && !openId && !tween && !busy());
      if (bikeBtn) bikeBtn.hidden = !ride.riding;
    }
    hintTick(dt);
    orbitA += ((dialOn ? 1 : 0) - orbitA) * (1 - Math.exp(-dt * 9)); sky.setOrbitAlpha(orbitA);
    hoverSunV += ((hoverBody === 'sun' ? 1 : 0) - hoverSunV) * (1 - Math.exp(-dt * 10)); hoverMoonV += ((hoverBody === 'moon' ? 1 : 0) - hoverMoonV) * (1 - Math.exp(-dt * 10)); sky.setHover(hoverSunV, hoverMoonV);       // (the sun or moon under the pointer, or being dragged, glows brighter)                  // (the dotted orbit fades in and out with the dial)
    if (shadowTick++ % (game?.active ? 2 : golf?.active ? (lowEnd ? 2 : 1) : 4) === 0) { renderer.shadowMap.needsUpdate = true; prof.shadow++; }
    if (dt > 0) perf.fps += (1 / dt - perf.fps) * 0.05;

    // Name and tagline: hidden while a sign is open or being reached; while the camera pulls back
    // to the overview they fade in with its progress (the name first, the tagline a little after).
    let wantName, wantTag, direct = false;
    if (active !== 'home' || openId || busy()) { wantName = wantTag = 0; }
    else if (tween && tween.to === stops.home) {
      const u = Math.min(tween.t, 1);
      wantName = THREE.MathUtils.smoothstep(u, 0.05, 0.65);
      wantTag = THREE.MathUtils.smoothstep(u, 0.3, 0.95);
      direct = true;
    } else { wantName = wantTag = 1; }
    const k = Math.min(1, dt * (wantName < heroName ? 9 : 3));
    heroName = direct ? wantName : heroName + (wantName - heroName) * k;
    heroTag = direct ? wantTag : heroTag + (wantTag - heroTag) * k;
    heroEl.style.opacity = heroName.toFixed(3);
    tagline.style.opacity = heroTag.toFixed(3);

    draw(dt);

    dynTick(rawDt);
    // If the machine struggles, drop soft focus first, then resolution.
    if (performance.now() < slow.hold || tween || morph) { slow.t = 0; slow.n = 0; return; } // transitions and resizes don't count
    slow.t += dt; slow.n++;
    if (slow.t > 3) {
      const fps = slow.n / slow.t;
      slow.strikes = fps < 22 ? slow.strikes + 1 : 0;
      const now = performance.now();
      if (slow.strikes >= 3) { // genuinely slow for ~9s in a row
        slow.strikes = 0;
        if (dof && !dof.half) {                       // 0) blur at half resolution before touching the scene's
          dof.half = true; halfForced = true;
        } else if (quality.scale > 0.71) {            // 1) draw fewer pixels first (1 -> 0.85 -> 0.7)...
          quality.scale = Math.max(0.7, quality.scale - 0.15);
          onResize();
        } else if (dof?.enabled) {                    // 2) ...then drop soft focus, but only for a while.
          dof.enabled = false;
          slow.backoff = now - slow.retryAt < 20000 ? Math.min(slow.backoff * 2, 300000) : 30000;
          slow.retryAt = now + slow.backoff;
        }
      } else if (fps >= 30 && dof && !dof.enabled && now >= slow.retryAt) {
        dof.enabled = true;                           // the slow patch passed: bring depth of field back
        slow.retryAt = now;                           // marks the moment of the retry (see the back-off above)
      }
      slow.t = 0; slow.n = 0;
    }
  }
  try { frame(); } catch (err) { console.error('Render loop failed:', err); hideBoot(); }
  requestAnimationFrame(() => requestAnimationFrame(hideBoot)); setTimeout(hideBoot, 450);   // the first scene frame has been drawn: lift the splash (the timer covers a background tab, where frames do not run)
  window.__portfolio = { weather, get golf() { return golf; }, playGolf, dyn, dynTick, prof, ride, game, scene, skyScene, camera, renderer, world, dof, slow, THREE, get focus() { return focus; }, cur };
}
