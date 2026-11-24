import { linearFit, movingAverage, principalDirection, resample, stats } from './analysis';
import { EXPERIMENTS } from './catalog';
import { startCentripetalDemo } from './demo';
import { confirmClear, controlsHtml, createLabKit, demoPanel, downloadCsv, downloadXlsx, exportButtons, fmt, labHead, makeChart, pairPanel, purposePanel, rnd, scaleOpts, themeCharts, thin, type Cell, type DataMsg } from './lab-kit';
import { cssVar, footer, header, toast } from './layout';

const LIVE_WINDOW = 20;
const MAX_TRIALS = 20;
const MIN_OMEGA = 1.0; // rad/s 以下不納入擬合（轉太慢，雜訊比例大）
const D2R = Math.PI / 180;

interface CTrial {
  index: number; rIn: number; rFit: number; intercept: number; r2: number; omegaMax: number; n: number; tilt: number;
  duration: number; source: 'demo' | 'phone'; startedAt: Date; rows: number[][]; points: { w2: number; a: number }[];
}

/** 由一輪原始數據 [t, 分段, ax, ay, az, ωx, ωy, ωz] 得出擬合用的 (ω², a_徑向) 點。 */
function processRun(rows: number[][]): { points: { w2: number; a: number }[]; tilt: number } {
  const segs = new Map<number, number[][]>();
  for (const r of rows) (segs.get(r[1]) ?? segs.set(r[1], []).get(r[1])!).push(r);
  const ax: number[] = [], ay: number[] = [], w: number[] = [];
  let tiltSum = 0, tiltN = 0;
  for (const seg of segs.values()) {
    if (seg.length < 20) continue;
    const t = seg.map((r) => r[0]);
    const fs = 50, win = 15; // 50 Hz、0.3 s 移動平均，再抽成 10 Hz
    const rx = movingAverage(resample(t, seg.map((r) => r[2]), fs), win);
    const ry = movingAverage(resample(t, seg.map((r) => r[3]), fs), win);
    const rz = movingAverage(resample(t, seg.map((r) => r[4]), fs), win);
    const rw = movingAverage(resample(t, seg.map((r) => Math.hypot(r[5], r[6], r[7]) * D2R), fs), win);
    for (let i = 0; i < rx.length; i += 5) {
      if (rw[i] < 0.4) { const g = Math.hypot(rx[i], ry[i], rz[i]) || 1; tiltSum += Math.acos(Math.min(1, Math.abs(rz[i]) / g)); tiltN++; }
      if (rw[i] < MIN_OMEGA) continue;
      ax.push(rx[i]); ay.push(ry[i]); w.push(rw[i]);
    }
  }
  const tilt = tiltN ? tiltSum / tiltN / D2R : NaN;
  if (ax.length < 3) return { points: [], tilt };
  const [ux, uy] = principalDirection(ax, ay);
  let a = ax.map((x, i) => x * ux + ay[i] * uy);
  const w2 = w.map((v) => v * v);
  const f = linearFit(w2, a);
  if (f && f.slope < 0) a = a.map((v) => -v);
  return { points: w2.map((x, i) => ({ w2: x, a: a[i] })), tilt };
}

export function renderCentripetalLab(root: HTMLElement, opts: { demo: boolean }): () => void {
  const exp = EXPERIMENTS.find((e) => e.id === 'centripetal')!;
  root.innerHTML = `<div class="page"><div class="holes"></div>
${header()}
<main>
  ${labHead('centripetal', 'a = v² / r = ω²r　⇒　斜率 = r')}
  ${purposePanel(
    '手機同時量測角速度 ω（陀螺儀）與加速度 a（加速度計），驗證等速圓周運動的向心加速度 a = ω²r，並由 a–ω² 圖的斜率求出旋轉半徑 r。',
    [
      '把手機螢幕朝上平放在轉盤（旋轉置物盤、唱盤或旋轉椅座墊）上，用膠帶固定；手機中心不要在轉軸正上方。',
      '量出轉軸到手機中心的距離 r（加速度計大約在手機中央），填入左側欄位。',
      '手機掃描 QR Code 並啟用感測器，手機畫面上的「傾角」應小於 5°。',
      '按「開始」，用手把轉盤轉快，放手讓它因摩擦慢慢停下（一次就能掃過許多不同轉速），約 15–20 秒後按「結束並記錄」。',
      '電腦會把加速度投影到「指向圓心」的方向，畫出 a–ω² 圖並做直線擬合；斜率就是 r，與尺量的 r 比較誤差。',
      '改變手機位置（不同 r）重複，比較 a 與 r 的關係。轉速請適中，注意安全，避免手機飛出。',
    ],
    '手機、轉盤（旋轉置物盤／唱盤／旋轉椅）、膠帶、捲尺',
  )}
  <div class="lab">
    <div class="stack side">
      ${pairPanel()}
      ${demoPanel('沒有手機也能試用：模擬手機放在距轉軸 r 處的轉盤上，先加速到約 7 rad/s，再因摩擦逐漸減速（含雜訊與切向加速度）。模擬半徑等於下方輸入的 r。')}
      <div class="panel">
        <h3>實驗參數 <span class="k">STEP 2</span></h3>
        <div class="field"><label for="radius">半徑 r</label><input id="radius" type="number" inputmode="decimal" min="0.01" max="3" step="0.001" value="0.120"><span>m</span></div>
        <p class="hint">轉軸到手機中心的距離（用尺量）。擬合出的 r 會與此值比較。</p>
      </div>
    </div>
    <div class="stack">
      <div class="panel">
        <h3>即時角速度與加速度 <span class="k">STEP 3 · LIVE</span></h3>
        ${controlsHtml()}
        <div class="chart-box"><canvas id="live-chart" aria-label="角速度與水平加速度對時間的即時圖表"></canvas><span class="stamp demo-stamp" hidden>示範數據</span></div>
        <div class="readouts">
          <div class="ro"><small>角速度 ω</small><b id="ro-w">—</b><i>rad/s</i></div>
          <div class="ro"><small>週期 T = 2π/ω</small><b id="ro-T">—</b><i>s</i></div>
          <div class="ro"><small>水平加速度 a</small><b id="ro-a">—</b><i>m/s²</i></div>
          <div class="ro"><small>擬合半徑 r</small><b class="g" id="ro-r">—</b><i>m</i></div>
        </div>
        <p class="hint" id="tilt-hint">手機傾角：—</p>
      </div>
      <div class="lab-grid2">
        <div class="panel">
          <h3>a–ω² 圖 <span class="k">LINEAR FIT</span></h3>
          <div class="chart-box small2"><canvas id="fit-chart" aria-label="向心加速度對角速度平方的散布圖"></canvas><span class="stamp demo-stamp" hidden>示範</span></div>
          <div class="fit-box" id="fit-box">記錄時會即時畫出 a–ω² 散布點；結束後顯示擬合結果。</div>
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
  const rInput = $<HTMLInputElement>('radius');
  const readR = () => { const v = Number(rInput.value); return Number.isFinite(v) && v >= 0.01 && v <= 3 ? v : null; };

  const live = { t: [] as number[], w: [] as number[], a: [] as number[], tilt: [] as number[] };
  let clock0: number | null = null;
  let run: { start: number; seg: number; rows: number[][]; startedAt: Date; src: 'demo' | 'phone'; r: number } | null = null;
  const trials: CTrial[] = [];
  let shown: { w2: number; a: number }[] = [];
  let restTilt: number | null = null;
  let dirty = true;

  const liveChart = makeChart($<HTMLCanvasElement>('live-chart'), {
    type: 'line',
    data: { datasets: [
      { label: '|ω|（rad/s）', data: [] as { x: number; y: number }[], borderColor: cssVar('--ink'), borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
      { label: '水平加速度 a（m/s²）', data: [] as { x: number; y: number }[], borderColor: cssVar('--red'), borderWidth: 1.4, pointRadius: 0, yAxisID: 'y1' },
    ] },
    options: { scales: { x: scaleOpts('t (s)'), y: scaleOpts('ω (rad/s)', { position: 'left', beginAtZero: true }), y1: scaleOpts('a (m/s²)', { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }) } },
  });
  const fitChart = makeChart($<HTMLCanvasElement>('fit-chart'), {
    type: 'scatter',
    data: { datasets: [
      { label: '量測點', data: [] as { x: number; y: number }[], borderColor: cssVar('--ink'), backgroundColor: cssVar('--ink'), pointRadius: 2.2 },
      { label: '擬合直線', type: 'line', data: [] as { x: number; y: number }[], borderColor: cssVar('--red'), borderWidth: 2, pointRadius: 0 },
      { label: '理論 a = ω²r（尺量 r）', type: 'line', data: [] as { x: number; y: number }[], borderColor: cssVar('--muted'), borderWidth: 1.4, pointRadius: 0, borderDash: [6, 4] },
    ] },
    options: { scales: { x: scaleOpts('ω² (rad²/s²)', { beginAtZero: true }), y: scaleOpts('a (m/s²)', { beginAtZero: true }) } },
  });
  const untheme = themeCharts([liveChart, fitChart], () => {
    liveChart.data.datasets[0].borderColor = cssVar('--ink');
    liveChart.data.datasets[1].borderColor = cssVar('--red');
    const d0 = fitChart.data.datasets[0];
    d0.borderColor = d0.backgroundColor = cssVar('--ink');
    fitChart.data.datasets[1].borderColor = cssVar('--red');
    fitChart.data.datasets[2].borderColor = cssVar('--muted');
  });

  function resetLive() { restTilt = null; live.t.length = live.w.length = live.a.length = live.tilt.length = 0; clock0 = null; dirty = true; }
  function onData(m: DataMsg) {
    if (m.type !== 'samples') return;
    const f = m.data;
    for (let i = 0; i + 6 < f.length; i += 7) {
      const tms = f[i];
      if (clock0 === null) clock0 = tms;
      const ts = (tms - clock0) / 1000;
      if (live.t.length && ts <= live.t[live.t.length - 1]) continue;
      const g = Math.hypot(f[i + 1], f[i + 2], f[i + 3]) || 1;
      live.t.push(ts);
      live.w.push(Math.hypot(f[i + 4], f[i + 5], f[i + 6]) * D2R);
      live.a.push(Math.hypot(f[i + 1], f[i + 2]));
      live.tilt.push(Math.acos(Math.min(1, Math.abs(f[i + 3]) / g)) / D2R);
      if (run && kit.runState === 'running') run.rows.push([(tms - run.start) / 1000, run.seg, f[i + 1], f[i + 2], f[i + 3], f[i + 4], f[i + 5], f[i + 6]]);
    }
    const cut = live.t[live.t.length - 1] - LIVE_WINDOW;
    let k = 0;
    while (k < live.t.length && live.t[k] < cut) k++;
    if (k > 0) { live.t.splice(0, k); live.w.splice(0, k); live.a.splice(0, k); live.tilt.splice(0, k); }
    dirty = true;
  }

  function drawFit(points: { w2: number; a: number }[], fit: { slope: number; intercept: number } | null) {
    fitChart.data.datasets[0].data = thin(points, 600).map((p) => ({ x: p.w2, y: p.a }));
    const xMax = points.length ? Math.max(...points.map((p) => p.w2)) * 1.05 : 0;
    fitChart.data.datasets[1].data = fit && xMax ? [{ x: 0, y: fit.intercept }, { x: xMax, y: fit.slope * xMax + fit.intercept }] : [];
    const r = readR();
    fitChart.data.datasets[2].data = r && xMax ? [{ x: 0, y: 0 }, { x: xMax, y: r * xMax }] : [];
    fitChart.update('none');
  }
  function liveAnalysis() {
    const n = live.t.length;
    if (n) {
      const k0 = Math.max(0, n - 20);
      const avg = (a: number[]) => a.slice(k0).reduce((s, v) => s + v, 0) / (n - k0);
      const w = avg(live.w), a = avg(live.a);
      if (w < 0.4) restTilt = avg(live.tilt);
      const tilt = restTilt;
      $('ro-w').textContent = w.toFixed(2);
      $('ro-T').textContent = w > 0.3 ? ((2 * Math.PI) / w).toFixed(2) : '—';
      $('ro-a').textContent = a.toFixed(2);
      const th = $('tilt-hint');
      th.textContent = tilt === null ? '手機傾角：轉盤靜止時才量得到（轉動中加速度會干擾）' : `手機傾角（最近一次靜止時）：${tilt.toFixed(1)}°${tilt > 8 ? '　⚠ 手機沒有平放，重力會混入水平加速度' : '（平放良好）'}`;
      th.classList.toggle('red', tilt !== null && tilt > 8);
    }
    if (!run || kit.runState !== 'running' || run.rows.length < 100) return;
    const res = processRun(run.rows);
    const f = res.points.length >= 10 ? linearFit(res.points.map((p) => p.w2), res.points.map((p) => p.a)) : null;
    shown = res.points;
    drawFit(shown, f);
    $('ro-r').textContent = f ? f.slope.toFixed(3) : '—';
  }

  function renderTrials() {
    const box = $('trials');
    if (!trials.length) { box.innerHTML = '<div class="trials-empty">尚無紀錄。每按一次「結束並記錄」會新增一輪。</div>'; return; }
    const sE = stats(trials.map((t) => (100 * (t.rFit - t.rIn)) / t.rIn));
    box.innerHTML = `<table class="trials"><thead><tr><th>輪次</th><th>r 尺量 (m)</th><th>r 擬合 (m)</th><th>誤差</th><th>R²</th><th></th></tr></thead><tbody>${trials
      .map((t, i) => `<tr><td>${t.index}${t.source === 'demo' ? ' <span class="src">示範</span>' : ''}</td><td>${t.rIn.toFixed(3)}</td><td>${t.rFit.toFixed(3)}</td><td>${fmt((100 * (t.rFit - t.rIn)) / t.rIn, 1)}%</td><td>${t.r2.toFixed(3)}</td><td><button class="del" data-del="${i}" title="刪除此輪" aria-label="刪除第 ${t.index} 輪">×</button></td></tr>`)
      .join('')}</tbody><tfoot><tr><td>平均誤差</td><td></td><td></td><td>${fmt(sE.mean, 1)}%</td><td></td><td></td></tr></tfoot></table>`;
  }
  function showTrialFit(t: CTrial) {
    shown = t.points;
    drawFit(t.points, { slope: t.rFit, intercept: t.intercept });
    $('fit-box').innerHTML = `<div class="fit-eq">第 ${t.index} 輪：a = <b>${t.rFit.toFixed(4)}</b> ω² ${t.intercept >= 0 ? '+' : '−'} ${Math.abs(t.intercept).toFixed(3)}　（R² = ${t.r2.toFixed(4)}，${t.n} 點）</div>
      <div class="fit-res">斜率即半徑：<b class="red">r = ${t.rFit.toFixed(3)} m</b>　｜　尺量 r = ${t.rIn.toFixed(3)} m　｜　誤差 ${fmt((100 * (t.rFit - t.rIn)) / t.rIn, 1)}%</div>
      <div class="hint">最大角速度 ${t.omegaMax.toFixed(2)} rad/s，靜止時平均傾角 ${Number.isFinite(t.tilt) ? `${t.tilt.toFixed(1)}°` : "—（未測到靜止片段）"}。截距不為 0 多半來自手機微傾（重力分量）或加速度計零點偏移。</div>`;
  }
  $('trials').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-del]');
    if (b) {
      trials.splice(Number(b.dataset.del), 1);
      trials.forEach((t, i) => (t.index = i + 1));
      renderTrials();
      kit.updateButtons();
      return;
    }
    const tr = (e.target as HTMLElement).closest('tbody tr');
    if (tr) { const i = [...tr.parentElement!.children].indexOf(tr); if (trials[i]) showTrialFit(trials[i]); }
  });
  $('clear').addEventListener('click', () => {
    if (!confirmClear()) return;
    trials.length = 0;
    renderTrials();
    drawFit([], null);
    kit.updateButtons();
  });

  const anyDemo = () => trials.some((t) => t.source === 'demo');
  const summaryRows = (): Cell[][] => [
    ['輪次', '尺量半徑 r (m)', '擬合半徑 r = 斜率 (m)', '誤差 (%)', '截距 (m/s²)', 'R²', '擬合點數', '最大角速度 (rad/s)', '平均傾角 (°)', '量測時長 (s)', '來源'],
    ...trials.map((t) => [t.index, rnd(t.rIn, 4), rnd(t.rFit, 4), rnd((100 * (t.rFit - t.rIn)) / t.rIn, 2), rnd(t.intercept, 4), rnd(t.r2, 4), t.n, rnd(t.omegaMax, 3), rnd(t.tilt, 2), rnd(t.duration, 2), t.source === 'demo' ? '示範' : '手機']),
  ];
  const pointRows = (): Cell[][] => [['輪次', 'ω² (rad²/s²)', 'a 徑向 (m/s²)'], ...trials.flatMap((t) => t.points.map((p) => [t.index, rnd(p.w2, 4), rnd(p.a, 4)]))];
  const rawRows = (): Cell[][] => [['輪次', 't (s)', '分段', 'ax (m/s²)', 'ay (m/s²)', 'az (m/s²)', 'ωx (deg/s)', 'ωy (deg/s)', 'ωz (deg/s)'], ...trials.flatMap((t) => t.rows.map((r) => [t.index, rnd(r[0], 4), r[1], rnd(r[2], 4), rnd(r[3], 4), rnd(r[4], 4), rnd(r[5], 3), rnd(r[6], 3), rnd(r[7], 3)]))];
  $('csv-sum').addEventListener('click', () => toast(`已下載 ${downloadCsv('向心加速度_摘要', summaryRows(), anyDemo())}`));
  $('csv-raw').addEventListener('click', () => toast(`已下載 ${downloadCsv('向心加速度_原始數據', rawRows(), anyDemo())}`));
  $('xlsx').addEventListener('click', () => {
    const info: Cell[][] = [['手機物理實驗室｜向心加速度 a = ω²r'], [], ['資料來源', anyDemo() ? '含示範（合成資料，非實際量測）' : '手機加速度計＋陀螺儀（DeviceMotion）'], ['匯出時間', new Date().toLocaleString('zh-TW', { hour12: false })], ['處理方式', '重新取樣 50 Hz、0.3 s 移動平均後取 10 Hz；|ω| ≥ 1 rad/s 的點納入；水平加速度投影到主成分方向（指向圓心）後，對 ω² 做最小平方直線擬合，斜率即 r'], ['公式', 'a = ω²r']];
    toast(`已下載 ${downloadXlsx('向心加速度', [{ name: '說明', rows: info, cols: [14, 90] }, { name: '多輪摘要', rows: summaryRows(), cols: Array(11).fill(14) }, { name: '擬合點', rows: pointRows(), cols: [6, 14, 14] }, { name: '原始數據', rows: rawRows(), cols: [6, 10, 6, 12, 12, 12, 12, 12, 12] }], anyDemo())}`);
  });

  const kit = createLabKit({
    root, expId: 'centripetal', expName: exp.name, kind: 'motion', sensorName: '加速度計與陀螺儀',
    streamingHint: '把手機平放固定在轉盤上，轉動轉盤後按「開始」。',
    maxTrials: MAX_TRIALS, trialCount: () => trials.length,
    startDemo: (emit) => startCentripetalDemo(emit, () => readR() ?? 0.12),
    onData,
    onSourceChange: resetLive,
    onStart: () => {
      const r = readR();
      if (r === null) { rInput.focus(); toast('請先輸入 0.01–3 m 之間的半徑 r'); return false; }
      const startClock = clock0 !== null && live.t.length ? clock0 + live.t[live.t.length - 1] * 1000 : performance.now();
      run = { start: startClock, seg: 1, rows: [], startedAt: new Date(), src: kit.source === 'demo' ? 'demo' : 'phone', r };
      shown = []; drawFit([], null);
      $('ro-r').textContent = '—';
      $('fit-box').textContent = '記錄中…轉速變化越大，擬合越準。';
      return true;
    },
    onResume: () => { if (run) run.seg += 1; },
    onStop: () => {
      if (!run) return;
      const r = run;
      run = null;
      const res = processRun(r.rows);
      const f = res.points.length >= 15 ? linearFit(res.points.map((p) => p.w2), res.points.map((p) => p.a)) : null;
      const w2max = res.points.length ? Math.max(...res.points.map((p) => p.w2)) : 0;
      if (!f || w2max < 4) { toast('有效數據不足：請讓轉盤轉到 ω > 2 rad/s，並涵蓋不同轉速（至少約 2 秒）'); $('fit-box').textContent = '本輪未記錄。'; return; }
      const duration = r.rows.length ? r.rows[r.rows.length - 1][0] - r.rows[0][0] : 0;
      const t: CTrial = { index: trials.length + 1, rIn: r.r, rFit: f.slope, intercept: f.intercept, r2: f.r2, omegaMax: Math.sqrt(w2max), n: res.points.length, tilt: res.tilt, duration, source: r.src, startedAt: r.startedAt, rows: r.rows, points: res.points };
      trials.push(t);
      renderTrials();
      showTrialFit(t);
      $('ro-r').textContent = f.slope.toFixed(3);
      toast(`第 ${trials.length} 輪已記錄：r = ${f.slope.toFixed(3)} m`);
      if (res.tilt > 8) toast('提醒：手機平均傾角超過 8°，結果可能偏差');
    },
    autoDemo: opts.demo,
  });
  rInput.addEventListener('change', () => { kit.restartDemo(); drawFit(shown, null); });

  let raf = 0, lastDraw = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!dirty || now - lastDraw < 66) return;
    lastDraw = now; dirty = false;
    const n = live.t.length;
    const idx = thin(Array.from({ length: n }, (_, i) => i));
    liveChart.data.datasets[0].data = idx.map((i) => ({ x: live.t[i], y: live.w[i] }));
    liveChart.data.datasets[1].data = idx.map((i) => ({ x: live.t[i], y: live.a[i] }));
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
    liveChart.destroy();
    fitChart.destroy();
  };
}
