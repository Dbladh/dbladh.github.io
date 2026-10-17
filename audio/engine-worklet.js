// A synthesised single-cylinder dirt-bike engine (an AudioWorklet: it runs on the audio thread, one sample at a time).
//
// Each firing is a short pulse (with a little random strength and timing, as in a real engine) fed through the exhaust's fixed
// resonances. Because the resonances stay put while the pulse rate follows the revs, it sounds like an engine changing speed rather
// than a recording being pitch-shifted, and since every pulse is made fresh it can never repeat.
//   rpm  0..1  -> about 1700..9500 rpm (a four-stroke fires every second turn)
//   load 0..1  -> throttle: louder, harder pulses, more crack
class DirtEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.ph = 0; this.t = 1; this.amp = 0; this.crack = 0; this.seed = 12345;
    this.rpmS = 0.2; this.loadS = 0.3;
    this.s = [[0, 0], [0, 0], [0, 0], [0, 0]];                       // state of four resonators (low, band)
    this.lp = 0; this.hp1 = 0; this.hp2 = 0; this.noiseLP = 0;
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  process(_in, outputs, params) {
    const out = outputs[0][0]; if (!out) return true;
    const rpmT = params.rpm[0], loadT = params.load[0];
    const sr = sampleRate, pi = Math.PI;
    // exhaust resonances (centre Hz, Q, weight)
    const R = [[135, 5.5, 1.0], [310, 6, 0.75], [720, 4, 0.4], [1500, 3, 0.18]];
    const fk = R.map((r) => 2 * Math.sin(pi * r[0] / sr)), qk = R.map((r) => 1 / r[1]);
    for (let i = 0; i < out.length; i++) {
      this.rpmS += (rpmT - this.rpmS) * 0.0006; this.loadS += (loadT - this.loadS) * 0.0012;        // smooth the controls
      const rpm = this.rpmS, load = this.loadS;
      const fire = 13 + 76 * Math.pow(rpm, 1.05);                                                      // firings per second
      this.ph += fire / sr;
      if (this.ph >= 1) {
        this.ph -= 1 + (this.rnd() - 0.5) * 0.14;                                                       // the next one comes a little early or late
        this.t = 0; this.amp = (0.7 + 0.6 * this.rnd()) * (0.55 + 0.6 * load); this.crack = (0.4 + 0.6 * this.rnd()) * (0.3 + 0.7 * load);
        if (this.rnd() < 0.04 + 0.06 * (1 - load)) this.amp *= 0.35;                                    // an occasional weak (almost misfiring) cycle at low load
      }
      const t = this.t; this.t += 1 / sr;
      // the pulse: a short half-sine, plus a burst of noise (the crack of the combustion) that dies in a few milliseconds
      const Tp = 0.0035 + 0.002 * (1 - rpm);
      let e = t < Tp ? Math.sin(pi * t / Tp) * this.amp : 0;
      const n = this.rnd() * 2 - 1;
      e += n * Math.exp(-t / 0.0035) * this.crack * (0.25 + 0.5 * rpm) * 0.55;
      // resonators
      let y = 0;
      for (let k = 0; k < 4; k++) {
        const st = this.s[k]; st[0] += fk[k] * st[1];
        const hi = e - st[0] - qk[k] * st[1]; st[1] += fk[k] * hi; y += st[1] * R[k][2] * (k === 0 ? 0.9 : 1);
      }
      // intake/mechanical hiss that grows with the revs, and a soft clip for grit
      this.noiseLP += (n - this.noiseLP) * 0.25; const hiss = (n - this.noiseLP) * (0.01 + 0.05 * rpm * (0.4 + 0.6 * load));
      y = Math.tanh((y * 0.85 + hiss) * (1.1 + 0.9 * load));
      out[i] = y * 0.6;
    }
    return true;
  }
}
registerProcessor('dirt-engine', DirtEngine);
