import { describe, it, expect } from 'vitest';
import {
  layerMix, MUSIC_LAYERS, SILENCE, midiToFreq, fillNoise,
  BOSS_RIFF, PULSE_KICK, PULSE_TICK, STEPS_PER_BAR, STEP_SECONDS, BPM,
  type MusicState,
} from '../src/audio/music';
import { AudioBus } from '../src/audio/audio';

const calm: MusicState = { pressure: 0, surge: false, boss: false };

describe('layerMix', () => {
  it('is silent when there is nothing to score', () => {
    expect(layerMix(null)).toEqual(SILENCE);
  });

  it('keeps every layer in range for any state, including junk pressure', () => {
    const pressures = [-5, 0, 0.5, 1, 7, NaN, Infinity];
    for (const pressure of pressures) {
      for (const surge of [false, true]) {
        for (const boss of [false, true]) {
          const mix = layerMix({ pressure, surge, boss });
          for (const layer of MUSIC_LAYERS) {
            expect(mix[layer], `${layer} @ ${pressure}/${surge}/${boss}`).toBeGreaterThanOrEqual(0);
            expect(mix[layer]).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('plays only the bed when the field is quiet', () => {
    const mix = layerMix(calm);
    expect(mix.bed).toBeGreaterThan(0);
    expect(mix.pulse).toBe(0);
    expect(mix.dread).toBe(0);
    expect(mix.boss).toBe(0);
  });

  it('brings the rhythm layer up monotonically with the horde', () => {
    const steps = [0, 0.15, 0.3, 0.5, 0.75, 1].map((p) => layerMix({ ...calm, pressure: p }).pulse);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    expect(steps[0]).toBe(0);
    expect(steps.at(-1)).toBe(1);
  });

  it('drives during a blood moon even if the screen happens to be empty', () => {
    const mix = layerMix({ pressure: 0, surge: true, boss: false });
    expect(mix.dread).toBe(1);
    expect(mix.pulse).toBeGreaterThan(0.5);
  });

  it('ducks the bed under the boss layer, which shares its register', () => {
    const withBoss = layerMix({ ...calm, boss: true });
    expect(withBoss.boss).toBe(1);
    expect(withBoss.bed).toBeLessThan(layerMix(calm).bed);
  });

  it('never drops the bed entirely — it is the floor the others sit on', () => {
    for (const surge of [false, true]) {
      for (const boss of [false, true]) {
        expect(layerMix({ pressure: 1, surge, boss }).bed).toBeGreaterThan(0);
      }
    }
  });
});

describe('the patterns', () => {
  it('fills exactly one bar each', () => {
    expect(PULSE_KICK).toHaveLength(STEPS_PER_BAR);
    expect(PULSE_TICK).toHaveLength(STEPS_PER_BAR);
    expect(BOSS_RIFF).toHaveLength(STEPS_PER_BAR);
  });

  it('never puts a kick and a tick on the same sixteenth', () => {
    for (let i = 0; i < STEPS_PER_BAR; i++) expect(PULSE_KICK[i] && PULSE_TICK[i]).toBe(false);
  });

  it('agrees with the tempo', () => {
    expect(STEP_SECONDS * 4 * BPM).toBeCloseTo(60);
  });
});

describe('midiToFreq', () => {
  it('lands on the reference pitches', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(57)).toBeCloseTo(220);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });
});

describe('fillNoise', () => {
  it('is deterministic and actually noisy', () => {
    const a = new Float32Array(512);
    const b = new Float32Array(512);
    fillNoise(a);
    fillNoise(b);
    expect([...a]).toEqual([...b]);
    expect(new Set(a).size).toBeGreaterThan(400);
    for (const v of a) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});

describe('AudioBus without Web Audio', () => {
  it('stays a silent no-op, which is what the headless sim depends on', () => {
    const bus = new AudioBus();
    expect(() => {
      bus.resume();
      bus.setMusic({ pressure: 1, surge: true, boss: true });
      bus.setMusic(null);
      bus.setMusicVolume(0.3);
      bus.setVolume(0.5);
      bus.setMuted(true);
      bus.shoot();
      bus.kill(1.4);
      bus.boss();
    }).not.toThrow();
  });
});
