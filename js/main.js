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
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || matchMedia('(max-width: 700px)').matches;

  // Two layers so the sun, moon, stars and clouds sit *behind* the big title while the
  // hills stay in front of it: #sky (below the text) and #scene (above the text).
  const skyRenderer = new THREE.WebGLRenderer({ canvas: skyCanvas, antialias: true, alpha: true });
  skyRenderer.setClearColor(0x000000, 0);
  skyRenderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const skyScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 600);
  const sky = createSky(scene, skyScene, renderer);
  const world = buildWorld(scene, sections, { maxLights: lowEnd ? 6 : 14, skyScene });
  const dof = reduceMotion ? null : createDOF(renderer); // soft focus is skipped for reduced motion
  let focus = 60;

  // ---- Camera stops ----
  const HOME = { pos: new THREE.Vector3(0, 7, 22), look: new THREE.Vector3(0, 17, -40) };
  const stops = { home: HOME };
  for (const b of world.boards) {
    const dist = 13 * b.scale;
    stops[b.id] = {
      pos: b.center.clone().addScaledVector(b.normal, dist).add(new THREE.Vector3(0, 0.6 * b.scale, 0)),
      look: b.center.clone(),
    };
  }

  const cur = { pos: HOME.pos.clone(), look: HOME.look.clone() };
  let tween = null;
  let active = 'home';
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let parallax = 1; // 1 on the overview, 0 when zoomed in

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function openPanel(id) {
    Object.entries(sections).forEach(([k, s]) => s.el.classList.toggle('is-open', k === id));
    if (sections[id]) sections[id].el.querySelector('h2')?.focus({ preventScroll: true });
  }

  function goTo(id, { instant = false, silent = false } = {}) {
    if (!stops[id]) id = 'home';
    active = id;
    body.dataset.stop = id;
    nav.querySelectorAll('a').forEach((a) => {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    Object.values(sections).forEach((s) => s.el.classList.remove('is-open'));

    const target = stops[id];
    const finish = () => { if (active === id) openPanel(id); };
    if (instant || reduceMotion) {
      cur.pos.copy(target.pos); cur.look.copy(target.look); tween = null;
      finish();
    } else {
      tween = { fromP: cur.pos.clone(), fromL: cur.look.clone(), to: target, t: 0, dur: 1.6, done: finish };
    }
    if (!silent) live.textContent = id === 'home' ? 'Overview of the landscape' : `${sections[id].title} section`;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  }

  // ---- Simple view toggle ----
  let simple = false;
  function setSimple(on) {
    simple = on;
    body.classList.toggle('scene-mode', !on);
    simpleBtn.setAttribute('aria-pressed', String(on));
    simpleBtn.textContent = on ? 'Back to the landscape' : 'Simple view';
    store.set('simple', on ? '1' : '0');
    Object.values(sections).forEach((s) => s.el.classList.remove('is-open'));
    if (!on) { onResize(); goTo(active, { instant: true, silent: true }); }
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
    dof?.resize();
  }
  window.addEventListener('resize', onResize);

  // ---- Input ----
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const ray = new THREE.Raycaster();
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
  window.addEventListener('hashchange', () => { if (!simple) goTo(location.hash.slice(1)); });

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
  const phrases = (tagline.dataset.phrases || '').split('|').filter(Boolean);
  if (phrases.length && !reduceMotion) {
    let i = 0;
    tagline.textContent = phrases[0];
    setInterval(() => {
      tagline.classList.add('fade');
      setTimeout(() => {
        i = (i + 1) % phrases.length;
        tagline.textContent = phrases[i];
        tagline.classList.remove('fade');
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

    // Subtle parallax from pointer position, only on the overview. It fades fully to zero
    // when zoomed in on a billboard (and for reduced motion), then eases back on return.
    const target = reduceMotion || active !== 'home' ? 0 : 1;
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

    // Depth of field: focus on whatever the camera is looking at, easing between stops.
    skyRenderer.render(skyScene, camera);
    if (dof && dof.enabled) {
      // On the overview, focus mid-village so nearby houses blur and the middle ones stay crisp.
      const want = active === 'home' ? 54 : camera.position.distanceTo(cur.look);
      focus += (want - focus) * Math.min(1, dt * 4);
      world.setView({ ...dof.params, focus });
      dof.render(scene, camera, focus);
    } else {
      world.setView({ height: canvas.height, focus, aperture: 0, maxBlur: 0 });
      renderer.render(scene, camera);
    }

    // If the machine struggles, drop soft focus first, then resolution.
    slow.t += dt; slow.n++;
    if (slow.t > 3) {
      const fps = slow.n / slow.t;
      if (fps < 26) {
        if (dof?.enabled) dof.enabled = false;
        else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); onResize(); }
      }
      slow.t = 0; slow.n = 0;
    }
  }
  const slow = { t: 0, n: 0 };
  try { frame(); } catch (err) { console.error('Render loop failed:', err); }
  window.__portfolio = { scene, skyScene, camera, renderer, world };
}
