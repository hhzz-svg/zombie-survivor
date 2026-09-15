/**
 * Procedural audio + sampled SFX. On first user gesture it spins up Web Audio, loads any provided
 * .wav samples (/assets/<name>.wav) into buffers, and plays them; if a sample is missing it falls
 * back to a synthesized tone. Four procedural music layers crossfade with the state of the run.
 * In Node (headless sim / tests) there is no Web Audio, so everything degrades to a silent no-op.
 */
import {
  MUSIC_LAYERS, layerMix, midiToFreq, fillNoise,
  STEP_SECONDS, STEPS_PER_BAR, ROOT_MIDI, PULSE_KICK, PULSE_TICK, BOSS_RIFF,
  type MusicLayer, type MusicState, type LayerMix,
} from './music';

const SAMPLE_NAMES = ['shoot', 'hit', 'explode', 'hurt', 'levelup', 'pickup', 'boss'] as const;

/** How far ahead of the audio clock notes are queued, and how often we top the queue up. */
const SCHEDULE_AHEAD = 0.28;
const SCHEDULE_TICK_MS = 60;

/** Crossfade time constant. Slow enough that a passing spike does not flap the mix. */
const FADE = 1.1;

/**
 * Per-layer headroom. The mix from music.ts is musical intent, 0..1; this is what each
 * layer is actually worth against the others, so balancing loudness never means editing
 * the pure function that decides *when* a layer plays.
 */
const LAYER_TRIM: Record<MusicLayer, number> = { bed: 0.06, pulse: 0.5, dread: 0.05, boss: 0.75 };

export class AudioBus {
  private ctx: AudioContext | null = null;
  private readonly supported: boolean;
  private master: GainNode | null = null;
  private volume = 0.8;
  private muted = false;
  private readonly samples = new Map<string, AudioBuffer>();
  private samplesRequested = false;
  private musicVolume = 0.6;
  private musicBus: GainNode | null = null;
  private readonly layerGain = new Map<MusicLayer, GainNode>();
  private mix: LayerMix | null = null; // last requested mix, replayed if the context starts late
  private noise: AudioBuffer | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0; // audio-clock time of the next sixteenth
  private step = 0;

  constructor() {
    this.supported =
      typeof window !== 'undefined' &&
      !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  }

  resume(): void {
    if (!this.supported) return;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.initMusic();
      void this.loadSamples();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async loadSamples(base = '/assets'): Promise<void> {
    if (this.samplesRequested || !this.ctx) return;
    this.samplesRequested = true;
    for (const name of SAMPLE_NAMES) {
      try {
        const res = await fetch(`${base}/${name}.wav`);
        if (!res.ok) continue;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.samples.set(name, buf);
      } catch {
        // missing/undecodable sample → synth fallback handles it
      }
    }
  }

  /**
   * Build the music graph once: a bus under the master, one gain per layer, and the two
   * sustained layers running continuously at zero gain. Starting oscillators once and
   * crossfading them is what makes the layers able to blend — stopping and restarting
   * them would click, and would make a smooth entry impossible.
   */
  private initMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.out());

    for (const layer of MUSIC_LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.musicBus);
      this.layerGain.set(layer, g);
    }

    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    fillNoise(noiseBuf.getChannelData(0));
    this.noise = noiseBuf;

    // bed — the old drone: a low sawtooth under a gentle lowpass.
    const bed = ctx.createOscillator();
    bed.type = 'sawtooth';
    bed.frequency.value = midiToFreq(ROOT_MIDI - 12);
    const bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = 220;
    bed.connect(bedFilter).connect(this.layerGain.get('bed')!);
    bed.start();

    // dread — a minor second beating against the root, tremolo'd. Unpleasant on purpose:
    // this is the blood-moon layer, and it should read as "something is wrong" before the
    // player has looked at the screen edges.
    // The tremolo modulates a node of its own, NOT the layer's mix gain. Summing an
    // oscillator into the mix gain makes that param swing around whatever the crossfade set,
    // so the layer stays audible at "zero" — measured, not theorised.
    const dread = this.layerGain.get('dread')!;
    const tremNode = ctx.createGain();
    tremNode.gain.value = 0.65;
    tremNode.connect(dread);
    for (const semis of [12, 13]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midiToFreq(ROOT_MIDI + semis);
      o.connect(tremNode);
      o.start();
    }
    const trem = ctx.createOscillator();
    const tremDepth = ctx.createGain();
    trem.frequency.value = 5.5;
    tremDepth.gain.value = 0.35;
    trem.connect(tremDepth).connect(tremNode.gain);
    trem.start();

    this.applyMix();
    this.startScheduler();
  }

  /**
   * Note timing comes from the audio clock, never from setInterval: the interval only tops
   * up a short queue of already-timed notes, so a busy frame cannot make the beat stutter.
   */
  private startScheduler(): void {
    if (this.scheduler !== null || !this.ctx) return;
    this.nextStepAt = this.ctx.currentTime + 0.05;
    this.scheduler = setInterval(() => this.pump(), SCHEDULE_TICK_MS);
  }

  private pump(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // A tab that was backgrounded can leave the queue far behind the clock; resync rather
    // than firing a burst of notes to catch up.
    if (this.nextStepAt < ctx.currentTime - 1) this.nextStepAt = ctx.currentTime;
    while (this.nextStepAt < ctx.currentTime + SCHEDULE_AHEAD) {
      this.playStep(this.step, this.nextStepAt);
      this.step = (this.step + 1) % STEPS_PER_BAR;
      this.nextStepAt += STEP_SECONDS;
    }
  }

  /**
   * One sixteenth of the two rhythmic layers. Voices are created per note and stopped —
   * the standard Web Audio pattern, since a stopped source cannot be restarted.
   */
  private playStep(step: number, at: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const pulse = this.layerGain.get('pulse');
    if (pulse) {
      if (PULSE_KICK[step]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, at);
        o.frequency.exponentialRampToValueAtTime(42, at + 0.11);
        g.gain.setValueAtTime(0.5, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        o.connect(g).connect(pulse);
        o.start(at);
        o.stop(at + 0.18);
      }
      if (PULSE_TICK[step] && this.noise) {
        const src = ctx.createBufferSource();
        const hp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        src.buffer = this.noise;
        hp.type = 'highpass';
        hp.frequency.value = 6000;
        g.gain.setValueAtTime(0.12, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
        src.connect(hp).connect(g).connect(pulse);
        src.start(at);
        src.stop(at + 0.06);
      }
    }

    const bossGain = this.layerGain.get('boss');
    const semis = BOSS_RIFF[step];
    if (bossGain && semis !== null && semis !== undefined) {
      const o = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(ROOT_MIDI + 12 + semis);
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.28, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + STEP_SECONDS * 1.6);
      o.connect(lp).connect(g).connect(bossGain);
      o.start(at);
      o.stop(at + STEP_SECONDS * 1.8);
    }
  }

  /**
   * What the music should be doing right now. `null` means "nothing" — the title screen and
   * the results screen — and everything fades out rather than cutting.
   */
  setMusic(state: MusicState | null): void {
    this.mix = layerMix(state);
    this.applyMix();
  }

  private applyMix(): void {
    const ctx = this.ctx;
    const mix = this.mix;
    if (!ctx || mix === null) return;
    for (const layer of MUSIC_LAYERS) {
      this.layerGain.get(layer)?.gain.setTargetAtTime(mix[layer] * LAYER_TRIM[layer], ctx.currentTime, FADE);
    }
  }

  /** Music volume, 0..1, independent of SFX — plenty of people want one without the other. */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
    }
  }

  /** Master volume, 0..1. Applied live, and remembered for a context created later. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  /** Everything routes through the master gain — never straight to the destination. */
  private out(): AudioNode {
    return this.master ?? this.ctx!.destination;
  }


  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.03): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.out());
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  /** Play a loaded sample; returns false if unavailable so callers can fall back to a tone. */
  private sample(name: string, vol: number, rate = 1): boolean {
    if (!this.ctx) return false;
    const buf = this.samples.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.out());
    src.start();
    return true;
  }

  shoot(): void {
    if (!this.sample('shoot', 0.25)) this.tone(430, 0.05, 'square', 0.022);
  }
  /** Kill thock; `pitch` climbs with the combo chain so streaks are audible. */
  kill(pitch = 1): void {
    if (!this.sample('hit', 0.3, pitch)) this.tone(130 * pitch, 0.09, 'sawtooth', 0.02);
  }
  explode(): void {
    if (!this.sample('explode', 0.5)) this.tone(90, 0.18, 'sawtooth', 0.05);
  }
  hurt(): void {
    if (!this.sample('hurt', 0.5)) this.tone(180, 0.13, 'square', 0.05);
  }
  pickup(): void {
    if (!this.sample('pickup', 0.25)) this.tone(900, 0.03, 'square', 0.018);
  }
  levelUp(): void {
    if (!this.sample('levelup', 0.5)) {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.1, 'square', 0.04), i * 60));
    }
  }
  boss(): void {
    if (!this.sample('boss', 0.6)) {
      [110, 98, 87].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sawtooth', 0.05), i * 120));
    }
  }
  nova(): void {
    this.tone(620, 0.12, 'sawtooth', 0.04);
  }
}
