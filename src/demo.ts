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
