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
  const p1 = best + shift;
  // 若有更長的資料，再找第 2、3… 個峰（約在 kP 處），以通過原點的最小平方擬合 lag_k = k·T 提高精度
  const longAc = autocorrelation(x, Math.min(Math.floor(x.length * 0.75), Math.floor(maxPeriod * fs * 4)));
  let num = p1, den2 = 1;
  for (let kk = 2; (kk + 0.3) * p1 < longAc.length - 1; kk++) {
    const lo = Math.max(1, Math.floor((kk - 0.3) * p1)), hi = Math.min(longAc.length - 2, Math.ceil((kk + 0.3) * p1));
    let bi = lo;
    for (let i = lo; i <= hi; i++) if (longAc[i] > longAc[bi]) bi = i;
    if (longAc[bi] < minStrength * 0.5 || bi === lo || bi === hi) break;
    const qa = longAc[bi - 1], qb = longAc[bi], qc = longAc[bi + 1];
    const qd = qa - 2 * qb + qc;
    const lag = bi + (qd !== 0 ? 0.5 * (qa - qc) / qd : 0);
    num += kk * lag;
    den2 += kk * kk;
  }
  const period = num / den2 / fs;
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

// ---------------- 里程碑 2：擬合、頻譜 ----------------

export interface LinearFit { slope: number; intercept: number; r2: number; n: number; seSlope: number | null; seIntercept: number | null }

/** 最小平方法直線擬合 y = slope·x + intercept。 */
export function linearFit(x: ArrayLike<number>, y: ArrayLike<number>): LinearFit | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - (slope * x[i] + intercept)) ** 2;
  const r2 = syy > 0 ? 1 - sse / syy : 1;
  let seSlope: number | null = null, seIntercept: number | null = null;
  if (n > 2) {
    const s2 = sse / (n - 2);
    seSlope = Math.sqrt(s2 / sxx);
    let sumX2 = 0;
    for (let i = 0; i < n; i++) sumX2 += x[i] * x[i];
    seIntercept = Math.sqrt((s2 * sumX2) / (n * sxx));
  }
  return { slope, intercept, r2, n, seSlope, seIntercept };
}

/** 等間隔序列的置中移動平均（視窗 w 點）。 */
export function movingAverage(x: number[], w: number): number[] {
  const n = x.length;
  const h = Math.max(0, Math.floor(w / 2));
  if (!h) return x.slice();
  const pre = [0];
  for (let i = 0; i < n; i++) pre.push(pre[i] + x[i]);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h), b = Math.min(n, i + h + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

/** 由加速度振幅與週期換算位移振幅：A = a_amp / ω²。 */
export const displacementFromAccel = (aAmp: number, T: number) => aAmp / (2 * Math.PI / T) ** 2;

/** 序列中位數。 */
export function median(v: number[]): number {
  if (!v.length) return NaN;
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Peak { f: number; db: number }

/**
 * 在功率頻譜（dB）中找峰：局部最大、且高出雜訊底（中位數）prominence dB 以上，
 * 以拋物線內插求出次格精度的頻率與峰值。回傳依峰值由大到小排序。
 */
export function spectrumPeaks(binHz: number, db: ArrayLike<number>, opts: { minF?: number; maxF?: number; prominence?: number; max?: number } = {}): Peak[] {
  const minF = opts.minF ?? 40, maxF = opts.maxF ?? 5000, prom = opts.prominence ?? 18, maxN = opts.max ?? 24;
  const i0 = Math.max(2, Math.ceil(minF / binHz)), i1 = Math.min(db.length - 3, Math.floor(maxF / binHz));
  if (i1 <= i0) return [];
  const seg: number[] = [];
  for (let i = i0; i <= i1; i++) seg.push(db[i]);
  const floor = median(seg);
  const peaks: Peak[] = [];
  for (let i = i0; i <= i1; i++) {
    const b = db[i];
    if (b < floor + prom) continue;
    if (!(b > db[i - 1] && b >= db[i + 1] && b >= db[i - 2] && b >= db[i + 2])) continue;
    const a = db[i - 1], c = db[i + 1];
    const den = a - 2 * b + c;
    const p = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    peaks.push({ f: (i + p) * binHz, db: b - 0.25 * (a - c) * p });
  }
  peaks.sort((x, y) => y.db - x.db);
  return peaks.slice(0, maxN);
}

export interface Harmonic { n: number; f: number; db: number }
export interface HarmonicResult { f0: number; harmonics: Harmonic[]; strongest: Peak }

/**
 * 由頻譜峰找基頻：以最強峰的 1/n 為候選基頻，計算各候選的泛音（k·f0）吻合程度，
 * 取得分最高者；基頻本身必須有峰。最後以各泛音頻率加權擬合 f0 = Σw·k·f_k / Σw·k²。
 */
export function harmonicAnalysis(peaks: Peak[], opts: { minF0?: number; maxF?: number; tol?: number; maxHarmonic?: number; binHz?: number } = {}): HarmonicResult | null {
  if (!peaks.length) return null;
  const minF0 = opts.minF0 ?? 40, maxF = opts.maxF ?? 5000, tol = opts.tol ?? 0.025, K = opts.maxHarmonic ?? 10, binHz = opts.binHz ?? 0;
  const strongest = peaks.reduce((a, b) => (b.db > a.db ? b : a));
  const amp = (d: number) => 10 ** (d / 20);
  let best: { f0: number; score: number; list: Harmonic[] } | null = null;
  for (let n = 1; n <= 8; n++) {
    const f0 = strongest.f / n;
    if (f0 < minF0) break;
    const list: Harmonic[] = [];
    let score = 0;
    for (let k = 1; k <= K && k * f0 <= maxF; k++) {
      const target = k * f0, w = Math.max(tol * target, 1.5 * binHz);
      let hit: Peak | null = null;
      for (const p of peaks) if (Math.abs(p.f - target) <= w && (!hit || p.db > hit.db)) hit = p;
      if (hit) { list.push({ n: k, f: hit.f, db: hit.db }); score += amp(hit.db); }
    }
    if (!list.length || list[0].n !== 1) continue;
    if (!best || score > best.score * 1.0001) best = { f0, score, list };
  }
  if (!best) return null;
  let num = 0, den = 0;
  for (const h of best.list) { const w = amp(h.db); num += w * h.n * h.f; den += w * h.n * h.n; }
  return { f0: num / den, harmonics: best.list, strongest };
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** 頻率 → 最接近的音名（A4 = 440 Hz）與偏差音分。 */
export function noteName(f: number): { name: string; cents: number } | null {
  if (!(f > 0)) return null;
  const m = 69 + 12 * Math.log2(f / 440);
  const r = Math.round(m);
  return { name: `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`, cents: Math.round((m - r) * 100) };
}

/** 閉管（一端封閉）第一共鳴：L + 0.3d = λ/4 ⇒ v = 4f(L + 0.3d)。 */
export const soundSpeedClosedTube = (f: number, L: number, d: number) => 4 * f * (L + 0.3 * d);

/**
 * 二維資料的主成分方向（單位向量）：用於找出轉盤上「指向圓心」的方向，
 * 讓加速度投影到半徑方向後再與 ω² 做擬合。
 */
export function principalDirection(x: ArrayLike<number>, y: ArrayLike<number>): [number, number] {
  const n = Math.min(x.length, y.length);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n || 1; my /= n || 1;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [Math.cos(th), Math.sin(th)];
}
