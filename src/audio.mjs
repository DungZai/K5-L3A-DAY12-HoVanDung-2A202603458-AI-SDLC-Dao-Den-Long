const SOUNDS = {
  mote_picked: [784, 1175],
  lantern_lit: [392, 523, 659, 784],
  pulse: [300, 600, 440],
  player_hit: [160, 97],
  jump: [280, 460],
  dash: [220, 480, 300],
  won: [392, 523, 659, 784, 1047],
  lost: [392, 311, 196],
  shade_spawned: [105, 138],
  countdown: [630],
  wind_warning: [155, 206, 262],
  charm_picked: [523, 784, 988]
};
const NIGHT_CHORDS = [[130.81, 196, 261.63], [110, 164.81, 261.63], [98, 146.83, 246.94]];

export class GameSound {
  constructor(volume) {
    this.volume = volume;
    this.context = null;
    this.ambient = [];
  }

  enable() {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) return;
    if (!this.context) {
      this.context = new Audio();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  setVolume(value) {
    this.volume = value;
    if (this.context) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.03);
  }

  tone(frequency, start, duration, volume, shape = 'sine') {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = shape;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.07, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  play(name) {
    if (!this.context || !SOUNDS[name]) return;
    const now = this.context.currentTime;
    const low = ['player_hit', 'shade_spawned', 'wind_warning', 'dash', 'pulse'].includes(name);
    for (const [index, frequency] of SOUNDS[name].entries()) {
      this.tone(frequency, now + index * 0.085, low ? 0.23 : 0.27, low ? 0.125 : 0.083, low ? 'triangle' : 'sine');
    }
  }

  night(number) {
    this.stopNight();
    if (!this.context) return;
    const now = this.context.currentTime;
    this.ambient = NIGHT_CHORDS[number - 1].map((frequency, index) => {
      const voice = this.context.createOscillator();
      const gain = this.context.createGain();
      const breath = this.context.createOscillator();
      const depth = this.context.createGain();
      voice.type = index === 0 ? 'triangle' : 'sine';
      voice.frequency.value = frequency;
      breath.frequency.value = 0.09 + index * 0.035;
      depth.gain.value = 0.008;
      breath.connect(depth).connect(gain.gain);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.024, now + 1.25);
      voice.connect(gain).connect(this.master);
      voice.start(now);
      breath.start(now);
      return { voice, breath, gain };
    });
  }

  stopNight() {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const { voice, breath, gain } of this.ambient) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.17);
      voice.stop(now + 0.9);
      breath.stop(now + 0.9);
    }
    this.ambient = [];
  }
}
