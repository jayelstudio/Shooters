// A short silent WAV (base64). Looping it through an <audio> element flips iOS
// Safari's audio session to "playback", so Web Audio plays through the speaker
// even when the device's mute/silent toggle is on (otherwise it only routes to
// headphones).
const SILENT_WAV_B64 = 'UklGRiQZAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAZAAAA' + 'A'.repeat(8532);

function silentWavUrl() {
  try {
    const bin = atob(SILENT_WAV_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  } catch (e) {
    return 'data:audio/wav;base64,' + SILENT_WAV_B64;
  }
}

// All sound is synthesized at runtime via Web Audio — no asset files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.enabled = true;
    this._silentEl = null;
    this.samples = { grunts: [] }; // decoded mp3 buffers (filled in init)
    this.sfx = { cheers: [], misses: [], level: null, extra: null };
    // background music (streamed via <audio>; switched on level-up)
    this._music = null;
    this._musicIndex = -1;
    this._musicVol = 0.2;
    this._musicShouldPlay = false;
    this._fadeTimer = null;
    this._musicTracks = ['./background-1.mp3', './background-2.mp3', './background-3.mp3'];
    this.muted = false;
    try { this.muted = localStorage.getItem('buckets.muted') === '1'; } catch (_) { /* ignore */ }
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
    this._unlockSpeaker();
    this._startCrowd();
    this._loadSamples();
  }

  // Decode the uploaded mp3 sound effects into AudioBuffers.
  async _loadSamples() {
    const ctx = this.ctx;
    if (!ctx) return;
    const decode = async (url) => {
      try {
        const r = await fetch(url);
        const a = await r.arrayBuffer();
        return await ctx.decodeAudioData(a);
      } catch (e) { return null; }
    };
    const [g1, g2, g3, bounce, rim, board, net] = await Promise.all([
      decode('./grunt-1.mp3'), decode('./grunt-2.mp3'), decode('./grunt-3.mp3'),
      decode('./ball-bounce.mp3'), decode('./rim.mp3'), decode('./backboard.mp3'), decode('./net.mp3'),
    ]);
    this.samples = { grunts: [g1, g2, g3].filter(Boolean), bounce, rim, board, net };

    // sfx/ folder: cheers, misses, level, extra
    const [c1, c2, c3, c4, c5, c6, c7, m1, m2, m3, level, extra] = await Promise.all([
      decode('./sfx/cheer-1.mp3'), decode('./sfx/cheer-2.mp3'), decode('./sfx/cheer-3.mp3'),
      decode('./sfx/cheer-4.mp3'), decode('./sfx/cheer-5.mp3'), decode('./sfx/cheer-6.mp3'),
      decode('./sfx/cheer-7.mp3'),
      decode('./sfx/miss-1.mp3'), decode('./sfx/miss-2.mp3'), decode('./sfx/miss-3.mp3'),
      decode('./sfx/level-1.mp3'), decode('./sfx/extra-1.mp3'),
    ]);
    this.sfx = {
      cheers: [c1, c2, c3, c4, c5, c6, c7], // index 0 = cheer-1 (first basket)
      misses: [m1, m2, m3],                 // 0 = short, 2 = past backboard
      level, extra,
    };
  }

  _playBuffer(buf, gain = 0.9, rate = 1) {
    if (!this.ctx || !this.enabled || !buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(this._now());
  }

  // Keep a silent looping <audio> element alive to route Web Audio to the
  // speaker on iOS regardless of the mute switch.
  _unlockSpeaker() {
    try {
      if (!this._silentEl) {
        const el = new Audio(silentWavUrl());
        el.loop = true;
        el.preload = 'auto';
        el.muted = false;
        el.volume = 1;
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        this._silentEl = el;
      }
      const p = this._silentEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this._silentEl && this._silentEl.paused) {
      const p = this._silentEl.play();
      if (p && p.catch) p.catch(() => {});
    }
    this.resumeMusic();
  }

  // ----- Background music (random track, switches on level-up) -----
  _ensureMusicEl() {
    if (this._music) return this._music;
    const el = new Audio();
    el.loop = true; el.preload = 'auto'; el.volume = 0; el.muted = this.muted;
    el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
    this._music = el;
    return el;
  }

  // Mute/unmute only the background music (sound effects keep playing).
  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem('buckets.muted', this.muted ? '1' : '0'); } catch (_) { /* ignore */ }
    if (this._music) this._music.muted = this.muted;
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  playRandomMusic() {
    if (!this.enabled) return;
    const el = this._ensureMusicEl();
    this._musicShouldPlay = true;
    let n;
    do { n = (Math.random() * this._musicTracks.length) | 0; }
    while (this._musicTracks.length > 1 && n === this._musicIndex);
    this._musicIndex = n;
    const startTrack = () => {
      el.src = this._musicTracks[n];
      const p = el.play(); if (p && p.catch) p.catch(() => {});
      this._fadeMusic(this._musicVol);
    };
    if (el.src && !el.paused) this._fadeMusic(0, startTrack); // fade out then switch
    else startTrack();
  }

  pauseMusic() {
    this._musicShouldPlay = false;
    const el = this._music; if (!el) return;
    this._fadeMusic(0, () => { try { el.pause(); } catch (_) {} });
  }

  resumeMusic() {
    const el = this._music;
    if (!el || !this._musicShouldPlay) return;
    const p = el.play(); if (p && p.catch) p.catch(() => {});
    this._fadeMusic(this._musicVol);
  }

  _fadeMusic(target, done) {
    const el = this._music; if (!el) { done && done(); return; }
    if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
    const dir = Math.sign(target - el.volume);
    if (dir === 0) { done && done(); return; }
    this._fadeTimer = setInterval(() => {
      let v = el.volume + dir * 0.05;
      const reached = (dir > 0 && v >= target) || (dir < 0 && v <= target);
      v = Math.max(0, Math.min(1, reached ? target : v));
      el.volume = v;
      if (reached) { clearInterval(this._fadeTimer); this._fadeTimer = null; done && done(); }
    }, 25);
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

  // Random effort grunt on release.
  grunt() {
    const a = this.samples.grunts;
    if (a && a.length) this._playBuffer(a[(Math.random() * a.length) | 0], 1.26, 0.96 + Math.random() * 0.08);
  }

  bounceFloor(strength = 1) {
    if (this.samples.bounce) { this._playBuffer(this.samples.bounce, Math.min(1, 0.45 + 0.55 * strength)); return; }
    this._tone({ freq: 130, freqEnd: 60, type: 'sine', dur: 0.05, gain: 0.3 * strength, decay: 0.05 });
    this._noiseBurst({ dur: 0.05, gain: 0.1 * strength, type: 'lowpass', freq: 500 });
  }

  // Quick synth clank on any rim contact (physical feedback).
  rim() {
    this._tone({ freq: 280, freqEnd: 180, type: 'triangle', dur: 0.06, gain: 0.18, decay: 0.1 });
    this._noiseBurst({ dur: 0.05, gain: 0.12, type: 'bandpass', freq: 2200 });
  }

  // Made off the rim (rattles in).
  rimScore() {
    if (this.samples.rim) this._playBuffer(this.samples.rim, 0.95);
    else this.rim();
  }

  backboard() {
    if (this.samples.board) { this._playBuffer(this.samples.board, 0.85); return; }
    this._tone({ freq: 200, freqEnd: 120, type: 'square', dur: 0.07, gain: 0.16, decay: 0.12 });
    this._noiseBurst({ dur: 0.06, gain: 0.1, type: 'lowpass', freq: 900 });
  }

  swish() {
    if (this.samples.net) { this._playBuffer(this.samples.net, 0.95); return; }
    this._noiseBurst({ dur: 0.22, gain: 0.16, type: 'highpass', freq: 5000 });
  }

  // Crowd murmur swell (the distinct cheer sound is the cheer-*.mp3 sample).
  cheer(big = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(big ? 0.4 : 0.28, t + 0.15);
    g.linearRampToValueAtTime(0.05, t + (big ? 2.2 : 1.4));
  }

  miss() {
    // soft crowd "aww" dip (the miss-*.mp3 sample is the distinct sound)
    if (!this.ctx || !this.enabled) return;
    const t = this._now();
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.linearRampToValueAtTime(0.02, t + 0.6);
    g.linearRampToValueAtTime(0.04, t + 1.6);
  }

  buzzer() {
    this._tone({ freq: 220, type: 'square', dur: 1.2, gain: 0.25, decay: 0.2 });
  }

  levelUp() {
    this.playLevel();
    this.cheer(true);
  }

  // ----- Sample-based reactions (sfx/ folder) -----
  playCheer(first = false) {
    const c = this.sfx && this.sfx.cheers ? this.sfx.cheers.filter(Boolean) : [];
    if (!c.length) return;
    const buf = first && this.sfx.cheers[0] ? this.sfx.cheers[0] : c[(Math.random() * c.length) | 0];
    this._playBuffer(buf, 0.9);
  }

  // reason: 'short' -> miss-1, 'past' -> miss-3, else random
  playMiss(reason) {
    const m = this.sfx && this.sfx.misses ? this.sfx.misses : [];
    let buf;
    if (reason === 'short') buf = m[0];
    else if (reason === 'past') buf = m[2];
    if (!buf) { const avail = m.filter(Boolean); buf = avail[(Math.random() * avail.length) | 0]; }
    this._playBuffer(buf, 0.9);
  }

  playLevel() { if (this.sfx && this.sfx.level) this._playBuffer(this.sfx.level, 0.9); }
  playExtra() { if (this.sfx && this.sfx.extra) this._playBuffer(this.sfx.extra, 0.95); }
}
