/** 數據分析：重新取樣、自相關求週期、統計。全部為純函式，方便測試。 */

export interface PeriodResult {
  period: number;      // s
  strength: number;    // 自相關峰值（0–1），越接近 1 越規律
  fs: number;          // 重新取樣頻率 Hz
  lags: number[];      // s
  ac: number[];        // 正規化自相關
}

/** 將不等間隔的 (t, y) 以線性內插重新取樣為等間隔序列。 */
export function resample(t: ArrayLike<number>, y: ArrayLike<number>, fs: number): number[] {
  const n = t.length;
  if (n < 2) return [];
  const t0 = t[0];
  const t1 = t[n - 1];
  const m = Math.floor((t1 - t0) * fs) + 1;
  const out = new Array<number>(m);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const ti = t0 + i / fs;
    while (j < n - 2 && t[j + 1] < ti) j++;
    const ta = t[j], tb = t[j + 1];
    const w = tb > ta ? (ti - ta) / (tb - ta) : 0;
    out[i] = y[j] + (y[j + 1] - y[j]) * Math.min(1, Math.max(0, w));
  }
  return out;
}

/** 正規化自相關 r[k]，k = 0 … maxLag（以 1/(N−k) 修正樣本數偏差）。 */
export function autocorrelation(x: number[], maxLag: number): number[] {
  const n = x.length;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const d = x.map((v) => v - mean);
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += d[i] * d[i];
  r0 /= n;
  const r: number[] = [];
  if (r0 === 0) return r;
  const L = Math.min(maxLag, n - 1);
  for (let k = 0; k <= L; k++) {
    let s = 0;
    for (let i = 0; i + k < n; i++) s += d[i] * d[i + k];
    r.push(s / (n - k) / r0);
  }
  return r;
}

/**
 * 以自相關找出週期：先找到 r 第一次變負的位置，之後的第一個最大值即為一個週期，
 * 再用拋物線內插細化。要求資料至少涵蓋約兩個週期。
 */
export function periodByAutocorrelation(
  t: ArrayLike<number>,
  y: ArrayLike<number>,
  opts: { fs?: number; minPeriod?: number; maxPeriod?: number; minStrength?: number } = {},
): PeriodResult | null {
  const fs = opts.fs ?? 100;
  const minPeriod = opts.minPeriod ?? 0.2;
  const maxPeriod = opts.maxPeriod ?? 10;
  const minStrength = opts.minStrength ?? 0.3;
  const x = resample(t, y, fs);
  if (x.length < fs * 1.5) return null;
  const maxLag = Math.min(Math.floor(x.length / 2), Math.floor(maxPeriod * fs));
  const ac = autocorrelation(x, maxLag);
  if (ac.length < 3) return null;
  const minLag = Math.max(1, Math.floor(minPeriod * fs / 2));
  let k = minLag;
  while (k < ac.length && ac[k] > 0) k++;
  if (k >= ac.length) return null;
  let best = -1;
  let bestVal = -Infinity;
  for (let i = k; i < ac.length - 1; i++) {
    if (ac[i] > bestVal) { bestVal = ac[i]; best = i; }
    if (bestVal > 0 && ac[i] < 0) break; // 已越過第一個正峰
  }
  if (best <= 0 || best >= ac.length - 1 || bestVal < minStrength) return null;
  const a = ac[best - 1], b = ac[best], c = ac[best + 1];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
  const period = (best + shift) / fs;
  if (period < minPeriod || period > maxPeriod) return null;
  return { period, strength: bestVal, fs, lags: ac.map((_, i) => i / fs), ac };
}

/** 選出變異最大的軸（單擺擺動所繞的軸）。 */
export function dominantAxis(cols: ArrayLike<number>[]): number {
  let best = 0, bestVar = -1;
  cols.forEach((c, idx) => {
    const n = c.length;
    if (!n) return;
    let m = 0;
    for (let i = 0; i < n; i++) m += c[i];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (c[i] - m) ** 2;
    if (v > bestVar) { bestVar = v; best = idx; }
  });
  return best;
}

export const gFromPendulum = (L: number, T: number) => (4 * Math.PI ** 2 * L) / (T * T);

export interface Stats { n: number; mean: number; sd: number | null; sem: number | null }

export function stats(values: number[]): Stats {
  const n = values.length;
  if (!n) return { n, mean: NaN, sd: null, sem: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, sd: null, sem: null };
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  return { n, mean, sd, sem: sd / Math.sqrt(n) };
}
