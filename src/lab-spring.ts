import type { Chart } from 'chart.js';
import { displacementFromAccel, dominantAxis, linearFit, periodByAutocorrelation, stats } from './analysis';
import { EXPERIMENTS } from './catalog';
import { startSpringDemo } from './demo';
import { confirmClear, controlsHtml, createLabKit, demoPanel, downloadCsv, downloadXlsx, exportButtons, fmt, labHead, makeChart, pairPanel, purposePanel, rnd, scaleOpts, themeCharts, thin, type Cell, type DataMsg } from './lab-kit';
import { cssVar, footer, header, toast } from './layout';

const AXES = ['ax', 'ay', 'az'];
const LIVE_WINDOW = 15;
const ANALYSIS_WINDOW = 20;
const MIN_SEGMENT = 3;
const MAX_TRIALS = 30;
const PERIOD_OPTS = { minPeriod: 0.15, maxPeriod: 5 };

interface SpringTrial {
  index: number; mass: number; period: number; k: number; axis: string; aAmp: number; amp: number;
  duration: number; strength: number; source: 'demo' | 'phone'; startedAt: Date; rows: number[][];
}

export function renderSpringLab(root: HTMLElement, opts: { demo: boolean }): () => void {
  const exp = EXPERIMENTS.find((e) => e.id === 'spring')!;
  root.innerHTML = `<div class="page"><div class="holes"></div>
${header()}
<main>
  ${labHead('spring', 'T = 2π√(m/k)　⇒　k = 4π²m / T²')}
  ${purposePanel(
    '量測彈簧振子的週期 T，驗證 T² 與懸掛質量 m 成正比，並由 T²–m 圖的斜率求出彈簧的彈力常數 k。',
    [
      '把手機放進夾鏈袋或手機套，用細繩或掛勾牢牢掛在彈簧下端（彈簧上端固定在鐵架上）。',
      '用電子秤量出「手機＋袋子＋掛勾」的總質量 m，填入左側欄位（單位 kg）。',
      '手機掃描 QR Code 並啟用感測器。等手機靜止後，把它往下拉約 2–3 cm 再放手，讓它只沿鉛直方向振動。',
      '按「開始」，記錄 5–10 秒（至少 5 個週期）後按「結束並記錄」。電腦會自動找出振動最明顯的軸並算出週期。',
      '在袋中加入砝碼（例如每次 +50 g），更新 m 後重複量測，至少 4 種質量。',
      '右下方 T²–m 圖會自動做直線擬合：斜率 = 4π²/k，截距可估計彈簧本身的等效質量（理論上約為彈簧質量的 1/3）。',
    ],
    '手機、彈簧（建議 k 約 10–50 N/m）、鐵架、夾鏈袋、砝碼、電子秤',
  )}
  <div class="lab">
    <div class="stack side">
      ${pairPanel()}
      ${demoPanel('沒有手機也能試用：模擬 k = 20 N/m、彈簧等效質量 15 g 的彈簧振子（含阻尼與雜訊）。改變下方質量 m 再量一輪，就能畫出 T²–m 圖。')}
      <div class="panel">
        <h3>實驗參數 <span class="k">STEP 2</span></h3>
        <div class="field"><label for="mass">懸掛質量 m</label><input id="mass" type="number" inputmode="decimal" min="0.01" max="5" step="0.001" value="0.250"><span>kg</span></div>
        <p class="hint">手機＋袋子＋掛勾＋砝碼的總質量。手機約 0.15–0.23 kg，請以電子秤實測。</p>
      </div>
    </div>
    <div class="stack">
      <div class="panel">
        <h3>即時加速度 <span class="k">STEP 3 · LIVE</span></h3>
        ${controlsHtml()}
        <div class="chart-box"><canvas id="live-chart" aria-label="加速度對時間的即時圖表"></canvas><span class="stamp demo-stamp" hidden>示範數據</span></div>
        <div class="readouts">
          <div class="ro"><small>週期 T</small><b id="ro-T">—</b><i>s</i></div>
          <div class="ro"><small>頻率 f</small><b id="ro-f">—</b><i>Hz</i></div>
          <div class="ro"><small>彈力常數 k</small><b class="g" id="ro-k">—</b><i>N/m</i></div>
          <div class="ro"><small>位移振幅 A／分析軸</small><b id="ro-A" style="font-size:20px">—</b></div>
        </div>
      </div>
      <div class="lab-grid2">
        <div class="panel">
          <h3>T²–m 圖 <span class="k">LINEAR FIT</span></h3>
          <div class="chart-box small2"><canvas id="fit-chart" aria-label="週期平方對質量的散布圖與擬合直線"></canvas><span class="stamp demo-stamp" hidden>示範</span></div>
          <div class="fit-box" id="fit-box">至少要有兩種不同質量的紀錄，才能做直線擬合。</div>
        </div>
        <div class="panel">
          <h3>多輪紀錄 <span class="k">TRIALS</span></h3>
          <div id="trials"></div>
          ${exportButtons()}
        </div>
      </div>
    </div>
  </div>
</main>
${footer()}
</div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const massInput = $<HTMLInputElement>('mass');
  const readM = () => { const v = Number(massInput.value); return Number.isFinite(v) && v >= 0.01 && v <= 5 ? v : null; };

  const live = { t: [] as number[], c: [[], [], []] as number[][] };
  let clock0: number | null = null;
  let run: { start: number; seg: number; rows: number[][]; startedAt: Date; src: 'demo' | 'phone'; segStart: number[]; mass: number } | null = null;
  const trials: SpringTrial[] = [];
  let dirty = true;

  // ---------- 圖表 ----------
  const colors = () => [cssVar('--muted'), cssVar('--ink'), cssVar('--red')];
  const liveChart = makeChart($<HTMLCanvasElement>('live-chart'), {
    type: 'line',
    data: { datasets: AXES.map((l, i) => ({ label: `${l}（m/s²）`, data: [] as { x: number; y: number }[], borderColor: colors()[i], borderWidth: i === 2 ? 2 : 1.4, pointRadius: 0, tension: 0 })) },
    options: { scales: { x: scaleOpts('t (s)'), y: scaleOpts('a (m/s²)') } },
  });
  const fitChart = makeChart($<HTMLCanvasElement>('fit-chart'), {
    type: 'scatter',
    data: { datasets: [
      { label: '量測', data: [] as { x: number; y: number }[], borderColor: cssVar('--ink'), backgroundColor: cssVar('--ink'), pointRadius: 5 },
      { label: '擬合直線', type: 'line', data: [] as { x: number; y: number }[], borderColor: cssVar('--red'), borderWidth: 1.8, pointRadius: 0, borderDash: [6, 4] },
    ] },
    options: { scales: { x: scaleOpts('m (kg)'), y: scaleOpts('T² (s²)', { beginAtZero: true }) } },
  });
  const untheme = themeCharts([liveChart, fitChart], () => {
    liveChart.data.datasets.forEach((d, i) => (d.borderColor = colors()[i]));
    const d0 = fitChart.data.datasets[0];
    d0.borderColor = d0.backgroundColor = cssVar('--ink');
    fitChart.data.datasets[1].borderColor = cssVar('--red');
  });

  // ---------- 資料流入 ----------
  function resetLive() { live.t.length = 0; live.c.forEach((a) => (a.length = 0)); clock0 = null; dirty = true; }
  function onData(m: DataMsg) {
    if (m.type !== 'samples') return;
    const flat = m.data;
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const tms = flat[i];
      if (clock0 === null) clock0 = tms;
      const ts = (tms - clock0) / 1000;
      if (live.t.length && ts <= live.t[live.t.length - 1]) continue;
      live.t.push(ts);
      for (let a = 0; a < 3; a++) live.c[a].push(flat[i + 1 + a]);
      if (run && kit.runState === 'running') run.rows.push([(tms - run.start) / 1000, run.seg, flat[i + 1], flat[i + 2], flat[i + 3]]);
    }
    const cut = live.t[live.t.length - 1] - LIVE_WINDOW;
    let k = 0;
    while (k < live.t.length && live.t[k] < cut) k++;
    if (k > 0) { live.t.splice(0, k); live.c.forEach((a) => a.splice(0, k)); }
    dirty = true;
  }

  // ---------- 分析 ----------
  function analyseRows(rows: number[][]): { period: number; axis: number; strength: number; aAmp: number } | null {
    if (rows.length < 50) return null;
    const axis = dominantAxis([2, 3, 4].map((c) => rows.map((r) => r[c])));
    const segs = new Map<number, number[][]>();
    for (const r of rows) (segs.get(r[1]) ?? segs.set(r[1], []).get(r[1])!).push(r);
    let wSum = 0, pSum = 0, sSum = 0, aSum = 0;
    for (const seg of segs.values()) {
      const dur = seg[seg.length - 1][0] - seg[0][0];
      if (dur < MIN_SEGMENT) continue;
      const y = seg.map((r) => r[2 + axis]);
      const p = periodByAutocorrelation(seg.map((r) => r[0]), y, PERIOD_OPTS);
      if (!p) continue;
      const mean = y.reduce((a, b) => a + b, 0) / y.length;
      const sd = Math.sqrt(y.reduce((a, v) => a + (v - mean) ** 2, 0) / y.length);
      wSum += dur; pSum += p.period * dur; sSum += p.strength * dur; aSum += Math.SQRT2 * sd * dur;
    }
    return wSum ? { period: pSum / wSum, axis, strength: sSum / wSum, aAmp: aSum / wSum } : null;
  }
  function setReadouts(v: { period: number; axis: number; aAmp: number; m: number | null } | null) {
    $('ro-T').textContent = v ? v.period.toFixed(3) : '—';
    $('ro-f').textContent = v ? (1 / v.period).toFixed(3) : '—';
    $('ro-k').textContent = v && v.m ? ((4 * Math.PI ** 2 * v.m) / v.period ** 2).toFixed(2) : '—';
    $('ro-A').textContent = v ? `${(displacementFromAccel(v.aAmp, v.period) * 100).toFixed(1)} cm · ${AXES[v.axis]}` : '—';
  }
  function liveAnalysis() {
    if (!run || kit.runState !== 'running') return;
    const seg = run.rows.slice(run.segStart[run.segStart.length - 1]);
    if (seg.length < 30) return;
    const tEnd = seg[seg.length - 1][0];
    const win = seg.filter((r) => r[0] >= tEnd - ANALYSIS_WINDOW);
    const res = analyseRows(win.map((r) => [r[0], 1, r[2], r[3], r[4]]));
    if (res) setReadouts({ ...res, m: readM() });
  }

  // ---------- 紀錄與擬合 ----------
  function fitResult() {
    const masses = new Set(trials.map((t) => t.mass.toFixed(4)));
    if (masses.size < 2) return null;
    const f = linearFit(trials.map((t) => t.mass), trials.map((t) => t.period ** 2));
    if (!f || f.slope <= 0) return null;
    const k = (4 * Math.PI ** 2) / f.slope;
    const kErr = f.seSlope !== null ? (k * f.seSlope) / f.slope : null;
    return { ...f, k, kErr, mEff: f.intercept / f.slope };
  }
  function renderFit() {
    const pts = trials.map((t) => ({ x: t.mass, y: t.period ** 2 }));
    fitChart.data.datasets[0].data = pts;
    const f = fitResult();
    if (f) {
      const xs = pts.map((p) => p.x);
      const x0 = Math.min(0, ...xs), x1 = Math.max(...xs) * 1.08;
      fitChart.data.datasets[1].data = [{ x: x0, y: f.slope * x0 + f.intercept }, { x: x1, y: f.slope * x1 + f.intercept }];
      $('fit-box').innerHTML = `<div class="fit-eq">T² = <b>${f.slope.toFixed(3)}</b> m ${f.intercept >= 0 ? '+' : '−'} ${Math.abs(f.intercept).toFixed(4)}　（R² = ${f.r2.toFixed(4)}）</div>
        <div class="fit-res">由斜率：<b class="red">k = ${f.k.toFixed(2)}${f.kErr !== null ? ` ± ${f.kErr.toFixed(2)}` : ''} N/m</b>　｜　彈簧等效質量 ≈ ${(f.mEff * 1000).toFixed(0)} g</div>
        <div class="hint">各輪 k = 4π²m/T² 的平均為 ${fmt(stats(trials.map((t) => t.k)).mean, 2)} N/m；若截距明顯大於 0，代表彈簧本身的質量不可忽略。</div>`;
    } else {
      fitChart.data.datasets[1].data = [];
      $('fit-box').textContent = '至少要有兩種不同質量的紀錄，才能做直線擬合。';
    }
    fitChart.update('none');
  }
  function renderTrials() {
    const box = $('trials');
    if (!trials.length) { box.innerHTML = '<div class="trials-empty">尚無紀錄。每按一次「結束並記錄」會新增一輪。</div>'; renderFit(); return; }
    const sK = stats(trials.map((t) => t.k));
    box.innerHTML = `<table class="trials"><thead><tr><th>輪次</th><th>m (kg)</th><th>T (s)</th><th>T² (s²)</th><th>k (N/m)</th><th></th></tr></thead><tbody>${trials
      .map((t, i) => `<tr><td>${t.index}${t.source === 'demo' ? ' <span class="src">示範</span>' : ''}</td><td>${t.mass.toFixed(3)}</td><td>${t.period.toFixed(4)}</td><td>${(t.period ** 2).toFixed(4)}</td><td>${t.k.toFixed(2)}</td><td><button class="del" data-del="${i}" title="刪除此輪" aria-label="刪除第 ${t.index} 輪">×</button></td></tr>`)
      .join('')}</tbody><tfoot><tr><td>平均</td><td></td><td></td><td></td><td>${fmt(sK.mean, 2)}</td><td></td></tr><tr><td>標準差</td><td></td><td></td><td></td><td>${fmt(sK.sd, 2)}</td><td></td></tr></tfoot></table>`;
    renderFit();
  }
  $('trials').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-del]');
    if (!b) return;
    trials.splice(Number(b.dataset.del), 1);
    trials.forEach((t, i) => (t.index = i + 1));
    renderTrials();
    kit.updateButtons();
  });
  $('clear').addEventListener('click', () => {
    if (!confirmClear()) return;
    trials.length = 0;
    renderTrials();
    kit.updateButtons();
  });

  // ---------- 匯出 ----------
  const anyDemo = () => trials.some((t) => t.source === 'demo');
  const summaryRows = (): Cell[][] => [
    ['輪次', '質量 m (kg)', '週期 T (s)', 'T² (s²)', '頻率 f (Hz)', 'k = 4π²m/T² (N/m)', '分析軸', '加速度振幅 (m/s²)', '位移振幅 A (cm)', '量測時長 (s)', '自相關峰值', '來源'],
    ...trials.map((t) => [t.index, rnd(t.mass, 4), rnd(t.period, 5), rnd(t.period ** 2, 5), rnd(1 / t.period, 4), rnd(t.k, 3), t.axis, rnd(t.aAmp, 3), rnd(t.amp * 100, 2), rnd(t.duration, 2), rnd(t.strength, 3), t.source === 'demo' ? '示範' : '手機']),
  ];
  const fitRows = (): Cell[][] => {
    const f = fitResult();
    return f ? [['T²–m 擬合', ''], ['斜率 (s²/kg)', rnd(f.slope, 5)], ['截距 (s²)', rnd(f.intercept, 5)], ['R²', rnd(f.r2, 5)], ['k = 4π²/斜率 (N/m)', rnd(f.k, 3)], ['k 標準誤 (N/m)', rnd(f.kErr, 3)], ['彈簧等效質量 (kg)', rnd(f.mEff, 4)]] : [['T²–m 擬合', '紀錄的質量少於兩種，未擬合']];
  };
  const rawRows = (): Cell[][] => [['輪次', '質量 m (kg)', 't (s)', '分段', 'ax (m/s²)', 'ay (m/s²)', 'az (m/s²)'], ...trials.flatMap((t) => t.rows.map((r) => [t.index, rnd(t.mass, 4), rnd(r[0], 4), r[1], rnd(r[2], 4), rnd(r[3], 4), rnd(r[4], 4)]))];
  $('csv-sum').addEventListener('click', () => toast(`已下載 ${downloadCsv('彈簧振動_摘要', [...summaryRows(), [], ...fitRows()], anyDemo())}`));
  $('csv-raw').addEventListener('click', () => toast(`已下載 ${downloadCsv('彈簧振動_原始數據', rawRows(), anyDemo())}`));
  $('xlsx').addEventListener('click', () => {
    const info: Cell[][] = [['手機物理實驗室｜彈簧振動與彈簧常數'], [], ['資料來源', anyDemo() ? '含示範（合成資料，非實際量測）' : '手機加速度計（DeviceMotion accelerationIncludingGravity）'], ['匯出時間', new Date().toLocaleString('zh-TW', { hour12: false })], ['週期分析', '取變化最大的加速度軸，重新取樣 100 Hz 後以自相關求週期'], ['公式', 'T = 2π√(m/k)；T² = (4π²/k)·m + 截距'], [], ...fitRows()];
    toast(`已下載 ${downloadXlsx('彈簧振動', [{ name: '說明與擬合', rows: info, cols: [22, 70] }, { name: '多輪摘要', rows: summaryRows(), cols: Array(12).fill(14) }, { name: '原始數據', rows: rawRows(), cols: [6, 12, 10, 6, 12, 12, 12] }], anyDemo())}`);
  });

  // ---------- 流程 ----------
  const kit = createLabKit({
    root, expId: 'spring', expName: exp.name, kind: 'accel', sensorName: '加速度計',
    streamingHint: '把手機掛在彈簧下端，拉下約 2–3 cm 放手，再按「開始」。',
    maxTrials: MAX_TRIALS, trialCount: () => trials.length,
    startDemo: (emit) => startSpringDemo(emit, () => readM() ?? 0.25),
    onData,
    onSourceChange: resetLive,
    onStart: () => {
      const m = readM();
      if (m === null) { massInput.focus(); toast('請先輸入 0.01–5 kg 之間的質量 m'); return false; }
      const startClock = clock0 !== null && live.t.length ? clock0 + live.t[live.t.length - 1] * 1000 : performance.now();
      run = { start: startClock, seg: 1, rows: [], startedAt: new Date(), src: kit.source === 'demo' ? 'demo' : 'phone', segStart: [0], mass: m };
      setReadouts(null);
      return true;
    },
    onResume: () => { if (run) { run.seg += 1; run.segStart.push(run.rows.length); } },
    onStop: () => {
      if (!run) return;
      const r = run;
      run = null;
      const res = analyseRows(r.rows);
      if (!res) { toast('有效數據不足（每段至少 3 秒、約兩個週期），本輪未記錄'); return; }
      const duration = r.rows.length ? r.rows[r.rows.length - 1][0] - r.rows[0][0] : 0;
      const k = (4 * Math.PI ** 2 * r.mass) / res.period ** 2;
      trials.push({ index: trials.length + 1, mass: r.mass, period: res.period, k, axis: AXES[res.axis], aAmp: res.aAmp, amp: displacementFromAccel(res.aAmp, res.period), duration, strength: res.strength, source: r.src, startedAt: r.startedAt, rows: r.rows });
      renderTrials();
      setReadouts({ ...res, m: r.mass });
      toast(`第 ${trials.length} 輪已記錄：T = ${res.period.toFixed(3)} s，k = ${k.toFixed(2)} N/m`);
    },
    autoDemo: opts.demo,
  });
  massInput.addEventListener('change', () => kit.restartDemo());

  // ---------- 繪圖迴圈 ----------
  let raf = 0, lastDraw = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!dirty || now - lastDraw < 66) return;
    lastDraw = now; dirty = false;
    const n = live.t.length;
    const idx = thin(Array.from({ length: n }, (_, i) => i));
    liveChart.data.datasets.forEach((d, a) => (d.data = idx.map((i) => ({ x: live.t[i], y: live.c[a][i] }))));
    const xs = liveChart.options.scales!.x!;
    xs.max = Math.max(LIVE_WINDOW, Math.ceil(n ? live.t[n - 1] : 0));
    xs.min = xs.max - LIVE_WINDOW;
    liveChart.update('none');
  };
  raf = requestAnimationFrame(loop);
  const timer = window.setInterval(liveAnalysis, 500);
  renderTrials();

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    kit.destroy();
    untheme();
    (liveChart as Chart).destroy();
    fitChart.destroy();
  };
}
