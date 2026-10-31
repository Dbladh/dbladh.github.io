// The weather: a small state of numbers (0..1) that eases towards a target, read by the sky, the clouds, the ground, the particles and the sound. No THREE here.
//   cloud (how overcast), rain, snow, fog, wind, storm (thunder and lightning), plus wet and cover (what rain and snow leave on the ground: they build up and dry or melt slowly).
// The target comes from a preset: `?weather=rain` in the address, or `weather.set('rain')` (and, in later steps, from the month, the time of day and the local weather).
const KEYS = ['cloud', 'rain', 'snow', 'fog', 'wind', 'storm'];
export const PRESETS = {
  clear: { cloud: 0.06, rain: 0, snow: 0, fog: 0, wind: 0.12, storm: 0 },
  cloudy: { cloud: 0.78, rain: 0, snow: 0, fog: 0.05, wind: 0.35, storm: 0 },
  rain: { cloud: 0.92, rain: 0.75, snow: 0, fog: 0.2, wind: 0.4, storm: 0 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.25, wind: 0.85, storm: 1 },
  snow: { cloud: 0.85, rain: 0, snow: 0.8, fog: 0.25, wind: 0.22, storm: 0 },
  fog: { cloud: 0.55, rain: 0, snow: 0, fog: 0.95, wind: 0.04, storm: 0 },
};

export function createWeather() {
  const state = { cloud: 0.06, rain: 0, snow: 0, fog: 0, wind: 0.12, storm: 0, wet: 0, cover: 0, flash: 0 }, target = { ...PRESETS.clear };
  let name = 'clear', hold = null, rate = 0.16;
  const api = {
    state,
    get name() { return name; },
    busy: false,
    names: Object.keys(PRESETS),
    /** Go to a preset (eased over several seconds), or to the given numbers; `instant` jumps there. */
    set(preset, instant = false) {
      const p = typeof preset === 'string' ? PRESETS[preset] : preset; if (!p) return false;
      name = typeof preset === 'string' ? preset : 'custom'; for (const k of KEYS) target[k] = p[k] ?? 0;
      if (instant) { for (const k of KEYS) state[k] = target[k]; state.wet = state.rain > 0.3 ? 1 : 0; state.cover = state.snow > 0.3 ? 1 : 0; }
      return true;
    },
    /** One step: the numbers ease towards the target, the ground gets wet or snowy (and dries or melts more slowly), a lightning flash dies away. */
    update(dt, onFlash) {
      const e = 1 - Math.exp(-dt * rate);
      for (const k of KEYS) state[k] += (target[k] - state[k]) * e;
      state.wet += ((state.rain > 0.15 ? 1 : 0) - state.wet) * (1 - Math.exp(-dt * (state.rain > 0.15 ? 0.12 : 0.012)));
      state.cover += ((state.snow > 0.15 ? 1 : 0) - state.cover) * (1 - Math.exp(-dt * (state.snow > 0.15 ? 0.02 : 0.006)));
      state.flash = Math.max(0, state.flash - dt * 3.2);
      api.busy = state.flash > 0.01 || KEYS.some((k) => Math.abs(target[k] - state[k]) > 0.004);
      if (state.storm > 0.3) { hold = hold === null ? 4 + Math.random() * 8 : hold - dt; if (hold <= 0) { hold = 8 + Math.random() * 17; state.flash = 1; onFlash?.(); } } else hold = null;
    },
  };
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('weather') : null;
  if (q && PRESETS[q]) api.set(q, true);
  return api;
}
