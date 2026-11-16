// The sound of the room.
//
// There are no audio files: the bed is made from filtered noise and a low pair of
// oscillators, so the site stays small and the wind never repeats. Volume lives
// in local storage and is controlled from the HUD; nothing starts until the
// player has touched the page, which is also what browsers require.

const KEY = 'gods-eye-sound';

function readSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { volume: 0.6, muted: false };
    const parsed = JSON.parse(raw);
    return {
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.6,
      muted: !!parsed.muted,
    };
  } catch {
    return { volume: 0.6, muted: false };
  }
}

export class Sound {
  constructor() {
    const settings = readSettings();
    this.volume = settings.volume;
    this.muted = settings.muted;
    this.ctx = null;
    this.master = null;
    this.bed = null;
    this.started = false;
    this.chimeAt = 6;
  }

  get audible() {
    return !this.muted && this.volume > 0.001;
  }

  // Called from a real gesture: browsers refuse to start audio before one.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      this.ctx = new Ctx();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.gainValue();
    this.master.connect(this.ctx.destination);
    this.startBed();
    return this.ctx;
  }

  gainValue() {
    if (this.muted) return 0;
    // a squared curve feels even on a slider
    return this.volume * this.volume * 0.55;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* private mode: the setting just will not survive the visit */
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.volume > 0) this.muted = false;
    this.apply();
    this.save();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (!this.muted) this.ensure();
    this.apply();
    this.save();
    return this.muted;
  }

  apply() {
    if (this.master && this.ctx) {
      const target = this.gainValue();
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(target, now, 0.08);
    }
  }

  // Night air through the shutter, and a low room hum under it.
  startBed() {
    if (!this.ctx || this.started) return;
    this.started = true;
    const ctx = this.ctx;

    const noise = ctx.createBufferSource();
    const length = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      // a little low-pass on the noise itself, so it breathes instead of hissing
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
      data[i] = last * 6;
    }
    noise.buffer = buffer;
    noise.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.6;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;

    // slow swell, so the wind rises and falls on its own
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(windGain.gain);

    noise.connect(band).connect(windGain).connect(this.master);
    noise.start();
    lfo.start();

    const hum = ctx.createGain();
    hum.gain.value = 0.03;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 240;
    hum.connect(humFilter).connect(this.master);
    for (const [freq, level] of [[55, 0.6], [82.5, 0.32], [110, 0.14]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(hum);
      osc.start();
    }

    this.bed = { noise, windGain, hum };
  }

  // A short, soft note now and then: something far off in the world.
  chime() {
    if (!this.ctx || !this.audible) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [523.25, 587.33, 698.46, 783.99, 880];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = (Math.random() * 2 - 1) * 0.6;
      osc.connect(gain).connect(pan).connect(this.master);
    } else {
      osc.connect(gain).connect(this.master);
    }
    osc.start(now);
    osc.stop(now + 3.6);
  }

  // Interface sounds: a tap on the board, a page turned.
  cue(kind = 'tap') {
    if (!this.ctx || !this.audible) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (kind === 'open') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.16);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } else if (kind === 'close') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(392, now);
      osc.frequency.exponentialRampToValueAtTime(262, now + 0.14);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    }
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  update(dt) {
    if (!this.ctx || !this.started) return;
    this.chimeAt -= dt;
    if (this.chimeAt <= 0) {
      this.chimeAt = 18 + Math.random() * 26;
      this.chime();
    }
  }
}
