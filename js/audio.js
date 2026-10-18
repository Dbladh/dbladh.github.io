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
const ENGINE_GAIN = 0.7;                // the engine's overall level (the one-shots sit on top of it)
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// ?engine=synth plays a synthesised engine (audio/engine-worklet.js) instead of the recording, for comparing by ear
const VARIANT = (/[?&]engine=(\w+)/.exec(location.search) || [])[1] || 'grain';
// Sound is off until the player turns it on (the speaker buttons remember the choice). Clicking the bike to start the game turns it on for that visit
// unless the player has switched it off on purpose.
const loadPref = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };

export function createAudio({ base = 'audio/' } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return stub();
  let synthOK = false, ctx = null, master = null, bus = null, lp = null, soft = null, dull = null, fx = null, ready = false, loading = null, on = loadPref() === '1', running = false, scn = null, scnLoading = null;
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
    soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 4200; soft.Q.value = 0.5; soft.connect(bus);   // rewards: rounded, never harsh
    dull = ctx.createBiquadFilter(); dull.type = 'lowpass'; dull.frequency.value = 1500; dull.Q.value = 0.7; dull.connect(bus);   // setbacks: muffled and low
    return ctx;
  };
  const decode = (data) => new Promise((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if (p?.catch) p.catch(rej); });
  const load = () => {
    if (loading) return loading;
    const names = ['engine_idle', 'rev_blip', 'crash', 'bounce'];
    const synth = VARIANT === 'synth' && ctx.audioWorklet ? ctx.audioWorklet.addModule(`${base}engine-worklet.js`).then(() => { synthOK = true; }).catch(() => { /* falls back to the recording */ }) : null;
    loading = Promise.all([synth, ...names.map((n) => fetch(`${base}${n}.mp3`).then((r) => r.arrayBuffer()).then(decode).then((b) => { buf[n] = b; }).catch(() => { /* a missing file just stays silent */ }))]).then(() => { ready = true; });
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

  // The engine is played as grains: short slices (0.5 s) of a longer recording, faded in and out and overlapped by half. The important
  // detail is *where* each new slice starts: either exactly where the playing one would carry on, or at a different place in the recording
  // chosen so that its waveform lines up with the playing one (found by a short cross-correlation). Slices taken from random places
  // without that would have their firing pulses out of step, and the overlap would beat and pulse like a rapid loop.
  const GRAIN = 0.5;
  const win = (() => { const w = new Float32Array(48); for (let i = 0; i < w.length; i++) { const x = Math.sin(Math.PI * i / (w.length - 1)); w[i] = x * x; } return w; })();   // (sums to 1 for aligned overlaps)
  function grainLayer(b, dest = lp) { const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(dest); return { b, data: b.getChannelData(0), bus, next: 0, rate: 1, pr: 1, pos: -1 }; }
  /** The start in the recording, near `cand`, whose next 60 ms best matches what is playing from `cont` (seconds). */
  function align(L, cont, cand) {
    const d = L.data, sr = L.b.sampleRate, W = Math.floor(0.06 * sr), R = Math.floor(0.036 * sr), c0 = Math.floor(cont * sr), k0 = Math.floor(cand * sr);
    if (c0 < 0 || c0 + W >= d.length) return cand;
    let e1 = 1e-9; for (let i = 0; i < W; i += 2) e1 += d[c0 + i] * d[c0 + i];
    let best = -2, bd = 0;
    for (let sh = -R; sh <= R; sh += 2) {
      const k = k0 + sh; if (k < 0 || k + W >= d.length) continue;
      let dot = 0, e2 = 1e-9; for (let i = 0; i < W; i += 2) { const v = d[k + i]; dot += d[c0 + i] * v; e2 += v * v; }
      const sc = dot / Math.sqrt(e1 * e2); if (sc > best) { best = sc; bd = sh; }
    }
    return (k0 + bd) / sr;
  }
  function grain(L, t) {
    const dur = L.b.duration, lo = 0.05, hi = dur - GRAIN * L.rate - 0.05;
    let pos;
    if (L.pos < 0) pos = lo + Math.random() * Math.max(0.01, hi - lo);
    else {
      const cont = L.pos + GRAIN * 0.5 * L.pr;                                                     // where the playing slice has got to
      if (cont > hi || Math.random() < 0.45) {                                                      // carry on, or hop somewhere else (always a place that lines up)
        let cand = lo + Math.random() * Math.max(0.01, hi - lo);
        if (Math.abs(cand - cont) < 0.4) cand = cont > (lo + hi) / 2 ? cand - 0.8 : cand + 0.8;
        cand = Math.min(hi, Math.max(lo, cand));
        pos = cont > hi ? align(L, Math.min(cont, dur - 0.2), cand) : align(L, cont, cand);
      } else pos = cont;
    }
    pos = Math.min(hi, Math.max(lo, pos)); L.pos = pos; L.pr = L.rate;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = L.b; s.playbackRate.value = L.rate;
    g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(win, t, GRAIN);
    s.connect(g); g.connect(L.bus); s.start(t, pos, GRAIN * L.rate + 0.02); s.onended = () => { try { s.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
  }
  function pump(L) {                                                                        // keep the next ~0.15 s of grains scheduled
    const now = ctx.currentTime;
    if (L.next < now) L.next = now + 0.01;
    while (L.next < now + 0.15) { grain(L, L.next); L.next += GRAIN * 0.5; }
  }
  function buildEngine() {
    if (engine || !buf.engine_idle) return;
    if (synthOK) {
      const node = new AudioWorkletNode(ctx, 'dirt-engine', { numberOfInputs: 0, outputChannelCount: [1] }), bus = ctx.createGain(); bus.gain.value = 0; node.connect(bus); bus.connect(lp);
      engine = { synth: { node, bus } };
    } else engine = { idle: grainLayer(buf.engine_idle) };
    const mkN = (type, f, q) => { const s = loopSrc(noise()), fl = ctx.createBiquadFilter(), g = ctx.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(bus); s.start(0, Math.random()); return { s, g, fl }; };
    ambience = { wind: mkN('bandpass', 900, 0.4), dirt: mkN('lowpass', 320, 0.7), mud: mkN('bandpass', 420, 1.2) };
    const osc = (type) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = 300; g.gain.value = 0; o.connect(g); g.connect(soft); o.start(); return { o, g }; };
    fx = { air: osc('sine'), charge: osc('triangle') };                              // a tone that climbs the longer you stay up, and a whine that builds as you charge
  }
  function killEngine() {
    for (const L of [engine?.idle, engine?.synth]) { try { L?.bus.disconnect(); L?.node?.disconnect(); } catch (e) { /* gone */ } }
    for (const n of [ambience?.wind, ambience?.dirt, ambience?.mud]) { try { n?.s.stop(); n?.s.disconnect(); n?.g.disconnect(); } catch (e) { /* already stopped */ } }
    for (const n of [fx?.air, fx?.charge]) { try { n?.o.stop(); n?.o.disconnect(); n?.g.disconnect(); } catch (e) { /* already stopped */ } }
    engine = ambience = fx = null;
  }

  // ---- the landscape: day and night ambience, a faint windmill, and the far-off dirt bike when it rides through ----
  const SCENE_FILES = ['amb_day', 'amb_night', 'amb_windmill'];
  function loadScene() {
    if (scnLoading || !ctx) return scnLoading;
    scnLoading = Promise.all(SCENE_FILES.map((n) => fetch(`${base}${n}.mp3`).then((r) => r.arrayBuffer()).then(decode).then((b) => { buf[n] = b; }).catch(() => { /* stays silent */ })))
      .then(() => loading).then(() => buildScene());
    return scnLoading;
  }
  function buildScene() {
    if (scn || !ctx || !buf.amb_day || !buf.amb_night) return;
    const out = ctx.createGain(); out.gain.value = 1; out.connect(master);
    const loop = (name, { lpf = 0, pan = false } = {}) => {
      const src = loopSrc(buf[name]), g = ctx.createGain(); g.gain.value = 0; let node = src;
      if (lpf) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; node.connect(f); node = f; }
      node.connect(g); let p = null;
      if (pan && ctx.createStereoPanner) { p = ctx.createStereoPanner(); g.connect(p); p.connect(out); } else g.connect(out);
      src.start(0, Math.random() * buf[name].duration);
      return { src, g, p };
    };
    scn = { out, day: loop('amb_day'), night: loop('amb_night'), wind: buf.amb_windmill ? loop('amb_windmill', { lpf: 2400, pan: true }) : null, bike: null };
    if (buf.engine_idle) {                                                  // the bike far off: the same engine, muffled, quiet and panned
      const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; g.connect(f);
      let p = null; if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); f.connect(p); p.connect(out); } else f.connect(out);
      const layer = grainLayer(buf.engine_idle, g); layer.bus.gain.value = 1; layer.rate = 1.12;
      scn.bike = { g, p, layer };
    }
  }
  const at = (p, v, tc = 0.05) => p.setTargetAtTime(v, ctx.currentTime, tc);
  const ok = () => ctx && ready && on && ctx.state === 'running';

  // ---- one-shots ----
  function play(name, { gain = 1, rate = 1, delay = 0, lpf = 0, offset = 0, dur = 0 } = {}) {
    if (!ok() || !buf[name]) return;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf[name]; s.playbackRate.value = rate; g.gain.value = gain;
    let out = g; s.connect(g);
    if (lpf) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; g.connect(f); out = f; }
    out.connect(bus);
    if (dur) { const t = ctx.currentTime + delay; g.gain.setValueAtTime(gain, t); g.gain.setValueAtTime(gain, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur); s.start(t, offset, dur + 0.05); } else s.start(ctx.currentTime + delay); s.onended = () => { try { s.disconnect(); out.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
  }
  function tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0, attack = 0.005, dest = null } = {}) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || bus); o.start(t); o.stop(t + dur + 0.05); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
  }
  function swoosh(dur, f0, f1, { gain = 0.18, q = 1.2, type = 'bandpass', delay = 0 } = {}) {
    if (!ok()) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(); s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05); s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
  }
  const lastAt = {};
  const gate = (name, min) => { const t = ctx.currentTime; if (t - (lastAt[name] ?? -9) < min) return false; lastAt[name] = t; return true; };       // (no sound may stack on itself)
  const thud = (gain = 0.5, f = 120) => { tone(f, 0.22, { gain, slide: f * 0.4, type: 'sine' }); swoosh(0.16, 900, 120, { gain: gain * 0.7, type: 'lowpass', q: 0.7 }); };

  const api = {
    get _debug() { return { ctx, buf, st, engine, ambience, ready, scn }; },   // (for tests)
    get enabled() { return on; },
    set enabled(v) {
      on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
      if (ctx) at(master.gain, on ? 0.8 : 0, 0.04);
      if (on && ctx) { ctx.resume?.(); loadScene(); }
      for (const f of listeners) f(on);
    },
    /** Turn sound on for this visit (not remembered) if the player has never chosen: the game and the bike easter egg. */
    autoOn() {
      if (on || loadPref() !== null) return;
      on = true; if (ctx) { at(master.gain, 0.8, 0.04); ctx.resume?.(); loadScene(); }
      for (const f of listeners) f(on);
    },
    /** Every frame in the landscape. s: { night 0..1, quiet (the game is on), windPan -1..1, bike: { gain, pan } | null } */
    sceneUpdate(s) {
      if (!ctx || !on || !scn) return;
      const k = s.quiet ? 0.25 : 1;
      at(scn.day.g.gain, 0.26 * (1 - s.night) * k, 1.4); at(scn.night.g.gain, 0.24 * s.night * k, 1.4);
      if (scn.wind) { at(scn.wind.g.gain, s.quiet ? 0 : 0.045, 0.9); if (scn.wind.p) at(scn.wind.p.pan, clamp(s.windPan || 0, -1, 1) * 0.7, 0.4); }
      if (scn.bike) {
        const g = !s.quiet && s.bike ? s.bike.gain : 0; at(scn.bike.g.gain, g, 0.3);
        if (g > 0.002) { if (scn.bike.p) at(scn.bike.p.pan, clamp(s.bike.pan, -1, 1) * 0.8, 0.2); pump(scn.bike.layer); }
      }
    },
    /** The camera flies into a billboard ('in'), back out to the view ('out') or between billboards ('across'): a soft whoosh. */
    zoom(kind = 'in') {
      if (!ctx || !gate('zoom', 0.3)) return;
      if (kind === 'in') { swoosh(0.95, 450, 2800, { gain: 0.13, q: 0.8 }); tone(196, 0.8, { type: 'sine', gain: 0.035, slide: 392, dest: soft }); }
      else if (kind === 'out') { swoosh(1.0, 2800, 380, { gain: 0.12, q: 0.8 }); tone(392, 0.9, { type: 'sine', gain: 0.03, slide: 196, dest: soft }); }
      else swoosh(0.6, 700, 2000, { gain: 0.09, q: 1.0 });
    },
    /** The bike was clicked: a bright rising sparkle to say an easter egg was found. */
    easter() {
      if (!ctx) return;
      [659, 784, 988, 1175, 1319, 1568, 1976].forEach((f, i) => { tone(f, 0.5, { type: 'sine', gain: 0.1, delay: i * 0.07, dest: soft }); tone(f * 2.01, 0.3, { type: 'triangle', gain: 0.025, delay: i * 0.07, dest: soft }); });
      [1319, 1659, 1976].forEach((f, i) => tone(f, 0.9, { type: 'sine', gain: 0.06, delay: 0.55 + i * 0.05, dest: soft }));
    },
    onChange(f) { listeners.push(f); },
    /** Call from a tap (the game's start or its first press): the browser only allows sound after one. */
    unlock() {
      ensure();
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }   // iOS: play even with the silent switch on
      if (ctx.state !== 'running') ctx.resume?.();
      if (!loading) load().then(() => { if (running) buildEngine(); });
      if (on) loadScene();
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
      const now = ctx.currentTime;
      const wander = 0.012 * Math.sin(now * 0.9) + 0.008 * Math.sin(now * 2.3 + 1.7) + 0.005 * Math.sin(now * 5.1 + 0.4);   // a living engine never holds one pitch
      const r = clamp(st.rpm + (s.playing && s.grounded ? wander : wander * 0.5)), loud = (0.35 + 0.65 * r) * st.eng * ENGINE_GAIN;
      if (engine.synth) {                                                                           // the synthesised engine: revs and throttle drive it directly
        const load = s.playing ? clamp(s.grounded ? 0.25 + 0.65 * s.charge + 0.25 * s.speedK : 0.55 + 0.3 * s.speedK) : 0;
        engine.synth.node.parameters.get('rpm').setTargetAtTime(r, now, 0.04); engine.synth.node.parameters.get('load').setTargetAtTime(load, now, 0.06);
        at(engine.synth.bus.gain, loud * 1.1, 0.05);
      } else {
        engine.idle.rate = 0.9 + 1.75 * r + st.chargeW; at(engine.idle.bus.gain, loud * (1 - 0.25 * r), 0.05);   // one steady engine, pitched up with the revs
        pump(engine.idle);
      }
      at(lp.frequency, 14000 - 10500 * clamp(((s.camDist || 26) - 24) / 40), 0.2);                   // far camera: a more distant, duller engine
      // wind, tyres on dirt and mud
      const sp = s.playing ? s.speedK : 0;
      at(ambience.wind.g.gain, 0.22 * sp * sp * (s.grounded ? 0.8 : 1), 0.12); at(ambience.wind.fl.frequency, 500 + 1400 * sp, 0.2);
      at(ambience.dirt.g.gain, s.grounded && s.playing ? 0.1 + 0.2 * sp : 0, 0.08);
      at(ambience.mud.g.gain, s.playing && s.grounded ? 0.5 * (s.mud || 0) : 0, 0.08);
      if (fx) {
        const air = s.playing && !s.grounded ? s.air || 0 : 0, ch = s.playing ? s.charge || 0 : 0;
        at(fx.air.g.gain, 0.03 * smooth(0.5, 1.1, air), 0.12); at(fx.air.o.frequency, 330 + 520 * clamp(air / 2.6), 0.1);
        at(fx.charge.g.gain, 0.035 * smooth(0.04, 0.3, ch), 0.06); at(fx.charge.o.frequency, 200 + 330 * ch, 0.05);
      }
    },

    // ---- events ----
    jump(charge) { if (charge > 0.45) play('rev_blip', { gain: 0.14 + 0.3 * charge, rate: 0.9 + Math.random() * 0.25, offset: Math.random() * 0.3, dur: 0.9 + Math.random() * 0.5 }); thud(0.2 + 0.15 * charge, 90); },
    land(kind, air = 0.5) {
      if (kind === 'perfect') { thud(0.5, 110); tone(1318, 0.5, { type: 'triangle', gain: 0.12, delay: 0.04 }); tone(1976, 0.6, { type: 'triangle', gain: 0.1, delay: 0.1 }); }
      else if (kind === 'clean') thud(0.4, 100);
      else if (kind === 'rough') { thud(0.8, 80); play('bounce', { gain: 0.55, rate: 0.75, lpf: 1800 }); tone(300, 0.2, { type: 'triangle', gain: 0.07, slide: 170, delay: 0.05, dest: dull }); }
      else if (air > 0.2) thud(0.22, 100);
    },
    coin() {
      if (!ctx) return;
      const now = ctx.currentTime; st.coinN = now - st.coinAt < 0.8 ? Math.min(7, st.coinN + 1) : 0; st.coinAt = now;
      const steps = [0, 2, 4, 7, 9, 12, 14, 16], f = 880 * Math.pow(2, steps[st.coinN] / 12);
      tone(f, 0.3, { type: 'sine', gain: 0.1, attack: 0.004, dest: soft });                                // warm fundamental
      tone(f * 2, 0.2, { type: 'sine', gain: 0.03, delay: 0.01, dest: soft }); tone(f * 2.76, 0.14, { type: 'sine', gain: 0.018, dest: soft });   // a soft bell on top
      if (st.coinN >= 4 && st.coinN % 2 === 0) tone(f * 3, 0.26, { type: 'sine', gain: 0.02, delay: 0.04, dest: soft });
    },
    /** A fuel can: a bright rising glug-and-ding. */
    fuelUp() {
      if (!ctx) return;
      tone(196, 0.16, { type: 'triangle', gain: 0.15, slide: 330, dest: soft }); tone(294, 0.16, { type: 'triangle', gain: 0.13, delay: 0.1, slide: 440, dest: soft });
      tone(784, 0.4, { type: 'sine', gain: 0.12, delay: 0.2, dest: soft }); tone(1175, 0.5, { type: 'sine', gain: 0.08, delay: 0.23, dest: soft });
    },
    /** The engine coughing on empty (a falling stutter). */
    sputter(dead = false) {
      if (!ctx) return;
      const n = dead ? 5 : 2;
      for (let i = 0; i < n; i++) tone(dead ? 120 - i * 14 : 130, 0.09, { type: 'sawtooth', gain: dead ? 0.2 : 0.13, delay: i * (dead ? 0.17 + i * 0.05 : 0.13), slide: -40, dest: dull });
    },
    combo(level) { const b = 523 * Math.pow(2, (level - 1) * 2 / 12); [0, 4, 7].forEach((st_, i) => tone(b * Math.pow(2, st_ / 12), 0.3, { type: 'triangle', gain: 0.13, delay: i * 0.065 })); },
    trick() { swoosh(0.34, 500, 3200, { gain: 0.11, q: 1.4 }); },
    /** A trick landed. `streak`: how many in a row (each within a few seconds of the last): the chime climbs a major scale and fills out. */
    trickDone(streak = 1) {
      if (!ctx) return;
      const n = Math.max(1, Math.min(8, streak)), steps = [0, 2, 4, 7, 9, 12, 14, 16], f0 = 523.25 * Math.pow(2, steps[n - 1] / 12), g0 = 0.1 + 0.01 * Math.min(n, 6);
      const note = (semi, delay, g = g0, dur = 0.34) => { const f = f0 * Math.pow(2, semi / 12); tone(f, dur, { type: 'sine', gain: g, delay, dest: soft }); tone(f * 2.01, dur * 0.6, { type: 'triangle', gain: g * 0.3, delay, dest: soft }); };
      if (n === 1) note(0, 0);
      else if (n === 2) { note(0, 0); note(7, 0.06); }
      else if (n === 3) { note(0, 0); note(4, 0.055); note(7, 0.11); }
      else if (n === 4) { note(0, 0); note(4, 0.05); note(7, 0.1); note(12, 0.16, g0 * 0.8, 0.5); }
      else { [0, 4, 7, 12, 16].forEach((sm, i) => note(sm, i * 0.05, g0 * (i > 2 ? 0.8 : 1), 0.5)); tone(f0 * 4, 0.5, { type: 'sine', gain: 0.03, delay: 0.28, dest: soft }); }
    },
    /** The combo ran out (a timeout drops it a step; `comboLost` is a hard knock down). */
    comboDrop() { if (!ctx || !gate('drop', 0.3)) return; tone(330, 0.16, { type: 'triangle', gain: 0.07, slide: 262, dest: dull }); },
    comboLost() { if (!ctx || !gate('lost', 0.3)) return; tone(392, 0.22, { type: 'triangle', gain: 0.1, slide: 360, dest: dull }); tone(311, 0.36, { type: 'triangle', gain: 0.1, delay: 0.2, slide: 262, dest: dull }); },
    /** Hit an obstacle slowly: a dull clunk and a short rattle. */
    stumble() { if (!ctx) return; thud(0.35, 90); tone(170, 0.2, { type: 'square', gain: 0.04, slide: 80, dest: dull }); tone(120, 0.12, { type: 'square', gain: 0.03, delay: 0.12, slide: 70, dest: dull }); },
    /** Fuel under a quarter (and the repeating warning under 15%): two quiet falling beeps. */
    lowFuel() { if (!ctx || !gate('lowfuel', 1)) return; tone(660, 0.09, { type: 'square', gain: 0.035, dest: dull }); tone(520, 0.1, { type: 'square', gain: 0.035, delay: 0.16, dest: dull }); },
    /** The tank is empty: the engine whine falls away, then coughs and dies. */
    outOfFuel() {
      if (!ctx) return;
      tone(280, 1.0, { type: 'sawtooth', gain: 0.07, slide: 55, dest: dull }); tone(140, 1.0, { type: 'sawtooth', gain: 0.05, slide: 40, dest: dull });
      for (let i = 0; i < 4; i++) tone(110 - i * 14, 0.09, { type: 'sawtooth', gain: 0.1, delay: 0.55 + i * (0.17 + i * 0.05), slide: -40, dest: dull });
      tone(220, 0.7, { type: 'sine', gain: 0.05, delay: 1.1, slide: 110, dest: dull });
    },
    /** A close call with an obstacle: a quick whoosh and a high ping. */
    nearMiss() { if (!ctx || !gate('near', 0.4)) return; swoosh(0.22, 900, 3400, { gain: 0.11, q: 1.6 }); tone(1568, 0.2, { type: 'sine', gain: 0.045, delay: 0.05, dest: soft }); },
    /** The charge reached full. */
    chargeReady() { if (!ctx || !gate('ready', 0.3)) return; tone(1320, 0.08, { type: 'triangle', gain: 0.06, dest: soft }); tone(1760, 0.14, { type: 'triangle', gain: 0.05, delay: 0.05, dest: soft }); },
    /** Every 500 m. */
    milestone() { if (!ctx) return; [784, 1047, 1319].forEach((f, i) => tone(f, 0.55 + i * 0.1, { type: 'sine', gain: 0.085 - i * 0.012, delay: i * 0.08, dest: soft })); },
    /** The score passed the best. */
    newBest() { if (!ctx) return; [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, 0.4, { type: 'sine', gain: 0.1, delay: i * 0.08, dest: soft }); tone(f * 2.01, 0.25, { type: 'triangle', gain: 0.03, delay: i * 0.08, dest: soft }); }); },
    /** Buttons and cards: soft ticks. */
    ui(kind = 'tap') {
      if (!ctx) return;
      if (kind === 'hover') { if (!gate('hover', 0.06)) return; tone(1320, 0.05, { type: 'sine', gain: 0.022, dest: soft }); return; }
      if (kind === 'click') { tone(740, 0.07, { type: 'sine', gain: 0.06, dest: soft }); tone(1110, 0.09, { type: 'sine', gain: 0.035, delay: 0.035, dest: soft }); return; }
      if (kind === 'confirm') { tone(523, 0.09, { type: 'sine', gain: 0.07, dest: soft }); tone(784, 0.12, { type: 'sine', gain: 0.06, delay: 0.06, dest: soft }); }
      else if (kind === 'back') { tone(440, 0.08, { type: 'sine', gain: 0.06, dest: soft }); tone(330, 0.1, { type: 'sine', gain: 0.05, delay: 0.05, dest: soft }); }
      else if (kind === 'cardIn') tone(494, 0.14, { type: 'sine', gain: 0.05, dest: soft });
      else tone(660, 0.06, { type: 'sine', gain: 0.055, dest: soft });
    },
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
  const out = { enabled: false };
  for (const n of ['onChange', 'unlock', 'start', 'stop', 'pause', 'resume', 'update', 'jump', 'land', 'coin', 'combo', 'comboDrop', 'comboLost', 'trick', 'trickDone', 'crash', 'bounce', 'over', 'fuelUp', 'sputter', 'stumble', 'lowFuel', 'outOfFuel', 'nearMiss', 'chargeReady', 'milestone', 'newBest', 'ui', 'autoOn', 'sceneUpdate', 'easter', 'zoom']) out[n] = f;
  return out;
}
