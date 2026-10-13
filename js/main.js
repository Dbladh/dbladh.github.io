// Wires everything together: renderer, camera stops, navigation, time-of-day,
// simple-view toggle. The page works as plain HTML if anything here fails.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createSky } from './sky.js';
import { createDOF } from './dof.js';

const body = document.body;
const canvas = document.getElementById('scene');
const skyCanvas = document.getElementById('sky');
const live = document.getElementById('live');
const nav = document.getElementById('stopnav');
const controls = document.getElementById('controls');
const timeInput = document.getElementById('time');
const timeLabel = document.getElementById('time-label');
const simpleBtn = document.getElementById('simple-toggle');
const tagline = document.getElementById('tagline');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ORDER = ['home', 'creativity', 'ai', 'engineering', 'about'];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode etc. */ } },
};

// ---- Section data comes straight from the HTML (single source of truth) ----
const sections = {};
document.querySelectorAll('.stop').forEach((el) => {
  sections[el.dataset.stop] = { el, title: el.dataset.title, teaser: el.dataset.teaser };
});

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

if (renderer) start(); // otherwise the plain HTML page is all there is

function start() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // transparent: CSS sky + title show through
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Weaker machines get fewer real lights (each one costs every pixel).
  const forced = new URLSearchParams(location.search).get('detail'); // ?detail=high|low, handy for testing
  const lowEnd = forced ? forced === 'low' : (navigator.hardwareConcurrency || 4) <= 4 || matchMedia('(max-width: 700px)').matches;

  // Two layers so the sun, moon, stars and clouds sit *behind* the big title while the
  // hills stay in front of it: #sky (below the text) and #scene (above the text).
  const skyRenderer = new THREE.WebGLRenderer({ canvas: skyCanvas, antialias: true, alpha: true });
  skyRenderer.setClearColor(0x000000, 0);
  skyRenderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const skyScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);
  camera.layers.enable(1); // billboards live on layer 1 (see dof.js)
  const sky = createSky(scene, skyScene, renderer);
  const world = buildWorld(scene, sections, { maxLights: lowEnd ? 6 : 14, skyScene, low: lowEnd });
  const dof = reduceMotion ? null : createDOF(renderer); // soft focus is skipped for reduced motion
  let focus = 60;

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
      const px = (v.x * 0.5 + 0.5) * window.innerWidth, py = (-v.y * 0.5 + 0.5) * window.innerHeight;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const w = x1 - x0, h = y1 - y0;
    const barPx = Math.min(h * 0.5, (b.layout.bar / b.layout.h) * h);
    // The scrolling text starts *below* the coloured bar, so it slides underneath it...
    el.style.left = x0 + 'px'; el.style.top = (y0 + barPx) + 'px';
    el.style.width = w + 'px'; el.style.height = (h - barPx) + 'px';
    el.style.fontSize = Math.min(24, Math.max(15, w / 52)) + 'px';
    // ...and the back link is pinned inside the bar.
    const back = el.querySelector('.back');
    if (back) {
      back.style.position = 'fixed';
      back.style.left = (x0 + w * 0.042) + 'px';
      back.style.top = (y0 + barPx / 2) + 'px';
      back.style.transform = 'translateY(-50%)';
      back.style.margin = '0';
      back.style.zIndex = '2';
    }
  }

  /** Where an open sign ends up: it stretches to fill the space between the controls and the nav. */
  function fitLayout(b) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const nr = nav.getBoundingClientRect();
    // The top controls fade away while a sign is open (body.sign-open), so the sign may use that space.
    const topEdge = body.classList.contains('sign-open') ? 0 : controls.getBoundingClientRect().bottom;
    const x0 = 12, x1 = vw - 12;
    const y0 = Math.max(12, topEdge + 8), y1 = Math.min(vh - 12, nr.top - 8);
    const st = stops[b.id];
    const dist = st.pos.distanceTo(st.look);
    const upp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / vh; // world units per CSS px
    const frame = (0.7 * b.scale) / upp + 4;                                        // keep the frame on screen
    const MAX = 4.5;                                                                // cap extreme stretches
    const w = Math.min(Math.max(40, x1 - x0 - 2 * frame) * upp, b.width * MAX);
    const h = Math.min(Math.max(40, y1 - y0 - 2 * frame) * upp, b.height * MAX);
    const barPx = Math.min(56, Math.max(34, (h / upp) * 0.0694)); // always tall enough to hold the back link
    return {
      w, h,
      ox: ((x0 + x1) / 2 - vw / 2) * upp,
      oy: -((y0 + y1) / 2 - vh / 2) * upp,
      bar: barPx * upp,
    };
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
    // The top controls leave as soon as we start heading to a sign (the zoom), and return when
    // we head back to the overview. The open sign then gets the full height.
    body.classList.toggle('sign-open', id !== 'home');
    nav.querySelectorAll('a').forEach((a) => {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
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
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    skyRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
    HOME.look.y = 17 - 8 * (1 - THREE.MathUtils.smoothstep(camera.aspect, 0.55, 1.0));
    if (!tween && active === 'home') cur.look.copy(HOME.look);
    world.placeBoards(camera.aspect, camera.fov, HOME.pos); // slide/stagger the signs for this screen shape
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
  const slow = { t: 0, n: 0, strikes: 0, hold: 0 }; // frame-rate watch (see end of frame())
  window.addEventListener('resize', onResize);

  // ---- Input ----
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const ray = new THREE.Raycaster();
  ray.layers.enable(1);
  const ndc = new THREE.Vector2();
  const faces = world.boards.map((b) => b.face);
  function pick(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(faces, false)[0];
    return hit ? hit.object.userData.stopId : null;
  }
  canvas.addEventListener('click', (e) => {
    if (active !== 'home') return;
    const id = pick(e);
    if (id) goTo(id);
  });
  canvas.addEventListener('pointermove', (e) => {
    canvas.style.cursor = active === 'home' && pick(e) ? 'pointer' : 'default';
  });
  // Canvas covers the page, so let clicks on empty sky/hills go back "home" when zoomed in.
  canvas.addEventListener('dblclick', () => goTo('home'));

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
    if (simple || e.target.closest('input, button')) return;
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
  function setTime(h) {
    const { night } = sky.set(h);
    world.setNight(night);
    const label = fmt(h);
    timeLabel.textContent = 'Time: ' + label;
    timeInput.setAttribute('aria-valuetext', label);
  }
  timeInput.addEventListener('input', () => setTime(parseFloat(timeInput.value)));

  simpleBtn.addEventListener('click', () => setSimple(!simple));

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
  const nowHour = Math.round((nowD.getHours() + nowD.getMinutes() / 60) * 4) / 4;
  timeInput.value = nowHour;
  setTime(nowHour);
  onResize();

  const initial = location.hash.slice(1); // read before setSimple() rewrites the hash
  active = stops[initial] ? initial : 'home';
  const startSimple = store.get('simple') === '1' || (store.get('simple') === null && reduceMotion);
  setSimple(startSimple); // when not simple, this also moves the camera to `active`

  // ---- Render loop ----
  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  /** Render both layers. `dt` only drives the focus easing, so 0 means "repaint as is". */
  function draw(dt) {
    skyRenderer.render(skyScene, camera);
    if (dof && dof.enabled) {
      // Depth of field: on the overview, focus mid-village so nearby houses blur and the middle ones stay crisp.
      const want = active === 'home' ? 54 : camera.position.distanceTo(cur.look);
      focus += (want - focus) * Math.min(1, dt * 4);
      world.setView({ ...dof.params, focus });
      dof.render(scene, camera, focus, world.signMats);
    } else {
      world.setView({ height: canvas.height, focus, aperture: 0, maxBlur: 0 });
      renderer.render(scene, camera);
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    if (simple || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.1);

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
    camera.lookAt(look);

    if (!reduceMotion) world.update(dt);

    // Name and tagline: hidden while a sign is open or being reached; while the camera pulls back
    // to the overview they fade in with its progress (the name first, the tagline a little after).
    let wantName, wantTag, direct = false;
    if (active !== 'home' || openId) { wantName = wantTag = 0; }
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

    // If the machine struggles, drop soft focus first, then resolution.
    if (performance.now() < slow.hold || tween || morph) { slow.t = 0; slow.n = 0; return; } // transitions and resizes don't count
    slow.t += dt; slow.n++;
    if (slow.t > 3) {
      const fps = slow.n / slow.t;
      slow.strikes = fps < 26 ? slow.strikes + 1 : 0;
      if (slow.strikes >= 2) { // genuinely slow for ~6s in a row
        slow.strikes = 0;
        if (dof?.enabled) dof.enabled = false;
        else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); onResize(); }
      }
      slow.t = 0; slow.n = 0;
    }
  }
  try { frame(); } catch (err) { console.error('Render loop failed:', err); }
  window.__portfolio = { scene, skyScene, camera, renderer, world, dof, slow, THREE, get focus() { return focus; }, cur };
}
