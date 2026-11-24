import { describe, expect, it } from 'vitest';
import { dominantAxis, gFromPendulum, harmonicAnalysis, linearFit, movingAverage, noteName, periodByAutocorrelation, principalDirection, soundSpeedClosedTube, spectrumPeaks, stats } from './analysis';

function synth(T: number, dur: number, rate: number, jitter = 0, noise = 0, damp = 0.05) {
  const t: number[] = [], y: number[] = [];
  let ti = 0;
  while (ti < dur) {
    t.push(ti);
    y.push(Math.exp(-damp * ti) * Math.sin((2 * Math.PI * ti) / T) + noise * (Math.random() - 0.5));
    ti += (1 / rate) * (1 + jitter * (Math.random() - 0.5));
  }
  return { t, y };
}

describe('periodByAutocorrelation', () => {
  it('finds the period of a clean damped sine', () => {
    const { t, y } = synth(1.42, 12, 60);
    const r = periodByAutocorrelation(t, y)!;
    expect(r.period).toBeCloseTo(1.42, 2);
  });
  it('handles jittered sampling and noise', () => {
    const { t, y } = synth(2.006, 15, 50, 0.4, 0.3);
    const r = periodByAutocorrelation(t, y)!;
    expect(Math.abs(r.period - 2.006)).toBeLessThan(0.01);
  });
  it('returns null for too-short or noisy input', () => {
    expect(periodByAutocorrelation([0, 0.1], [1, 2])).toBeNull();
    const t = Array.from({ length: 600 }, (_, i) => i / 100);
    const y = t.map(() => Math.random() - 0.5);
    expect(periodByAutocorrelation(t, y)).toBeNull();
  });
});

describe('helpers', () => {
  it('g from L and T', () => {
    expect(gFromPendulum(0.5, 2 * Math.PI * Math.sqrt(0.5 / 9.8))).toBeCloseTo(9.8, 6);
  });
  it('stats', () => {
    const s = stats([9.7, 9.8, 9.9]);
    expect(s.mean).toBeCloseTo(9.8);
    expect(s.sd).toBeCloseTo(0.1);
    expect(stats([1]).sd).toBeNull();
  });
  it('dominant axis', () => {
    expect(dominantAxis([[0, 0.1, 0], [1, -1, 1], [0, 0, 0.2]])).toBe(1);
  });
});


describe('milestone 2 helpers', () => {
  it('linear fit recovers slope and intercept', () => {
    const x = [0.1, 0.2, 0.3, 0.4, 0.5], y = x.map((v) => 1.97 * v + 0.03);
    const f = linearFit(x, y)!;
    expect(f.slope).toBeCloseTo(1.97, 6);
    expect(f.intercept).toBeCloseTo(0.03, 6);
    expect(f.r2).toBeCloseTo(1, 6);
  });
  it('moving average', () => {
    expect(movingAverage([0, 3, 0, 3, 0], 3)).toEqual([1.5, 1, 2, 1, 1.5]);
  });
  it('finds fundamental from a harmonic spectrum where the 2nd harmonic is strongest', () => {
    const binHz = 48000 / 8192, n = Math.ceil(5000 / binHz);
    const f0 = 220.7, amps = [0.5, 1, 0.6, 0.4, 0.2];
    const db = Array.from({ length: n }, (_, i) => {
      const f = i * binHz;
      let s = 1e-5;
      amps.forEach((a, k) => (s += a * Math.exp(-(((f - (k + 1) * f0) / (1.3 * binHz)) ** 2))));
      return Math.round(20 * Math.log10(s));
    });
    const peaks = spectrumPeaks(binHz, db);
    const h = harmonicAnalysis(peaks, { binHz })!;
    expect(Math.abs(h.f0 - f0)).toBeLessThan(1);
    expect(h.harmonics.length).toBe(5);
  });
  it('note name and tube', () => {
    expect(noteName(440)).toEqual({ name: 'A4', cents: 0 });
    expect(noteName(261.63)!.name).toBe('C4');
    expect(soundSpeedClosedTube(500, 0.165, 0.03)).toBeCloseTo(348, 6);
  });
  it('principal direction', () => {
    const x = [0, 1, 2, 3], y = [0, 1, 2, 3];
    const [a, b] = principalDirection(x, y);
    expect(Math.abs(a)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(Math.abs(b)).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
