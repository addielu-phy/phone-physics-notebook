import { harmonicAnalysis, noteName, soundSpeedClosedTube, spectrumPeaks, stats, type Harmonic } from './analysis';
import { EXPERIMENTS } from './catalog';
import { startSoundDemo } from './demo';
import { confirmClear, controlsHtml, createLabKit, demoPanel, downloadCsv, downloadXlsx, exportButtons, fmt, labHead, makeChart, pairPanel, purposePanel, rnd, scaleOpts, themeCharts, type Cell, type DataMsg } from './lab-kit';
import { cssVar, esc, footer, header, toast } from './layout';
import type { SpectrumFrame } from './protocol';

const HISTORY = 20; // s
const MAX_TRIALS = 30;
const MIN_LEVEL = -75; // dBFS 以下視為太小聲

interface STrial {
  index: number; f0: number; note: string; harmonics: Harmonic[]; f0Mean: number; f0Sd: number | null; frames: number; duration: number;
  L: number | null; d: number | null; v: number | null; source: 'demo' | 'phone'; startedAt: Date;
  binHz: number; avgDb: number[]; history: [number, number | null][];
}

const noteText = (f: number) => { const n = noteName(f); return n ? `${n.name} ${n.cents >= 0 ? '+' : '−'}${Math.abs(n.cents)}¢` : '—'; };

function analyseFrame(binHz: number, db: ArrayLike<number>) {
  const peaks = spectrumPeaks(binHz, db, { minF: 40, maxF: 5000, prominence: 18 });
  return { peaks, h: harmonicAnalysis(peaks, { binHz, maxF: 5000 }) };
}

export function renderSoundLab(root: HTMLElement, opts: { demo: boolean }): () => void {
  const exp = EXPERIMENTS.find((e) => e.id === 'sound-spectrum')!;
  root.innerHTML = `<div class="page"><div class="holes"></div>
${header()}
<main>
  ${labHead('sound-spectrum', 'fₙ = n·f₀　｜　閉管：v = 4f(L + 0.3d)')}
  ${purposePanel(
    '用手機麥克風做頻譜分析，找出聲音的基頻 f₀ 與泛音 2f₀、3f₀…，比較音叉、樂器與人聲的音色差異；也可用閉管共鳴量測聲速。',
    [
      '手機掃描 QR Code，按「啟用麥克風」並允許權限。頻譜在手機上計算，只傳頻譜到電腦，不傳送錄音。',
      '讓聲源（音叉、直笛、吉他、人聲「啊—」）發出穩定的聲音，手機麥克風距離約 10–30 cm，上方即時顯示頻譜與基頻。',
      '按「開始」記錄 2–5 秒後按「結束並記錄」，電腦會把這段時間的頻譜平均，找出基頻與各泛音並列表。',
      '觀察泛音頻率是否為基頻的整數倍，比較不同樂器各泛音的相對強度（音色）。',
      '（選做）閉管共鳴：在量筒或水管上方敲音叉，調整水位找到最響的位置，量空氣柱長度 L 與管內徑 d 填入左側，即可算出聲速並與理論值比較。',
    ],
    '手機、音叉或樂器；選做：量筒或水管、水、尺',
  )}
  <div class="lab">
    <div class="stack side">
      ${pairPanel()}
      ${demoPanel('沒有手機也能試用：模擬撥弦的聲音（基頻 220 Hz，第 2 泛音最強，每 4 秒撥一次），可直接看到「最強的峰不一定是基頻」。')}
      <div class="panel">
        <h3>閉管共鳴（選填） <span class="k">STEP 2</span></h3>
        <div class="field"><label for="tubeL">空氣柱長 L</label><input id="tubeL" type="number" inputmode="decimal" min="0.01" max="5" step="0.001" placeholder="—"><span>m</span></div>
        <div class="field"><label for="tubeD">管內徑 d</label><input id="tubeD" type="number" inputmode="decimal" min="0" max="0.5" step="0.001" value="0.030"><span>m</span></div>
        <div class="field"><label for="temp">室溫 T</label><input id="temp" type="number" inputmode="decimal" min="-20" max="50" step="0.1" value="25"><span>°C</span></div>
        <p class="hint">第一共鳴位置：L + 0.3d = λ/4，故 v = 4f₀(L + 0.3d)。理論聲速 v ≈ 331.3 + 0.606T = <b id="v-theory">—</b> m/s。不做共鳴管可留空 L。</p>
      </div>
    </div>
    <div class="stack">
      <div class="panel">
        <h3>即時頻譜 <span class="k">STEP 3 · LIVE</span></h3>
        ${controlsHtml()}
        <div class="range-row"><span class="muted">顯示範圍</span><span class="seg" id="range"><button type="button" data-max="1000">1 kHz</button><button type="button" data-max="2000" class="on">2 kHz</button><button type="button" data-max="5000">5 kHz</button></span></div>
        <div class="chart-box"><canvas id="spec-chart" aria-label="聲音功率頻譜即時圖"></canvas><span class="stamp demo-stamp" hidden>示範數據</span></div>
        <div class="readouts">
          <div class="ro"><small>基頻 f₀</small><b class="g" id="ro-f0">—</b><i>Hz</i></div>
          <div class="ro"><small>音名（A4 = 440 Hz）</small><b id="ro-note" style="font-size:22px">—</b></div>
          <div class="ro"><small>最強峰</small><b id="ro-peak">—</b><i>Hz</i></div>
          <div class="ro"><small>音量</small><b id="ro-level">—</b><i>dBFS</i></div>
        </div>
      </div>
      <div class="lab-grid2">
        <div class="panel">
          <h3>基頻歷程 <span class="k">f₀(t)</span></h3>
          <div class="chart-box small2"><canvas id="hist-chart" aria-label="基頻隨時間變化圖"></canvas></div>
          <div class="fit-box" id="harm-box">按「結束並記錄」後，這裡會列出平均頻譜的泛音分析。</div>
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
  const num = (id: string, lo: number, hi: number) => { const s = $<HTMLInputElement>(id).value.trim(); const v = Number(s); return s !== '' && Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
  const vTheory = () => { const T = num('temp', -20, 50); return T === null ? null : 331.3 + 0.606 * T; };
  const updTheory = () => ($('v-theory').textContent = fmt(vTheory(), 1));
  updTheory();
  $('temp').addEventListener('input', updTheory);

  let maxF = 2000;
  let latest: SpectrumFrame | null = null;
  let clock0: number | null = null;
  const hist: { t: number; f0: number | null }[] = [];
  let run: { startT: number | null; sum: Float64Array | null; binHz: number; frames: number; f0s: number[]; history: [number, number | null][]; startedAt: Date; src: 'demo' | 'phone'; lastT: number } | null = null;
  const trials: STrial[] = [];
  let shownHarm: Harmonic[] = [];
  let dirty = true;

  const specChart = makeChart($<HTMLCanvasElement>('spec-chart'), {
    type: 'line',
    data: { datasets: [
      { label: '功率頻譜（dBFS）', data: [] as { x: number; y: number }[], borderColor: cssVar('--ink'), borderWidth: 1.3, pointRadius: 0, tension: 0 },
      { label: '泛音 n·f₀', data: [] as { x: number; y: number }[], borderColor: cssVar('--red'), backgroundColor: cssVar('--red'), pointRadius: 5, pointStyle: 'triangle', showLine: false },
    ] },
    options: { scales: { x: scaleOpts('f (Hz)', { min: 0, max: maxF }), y: scaleOpts('功率 (dB)', { min: -130, max: 0 }) } },
  });
  const histChart = makeChart($<HTMLCanvasElement>('hist-chart'), {
    type: 'scatter',
    data: { datasets: [{ label: 'f₀ (Hz)', data: [] as { x: number; y: number }[], borderColor: cssVar('--ink'), backgroundColor: cssVar('--ink'), pointRadius: 2.2 }] },
    options: { plugins: { legend: { display: false } }, scales: { x: scaleOpts('t (s)'), y: scaleOpts('f₀ (Hz)') } },
  });
  const untheme = themeCharts([specChart, histChart], () => {
    specChart.data.datasets[0].borderColor = cssVar('--ink');
    const d1 = specChart.data.datasets[1];
    d1.borderColor = d1.backgroundColor = cssVar('--red');
    const h = histChart.data.datasets[0];
    h.borderColor = h.backgroundColor = cssVar('--ink');
  });
  $('range').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-max]');
    if (!b) return;
    maxF = Number(b.dataset.max);
    $('range').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    specChart.options.scales!.x!.max = maxF;
    dirty = true;
  });

  function resetLive() { latest = null; clock0 = null; hist.length = 0; dirty = true; ['ro-f0', 'ro-note', 'ro-peak', 'ro-level'].forEach((id) => ($(id).textContent = '—')); }
  function onData(m: DataMsg) {
    if (m.type !== 'spectrum') return;
    if (clock0 === null) clock0 = m.t;
    const ts = (m.t - clock0) / 1000;
    latest = m;
    const { peaks, h } = analyseFrame(m.binHz, m.db);
    const loud = m.level > MIN_LEVEL && peaks.length > 0;
    const f0 = loud && h ? h.f0 : null;
    hist.push({ t: ts, f0 });
    while (hist.length && hist[0].t < ts - HISTORY) hist.shift();
    $('ro-level').textContent = m.level.toFixed(0);
    $('ro-peak').textContent = loud ? peaks[0].f.toFixed(1) : '—';
    $('ro-f0').textContent = f0 ? f0.toFixed(1) : '—';
    $('ro-note').textContent = f0 ? noteText(f0) : loud ? '—' : '太小聲';
    shownHarm = loud && h ? h.harmonics : [];
    if (run && kit.runState === 'running') {
      if (run.startT === null) run.startT = ts;
      if (!run.sum || run.binHz !== m.binHz || run.sum.length !== m.db.length) { run.sum = new Float64Array(m.db.length); run.binHz = m.binHz; run.frames = 0; }
      for (let i = 0; i < m.db.length; i++) run.sum[i] += 10 ** (m.db[i] / 10);
      run.frames++;
      if (f0) run.f0s.push(f0);
      run.history.push([ts - run.startT, f0]);
      run.lastT = ts;
    }
    dirty = true;
  }

  function harmonicsTable(t: STrial): string {
    const ref = Math.max(...t.harmonics.map((h) => h.db));
    return `<div class="fit-eq">第 ${t.index} 輪平均頻譜：基頻 <b class="red">f₀ = ${t.f0.toFixed(2)} Hz</b>（${esc(t.note)}）${t.v !== null ? `　｜　聲速 v = <b class="red">${t.v.toFixed(1)} m/s</b>` : ''}</div>
      <table class="trials harm"><thead><tr><th>n</th><th>fₙ (Hz)</th><th>fₙ / f₀</th><th>相對強度 (dB)</th></tr></thead><tbody>${t.harmonics
        .map((h) => `<tr><td>${h.n}</td><td>${h.f.toFixed(1)}</td><td>${(h.f / t.f0).toFixed(3)}</td><td>${(h.db - ref).toFixed(1)}</td></tr>`)
        .join('')}</tbody></table>
      <div class="hint">fₙ / f₀ 接近整數代表諧和泛音；最強的峰（相對強度 0 dB）不一定是基頻。${t.v !== null && vTheory() ? `與理論值 ${vTheory()!.toFixed(1)} m/s 相差 ${fmt((100 * (t.v - vTheory()!)) / vTheory()!, 1)}%。` : ''}</div>`;
  }
  function renderTrials() {
    const box = $('trials');
    if (!trials.length) { box.innerHTML = '<div class="trials-empty">尚無紀錄。每按一次「結束並記錄」會新增一輪。</div>'; return; }
    const vs = trials.filter((t) => t.v !== null).map((t) => t.v!);
    const sV = stats(vs);
    box.innerHTML = `<table class="trials"><thead><tr><th>輪次</th><th>f₀ (Hz)</th><th>音名</th><th>泛音數</th><th>v (m/s)</th><th></th></tr></thead><tbody>${trials
      .map((t, i) => `<tr data-row="${i}"><td>${t.index}${t.source === 'demo' ? ' <span class="src">示範</span>' : ''}</td><td>${t.f0.toFixed(2)}</td><td>${esc(t.note)}</td><td>${t.harmonics.length}</td><td>${t.v !== null ? t.v.toFixed(1) : '—'}</td><td><button class="del" data-del="${i}" title="刪除此輪" aria-label="刪除第 ${t.index} 輪">×</button></td></tr>`)
      .join('')}</tbody>${vs.length ? `<tfoot><tr><td>聲速平均</td><td></td><td></td><td></td><td>${fmt(sV.mean, 1)}</td><td></td></tr></tfoot>` : ''}</table><p class="hint">點選任一列可查看該輪的泛音分析。</p>`;
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
    const tr = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (tr) $('harm-box').innerHTML = harmonicsTable(trials[Number(tr.dataset.row)]);
  });
  $('clear').addEventListener('click', () => {
    if (!confirmClear()) return;
    trials.length = 0;
    renderTrials();
    $('harm-box').textContent = '按「結束並記錄」後，這裡會列出平均頻譜的泛音分析。';
    kit.updateButtons();
  });

  const anyDemo = () => trials.some((t) => t.source === 'demo');
  const H = 8;
  const summaryRows = (): Cell[][] => [
    ['輪次', '基頻 f0 (Hz)', '音名', '逐幀 f0 平均 (Hz)', '逐幀 f0 標準差 (Hz)', '泛音數', ...Array.from({ length: H }, (_, i) => `f${i + 1} (Hz)`), ...Array.from({ length: H }, (_, i) => `f${i + 1} 相對強度 (dB)`), '空氣柱 L (m)', '管徑 d (m)', '聲速 v (m/s)', '幀數', '時長 (s)', '來源'],
    ...trials.map((t) => {
      const ref = Math.max(...t.harmonics.map((h) => h.db));
      const byN = (n: number) => t.harmonics.find((h) => h.n === n);
      return [t.index, rnd(t.f0, 3), t.note, rnd(t.f0Mean, 3), rnd(t.f0Sd, 3), t.harmonics.length, ...Array.from({ length: H }, (_, i) => rnd(byN(i + 1)?.f, 2)), ...Array.from({ length: H }, (_, i) => { const h = byN(i + 1); return h ? rnd(h.db - ref, 1) : null; }), rnd(t.L, 4), rnd(t.d, 4), rnd(t.v, 2), t.frames, rnd(t.duration, 2), t.source === 'demo' ? '示範' : '手機'];
    }),
  ];
  const specRows = (): Cell[][] => [['輪次', '頻率 (Hz)', '平均功率 (dBFS)'], ...trials.flatMap((t) => t.avgDb.map((v, i) => [t.index, rnd(i * t.binHz, 2), rnd(v, 1)]))];
  const histRows = (): Cell[][] => [['輪次', 't (s)', 'f0 (Hz)'], ...trials.flatMap((t) => t.history.map(([s, f]) => [t.index, rnd(s, 2), rnd(f, 2)]))];
  $('csv-sum').addEventListener('click', () => toast(`已下載 ${downloadCsv('聲音頻譜_摘要', summaryRows(), anyDemo())}`));
  $('csv-raw').addEventListener('click', () => toast(`已下載 ${downloadCsv('聲音頻譜_平均頻譜', specRows(), anyDemo())}`));
  $('xlsx').addEventListener('click', () => {
    const info: Cell[][] = [['手機物理實驗室｜聲音頻譜'], [], ['資料來源', anyDemo() ? '含示範（合成資料，非實際量測）' : '手機麥克風（Web Audio AnalyserNode，FFT 8192 點，Blackman 窗）'], ['匯出時間', new Date().toLocaleString('zh-TW', { hour12: false })], ['處理方式', '每 0.1 s 一幀；記錄期間的功率頻譜取線性平均；峰值以拋物線內插；基頻由泛音吻合度選出並以各泛音加權擬合'], ['閉管共鳴', 'v = 4f0(L + 0.3d)'], ['理論聲速', vTheory() !== null ? `${vTheory()!.toFixed(1)} m/s（331.3 + 0.606T）` : '—']];
    toast(`已下載 ${downloadXlsx('聲音頻譜', [{ name: '說明', rows: info, cols: [14, 90] }, { name: '多輪摘要', rows: summaryRows(), cols: Array(30).fill(12) }, { name: '平均頻譜', rows: specRows(), cols: [6, 12, 14] }, { name: '基頻歷程', rows: histRows(), cols: [6, 10, 12] }], anyDemo())}`);
  });

  const kit = createLabKit({
    root, expId: 'sound-spectrum', expName: exp.name, kind: 'audio', sensorName: '麥克風',
    streamingHint: '讓聲源發出穩定的聲音，按「開始」記錄 2–5 秒。',
    maxTrials: MAX_TRIALS, trialCount: () => trials.length,
    startDemo: (emit) => startSoundDemo(emit),
    onData,
    onSourceChange: resetLive,
    onStart: () => {
      run = { startT: null, sum: null, binHz: 0, frames: 0, f0s: [], history: [], startedAt: new Date(), src: kit.source === 'demo' ? 'demo' : 'phone', lastT: 0 };
      return true;
    },
    onStop: () => {
      if (!run) return;
      const r = run;
      run = null;
      if (!r.sum || r.frames < 5) { toast('記錄太短（至少 0.5 秒），本輪未記錄'); return; }
      const avgDb = Array.from(r.sum, (s) => 10 * Math.log10(s / r.frames || 1e-14));
      const { h } = analyseFrame(r.binHz, avgDb);
      if (!h) { toast('找不到明顯的音高：請靠近聲源、保持安靜後再試一次'); return; }
      const sF = stats(r.f0s);
      const L = num('tubeL', 0.01, 5), d = num('tubeD', 0, 0.5) ?? 0;
      const t: STrial = { index: trials.length + 1, f0: h.f0, note: noteText(h.f0), harmonics: h.harmonics, f0Mean: sF.mean, f0Sd: sF.sd, frames: r.frames, duration: (r.lastT - (r.startT ?? 0)), L, d: L !== null ? d : null, v: L !== null ? soundSpeedClosedTube(h.f0, L, d) : null, source: r.src, startedAt: r.startedAt, binHz: r.binHz, avgDb, history: r.history };
      trials.push(t);
      renderTrials();
      $('harm-box').innerHTML = harmonicsTable(t);
      toast(`第 ${trials.length} 輪已記錄：f₀ = ${h.f0.toFixed(1)} Hz（${t.note}）`);
    },
    autoDemo: opts.demo,
  });
  // 聲音不需要暫停分段：隱藏暫停／繼續以簡化操作
  $('pause').hidden = true;
  $('resume').hidden = true;

  let raf = 0, lastDraw = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!dirty || now - lastDraw < 80) return;
    lastDraw = now; dirty = false;
    if (latest) {
      const nMax = Math.min(latest.db.length, Math.ceil(maxF / latest.binHz) + 1);
      const pts: { x: number; y: number }[] = [];
      for (let i = 1; i < nMax; i++) pts.push({ x: i * latest.binHz, y: latest.db[i] });
      specChart.data.datasets[0].data = pts;
      specChart.data.datasets[1].data = shownHarm.filter((h) => h.f <= maxF).map((h) => ({ x: h.f, y: Math.min(-2, h.db + 6) }));
    } else {
      specChart.data.datasets[0].data = [];
      specChart.data.datasets[1].data = [];
    }
    specChart.update('none');
    const hp = hist.filter((p) => p.f0 !== null).map((p) => ({ x: p.t, y: p.f0! }));
    histChart.data.datasets[0].data = hp;
    const xs = histChart.options.scales!.x!;
    const tEnd = hist.length ? hist[hist.length - 1].t : 0;
    xs.max = Math.max(HISTORY, Math.ceil(tEnd));
    xs.min = xs.max - HISTORY;
    histChart.update('none');
  };
  raf = requestAnimationFrame(loop);
  renderTrials();

  return () => {
    cancelAnimationFrame(raf);
    kit.destroy();
    untheme();
    specChart.destroy();
    histChart.destroy();
  };
}
