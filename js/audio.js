// Sound for the dirt-bike game (Web Audio, no libraries).
//
// The engine is two looping recordings (a steady idle and a high-rev burst) that are pitch-shifted by the revs and crossfaded,
// so one smooth "rpm" value (speed, how long the button has been held, airborne) makes the bike feel alive. Everything else is a
// short one-shot: recordings for the throttle blip, the crash and the rider's bounce, and small synthesised sounds for the rest
// (coins, landings, tricks, wind, dirt, mud), so there are only five files to download (about 120 KB, fetched when the game starts).
//
// Browsers only allow sound after a tap, so `unlock()` is called from the game's start and first press. A speaker button
// mutes it and remembers the choice. The file names and cuts come from audio/tools/make_audio.py.
import { SONG_RH, SONG_LH, SONG_CL, SONG_ST, SONG_CHORDS } from './notes.js?v=20261024232956';
const ENGINE_GAIN = 0.7;                // the engine's overall level (the one-shots sit on top of it)
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// ?engine=synth plays a synthesised engine (audio/engine-worklet.js) instead of the recording, for comparing by ear
const VARIANT = (/[?&]engine=(\w+)/.exec(location.search) || [])[1] || 'grain';
// Sound is off on every visit until the player turns it on. Clicking the bike to start the game turns it on for that visit
// unless the player has switched it off on purpose during the visit.

/** The lamp flicker: the first part of audio/raw/light_flicker.mp3 (cut by audio/tools/make_flicker.py, with the low mains hum filtered out: a cluster of bright flickers). `events` are when
 *  the flickers are heard in it, as [start s, length s, strength 0..1]: the lamps flash in step (see world.setHover). Each billboard plays it a little higher or lower. */
const FLICKER_EVENTS = [[0.055, 0.04, 0.28], [0.175, 0.04, 0.55], [0.305, 0.07, 1], [0.43, 0.075, 0.72], [0.555, 0.05, 0.54]];
const BOARD_PITCH = { creativity: 0.95, ai: 1.0, about: 1.06 };
/** When the beats of the house song fall (seconds from its start), found by analysing the recording (audio/tools/find_beats.py): about 85 to 94 beats a minute (the tempo changes through the song, and these follow it) in 3/4 time,
 *  so every third beat is a downbeat (beat 0, 3, 6...). The billboards light up one on each beat, in turn. */
const SONG_BEATS = [0.01,0.72,1.43,2.14,2.86,3.56,4.27,4.99,5.70,6.41,7.12,7.83,8.54,9.25,9.96,10.66,11.37,12.07,12.77,13.47,14.19,14.87,15.57,16.28,16.99,17.68,18.38,19.08,19.78,20.48,21.18,21.86,22.56,23.24,23.94,24.64,25.33,26.01,26.71,27.39,28.10,28.78,29.45,30.15,30.84,31.52,32.21,32.88,33.56,34.25,34.93,35.61,36.29,36.98,37.66,38.34,39.02,39.69,40.38,41.06,41.75,42.43,43.12,43.78,44.48,45.16,45.84,46.51,47.21,47.88,48.56,49.25,49.93,50.62,51.29,51.98,52.66,53.34,54.03,54.69,55.39,56.06,56.75,57.43,58.12,58.79,59.48,60.16,60.85,61.52,62.19,62.89,63.58,64.25,64.93,65.62,66.29,66.97,67.64,68.29,68.93,69.57,70.21,70.84,71.48,72.12,72.75,73.40,74.04,74.69,75.33,75.95,76.59,77.23,77.87,78.51,79.15,79.78,80.42,81.06,81.70,82.34,82.96,83.62,84.27,84.94,85.64,86.33,87.03,87.72,88.42,89.11,89.78,90.46,91.15,91.83,92.52,93.20,93.88,94.56,95.25,95.92,96.60,97.29,97.96,98.65,99.33,100.02,100.70,101.38,102.06,102.75,103.43,104.12,104.78,105.48,106.15,106.84,107.52,108.20,108.87,109.56,110.24,110.94,111.65,112.38,113.15,113.96,114.78,115.54,116.29,116.94,117.54,118.13,118.71,119.41,120.19,120.96,121.74,122.52,123.30];
/** The song's beat position (see songBeatPos) at `t` seconds in. */
const beatAt = (t) => {
  const B = SONG_BEATS;
  if (t <= B[0]) return t / 0.7;
  if (t >= B[B.length - 1]) return B.length - 1 + (t - B[B.length - 1]) / 0.685;
  let lo = 0, hi = B.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m] <= t) lo = m; else hi = m; }
  return lo + (t - B[lo]) / (B[lo + 1] - B[lo]);
};
const LH_STEP = []; { let step = -1, last = -9; SONG_LH.forEach((n, i) => { if (n[0] - last > 0.05) { step++; last = n[0]; } LH_STEP[i] = step; }); }       // (which beat-of-the-round each left-hand note is: notes struck together count once)
const NOTE_LEAD = 0.12;                  // seconds: how far ahead of the sound the note lights run (raise it if they still look late, lower it if early)
export const pickFlicker = (id) => {
  const rate = (BOARD_PITCH[id] || 1) * (0.99 + Math.random() * 0.02);
  return { snd: 'fl_start', rate, events: FLICKER_EVENTS.map(([t, d, a]) => [t / rate, d / rate, a]) };       // (a slower sound is a longer one: the flashes stretch with it)
};

export function createAudio({ base = 'audio/' } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return stub();
  let synthOK = false, ctx = null, master = null, other = null, bus = null, lp = null, soft = null, dull = null, fx = null, ready = false, loading = null, on = false, chose = false, running = false, scn = null, scnLoading = null, song = null, songTok = 0, songLoading = null, an = null, anData = null;
  const buf = {};
  let engine = null, ambience = null;
  const st = { rpm: 0, eng: 0, last: 0, coinAt: -9, coinN: 0, bounceAt: -9, wind: 0, dirt: 0, mud: 0, chargeW: 0 };
  const listeners = [];

  const ensure = () => {
    if (ctx) return ctx;
    ctx = new Ctx({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ctx.destination);
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 14000; lp.connect(master);       // the camera's distance softens the engine
    other = ctx.createGain(); other.connect(master);                                                  // everything but the music runs through here, so music mode can fade it all away together
    bus = ctx.createGain(); bus.connect(other);
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
  // The ride's background music (audio/ride.mp3, made by audio/tools/make_ride_music.py): a seamless loop, kept low under the engine, faded in when a ride begins
  // (it carries on across restarts) and out when the game is left.
  const RIDE_GAIN = 0.55;
  let ride = null, rideLoading = null;
  function rideStart() {
    if (!ctx || ride) { if (ride) { ride.g.gain.cancelScheduledValues(ctx.currentTime); ride.g.gain.setTargetAtTime(RIDE_GAIN, ctx.currentTime, 0.8); } return; }
    if (!buf.ride) {
      if (!rideLoading) rideLoading = fetch(`${base}ride.mp3`).then((r) => r.arrayBuffer()).then(decode).then((b) => { buf.ride = b; }).catch(() => { /* stays silent */ });
      rideLoading.then(() => { if (running && !ride && buf.ride) rideStart(); });
      return;
    }
    const src = loopSrc(buf.ride), g = ctx.createGain(); g.gain.value = 0;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 130; shelf.gain.value = 2.5;      // the new recording already has a big low end: just a little more...
    const punch = ctx.createBiquadFilter(); punch.type = 'peaking'; punch.frequency.value = 70; punch.Q.value = 1.1; punch.gain.value = 1.5;   // ...with a punchy bump where the notes sit
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.012; comp.release.value = 0.14;   // (it also keeps the boosted bass from overloading)
    src.connect(shelf); shelf.connect(punch); punch.connect(comp); comp.connect(g); g.connect(master); src.start();
    g.gain.setTargetAtTime(RIDE_GAIN, ctx.currentTime, 1.2); ride = { src, g };
  }
  function rideStop() {
    if (!ride) return; const r = ride; ride = null;
    try { r.g.gain.cancelScheduledValues(ctx.currentTime); r.g.gain.setTargetAtTime(0, ctx.currentTime, 0.35); } catch (e) { /* gone */ }
    setTimeout(() => { try { r.src.stop(); r.src.disconnect(); r.g.disconnect(); } catch (e) { /* already stopped */ } }, 2000);
  }
  function killEngine() {
    for (const L of [engine?.idle, engine?.synth]) { try { L?.bus.disconnect(); L?.node?.disconnect(); } catch (e) { /* gone */ } }
    for (const n of [ambience?.wind, ambience?.dirt, ambience?.mud]) { try { n?.s.stop(); n?.s.disconnect(); n?.g.disconnect(); } catch (e) { /* already stopped */ } }
    for (const n of [fx?.air, fx?.charge]) { try { n?.o.stop(); n?.o.disconnect(); n?.g.disconnect(); } catch (e) { /* already stopped */ } }
    engine = ambience = fx = null;
  }

  // ---- the landscape: day and night ambience, a faint windmill, and the far-off dirt bike when it rides through ----
  const SCENE_FILES = ['amb_day', 'amb_night', 'amb_windmill', 'fl_start'];
  function loadScene() {
    if (scnLoading || !ctx) return scnLoading;
    scnLoading = Promise.all(SCENE_FILES.map((n) => fetch(`${base}${n}.mp3`).then((r) => r.arrayBuffer()).then(decode).then((b) => { buf[n] = b; }).catch(() => { /* stays silent */ })))
      .then(() => loading).then(() => buildScene());
    return scnLoading;
  }
  function buildScene() {
    if (scn || !ctx || !buf.amb_day || !buf.amb_night) return;
    const out = ctx.createGain(); out.gain.value = 1; out.connect(other);
    const loop = (name, { lpf = 0, pan = false } = {}) => {
      const src = loopSrc(buf[name]), g = ctx.createGain(); g.gain.value = 0; let node = src;
      if (lpf) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; node.connect(f); node = f; }
      node.connect(g); let p = null;
      if (pan && ctx.createStereoPanner) { p = ctx.createStereoPanner(); g.connect(p); p.connect(out); } else g.connect(out);
      src.start(0, Math.random() * buf[name].duration);
      return { src, g, p };
    };
    scn = { out, day: loop('amb_day', { lpf: 5200 }), night: loop('amb_night', { lpf: 3400 }), wind: buf.amb_windmill ? loop('amb_windmill', { lpf: 2400, pan: true }) : null, bike: null };
    if (buf.engine_idle) {                                                  // the bike far off: the same engine, muffled, quiet and panned
      const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 950; g.connect(f);
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

  let anSt = null;
  const api = {
    get _debug() { return { ctx, buf, st, engine, ambience, ready, scn, master }; },   // (for tests)
    get enabled() { return on; },
    set enabled(v) {
      on = !!v; chose = true;
      if (ctx) at(master.gain, on ? 0.8 : 0, 0.04);
      if (on && ctx) { ctx.resume?.(); loadScene(); }
      for (const f of listeners) f(on);
    },
    /** Turn sound on for this visit (not remembered) if the player has never chosen: the game and the bike easter egg. */
    autoOn() {
      if (on || chose) return;
      on = true; if (ctx) { at(master.gain, 0.8, 0.04); ctx.resume?.(); loadScene(); }
      for (const f of listeners) f(on);
    },
    /** Every frame in the landscape. s: { night 0..1, quiet (the game is on), windPan -1..1, bike: { gain, pan } | null } */
    sceneUpdate(s) {
      if (!ctx || !on || !scn) return;
      const k = s.quiet ? 0.25 : 1;
      // Music mode: every sound but the music fades away until it is almost silent by 1:10, and comes back from the last note (1:55) to the end.
      const ts = song ? ctx.currentTime - song.t0 : -1, sm = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
      const duck = song ? 1 - 0.97 * sm(0, 70, ts) * (1 - sm(115, 123, ts)) : 1;
      at(other.gain, duck, song ? 0.3 : 1.2);
      at(scn.day.g.gain, 0.13 * (1 - s.night) * k, 1.4); at(scn.night.g.gain, 0.11 * s.night * k, 1.4);
      if (scn.wind) { at(scn.wind.g.gain, s.quiet ? 0 : 0.045, 0.9); if (scn.wind.p) at(scn.wind.p.pan, clamp(s.windPan || 0, -1, 1) * 0.7, 0.4); }
      if (scn.bike) {
        const g = !s.quiet && s.bike ? s.bike.gain : 0; at(scn.bike.g.gain, g, 0.3);
        if (g > 0.002) { if (scn.bike.p) at(scn.bike.p.pan, clamp(s.bike.pan, -1, 1) * 0.8, 0.2); pump(scn.bike.layer); }
      }
    },
    /** The camera flies into a billboard ('in'), back out to the view ('out') or between billboards ('across'): a big whoosh that swells and fades over the
     *  whole flight (`dur` seconds, the length of the animation). */
    zoom(kind = 'in', dur = 1.6) {
      if (!ctx || !gate('zoom', 0.3)) return;
      const t0 = ctx.currentTime, nb = noise(), up = kind !== 'out';
      const env = (peak, skew = 0.55) => { const c = new Float32Array(96); for (let i = 0; i < c.length; i++) { const u = i / (c.length - 1), v = u < skew ? u / skew : (1 - u) / (1 - skew); c[i] = peak * Math.pow(Math.sin(Math.min(1, v) * Math.PI / 2), 1.6); } return c; };
      const layer = (type, f0, f1, q, peak, skew) => {
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = nb; src.loop = true; f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
        g.gain.setValueAtTime(0, t0); g.gain.setValueCurveAtTime(env(peak, skew), t0, dur);
        src.connect(f); f.connect(g); g.connect(bus); src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.1);
        src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) { /* done */ } };
      };
      const sk = kind === 'out' ? 0.4 : kind === 'across' ? 0.5 : 0.62;
      if (kind === 'in') { layer('bandpass', 130, 1000, 0.9, 0.07, sk); layer('lowpass', 220, 800, 0.8, 0.05, sk); }
      else if (kind === 'out') { layer('bandpass', 1000, 120, 0.9, 0.065, sk); layer('lowpass', 800, 180, 0.8, 0.05, sk); }
      else { layer('bandpass', 180, 700, 0.9, 0.06, sk); layer('lowpass', 350, 300, 0.9, 0.045, sk); }
      // a low rush under it, and a soft rising or falling tone so it feels like travel
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(up ? 48 : 105, t0); o.frequency.exponentialRampToValueAtTime(up ? 115 : 42, t0 + dur);
      og.gain.setValueAtTime(0, t0); og.gain.setValueCurveAtTime(env(0.06, sk), t0, dur); o.connect(og); og.connect(bus); o.start(t0); o.stop(t0 + dur + 0.1);
      o.onended = () => { try { o.disconnect(); og.disconnect(); } catch (e) { /* done */ } };
      if (kind !== 'across') tone(up ? 110 : 165, dur * 0.9, { type: 'sine', gain: 0.01, slide: up ? 165 : 98, dest: soft, attack: dur * 0.3 });
    },
    /** A billboard's lamps start to flicker (`pat` from pickFlicker): the recorded flicker (its low mains hum filtered out, only the bright crackle left). */
    flicker(pat) {
      if (!ctx || !on) return;
      play(pat.snd, { gain: 0.38, rate: pat.rate });
    },
    /** The pointer left the sign: the lamp clicks off. */
    flickerOff() {
      if (!ctx || !on) return;
      play('fl_start', { gain: 0.14, rate: 1.25, offset: 0.25, dur: 0.14 });
    },
    /** A house starts playing its song (the easter egg): far off and a little muffled, as if from inside, with a faint room echo; `pan` -1..1 is where the house is. */
    songStart(pan = 0) {
      if (!ctx || !on) return false;
      api.songStop();
      const tok = ++songTok;
      songLoading = songLoading || fetch(`${base}song.mp3`).then((r) => r.arrayBuffer()).then(decode).then((b) => { buf.song = b; }).catch(() => { /* stays silent */ });
      songLoading.then(() => {
        if (tok !== songTok || !buf.song || !on) return;
        const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), lpf = ctx.createBiquadFilter(), dry = ctx.createGain(), g = ctx.createGain();
        const del = ctx.createDelay(0.5), fb = ctx.createGain(), dl = ctx.createBiquadFilter(), wet = ctx.createGain();
        anSt = null; an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.5; anData = new Uint8Array(an.frequencyBinCount); src.connect(an);          // (listens to the song as recorded, before it is muffled; makes no sound)
        src.buffer = buf.song; hp.type = 'highpass'; hp.frequency.value = 200; lpf.type = 'lowpass'; lpf.frequency.value = 1800; lpf.Q.value = 0.4;
        dry.gain.value = 0.8; del.delayTime.value = 0.12; fb.gain.value = 0.34; dl.type = 'lowpass'; dl.frequency.value = 1100; wet.gain.value = 0.38; g.gain.value = 0;
        src.connect(hp); hp.connect(lpf); lpf.connect(dry); dry.connect(g); lpf.connect(del); del.connect(dl); dl.connect(fb); fb.connect(del); dl.connect(wet); wet.connect(g);
        let p = null; if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1) * 0.6; g.connect(p); p.connect(master); } else g.connect(master);
        // At first it is far off, behind walls; over the first minute it comes forward: clearer, fuller, drier and louder, until it is the main thing you hear.
        const t0 = ctx.currentTime, T = 60;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.3, t0 + 2.5); g.gain.linearRampToValueAtTime(0.85, t0 + T);
        lpf.frequency.setValueAtTime(1800, t0); lpf.frequency.exponentialRampToValueAtTime(16000, t0 + T);
        hp.frequency.setValueAtTime(200, t0); hp.frequency.exponentialRampToValueAtTime(40, t0 + T);
        wet.gain.setValueAtTime(0.38, t0); wet.gain.linearRampToValueAtTime(0.05, t0 + T);
        dry.gain.setValueAtTime(0.8, t0); dry.gain.linearRampToValueAtTime(1.0, t0 + T);
        src.loop = false;                                                          // (it plays once, and its last seconds fade out)
        song = { src, g, p, t0, nodes: [hp, lpf, dry, del, fb, dl, wet] };
        src.onended = () => { if (an) { try { an.disconnect(); } catch (e) { /* gone */ } an = null; } if (song && song.src === src) { try { src.disconnect(); g.disconnect(); p?.disconnect(); song.nodes.forEach((n) => n.disconnect()); } catch (e) { /* gone */ } song = null; } };
        src.start();
      });
      return true;
    },
    songStop() {
      songTok++;
      if (!song || !ctx) return;
      const s0 = song; song = null; if (an) { const a0 = an; an = null; setTimeout(() => { try { a0.disconnect(); } catch (e) { /* gone */ } }, 1500); }
      s0.g.gain.cancelScheduledValues(ctx.currentTime); s0.g.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => { try { s0.src.stop(); s0.src.disconnect(); s0.g.disconnect(); s0.p?.disconnect(); s0.nodes.forEach((n) => n.disconnect()); } catch (e) { /* gone */ } }, 1500);
    },
    songPan(pan) { if (song && song.p) song.p.pan.setTargetAtTime(clamp(pan, -1, 1) * (0.6 - 0.35 * clamp((ctx.currentTime - song.t0) / 60)), ctx.currentTime, 0.2); },           // (less to one side as it comes forward)
    get songPlaying() { return !!song; },
    /** Seconds into the house song, or -1 when none plays. */
    songTime() { return song && ctx ? ctx.currentTime - song.t0 : -1; },
    /** Where the song is in its beats: a number whose whole part is the beat count (0, 1, 2...; the bar position is that modulo 3) and whose fraction is how far into the beat it is; -1 if no song. */
    songBeatPos() {
      if (!song || !ctx) return -1;
      const t = ctx.currentTime - song.t0, B = SONG_BEATS;
      return beatAt(t);
    },
    /** The notes sounding in the house song right now (from its MIDI, see js/notes.js), for the lights. Fills and returns `out`:
     *  rh[0..2] and lh[0..2] are how strongly the melody / left hand is lit in each of three zones (rh by pitch: low, middle, high; lh by pitch the same way, left to right),
     *  `pe[pitch]` is how brightly that MIDI pitch is sounding (0..1, either hand: what the sky's stars glow with), `recent` lists the notes struck in the last 2.4 s, newest first ({ hand: 0 right / 1 left, pitch, start, age, vel }), `chord` / `root` / `minor` are the harmony now (root 0-11, minor 0/1; chord -1 before the first),
     *  and lhN counts the left-hand notes started so far (a change means a new one: lhZone is its zone, lhVel its strength 0..1). All zeros when no song plays. */
    songNotes(out) {
      const o = out || {}; o.rh = o.rh || [0, 0, 0]; o.lh = o.lh || [0, 0, 0]; o.lhN = 0; o.lhZone = 0; o.lhVel = 0; o.clN = 0; o.clDur = 0; o.clPitch = 0; o.clVel = 0; o.st = 0; o.sweep = 0; (o.pe = o.pe || new Float32Array(128)).fill(0); o.chord = -1; o.root = 0; o.minor = 0; (o.recent = o.recent || []).length = 0;
      o.rh[0] = o.rh[1] = o.rh[2] = o.lh[0] = o.lh[1] = o.lh[2] = 0;
      if (!song || !ctx) return o;
      const t = ctx.currentTime - song.t0 + NOTE_LEAD;                          // (a touch ahead of the sound: a frame is drawn and shown a little after the note is heard, so the lights are brought forward to land on it)
      o.sweep = smooth(69, 70.5, t) * (1 - smooth(85, 86.5, t));                  // 1:10 to 1:26: the left hand's lights step left, middle, right, left... in a fixed round, whatever the notes (a calmer, less bright passage than all lighting together)
      for (const [list, dst, zone] of [[SONG_RH, o.rh, (p) => (p <= 72 ? 0 : p <= 75 ? 1 : 2)], [SONG_LH, o.lh, (p, k) => (o.sweep > 0.5 ? LH_STEP[k] % 3 : p <= 50 ? 0 : p <= 57 ? 1 : 2)]]) {
        let n = 0; while (n < list.length && list[n][0] <= t) n++;           // (a few hundred notes: a plain scan is fine)
        for (let k = n - 1; k >= 0 && t - list[k][0] < 9; k--) {
          const [s, p, len, v] = list[k], age = t - s, z = zone(p, k), a = 0.45 + 0.55 * clamp(v / 70);
          const hold = 0.3 + 0.7 * Math.exp(-Math.min(age, len) * 0.8), e = a * Math.min(1, 0.85 * (age <= len ? hold : hold * Math.exp(-(age - len) * 7)) + 0.5 * Math.exp(-age * 8));   // (struck bright, then it stays lit for as long as the note is held, slowly dimming the longer it goes, and drops away quickly once the note ends)
          if (e > dst[z]) dst[z] = e;
          if (e > o.pe[p]) o.pe[p] = e;
          if (age < 2.4) o.recent.push({ hand: list === SONG_RH ? 0 : 1, pitch: p, start: s, age, vel: a });
        }
        if (list === SONG_LH) { o.lhN = n; if (n > 0) { o.lhZone = zone(list[n - 1][1], n - 1); o.lhVel = 0.45 + 0.55 * clamp(list[n - 1][3] / 70); } }
      }
      { let n = 0; while (n < SONG_CL.length && SONG_CL[n][0] <= t) n++;                // the clarinet: how many of its notes have started, and the latest one's pitch, length (s) and strength
        o.clN = n; if (n > 0) { const c = SONG_CL[n - 1]; o.clPitch = c[1]; o.clDur = c[2]; o.clVel = 0.45 + 0.55 * clamp(c[3] / 70); if (t - c[0] > c[2] + 0.5) o.clDur = 0; } }
      for (const [s0, , len, v] of SONG_ST) {                                          // the strings: a slow swell in, held for the note, a long release (0..1; they play quietly, so scaled up)
        const age = t - s0; if (age < 0 || age > len + 3) continue;
        const e = smooth(0, 0.9, age) * (age > len ? Math.exp(-(age - len) / 1.0) : 1) * (0.55 + 0.45 * clamp(v / 35));
        if (e > o.st) o.st = e;
      }
      o.recent.sort((a, b) => a.age - b.age);
      let c = -1; while (c + 1 < SONG_CHORDS.length && SONG_CHORDS[c + 1][0] <= t) c++;       // (the chord now: root pitch class 0-11 and major / minor, from the song's MIDI)
      if (c >= 0) { o.chord = c; o.root = SONG_CHORDS[c][1]; o.minor = SONG_CHORDS[c][2]; }
      return o;
    },
    /** The song's sound this instant, for the aurora: bass, mid, treble and energy (0..1, each scaled to the song's own loudest), centroid (how bright it is, 0..1)
     *  and beat (a spike on a sudden bass hit). Fills and returns `out`; all zeros when no song plays. */
    songSpectrum(out, dt = 0.016) {
      const o = out || {}; if (!an || !song) { o.bass = o.mid = o.treble = o.energy = o.centroid = o.beat = 0; return o; }
      an.getByteFrequencyData(anData);
      const band = (a, b) => { let t = 0; for (let i = a; i < b; i++) t += anData[i]; return t / ((b - a) * 255); };
      const raw = { bass: band(1, 6), mid: band(6, 43), treble: band(43, 214) };
      const sp = (anSt = anSt || { max: { bass: 0.1, mid: 0.1, treble: 0.05 }, v: { bass: 0, mid: 0, treble: 0, energy: 0, centroid: 0.3 }, bassAvg: 0, beat: 0 });
      for (const k of ['bass', 'mid', 'treble']) {
        sp.max[k] = Math.max(sp.max[k] * Math.pow(0.97, dt), raw[k], 0.03);                       // (the loudest it has been lately: each band is read against its own)
        const n = Math.pow(clamp((raw[k] / sp.max[k] - 0.4) / 0.6), 1.2); const up = n > sp.v[k];             // (only what rises above its usual level counts, so quiet and loud passages differ)
        sp.v[k] += (n - sp.v[k]) * (1 - Math.exp(-dt * (up ? 6 : 1.5)));                         // quick to rise, slow to fall
      }
      const en = (sp.v.bass * 0.45 + sp.v.mid * 0.4 + sp.v.treble * 0.15), cen = clamp((sp.v.treble * 1.4 + sp.v.mid * 0.5) / (sp.v.bass + sp.v.mid + sp.v.treble + 0.2));
      sp.v.energy += (en - sp.v.energy) * (1 - Math.exp(-dt * 1.4)); sp.v.centroid += (cen - sp.v.centroid) * (1 - Math.exp(-dt * 1.5));
      const flux = raw.bass - sp.bassAvg; sp.bassAvg += (raw.bass - sp.bassAvg) * (1 - Math.exp(-dt * 2.5));
      sp.beat = Math.max(sp.beat * Math.exp(-dt * 2.2), flux > 0.06 ? clamp(flux * 3.5) : 0);
      o.bass = sp.v.bass; o.mid = sp.v.mid; o.treble = sp.v.treble; o.energy = sp.v.energy; o.centroid = sp.v.centroid; o.beat = sp.beat;
      return o;
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
    start() { running = true; st.rpm = 0.2; st.eng = 0; if (ready) buildEngine(); rideStart(); },
    /** Leave the game: everything stops. */
    stop() { running = false; killEngine(); rideStop(); },
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
      if (kind === 'perfect') { thud(0.5, 110); tone(1318, 0.5, { type: 'triangle', gain: 0.12, delay: 0.04 }); tone(1976, 0.6, { type: 'triangle', gain: 0.1, delay: 0.1 }); tone(2637, 0.5, { type: 'sine', gain: 0.06, delay: 0.17, dest: soft }); swoosh(0.45, 500, 3200, { gain: 0.16, type: 'bandpass' }); tone(110, 0.5, { type: 'sawtooth', gain: 0.05, slide: 260, delay: 0.02, dest: dull }); }   // (thud, a bright two-note chime with a sparkle on top, and a rising whoosh: the boost)
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
    /** The low-fuel beep (urgency 0..1: it rises in pitch as the tank empties). */
    fuelBeep(u = 0) { if (!ctx) return; const f = 1000 + 500 * u; tone(f, 0.1, { type: 'square', gain: 0.2 + 0.07 * u, attack: 0.003 }); tone(f * 2, 0.08, { type: 'sine', gain: 0.07 + 0.03 * u, attack: 0.003 }); },       // (a clear dashboard beep, well above the engine and the music)
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
    /** The mini-golf's sounds: putt (v = power), wall and post knocks (v = strength), the cup, and a small jingle. */
    golf(kind = 'putt', v = 0.5) {
      if (!ctx) return;
      if (kind === 'putt') { if (!gate('gputt', 0.1)) return; tone(190 + 120 * v, 0.09, { type: 'triangle', gain: 0.12 + 0.1 * v, slide: 90, dest: soft }); swoosh(0.07, 2400, 900, { gain: 0.04 + 0.05 * v, q: 0.7 }); }
      else if (kind === 'wall') { if (!gate('gwall', 0.05)) return; tone(420 + 380 * v, 0.07, { type: 'triangle', gain: 0.03 + 0.05 * v, slide: 260, dest: soft }); }
      else if (kind === 'post') { if (!gate('gpost', 0.05)) return; tone(880 + 300 * v, 0.1, { type: 'sine', gain: 0.05 + 0.05 * v, dest: soft }); }
      else if (kind === 'pbbump') { if (!gate('gpbb', 0.04)) return; tone(420 + 70 * v, 0.14, { type: 'triangle', gain: 0.1, slide: 520, dest: soft }); tone(1180 + 110 * v, 0.1, { type: 'sine', gain: 0.05, delay: 0.02, dest: soft }); }
      else if (kind === 'pbkick') { if (!gate('gpbk', 0.05)) return; tone(170, 0.08, { type: 'square', gain: 0.07, slide: 70, dest: soft }); swoosh(0.08, 3200, 900, { gain: 0.06, q: 0.7 }); }
      else if (kind === 'pbflip') { if (!gate('gpbf', 0.05)) return; tone(260, 0.05, { type: 'square', gain: 0.05, slide: 120, dest: soft }); }
      else if (kind === 'pbdrain') { tone(300, 0.5, { type: 'sawtooth', gain: 0.07, slide: 70, dest: soft }); }
      else if (kind === 'cup') { tone(330, 0.2, { type: 'sine', gain: 0.1, slide: 180, dest: soft }); tone(247, 0.3, { type: 'sine', gain: 0.08, delay: 0.1, dest: soft }); }
      else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, { type: 'sine', gain: 0.085, delay: i * 0.09, dest: soft }));
      else if (kind === 'splash') { if (!gate('gsplash', 0.2)) return; swoosh(0.35, 1800, 300, { gain: 0.12, q: 0.6 }); tone(260, 0.25, { type: 'sine', gain: 0.08, slide: 90, dest: soft }); }
      else if (kind === 'pickup') [660, 880, 1175].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.08, delay: i * 0.06, dest: soft }));
      else if (kind === 'tele') { swoosh(0.28, 400, 2400, { gain: 0.1, q: 0.8 }); tone(300, 0.25, { type: 'sine', gain: 0.06, slide: 900, dest: soft }); }
      else if (kind === 'load') tone(150, 0.3, { type: 'square', gain: 0.05, slide: 90, dest: soft });
      else if (kind === 'boom') { tone(110, 0.35, { type: 'sine', gain: 0.2, slide: 45, dest: soft }); swoosh(0.25, 900, 200, { gain: 0.12, q: 0.5 }); }
      else if (kind === 'loop') { swoosh(0.7, 500, 1600, { gain: 0.1, q: 1.0 }); }
      else if (kind === 'geyser') { if (!gate('ggey', 0.3)) return; swoosh(0.4, 700, 2600, { gain: 0.12, q: 0.5 }); }
    },
    /** A soft, quiet two-note chime: the note rising from a house (a hint that it can be played). */
    chime() { if (!ctx || !gate('chime', 2)) return; tone(988, 0.5, { type: 'sine', gain: 0.045, dest: soft }); tone(1319, 0.8, { type: 'sine', gain: 0.035, delay: 0.14, dest: soft }); },
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
      play('crash', { gain: pit ? 0.25 : 0.48 });                                   // (half as loud as it was)
      if (pit) { tone(900, 1.1, { type: 'sine', gain: 0.06, slide: 140 }); swoosh(1.0, 1400, 150, { gain: 0.1, type: 'lowpass' }); }
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
  for (const n of ['onChange', 'unlock', 'start', 'stop', 'pause', 'resume', 'update', 'jump', 'land', 'coin', 'combo', 'comboDrop', 'comboLost', 'trick', 'trickDone', 'crash', 'bounce', 'over', 'fuelUp', 'sputter', 'stumble', 'lowFuel', 'fuelBeep', 'outOfFuel', 'nearMiss', 'chargeReady', 'milestone', 'newBest', 'ui', 'autoOn', 'sceneUpdate', 'easter', 'zoom', 'flicker', 'flickerOff', 'songStart', 'songStop', 'songPan', 'songSpectrum', 'songBeatPos', 'songNotes', 'chime', 'golf', 'songTime']) out[n] = f;
  return out;
}
