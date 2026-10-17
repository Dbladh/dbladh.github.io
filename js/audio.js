// Sound for the dirt-bike game (Web Audio, no libraries).
//
// The engine is two looping recordings (a steady idle and a high-rev burst) that are pitch-shifted by the revs and crossfaded,
// so one smooth "rpm" value (speed, how long the button has been held, airborne) makes the bike feel alive. Everything else is a
// short one-shot: recordings for the throttle blip, the crash and the rider's bounce, and small synthesised sounds for the rest
// (coins, landings, tricks, wind, dirt, mud), so there are only five files to download (about 120 KB, fetched when the game starts).
//
// Browsers only allow sound after a tap, so `unlock()` is called from the game's start and first press. A speaker button
// mutes it and remembers the choice. The file names and cuts come from audio/tools/make_audio.py.
const KEY = 'dirtbike-sound';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const loadOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };

export function createAudio({ base = 'audio/' } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return stub();
  let ctx = null, master = null, bus = null, lp = null, ready = false, loading = null, on = loadOn(), running = false;
  const buf = {};
  let engine = null, ambience = null;
  const st = { rpm: 0, eng: 0, last: 0, coinAt: -9, coinN: 0, bounceAt: -9, wind: 0, dirt: 0, mud: 0, chargeW: 0 };
  const listeners = [];

  const ensure = () => {
    if (ctx) return ctx;
    ctx = new Ctx({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ctx.destination);
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 14000; lp.connect(master);       // the camera's distance softens the engine
    bus = ctx.createGain(); bus.connect(master);
    return ctx;
  };
  const decode = (data) => new Promise((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if (p?.catch) p.catch(rej); });
  const load = () => {
    if (loading) return loading;
    const names = ['engine_idle', 'engine_high', 'rev_blip', 'crash', 'bounce'];
    loading = Promise.all(names.map((n) => fetch(`${base}${n}.mp3`).then((r) => r.arrayBuffer()).then(decode).then((b) => { buf[n] = b; }).catch(() => { /* a missing file just stays silent */ }))).then(() => { ready = true; });
    return loading;
  };
  // a looping noise buffer for wind, dirt and mud
  let noiseBuf = null;
  const noise = () => {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let b0 = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.97 * b0 + 0.03 * w; d[i] = (w * 0.5 + b0 * 6) * 0.6; }   // a little pink-ish
    return noiseBuf;
  };
  const loopSrc = (b, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; return s; };

  function buildEngine() {
    if (engine || !buf.engine_idle) return;
    const mk = (b, rate) => { const s = loopSrc(b, rate), g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(lp); s.start(0, Math.random() * Math.min(1, b.duration * 0.5)); return { s, g }; };
    engine = { idle: mk(buf.engine_idle, 1), high: buf.engine_high ? mk(buf.engine_high, 1) : null };
    const mkN = (type, f, q) => { const s = loopSrc(noise()), fl = ctx.createBiquadFilter(), g = ctx.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(bus); s.start(0, Math.random()); return { s, g, fl }; };
    ambience = { wind: mkN('bandpass', 900, 0.4), dirt: mkN('lowpass', 320, 0.7), mud: mkN('bandpass', 420, 1.2) };
  }
  function killEngine() {
    for (const n of [engine?.idle, engine?.high, ambience?.wind, ambience?.dirt, ambience?.mud]) { try { n?.s.stop(); n?.s.disconnect(); n?.g.disconnect(); } catch (e) { /* already stopped */ } }
    engine = ambience = null;
  }

  const at = (p, v, tc = 0.05) => p.setTargetAtTime(v, ctx.currentTime, tc);
  const ok = () => ctx && ready && on && ctx.state === 'running';

  // ---- one-shots ----
  function play(name, { gain = 1, rate = 1, delay = 0, lpf = 0 } = {}) {
    if (!ok() || !buf[name]) return;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf[name]; s.playbackRate.value = rate; g.gain.value = gain;
    let out = g; s.connect(g);
    if (lpf) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; g.connect(f); out = f; }
    out.connect(bus); s.start(ctx.currentTime + delay); s.onended = () => { try { s.disconnect(); out.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
  }
  function tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
  }
  function swoosh(dur, f0, f1, { gain = 0.18, q = 1.2, type = 'bandpass', delay = 0 } = {}) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(); s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05); s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
  }
  const thud = (gain = 0.5, f = 120) => { tone(f, 0.22, { gain, slide: f * 0.4, type: 'sine' }); swoosh(0.16, 900, 120, { gain: gain * 0.7, type: 'lowpass', q: 0.7 }); };

  const api = {
    get _debug() { return { ctx, buf, st, engine, ambience, ready }; },   // (for tests)
    get enabled() { return on; },
    set enabled(v) {
      on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
      if (ctx) at(master.gain, on ? 0.8 : 0, 0.04);
      if (on && ctx) ctx.resume?.();
      for (const f of listeners) f(on);
    },
    onChange(f) { listeners.push(f); },
    /** Call from a tap (the game's start or its first press): the browser only allows sound after one. */
    unlock() {
      ensure();
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }   // iOS: play even with the silent switch on
      if (ctx.state !== 'running') ctx.resume?.();
      if (!loading) load().then(() => { if (running) buildEngine(); });
    },
    /** A ride begins: the engine starts. */
    start() { running = true; st.rpm = 0.2; st.eng = 0; if (ready) buildEngine(); },
    /** Leave the game: everything stops. */
    stop() { running = false; killEngine(); },
    pause() { try { ctx?.suspend(); } catch (e) { /* none */ } },
    resume() { try { if (running || ctx) ctx?.resume(); } catch (e) { /* none */ } },

    /** Every frame while the game runs. s: { playing, vx, speedK, charge, boost, grounded, mud, camDist, dt } */
    update(s) {
      if (!ctx || !engine || !on) return;
      const dt = Math.min(0.1, s.dt || 0.016);
      // revs: up quickly, down slowly. On the ground they follow speed and the held charge; in the air the engine runs free.
      const target = s.playing ? (s.grounded ? clamp(0.2 + 0.42 * s.speedK + 0.3 * s.charge + 0.1 * s.boost) : clamp(0.72 + 0.22 * s.speedK + 0.06 * s.boost)) : 0;
      st.rpm += (target - st.rpm) * (1 - Math.exp(-(target > st.rpm ? 7 : 2.4) * dt));
      st.eng += ((s.playing ? 1 : 0) - st.eng) * (1 - Math.exp(-(s.playing ? 4 : 14) * dt));       // cut quickly in a crash
      st.chargeW = s.charge >= 0.98 && s.grounded ? Math.sin(ctx.currentTime * 60) * 0.015 : 0;      // at full charge the engine trembles
      const r = clamp(st.rpm), loud = (0.5 + 0.5 * r) * st.eng;
      const wgIdle = 1 - smooth(0.2, 0.7, r), wgHigh = smooth(0.25, 0.8, r);
      at(engine.idle.g.gain, wgIdle * loud * 0.9, 0.04); at(engine.idle.s.playbackRate, 0.86 + 1.0 * r + st.chargeW, 0.05);
      if (engine.high) { at(engine.high.g.gain, wgHigh * loud * 0.8, 0.04); at(engine.high.s.playbackRate, 0.84 + 0.36 * r + st.chargeW, 0.05); }
      at(lp.frequency, 14000 - 10500 * clamp(((s.camDist || 26) - 24) / 40), 0.2);                   // far camera: a more distant, duller engine
      // wind, tyres on dirt and mud
      const sp = s.playing ? s.speedK : 0;
      at(ambience.wind.g.gain, 0.22 * sp * sp * (s.grounded ? 0.8 : 1), 0.12); at(ambience.wind.fl.frequency, 500 + 1400 * sp, 0.2);
      at(ambience.dirt.g.gain, s.grounded && s.playing ? 0.1 + 0.2 * sp : 0, 0.08);
      at(ambience.mud.g.gain, s.playing && s.grounded ? 0.5 * (s.mud || 0) : 0, 0.08);
    },

    // ---- events ----
    jump(charge) { if (charge > 0.25) play('rev_blip', { gain: 0.3 + 0.5 * charge, rate: 0.95 + 0.15 * charge }); thud(0.2 + 0.15 * charge, 90); },
    land(kind, air = 0.5) {
      if (kind === 'perfect') { thud(0.5, 110); tone(1318, 0.5, { type: 'triangle', gain: 0.12, delay: 0.04 }); tone(1976, 0.6, { type: 'triangle', gain: 0.1, delay: 0.1 }); }
      else if (kind === 'clean') thud(0.4, 100);
      else if (kind === 'rough') { thud(0.8, 80); play('bounce', { gain: 0.55, rate: 0.75, lpf: 1800 }); }
      else if (air > 0.2) thud(0.22, 100);
    },
    coin() {
      if (!ctx) return;
      const now = ctx.currentTime; st.coinN = now - st.coinAt < 0.8 ? Math.min(7, st.coinN + 1) : 0; st.coinAt = now;
      const steps = [0, 2, 4, 7, 9, 12, 14, 16], f = 988 * Math.pow(2, steps[st.coinN] / 12);
      tone(f, 0.28, { type: 'triangle', gain: 0.16 }); tone(f * 2.005, 0.34, { type: 'sine', gain: 0.07, delay: 0.015 });
    },
    combo(level) { const b = 523 * Math.pow(2, (level - 1) * 2 / 12); [0, 4, 7].forEach((st_, i) => tone(b * Math.pow(2, st_ / 12), 0.3, { type: 'triangle', gain: 0.13, delay: i * 0.065 })); },
    trick() { swoosh(0.34, 500, 3200, { gain: 0.2, q: 1.4 }); },
    trickDone() { tone(880, 0.22, { type: 'triangle', gain: 0.1 }); tone(1320, 0.3, { type: 'triangle', gain: 0.09, delay: 0.07 }); },
    crash(pit) {
      play('crash', { gain: pit ? 0.5 : 0.95 });
      if (pit) { tone(900, 1.1, { type: 'sine', gain: 0.12, slide: 140 }); swoosh(1.0, 1400, 150, { gain: 0.2, type: 'lowpass' }); }
    },
    bounce(v = 5) {
      if (!ctx || ctx.currentTime - st.bounceAt < 0.14 || v < 2) return; st.bounceAt = ctx.currentTime;
      play('bounce', { gain: clamp(0.15 + v * 0.045, 0, 0.9), rate: 0.85 + Math.random() * 0.4 });
    },
    over(best) { tone(392, 0.5, { type: 'triangle', gain: 0.12, delay: 0.15 }); tone(294, 0.7, { type: 'triangle', gain: 0.12, delay: 0.35 }); if (best) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.12, delay: 0.7 + i * 0.1 })); },
  };
  return api;
}

/** No Web Audio: every call does nothing. */
function stub() {
  const f = () => {};
  return { enabled: false, onChange: f, unlock: f, start: f, stop: f, pause: f, resume: f, update: f, jump: f, land: f, coin: f, combo: f, trick: f, trickDone: f, crash: f, bounce: f, over: f };
}
