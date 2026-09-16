/**
 * The musical decisions, kept apart from the Web Audio plumbing.
 *
 * Everything here is a pure function or a constant table, for two reasons: it can be unit
 * tested without an AudioContext (Web Audio does not exist in Node, where the headless sim
 * runs), and it keeps the question "what should be playing right now" separate from the
 * question "how do I make a sawtooth do that".
 *
 * There is no music asset. Four procedural layers crossfade against the state of the run,
 * which costs nothing to download and — unlike a looping track — can follow the fight
 * continuously instead of cutting between clips.
 */

export type MusicLayer = 'bed' | 'pulse' | 'dread' | 'boss';

export const MUSIC_LAYERS: readonly MusicLayer[] = ['bed', 'pulse', 'dread', 'boss'];

export interface MusicState {
  /** Horde pressure, 0..1 — how much is on screen. */
  pressure: number;
  /** A blood moon is running. */
  surge: boolean;
  /** A boss is alive. */
  boss: boolean;
}

export type LayerMix = Record<MusicLayer, number>;

export const SILENCE: LayerMix = { bed: 0, pulse: 0, dread: 0, boss: 0 };

/** Below this much pressure the run reads as calm and the rhythm layer stays out of the way. */
const PULSE_FLOOR = 0.15;

/**
 * Target gain per layer, 0..1. The mix is a pure function of the run's state, so the music
 * is reproducible from a replay and there is exactly one place to reason about balance.
 */
export function layerMix(state: MusicState | null): LayerMix {
  if (state === null) return { ...SILENCE };
  const pressure = clamp01(state.pressure);

  // The bed never drops out — it is the floor the others sit on — but it ducks under the
  // boss layer, which occupies the same low register and would otherwise turn to mud.
  const bed = state.boss ? 0.45 : 1;

  // Rhythm tracks the horde, with a floor during a blood moon so the surge always drives.
  let pulse = pressure <= PULSE_FLOOR ? 0 : (pressure - PULSE_FLOOR) / (1 - PULSE_FLOOR);
  if (state.surge) pulse = Math.max(pulse, 0.8);

  return {
    bed,
    pulse: clamp01(pulse),
    dread: state.surge ? 1 : 0,
    boss: state.boss ? 1 : 0,
  };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export const BPM = 96;
export const STEPS_PER_BAR = 16; // sixteenth notes

/** Seconds per sixteenth note. */
export const STEP_SECONDS = 60 / BPM / 4;

/**
 * A minor, because the whole game is one long night. Semitone offsets from the root, used
 * by every pitched layer so the four of them can never disagree about the key.
 */
export const ROOT_MIDI = 33; // A1

/** Kick on the downbeats, ticks on the offbeats. `true` means "this step sounds". */
export const PULSE_KICK: readonly boolean[] = step16([0, 4, 6, 8, 12, 14]);
export const PULSE_TICK: readonly boolean[] = step16([2, 5, 7, 10, 13, 15]);

/**
 * The boss riff: semitone offsets from the root, `null` for a rest. A minor pentatonic
 * climb that resolves down — deliberately repetitive, because it plays under a fight the
 * player needs to concentrate through, not over a cutscene.
 */
export const BOSS_RIFF: ReadonlyArray<number | null> = [
  0, null, 0, 3, null, 0, 7, null,
  0, null, 10, 7, null, 5, 3, null,
];

function step16(on: readonly number[]): boolean[] {
  const out = new Array<boolean>(STEPS_PER_BAR).fill(false);
  for (const i of on) out[i] = true;
  return out;
}

/** Equal temperament, A4 = 440Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Deterministic white noise, so the noise buffer is identical every session. Nothing here
 * may reach for Math.random: this module is under the same no-nondeterminism rule as the
 * simulation (see eslint.config.js), and a fixed buffer is also just easier to reason about.
 */
export function fillNoise(out: Float32Array, seed = 0x9e3779b9): void {
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s / 0x100000000) * 2 - 1;
  }
}
