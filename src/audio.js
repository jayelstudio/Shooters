// All sound is synthesized at runtime via Web Audio — no asset files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.enabled = true;
  }

  // Must be called from a user gesture (tap) to satisfy autoplay policies.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this._startCrowd();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _now() { return this.ctx.currentTime; }

  // Continuous low crowd murmur using filtered noise.
  _startCrowd() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;

    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.05;

    src.connect(bp).connect(lp).connect(this.crowdGain).connect(this.master);
    src.start();

    // Slow random swells for a living-arena feel.
    this._crowdLFO();
  }

  _crowdLFO() {
    if (!this.ctx) return;
    const g = this.crowdGain.gain;
    const t = this._now();
    const target = 0.035 + Math.random() * 0.04;
    g.linearRampToValueAtTime(target, t + 1.5 + Math.random() * 2);
    setTimeout(() => this._crowdLFO(), 2000 + Math.random() * 2000);
  }

  _tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.3, decay = 0.12, freqEnd = null }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = this._now();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + decay);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + decay + 0.02);
  }

  _noiseBurst({ dur = 0.08, gain = 0.3, type = 'highpass', freq = 1200 }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = this._now();
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  // ----- Game events -----
  dribble() {
    this._tone({ freq: 150, freqEnd: 70, type: 'sine', dur: 0.05, gain: 0.35, decay: 0.05 });
    this._noiseBurst({ dur: 0.04, gain: 0.12, type: 'lowpass', freq: 400 });
  }

  bounceFloor(strength = 1) {
    this._tone({ freq: 130, freqEnd: 60, type: 'sine', dur: 0.05, gain: 0.3 * strength, decay: 0.05 });
    this._noiseBurst({ dur: 0.05, gain: 0.1 * strength, type: 'lowpass', freq: 500 });
  }

  rim() {
    this._tone({ freq: 280, freqEnd: 180, type: 'triangle', dur: 0.06, gain: 0.18, decay: 0.1 });
    this._noiseBurst({ dur: 0.05, gain: 0.12, type: 'bandpass', freq: 2200 });
  }

  backboard() {
    this._tone({ freq: 200, freqEnd: 120, type: 'square', dur: 0.07, gain: 0.16, decay: 0.12 });
    this._noiseBurst({ dur: 0.06, gain: 0.1, type: 'lowpass', freq: 900 });
  }

  swish() {
    this._noiseBurst({ dur: 0.22, gain: 0.16, type: 'highpass', freq: 5000 });
  }

  shoot() {
    this._noiseBurst({ dur: 0.12, gain: 0.08, type: 'highpass', freq: 3000 });
  }

  // Crowd cheer: layered rising noise + chord.
  cheer(big = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(big ? 0.4 : 0.28, t + 0.15);
    g.linearRampToValueAtTime(0.05, t + (big ? 2.2 : 1.4));
    const notes = big ? [392, 523, 659, 784] : [392, 523];
    notes.forEach((f, i) => this._tone({ freq: f, type: 'sawtooth', dur: 0.5, gain: 0.05, decay: 0.4 }));
    this._noiseBurst({ dur: 0.6, gain: 0.12, type: 'bandpass', freq: 1500 });
  }

  miss() {
    // soft "aww" dip
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.linearRampToValueAtTime(0.02, t + 0.6);
    g.linearRampToValueAtTime(0.04, t + 1.6);
    this._tone({ freq: 300, freqEnd: 180, type: 'sine', dur: 0.3, gain: 0.05, decay: 0.2 });
  }

  buzzer() {
    this._tone({ freq: 220, type: 'square', dur: 1.2, gain: 0.25, decay: 0.2 });
  }

  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this._tone({ freq: f, type: 'triangle', dur: 0.12, gain: 0.18, decay: 0.1 }), i * 90);
    });
    this.cheer(true);
  }
}
