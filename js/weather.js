// The weather: a small state of numbers (0..1) that eases towards a target, read by the sky, the clouds, the ground, the particles and the sound. No THREE here.
//   cloud (how overcast), rain, snow, fog, wind, storm (thunder and lightning), plus wet and cover (what rain and snow leave on the ground: they build up and dry or melt slowly).
// The target comes from a preset: `?weather=rain` in the address, or `weather.set('rain')` (and, in later steps, from the month, the time of day and the local weather).
const KEYS = ['cloud', 'rain', 'snow', 'fog', 'wind', 'storm'];
const OMEGA = { cloud: 0.7, rain: 0.75, snow: 0.6, fog: 0.42, wind: 0.5, storm: 0.6 };      // how quickly each follows its target (per second): fog is the slowest
export const PRESETS = {
  clear: { cloud: 0.06, rain: 0, snow: 0, fog: 0, wind: 0.12, storm: 0 },
  cloudy: { cloud: 0.78, rain: 0, snow: 0, fog: 0.05, wind: 0.35, storm: 0 },
  rain: { cloud: 0.92, rain: 0.75, snow: 0, fog: 0.2, wind: 0.4, storm: 0 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.25, wind: 0.85, storm: 1 },
  snow: { cloud: 0.85, rain: 0, snow: 0.8, fog: 0.25, wind: 0.22, storm: 0 },
  fog: { cloud: 0.55, rain: 0, snow: 0, fog: 0.95, wind: 0.04, storm: 0 },
  shower: { cloud: 0.64, rain: 0.6, snow: 0, fog: 0.05, wind: 0.25, storm: 0 },                // a sun shower: rain falling through a bright, broken sky (a rainbow comes with it)
};

// ---- where the weather comes from ----
// 'auto': a seeded guess from the real date and time of day, shaped by the season (the same for everyone on a given day, mostly clear); 'local': what it is doing where the visitor is (Open-Meteo, no key,
// only after they ask, with their position rounded to about 10 km); or a preset picked by hand. The mode and the last local reading are remembered (the reading for half an hour).
const SEASON = [   // clear, cloudy, rain, storm, snow, fog, per month (January first)
  [0.36, 0.2, 0.05, 0, 0.25, 0.14], [0.38, 0.2, 0.06, 0, 0.22, 0.14], [0.45, 0.2, 0.2, 0.02, 0.06, 0.07], [0.46, 0.2, 0.24, 0.04, 0, 0.06], [0.5, 0.2, 0.2, 0.06, 0, 0.04], [0.58, 0.16, 0.12, 0.11, 0, 0.03],
  [0.6, 0.15, 0.1, 0.13, 0, 0.02], [0.6, 0.15, 0.1, 0.12, 0, 0.03], [0.46, 0.2, 0.16, 0.04, 0, 0.14], [0.36, 0.22, 0.2, 0.02, 0, 0.2], [0.34, 0.25, 0.2, 0.01, 0.06, 0.14], [0.34, 0.2, 0.08, 0, 0.26, 0.12],
];
const NAMES = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
const hashS = (n) => { let h = (n ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** The guess for a real date: a preset name (the weather is held for a three hour block, so it changes slowly and is the same for everyone). */
export function baseline(date = new Date()) {
  const m = date.getMonth(), block = Math.floor(date.getHours() / 3), key = date.getFullYear() * 10000 + (m + 1) * 100 + date.getDate();
  const w = SEASON[m].slice(); if (date.getHours() < 13 || date.getHours() > 22) w[3] *= 0.2; if (date.getHours() > 9 && date.getHours() < 17) w[5] *= 0.15;      // (storms build in the afternoon, fog lies in the early hours)
  let r = hashS(key * 8 + block) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 6; i++) { r -= w[i]; if (r <= 0) return NAMES[i] === 'rain' && m >= 2 && m <= 8 && hashS(key * 3 + block) < 0.4 ? 'shower' : NAMES[i]; }
  return 'clear';
}
/** Turn a reading of the weather outside (Open-Meteo's WMO code, cloud cover, wind) into the numbers the landscape uses. */
export function fromReading({ code = 0, cloud = 0, wind = 0 }) {
  const c = Math.min(1, Math.max(0.04, cloud / 100 * 0.9)), wd = Math.min(1, Math.max(0.05, wind / 40)), o = { cloud: c, rain: 0, snow: 0, fog: 0, wind: wd, storm: 0 };
  if (code === 45 || code === 48) { o.fog = 0.95; o.cloud = Math.max(c, 0.5); }
  else if (code >= 51 && code <= 57) { o.rain = 0.35; o.cloud = Math.max(c, 0.8); }
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) { o.rain = code === 61 || code === 80 ? 0.55 : code === 63 || code === 81 ? 0.8 : 1; o.cloud = Math.max(c, 0.9); }
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { o.snow = code === 71 || code === 85 ? 0.45 : code === 73 ? 0.7 : 0.95; o.cloud = Math.max(c, 0.85); }
  else if (code >= 95) { o.rain = 1; o.storm = 1; o.cloud = 1; o.wind = Math.max(o.wind, 0.7); }
  return o;
}
/** The simple icon for a set of numbers: sun, moon, partly cloudy, cloud, rain, storm, snow or fog. */
export const kindOf = (t, night = false) => (t.storm > 0.5 ? 'storm' : t.snow > 0.3 ? 'snow' : t.rain > 0.25 && t.cloud < 0.72 && !night ? 'shower' : t.rain > 0.25 ? 'rain' : t.fog > 0.5 ? 'fog' : t.cloud > 0.55 ? 'cloud' : t.cloud > 0.25 ? 'partly' : night ? 'moon' : 'sun');

export function createWeather({ calm = false } = {}) {
  const vel = { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0, storm: 0 }, state = { cloud: 0.06, rain: 0, snow: 0, fog: 0, wind: 0.12, storm: 0, wet: 0, cover: 0, roof: 0, tree: 0, bow: 0, mist: 0, flash: 0 }, target = { ...PRESETS.clear };
  let name = 'clear', hold = null, rate = 0.16, mode = 'auto', temp = null, place = null;
  const subs = new Set(), store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const changed = () => { for (const f of subs) f(api); };
  let autoT = 0, autoName = '', localT = 1800;
  const applyReading = (rd) => { api.set(fromReading({ code: rd.code, cloud: rd.cloud, wind: rd.wind })); temp = rd.temp; place = 'here'; };
  void place;
  const api = {
    state,
    get name() { return name; },
    busy: false,
    quiet: false,                       // (in the games: no lightning flashes)
    get mode() { return mode; },
    get temp() { return temp; },
    /** The icon name for what the weather is heading for (the target, so the icon changes the moment it is chosen). */
    kind(night = false) { return kindOf(target, night); },
    onChange(f) { subs.add(f); },
    /** 'auto' (the guess from the date and time), 'local' (asks for the position first if it must) or a preset name. Returns what happened for 'local': 'ok', 'denied' or 'failed'. */
    async setMode(m) {
      if (m === 'local') {
        const r = await api.useLocal(); if (r !== 'ok') return r; mode = 'local'; store.set('wx.mode', 'local'); changed(); return 'ok';
      }
      mode = m === 'auto' ? 'auto' : 'preset'; temp = null; store.set('wx.mode', m);
      if (m === 'auto') api.set(baseline()); else api.set(m);
      changed(); return 'ok';
    },
    /** Read the weather where the visitor is: from the last reading if it is under half an hour old, else the browser's position (rounded) and Open-Meteo. */
    async useLocal(quiet = false) {
      try {
        const c = JSON.parse(store.get('wx.local') || 'null');
        if (c && Date.now() - c.t < 30 * 60 * 1000) { applyReading(c); return 'ok'; }
      } catch (e) { /* no reading kept */ }
      if (quiet) { try { const ps = await navigator.permissions.query({ name: 'geolocation' }); if (ps.state !== 'granted') return 'denied'; } catch (e) { return 'denied'; } }          // (a refresh in the background never asks)
      let pos; try { pos = await new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, { timeout: 9000, maximumAge: 3600000 }) : rej(new Error('none'))); } catch (e) { return e && e.code === 1 ? 'denied' : 'failed'; }
      const lat = Math.round(pos.coords.latitude * 10) / 10, lon = Math.round(pos.coords.longitude * 10) / 10, ac = new AbortController(), to = setTimeout(() => ac.abort(), 7000);
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m&wind_speed_unit=kmh`, { signal: ac.signal });
        const j = await r.json(), cur = j.current; if (!cur) return 'failed';
        const rd = { t: Date.now(), code: cur.weather_code, cloud: cur.cloud_cover, wind: cur.wind_speed_10m, temp: cur.temperature_2m }; store.set('wx.local', JSON.stringify(rd)); applyReading(rd); return 'ok';
      } catch (e) { return 'failed'; } finally { clearTimeout(to); }
    },
    /** Called every frame: in 'auto' the guess is looked at again every few minutes (it changes only every three hours); a stale local reading is refreshed. */
    tick(dt) {
      if (mode === 'auto') { autoT -= dt; if (autoT <= 0) { autoT = 300; const b = baseline(); if (b !== autoName) { autoName = b; api.set(b); changed(); } } }
      else if (mode === 'local') { localT -= dt; if (localT <= 0) { localT = 1800; api.useLocal(true).then(() => changed()); } }
    },
    names: Object.keys(PRESETS),
    /** Go to a preset (eased over several seconds), or to the given numbers; `instant` jumps there. */
    set(preset, instant = false) {
      const p = typeof preset === 'string' ? PRESETS[preset] : preset; if (!p) return false;
      name = typeof preset === 'string' ? preset : 'custom'; for (const k of KEYS) target[k] = p[k] ?? 0;
      if (instant) { for (const k of KEYS) { state[k] = target[k]; vel[k] = 0; } state.wet = state.rain > 0.3 ? 1 : 0; state.cover = state.roof = state.tree = state.snow > 0.3 ? 1 : 0; }
      return true;
    },
    /** One step: the numbers ease towards the target, the ground gets wet or snowy (and dries or melts more slowly), a lightning flash dies away. */
    update(dt, onFlash) {
      // Each number follows its target on a critically damped spring (a smooth start and a smooth stop, no overshoot, about 8 s to settle). Rain and snow only build once the clouds have: they follow the sky, not the other way round.
      const step = Math.min(dt, 0.1);
      for (const k of KEYS) {
        let tg = target[k]; if (k === 'rain' || k === 'snow') tg *= Math.min(1, Math.max(0, (state.cloud - 0.4) / 0.35)); else if (k === 'storm') tg *= Math.min(1, Math.max(0, (state.rain - 0.2) / 0.5));
        const w = OMEGA[k]; vel[k] += ((tg - state[k]) * w * w - 2 * w * vel[k]) * step; state[k] += vel[k] * step;
      }
      state.wet += ((state.rain > 0.15 ? 1 : 0) - state.wet) * (1 - Math.exp(-dt * (state.rain > 0.15 ? 0.12 : 0.012)));
      { // snow lies down while it falls and melts away steadily afterwards, for good: the trees and roofs shed it first, the ground keeps it longest; rain and a clear sky thaw it faster
      const snowing = state.snow > 0.15, thaw = 1 + 2.5 * state.rain + 0.8 * (1 - state.cloud) + 1.5 * state.wind * (1 - state.cloud);
      if (snowing) { const up = 1 - Math.exp(-dt * 0.02); state.cover += (1 - state.cover) * up; state.roof += (1 - state.roof) * up * 1.4; state.tree += (1 - state.tree) * up * 1.8; }
      else { state.cover = Math.max(0, state.cover - dt * thaw / 360); state.roof = Math.max(0, state.roof - dt * thaw / 200); state.tree = Math.max(0, state.tree - dt * thaw / 120); }
    }
      { // a rainbow: while the ground is still wet and the rain has eased, under a sky that is not shut (the sky also needs the sun up and on the far side)
        const bt = Math.min(1, state.wet) * Math.min(1, Math.max(0, 1 - state.rain * 1.6)) * (1 - Math.min(1, Math.max(0, (state.cloud - 0.55) / 0.35))) * (state.snow > 0.1 ? 0 : 1), up = bt > state.bow ? 0.25 : 0.4;
        state.bow += (bt - state.bow) * (1 - Math.exp(-dt * up));
      }
      state.mist = Math.max(state.fog, state.rain * 0.65, state.wet * 0.3 * (1 - Math.min(1, state.snow * 2)));          // (the mist: thick in fog, thinner in rain, and a thin trace over wet ground)
      state.flash = Math.max(0, state.flash - dt * 3.2);
      api.busy = state.flash > 0.01 || KEYS.some((k) => Math.abs(target[k] - state[k]) > 0.004 || Math.abs(vel[k]) > 0.002);
      if (state.storm > 0.3) { hold = hold === null ? 4 + Math.random() * 8 : hold - dt; if (hold <= 0) { hold = 8 + Math.random() * 17; if (!calm && !api.quiet) state.flash = 1; onFlash?.(); } } else hold = null;
    },
  };
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('weather') : null, saved = store.get('wx.mode');
  if (q && PRESETS[q]) { mode = 'preset'; api.set(q, true); }
  else if (q === 'auto' || !saved || saved === 'auto') { mode = 'auto'; autoName = baseline(); api.set(autoName, true); }
  else if (saved === 'local') { mode = 'local'; api.useLocal(true).then((r) => { if (r === 'ok') { for (const k of KEYS) state[k] = target[k]; state.wet = state.rain > 0.3 ? 1 : 0; state.cover = state.roof = state.tree = state.snow > 0.3 ? 1 : 0; } else { mode = 'auto'; autoName = baseline(); api.set(autoName, true); } changed(); }); }
  else if (PRESETS[saved]) { mode = 'preset'; api.set(saved, true); }
  return api;
}
