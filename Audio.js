// Audio.js - tiny procedural sound engine for retro Nintendo-esque blips
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }
  _ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  }
  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  _blip({freq=440, type='square', dur=0.1, vol=0.3, attack=0.005, decay=0.08, slide=0}) {
    if (!this.enabled) return;
    this._ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  kick() {
    this._blip({ freq: 220, type: 'square', dur: 0.12, slide: -120, vol: 0.4 });
    setTimeout(() => this._blip({ freq: 90, type: 'sine', dur: 0.08, vol: 0.3 }), 20);
  }
  pass() {
    this._blip({ freq: 520, type: 'triangle', dur: 0.08, vol: 0.3, slide: 80 });
  }
  bounce() {
    this._blip({ freq: 660, type: 'square', dur: 0.05, vol: 0.18, slide: -120 });
  }
  tackle() {
    // chunky thud + scrape
    this._blip({ freq: 160, type: 'square', dur: 0.08, vol: 0.35, slide: -80 });
    setTimeout(() => this._blip({ freq: 320, type: 'triangle', dur: 0.06, vol: 0.22, slide: -200 }), 25);
  }
  whistle() {
    this._blip({ freq: 1200, type: 'sine', dur: 0.18, vol: 0.3, slide: 200 });
  }
  goal() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() =>
      this._blip({ freq: f, type: 'square', dur: 0.14, vol: 0.32 }), i * 90));
  }
  crowd() {
    // brief noise burst
    if (!this.enabled) return;
    this._ensure();
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.8, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.sin((i / d.length) * Math.PI);
      d[i] = (Math.random() * 2 - 1) * env * 0.3;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.4;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.7;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }
  click() {
    this._blip({ freq: 800, type: 'square', dur: 0.05, vol: 0.2 });
  }
  modifier(id) {
    // Cute "power-up" jingle, slightly tinted per modifier type.
    const themes = {
      speed:     [523, 784, 1046],
      slow:      [523, 415, 330],
      ice:       [880, 988, 1175, 1318],
      scared:    [660, 440, 660, 440],
      blackhole: [294, 233, 196, 165],
      frost:     [988, 1175, 1318, 1568],
    };
    const notes = themes[id] || [523, 659, 784];
    notes.forEach((f, i) => setTimeout(() =>
      this._blip({ freq: f, type: 'triangle', dur: 0.13, vol: 0.28 }), i * 80));
  }
  freeze() {
    // crystalline shimmer
    this._blip({ freq: 1568, type: 'sine', dur: 0.12, vol: 0.25, slide: -800 });
    setTimeout(() => this._blip({ freq: 1175, type: 'sine', dur: 0.08, vol: 0.18, slide: -400 }), 60);
  }
}
