import { describe, expect, it } from 'vitest';
import { dominantAxis, gFromPendulum, periodByAutocorrelation, stats } from './analysis';

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
