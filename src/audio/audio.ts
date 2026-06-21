/**
 * Procedural audio + sampled SFX. On first user gesture it spins up Web Audio, loads any provided
 * .wav samples (/assets/<name>.wav) into buffers, and plays them; if a sample is missing it falls
 * back to a synthesized tone. A low intensity drone swells with on-screen danger. In Node (headless
 * sim / tests) there is no Web Audio, so everything degrades to a silent no-op.
 */
const SAMPLE_NAMES = ['shoot', 'hit', 'explode', 'hurt', 'levelup', 'pickup', 'boss'] as const;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private readonly supported: boolean;
  private droneGain: GainNode | null = null;
  private readonly samples = new Map<string, AudioBuffer>();
  private samplesRequested = false;

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
      this.initDrone();
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

  private initDrone(): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    g.gain.value = 0;
    o.connect(g).connect(this.ctx.destination);
    o.start();
    this.droneGain = g;
  }

  setIntensity(n: number): void {
    if (!this.droneGain || !this.ctx) return;
    this.droneGain.gain.setTargetAtTime(Math.min(0.06, n * 0.06), this.ctx.currentTime, 0.4);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.03): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  /** Play a loaded sample; returns false if unavailable so callers can fall back to a tone. */
  private sample(name: string, vol: number): boolean {
    if (!this.ctx) return false;
    const buf = this.samples.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.ctx.destination);
    src.start();
    return true;
  }

  shoot(): void {
    if (!this.sample('shoot', 0.25)) this.tone(430, 0.05, 'square', 0.022);
  }
  kill(): void {
    if (!this.sample('hit', 0.3)) this.tone(130, 0.09, 'sawtooth', 0.02);
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
