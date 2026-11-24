import type { DataMsg } from './lab-kit';
/** 示範模式：產生合成的單擺陀螺儀數據（含阻尼與雜訊），格式與手機送來的相同。 */

export const DEMO_G = 9.79; // 高雄附近的重力加速度約 9.788 m/s²

export interface DemoOptions { length: number; amplitudeDeg?: number; rate?: number; damping?: number; noise?: number }

export function startDemo(onBatch: (flat: number[]) => void, opts: DemoOptions): () => void {
  const rate = opts.rate ?? 100;
  const amp = ((opts.amplitudeDeg ?? 12) * Math.PI) / 180;
  const damping = opts.damping ?? 0.035;
  const noise = opts.noise ?? 2.5; // deg/s
  const w = Math.sqrt(DEMO_G / opts.length);
  const t0 = performance.now();
  let next = 0; // 下一筆樣本的時間（s，相對 t0）
  const gauss = () => {
    const u = Math.random() || 1e-9, v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const id = window.setInterval(() => {
    const now = (performance.now() - t0) / 1000;
    const out: number[] = [];
    while (next <= now) {
      const t = next;
      const e = Math.exp(-damping * t);
      // θ = A e^{-γt} cos(ωt) → dθ/dt
      const dtheta = -amp * e * (w * Math.sin(w * t) + damping * Math.cos(w * t));
      const main = (dtheta * 180) / Math.PI;
      out.push(t0 + t * 1000, noise * 0.4 * gauss(), main + noise * gauss(), 0.15 * main + noise * 0.4 * gauss());
      next += (1 / rate) * (1 + 0.15 * (Math.random() - 0.5));
    }
    if (out.length) onBatch(out);
  }, 50);
  return () => window.clearInterval(id);
}

// ---------------- 里程碑 2 的示範資料 ----------------

const gauss = () => {
  const u = Math.random() || 1e-9, v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** 以約 rate Hz 產生不等間隔樣本，每 50 ms 送出一批。 */
function sampler(rate: number, row: (t: number) => number[], emit: (flat: number[]) => void): () => void {
  const t0 = performance.now();
  let next = 0;
  const id = window.setInterval(() => {
    const now = (performance.now() - t0) / 1000;
    const out: number[] = [];
    while (next <= now) {
      out.push(t0 + next * 1000, ...row(next));
      next += (1 / rate) * (1 + 0.15 * (Math.random() - 0.5));
    }
    if (out.length) emit(out);
  }, 50);
  return () => window.clearInterval(id);
}

export const DEMO_SPRING = { k: 20, mEff: 0.015 };
/** 彈簧振子：手機掛在 k = 20 N/m 的彈簧下（彈簧等效質量 15 g），沿 z 軸振動。 */
export function startSpringDemo(emit: (m: DataMsg) => void, mass: () => number): () => void {
  const m = mass() > 0 ? mass() : 0.25;
  const w = Math.sqrt(DEMO_SPRING.k / (m + DEMO_SPRING.mEff));
  const A = 0.025, gamma = 0.06;
  return sampler(100, (t) => {
    const a = -A * w * w * Math.exp(-gamma * t) * Math.cos(w * t);
    return [0.05 * gauss() + 0.03 * a, 0.05 * gauss(), DEMO_G + a + 0.06 * gauss()];
  }, (data) => emit({ type: 'samples', seq: 0, data, kind: 'accel' }));
}

/** 轉盤：先加速到約 7 rad/s，再因摩擦慢慢減速，每 24 秒重複一次；手機距轉軸 r。 */
export function startCentripetalDemo(emit: (m: DataMsg) => void, radius: () => number): () => void {
  const r = radius() > 0 ? radius() : 0.12;
  const omega = (t: number) => {
    const s = t % 24;
    return s < 3 ? (7 * s) / 3 : 7 * Math.exp(-(s - 3) / 9);
  };
  return sampler(100, (t) => {
    const w = omega(t), dw = (omega(t + 0.01) - omega(t - 0.01)) / 0.02;
    const ac = w * w * r, at = dw * r;
    const deg = (w * 180) / Math.PI;
    return [-ac + 0.12 * gauss() + 0.05, at + 0.12 * gauss() - 0.08, DEMO_G + 0.08 * gauss(), 0.6 * gauss(), 0.6 * gauss(), deg + 0.6 * gauss()];
  }, (data) => emit({ type: 'samples', seq: 0, data, kind: 'motion' }));
}

export const DEMO_SOUND_F0 = 220;
/** 聲音頻譜：模擬撥弦（基頻 220 Hz，第 2 泛音最強）的功率頻譜，每 0.1 s 一幀。 */
export function startSoundDemo(emit: (m: DataMsg) => void): () => void {
  const binHz = 48000 / 8192;
  const n = Math.ceil(5000 / binHz) + 1;
  const amps = [0.55, 1, 0.5, 0.35, 0.22, 0.12, 0.08, 0.05];
  const t0 = performance.now();
  let seq = 0;
  const id = window.setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const f0 = DEMO_SOUND_F0 * (1 + 0.002 * Math.sin(2 * Math.PI * 0.4 * t));
    const env = 0.35 + 0.65 * Math.exp(-(t % 4) / 1.6); // 每 4 秒撥一次
    const db = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const f = i * binHz;
      let s = 0;
      amps.forEach((a, k) => (s += a * env * Math.exp(-(((f - (k + 1) * f0) / (1.25 * binHz)) ** 2))));
      db[i] = Math.round(Math.max(-140, 20 * Math.log10(s * 0.03 + 10 ** ((-98 + 4 * gauss() - 0.004 * f) / 20))));
    }
    emit({ type: 'spectrum', seq: seq++, t: performance.now(), binHz, db, level: Math.round((-30 + 20 * Math.log10(env)) * 10) / 10 });
  }, 100);
  return () => window.clearInterval(id);
}
