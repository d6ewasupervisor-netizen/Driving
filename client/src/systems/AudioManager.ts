/**
 * AudioManager — Web Audio API engine/SFX system
 *
 * All sounds are procedurally generated (no audio files needed).
 *   - Engine: sawtooth oscillator + bandpass filter, frequency driven by RPM
 *   - Tire screech: filtered noise buffer triggered on high lateral slip
 *   - Wind: lowpass noise, gain proportional to speed
 *   - Collision: short noise burst with envelope
 *   - Coin pickup: two-tone chime
 *
 * Singleton pattern — call AudioManager.init() on first user gesture.
 */

// ─── Noise buffer (reused across effects) ────────────────────────────────────
let _noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (_noiseBuffer && _noiseBuffer.sampleRate === ctx.sampleRate) return _noiseBuffer;
  const len = ctx.sampleRate * 2; // 2 seconds
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  _noiseBuffer = buf;
  return buf;
}

class AudioManagerClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Engine nodes
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Wind nodes
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Screech nodes
  private screechSource: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  // Rain nodes
  private rainSource: AudioBufferSourceNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;

  // State
  private _initialized = false;
  private _muted = false;
  private _sfxVolume = 0.7;
  private _musicVolume = 0.3;
  private _suspended = false;

  get initialized() { return this._initialized; }

  // ── Initialize on first user gesture ─────────────────────────────────────
  init(): boolean {
    if (this._initialized) return true;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);

      // SFX bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._sfxVolume;
      this.sfxGain.connect(this.masterGain);

      // Music bus (unused for now, placeholder)
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this._musicVolume;
      this.musicGain.connect(this.masterGain);

      this._setupEngine();
      this._setupWind();
      this._setupScreech();
      this._setupRain();

      this._initialized = true;
      return true;
    } catch {
      return false;
    }
  }

  // ── Engine: two detuned sawtooth oscillators through a bandpass filter ────
  private _setupEngine() {
    const ctx = this.ctx!;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.sfxGain!);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'bandpass';
    this.engineFilter.frequency.value = 120;
    this.engineFilter.Q.value = 2.5;
    this.engineFilter.connect(this.engineGain);

    // Primary oscillator
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 80;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc.start();

    // Secondary oscillator (detuned for richness)
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 80;
    this.engineOsc2.detune.value = -7;

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.3;
    this.engineOsc2.connect(osc2Gain);
    osc2Gain.connect(this.engineFilter);
    this.engineOsc2.start();
  }

  // ── Wind: noise through lowpass, gain = speed ────────────────────────────
  private _setupWind() {
    const ctx = this.ctx!;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.sfxGain!);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.5;
    this.windFilter.connect(this.windGain);

    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = getNoiseBuffer(ctx);
    this.windSource.loop = true;
    this.windSource.connect(this.windFilter);
    this.windSource.start();
  }

  // ── Screech: noise through highpass, gain controlled by slip ─────────────
  private _setupScreech() {
    const ctx = this.ctx!;

    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    this.screechGain.connect(this.sfxGain!);

    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'highpass';
    this.screechFilter.frequency.value = 3000;
    this.screechFilter.Q.value = 5;
    this.screechFilter.connect(this.screechGain);

    this.screechSource = ctx.createBufferSource();
    this.screechSource.buffer = getNoiseBuffer(ctx);
    this.screechSource.loop = true;
    this.screechSource.connect(this.screechFilter);
    this.screechSource.start();
  }

  // ── Rain: bandpass noise, ambient patter ───────────────────────────────────
  private _setupRain() {
    const ctx = this.ctx!;

    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.sfxGain!);

    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 4000;
    this.rainFilter.Q.value = 0.5;
    this.rainFilter.connect(this.rainGain);

    this.rainSource = ctx.createBufferSource();
    this.rainSource.buffer = getNoiseBuffer(ctx);
    this.rainSource.loop = true;
    this.rainSource.connect(this.rainFilter);
    this.rainSource.start();
  }

  // ── Per-frame update: call from useFrame ──────────────────────────────────
  update(rpm: number, speedMph: number, slipAmount: number, isDriving: boolean, raining = false) {
    if (!this._initialized || !this.ctx) return;

    // Resume context if needed (autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (!isDriving || this._suspended) {
      // Silence everything when not driving
      this.engineGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.windGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.screechGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }

    const t = this.ctx.currentTime;

    // ── Engine ──────────────────────────────────────────────────────────────
    // Map RPM 800-7000 → frequency 40-220 Hz
    const rpmNorm = Math.max(0, Math.min(1, (rpm - 800) / 6200));
    const freq = 40 + rpmNorm * 180;
    const filterFreq = 80 + rpmNorm * 600;
    const engineVol = 0.08 + rpmNorm * 0.18; // louder at high RPM

    this.engineOsc?.frequency.setTargetAtTime(freq, t, 0.03);
    this.engineOsc2?.frequency.setTargetAtTime(freq * 1.01, t, 0.03);
    this.engineFilter?.frequency.setTargetAtTime(filterFreq, t, 0.03);
    this.engineGain?.gain.setTargetAtTime(engineVol, t, 0.05);

    // ── Wind ────────────────────────────────────────────────────────────────
    // Map speed 0-80 mph → gain 0-0.12, filter 400-2000 Hz
    const speedNorm = Math.min(1, speedMph / 80);
    const windVol = speedNorm * 0.12;
    const windFreq = 400 + speedNorm * 1600;

    this.windFilter?.frequency.setTargetAtTime(windFreq, t, 0.1);
    this.windGain?.gain.setTargetAtTime(windVol, t, 0.15);

    // ── Tire screech ────────────────────────────────────────────────────────
    // slipAmount 0-1 → gain 0-0.15
    const screechVol = Math.min(0.15, slipAmount * 0.2);
    this.screechGain?.gain.setTargetAtTime(screechVol, t, 0.02);

    // ── Rain ambience ───────────────────────────────────────────────────────
    const rainVol = raining ? 0.12 : 0;
    this.rainGain?.gain.setTargetAtTime(rainVol, t, 0.3);
  }

  // ── One-shot: collision thud ──────────────────────────────────────────────
  playCollision() {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Short burst of low-frequency noise
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.start(t);
    source.stop(t + 0.35);
  }

  // ── One-shot: coin pickup chime ───────────────────────────────────────────
  playCoinPickup() {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Two-tone ascending chime
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 880; // A5

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 1320; // E6

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(t);
    osc2.start(t + 0.1);
    osc1.stop(t + 0.3);
    osc2.stop(t + 0.45);
  }

  // ── One-shot: zombie splat ────────────────────────────────────────────────
  playZombieSplat() {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Quick wet thud — bandpass noise + pitch drop
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    filter.Q.value = 3;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.start(t);
    source.stop(t + 0.25);
  }

  // ── One-shot: quiz correct ────────────────────────────────────────────────
  playQuizCorrect() {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Ascending major triad arpeggio
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.15, t + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.35);
    });
  }

  // ── One-shot: quiz wrong ──────────────────────────────────────────────────
  playQuizWrong() {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Descending minor second (dissonant)
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(200, t + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // ── Suspend/resume (for pause) ────────────────────────────────────────────
  suspend() {
    this._suspended = true;
  }

  resume() {
    this._suspended = false;
  }

  // ── Volume / mute ─────────────────────────────────────────────────────────
  setMuted(muted: boolean) {
    this._muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 1,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  setSfxVolume(vol: number) {
    this._sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this._sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  setMusicVolume(vol: number) {
    this._musicVolume = Math.max(0, Math.min(1, vol));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this._musicVolume, this.ctx.currentTime, 0.05);
    }
  }

  get muted() { return this._muted; }
  get sfxVolume() { return this._sfxVolume; }
  get musicVolume() { return this._musicVolume; }
}

// Singleton
export const AudioManager = new AudioManagerClass();
