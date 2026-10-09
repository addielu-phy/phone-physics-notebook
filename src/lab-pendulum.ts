import { Chart, registerables } from 'chart.js';
import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { dominantAxis, gFromPendulum, periodByAutocorrelation, stats } from './analysis';
import { EXPERIMENTS } from './catalog';
import { startDemo } from './demo';
import { downloadWorkbook, type TrialRecord } from './excel';
import { icon } from './icons';
import { cssVar, footer, header, toast } from './layout';
import { makeCode, PEER_DEBUG, PEER_PREFIX, type DeskMsg, type PhoneMsg, type SensorState } from './protocol';

Chart.register(...registerables);

type RunState = 'idle' | 'running' | 'paused';
type Source = 'none' | 'phone' | 'demo';
const AXES = ['ωx', 'ωy', 'ωz'];
const LIVE_WINDOW = 15; // s 顯示於圖表的時間長度
const ANALYSIS_WINDOW = 20; // s 即時分析使用的最近數據
const MIN_SEGMENT = 3; // s 一個分段至少多長才納入最終分析
const MAX_TRIALS = 20;

export function renderPendulumLab(root: HTMLElement, opts: { demo: boolean }): () => void {
  const exp = EXPERIMENTS.find((e) => e.id === 'pendulum')!;
  root.innerHTML = `<div class="page"><div class="holes"></div>
${header()}
<main>
  <div class="lab-head">
    <div><div class="crumb"><a href="#/">首頁</a> ／ 力學 ／ E-01</div>
    <h1>${icon(exp.icon)}單擺測 g <span class="demo-flag" id="demo-flag" hidden>示範模式</span></h1></div>
    <div class="hand red" style="font-size:19px">T = 2π√(L/g)　⇒　g = 4π²L / T²</div>
  </div>
  <div class="lab">
    <div class="stack side">
      <div class="panel" id="pair-panel">
        <h3>手機配對 <span class="k">STEP 1</span></h3>
        <div class="qr-box" id="qr"><div class="ph">產生配對碼中…</div></div>
        <div class="code" id="code">······</div>
        <div class="url" id="url"></div>
        <div class="status-line"><span class="dot wait" id="conn-dot"></span><span id="conn-text">連線配對伺服器中…</span></div>
        <div class="hint" id="conn-hint">用手機相機掃描 QR Code，在手機上按「啟用感測器」。</div>
      </div>
      <div class="panel">
        <h3>示範模式 <span class="k">DEMO</span></h3>
        <p class="hint" style="margin:0 0 10px">沒有手機也能試用：以合成的單擺數據（含阻尼與雜訊）模擬陀螺儀，模擬擺長等於下方輸入的 L，模擬 g = 9.79 m/s²。</p>
        <button class="btn" id="demo-btn" type="button" style="width:100%">開始示範</button>
      </div>
      <div class="panel">
        <h3>實驗參數 <span class="k">STEP 2</span></h3>
        <div class="field"><label for="len">擺長 L</label><input id="len" type="number" inputmode="decimal" min="0.05" max="5" step="0.001" value="0.500"><span>m</span></div>
        <p class="hint">由懸點量到擺錘（手機）質心。擺角建議小於 15°。</p>
      </div>
    </div>
    <div class="stack">
      <div class="panel">
        <h3>即時角速度 <span class="k">STEP 3 · LIVE</span></h3>
        <div class="controls">
          <button class="btn primary" id="start" type="button">開始</button>
          <button class="btn" id="pause" type="button">暫停</button>
          <button class="btn" id="resume" type="button">繼續</button>
          <button class="btn danger" id="stop" type="button">結束並記錄</button>
          <span class="run-state" id="run-state">尚未開始</span>
        </div>
        <div class="chart-box"><canvas id="live-chart" aria-label="角速度對時間的即時圖表"></canvas><span class="stamp" id="demo-stamp" hidden>示範數據</span></div>
        <div class="readouts">
          <div class="ro"><small>週期 T</small><b id="ro-T">—</b><i>s</i></div>
          <div class="ro"><small>頻率 f</small><b id="ro-f">—</b><i>Hz</i></div>
          <div class="ro"><small>重力加速度 g</small><b class="g" id="ro-g">—</b><i>m/s²</i></div>
          <div class="ro"><small>分析軸／取樣率</small><b id="ro-ax" style="font-size:20px">—</b></div>
        </div>
      </div>
      <div class="lab-grid2">
        <div class="panel">
          <h3>自相關 <span class="k">AUTOCORRELATION</span></h3>
          <div class="chart-box small"><canvas id="ac-chart" aria-label="自相關圖"></canvas></div>
          <p class="hint">第一個正峰的時間差就是週期 T；峰值越接近 1，擺動越規律。</p>
        </div>
        <div class="panel">
          <h3>多輪紀錄 <span class="k">TRIALS</span></h3>
          <div id="trials"></div>
          <div class="foot"><button class="btn small" id="clear" type="button">清除全部</button><button class="btn small primary" id="export" type="button">匯出 Excel</button></div>
        </div>
      </div>
    </div>
  </div>
</main>
${footer()}
</div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const lenInput = $<HTMLInputElement>('len');

  // ---------- 狀態 ----------
  let source: Source = 'none';
  let runState: RunState = 'idle';
  let stopDemo: (() => void) | null = null;
  let phoneSensor: SensorState | null = null;
  const live = { t: [] as number[], x: [] as number[], y: [] as number[], z: [] as number[] };
  let clock0: number | null = null; // 目前來源的第一筆樣本時間（ms）
  let run: { start: number; seg: number; rows: number[][]; startedAt: Date; src: 'demo' | 'phone'; segStart: number[] } | null = null;
  const trials: TrialRecord[] = [];
  let dirty = true;

  // ---------- 圖表 ----------
  const colors = () => [cssVar('--muted'), cssVar('--ink'), cssVar('--red')];
  const gridColor = () => cssVar('--line');
  const liveChart = new Chart($<HTMLCanvasElement>('live-chart'), {
    type: 'line',
    data: { datasets: AXES.map((label, i) => ({ label: `${label}（deg/s）`, data: [] as { x: number; y: number }[], borderColor: colors()[i], borderWidth: i === 1 ? 2 : 1.4, pointRadius: 0, tension: 0 })) },
    options: {
      animation: false, parsing: false, normalized: true, responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: { legend: { labels: { boxWidth: 14, color: cssVar('--text') } }, tooltip: { enabled: false } },
      scales: {
        x: { type: 'linear', title: { display: true, text: 't (s)', color: cssVar('--muted') }, grid: { color: gridColor() }, ticks: { color: cssVar('--muted'), maxTicksLimit: 10 } },
        y: { title: { display: true, text: 'ω (deg/s)', color: cssVar('--muted') }, grid: { color: gridColor() }, ticks: { color: cssVar('--muted') } },
      },
    },
  });
  const acChart = new Chart($<HTMLCanvasElement>('ac-chart'), {
    type: 'line',
    data: { datasets: [{ label: 'r(τ)', data: [] as { x: number; y: number }[], borderColor: cssVar('--ink'), borderWidth: 1.6, pointRadius: 0 }, { label: '週期', data: [] as { x: number; y: number }[], borderColor: cssVar('--red'), backgroundColor: cssVar('--red'), pointRadius: 5, showLine: false }] },
    options: {
      animation: false, parsing: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { type: 'linear', title: { display: true, text: 'τ (s)', color: cssVar('--muted') }, grid: { color: gridColor() }, ticks: { color: cssVar('--muted') } }, y: { min: -1, max: 1, grid: { color: gridColor() }, ticks: { color: cssVar('--muted'), stepSize: 0.5 } } },
    },
  });
  const onTheme = () => {
    liveChart.data.datasets.forEach((d, i) => (d.borderColor = colors()[i]));
    acChart.data.datasets[0].borderColor = cssVar('--ink');
    acChart.data.datasets[1].borderColor = acChart.data.datasets[1].backgroundColor = cssVar('--red');
    for (const c of [liveChart, acChart]) {
      for (const s of Object.values(c.options.scales ?? {})) {
        if (!s) continue;
        s.grid = { ...s.grid, color: gridColor() };
        s.ticks = { ...s.ticks, color: cssVar('--muted') };
      }
      if (c.options.plugins?.legend?.labels) c.options.plugins.legend.labels.color = cssVar('--text');
      c.update('none');
    }
  };
  window.addEventListener('themechange', onTheme);

  // ---------- 資料流入 ----------
  function resetLive() {
    live.t.length = live.x.length = live.y.length = live.z.length = 0;
    clock0 = null;
    dirty = true;
  }
  function ingest(flat: number[], from: Source) {
    if (from !== source) return;
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const tms = flat[i];
      if (clock0 === null) clock0 = tms;
      const ts = (tms - clock0) / 1000;
      if (live.t.length && ts <= live.t[live.t.length - 1]) continue; // 丟棄亂序
      live.t.push(ts); live.x.push(flat[i + 1]); live.y.push(flat[i + 2]); live.z.push(flat[i + 3]);
      if (run && runState === 'running') {
        run.rows.push([(tms - run.start) / 1000, run.seg, flat[i + 1], flat[i + 2], flat[i + 3]]);
      }
    }
    const cut = live.t[live.t.length - 1] - LIVE_WINDOW;
    let k = 0;
    while (k < live.t.length && live.t[k] < cut) k++;
    if (k > 0) { live.t.splice(0, k); live.x.splice(0, k); live.y.splice(0, k); live.z.splice(0, k); }
    dirty = true;
  }

  // ---------- 示範模式 ----------
  function setSource(s: Source) {
    source = s;
    resetLive();
    const demo = s === 'demo';
    $('demo-flag').hidden = !demo;
    $('demo-stamp').hidden = !demo;
    $('demo-btn').textContent = demo ? '結束示範' : '開始示範';
    updateButtons();
  }
  function beginDemo() {
    stopDemo?.();
    const L = readL();
    setSource('demo');
    stopDemo = startDemo((flat) => ingest(flat, 'demo'), { length: L ?? 0.5 });
  }
  function endDemo() {
    stopDemo?.();
    stopDemo = null;
    setSource(conn?.open && phoneSensor === 'streaming' ? 'phone' : 'none');
  }
  $('demo-btn').addEventListener('click', () => {
    if (runState !== 'idle') return toast('請先結束本輪量測，再切換資料來源');
    if (source === 'demo') endDemo(); else beginDemo();
  });
  lenInput.addEventListener('change', () => {
    if (source === 'demo' && runState === 'idle') beginDemo();
  });

  // ---------- 手機配對（PeerJS） ----------
  let peer: Peer | null = null;
  let conn: DataConnection | null = null;
  let destroyed = false;
  const setConn = (cls: 'ok' | 'wait' | 'bad', text: string, hint?: string) => {
    $('conn-dot').className = 'dot ' + cls;
    $('conn-text').textContent = text;
    if (hint !== undefined) $('conn-hint').textContent = hint;
  };
  function sendPhone(msg: DeskMsg) { if (conn?.open) conn.send(msg); }

  function createPeer() {
    const code = makeCode();
    peer?.destroy();
    peer = new Peer(PEER_PREFIX + code, { debug: PEER_DEBUG });
    setConn('wait', '連線配對伺服器中…');
    peer.on('open', async () => {
      const url = `${location.origin}${location.pathname}?sensor=${code}`;
      $('code').textContent = code;
      $('url').textContent = url;
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, url, { width: 190, margin: 1, color: { dark: '#14244f', light: '#ffffff' }, errorCorrectionLevel: 'M' });
      $('qr').replaceChildren(canvas);
      setConn('wait', '等待手機掃描…', '用手機相機掃描 QR Code，在手機上按「啟用感測器」。');
    });
    peer.on('connection', (c) => {
      conn?.close();
      conn = c;
      c.on('open', () => {
        setConn('wait', '手機已連線，等待啟用感測器…');
        sendPhone({ type: 'welcome', experiment: '單擺測 g' });
        sendPhone({ type: 'recording', state: runState });
      });
      c.on('data', (raw) => onPhone(raw as PhoneMsg));
      c.on('close', () => {
        if (conn !== c) return;
        conn = null;
        phoneSensor = null;
        setConn('bad', '手機已中斷連線', '請在手機上重新整理頁面或再次掃描 QR Code。');
        if (source === 'phone') {
          if (runState === 'running') { pause(); toast('手機中斷，已自動暫停'); }
          setSource('none');
        }
      });
    });
    peer.on('disconnected', () => { if (!destroyed) peer?.reconnect(); });
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'unavailable-id') return createPeer();
      if (type === 'peer-unavailable') return;
      setConn('bad', '配對伺服器連線失敗', '請確認網路後重新整理頁面；也可以先使用示範模式。');
    });
  }

  function onPhone(m: PhoneMsg) {
    if (m.type === 'hello') return;
    if (m.type === 'status') {
      phoneSensor = m.state;
      const map: Record<SensorState, [cls: 'ok' | 'wait' | 'bad', text: string]> = {
        'waiting-permission': ['wait', '手機已連線，等待啟用感測器…'],
        streaming: ['ok', `手機串流中${m.rate ? `（約 ${Math.round(m.rate)} Hz）` : ''}`],
        denied: ['bad', '手機拒絕了感測器權限'],
        'no-sensor': ['bad', '這支手機沒有可用的陀螺儀'],
      };
      setConn(...map[m.state], m.detail ?? (m.state === 'streaming' ? '將手機固定在擺錘上，按「開始」記錄。' : undefined));
      if (m.state === 'streaming' && source === 'none') setSource('phone');
      if (m.state === 'streaming' && source === 'demo' && runState === 'idle') toast('手機已就緒，結束示範後即改用手機數據');
      return;
    }
    if (m.type === 'samples') {
      if (source === 'none' && phoneSensor === 'streaming') setSource('phone');
      ingest(m.data, 'phone');
    }
  }

  // ---------- 量測流程 ----------
  function readL(): number | null {
    const v = Number(lenInput.value);
    return Number.isFinite(v) && v >= 0.05 && v <= 5 ? v : null;
  }
  function updateButtons() {
    const has = source !== 'none';
    ($('start') as HTMLButtonElement).disabled = runState !== 'idle' || !has || trials.length >= MAX_TRIALS;
    ($('pause') as HTMLButtonElement).disabled = runState !== 'running';
    ($('resume') as HTMLButtonElement).disabled = runState !== 'paused' || !has;
    ($('stop') as HTMLButtonElement).disabled = runState === 'idle';
    ($('demo-btn') as HTMLButtonElement).disabled = runState !== 'idle';
    ($('export') as HTMLButtonElement).disabled = !trials.length;
    ($('clear') as HTMLButtonElement).disabled = !trials.length;
    const rs = $('run-state');
    rs.className = 'run-state' + (runState === 'running' ? ' on' : '');
    rs.textContent = runState === 'running' ? `● 第 ${trials.length + 1} 輪記錄中` : runState === 'paused' ? `‖ 第 ${trials.length + 1} 輪已暫停` : !has ? '請先連線手機或開始示範' : trials.length >= MAX_TRIALS ? '已達 20 輪上限' : '準備就緒';
    sendPhone({ type: 'recording', state: runState });
  }
  function start() {
    if (readL() === null) { lenInput.focus(); return toast('請先輸入 0.05–5 m 之間的擺長 L'); }
    const startClock = clock0 !== null && live.t.length ? clock0 + live.t[live.t.length - 1] * 1000 : performance.now();
    run = { start: startClock, seg: 1, rows: [], startedAt: new Date(), src: source === 'demo' ? 'demo' : 'phone', segStart: [0] };
    runState = 'running';
    setReadouts(null);
    updateButtons();
  }
  function pause() { if (runState === 'running') { runState = 'paused'; updateButtons(); } }
  function resume() {
    if (runState !== 'paused' || !run) return;
    run.seg += 1;
    run.segStart.push(run.rows.length);
    runState = 'running';
    updateButtons();
  }
  function stop() {
    if (!run) return;
    const r = run;
    run = null;
    runState = 'idle';
    const L = readL();
    const res = analyseRun(r.rows);
    if (!res || L === null) {
      toast(L === null ? '擺長 L 無效，本輪未記錄' : '有效數據不足（每段至少 3 秒、約兩個週期），本輪未記錄');
      updateButtons();
      return;
    }
    const duration = r.rows.length ? r.rows[r.rows.length - 1][0] - r.rows[0][0] : 0;
    trials.push({ index: trials.length + 1, length: L, period: res.period, g: gFromPendulum(L, res.period), axis: AXES[res.axis], duration, strength: res.strength, source: r.src, startedAt: r.startedAt, rows: r.rows });
    renderTrials();
    setReadouts({ period: res.period, axis: res.axis, L });
    updateButtons();
    toast(`第 ${trials.length} 輪已記錄：T = ${res.period.toFixed(3)} s`);
  }
  $('start').addEventListener('click', start);
  $('pause').addEventListener('click', pause);
  $('resume').addEventListener('click', resume);
  $('stop').addEventListener('click', stop);

  /** 依分段各自求週期，再以時長加權平均（自相關不跨越暫停）。 */
  function analyseRun(rows: number[][]): { period: number; axis: number; strength: number } | null {
    if (rows.length < 50) return null;
    const axis = dominantAxis([rows.map((r) => r[2]), rows.map((r) => r[3]), rows.map((r) => r[4])]);
    const segs = new Map<number, number[][]>();
    for (const r of rows) (segs.get(r[1]) ?? segs.set(r[1], []).get(r[1])!).push(r);
    let wSum = 0, pSum = 0, sSum = 0;
    for (const seg of segs.values()) {
      const dur = seg[seg.length - 1][0] - seg[0][0];
      if (dur < MIN_SEGMENT) continue;
      const p = periodByAutocorrelation(seg.map((r) => r[0]), seg.map((r) => r[2 + axis]));
      if (!p) continue;
      wSum += dur; pSum += p.period * dur; sSum += p.strength * dur;
    }
    return wSum ? { period: pSum / wSum, axis, strength: sSum / wSum } : null;
  }

  function setReadouts(v: { period: number; axis: number; L: number | null; rate?: number } | null) {
    $('ro-T').textContent = v ? v.period.toFixed(3) : '—';
    $('ro-f').textContent = v ? (1 / v.period).toFixed(3) : '—';
    $('ro-g').textContent = v && v.L ? gFromPendulum(v.L, v.period).toFixed(2) : '—';
    if (v) $('ro-ax').textContent = `${AXES[v.axis]}${v.rate ? ` · ${Math.round(v.rate)}Hz` : ''}`;
  }

  /** 即時分析：本輪目前分段的最近 20 秒。 */
  function liveAnalysis() {
    if (!run || runState !== 'running') return;
    const from = run.segStart[run.segStart.length - 1];
    const seg = run.rows.slice(from);
    if (seg.length < 30) return;
    const tEnd = seg[seg.length - 1][0];
    const win = seg.filter((r) => r[0] >= tEnd - ANALYSIS_WINDOW);
    const axis = dominantAxis([win.map((r) => r[2]), win.map((r) => r[3]), win.map((r) => r[4])]);
    const rate = (win.length - 1) / Math.max(1e-6, win[win.length - 1][0] - win[0][0]);
    const p = periodByAutocorrelation(win.map((r) => r[0]), win.map((r) => r[2 + axis]));
    $('ro-ax').textContent = `${AXES[axis]} · ${Math.round(rate)}Hz`;
    if (!p) return;
    setReadouts({ period: p.period, axis, L: readL(), rate });
    const step = Math.max(1, Math.floor(p.ac.length / 400));
    acChart.data.datasets[0].data = p.ac.filter((_, i) => i % step === 0).map((y, i) => ({ x: p.lags[i * step], y }));
    acChart.data.datasets[1].data = [{ x: p.period, y: p.strength }];
    acChart.update('none');
  }

  // ---------- 多輪表格 ----------
  function renderTrials() {
    const box = $('trials');
    if (!trials.length) { box.innerHTML = '<div class="trials-empty">尚無紀錄。每按一次「結束並記錄」會新增一輪。</div>'; return; }
    const sT = stats(trials.map((t) => t.period));
    const sG = stats(trials.map((t) => t.g));
    const f = (v: number | null, d: number) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
    box.innerHTML = `<table class="trials"><thead><tr><th>輪次</th><th>L (m)</th><th>T (s)</th><th>g (m/s²)</th><th>時長 (s)</th><th></th></tr></thead><tbody>${trials
      .map((t, i) => `<tr><td>${t.index}${t.source === 'demo' ? ' <span class="src">示範</span>' : ''}</td><td>${t.length.toFixed(3)}</td><td>${t.period.toFixed(4)}</td><td>${t.g.toFixed(3)}</td><td>${t.duration.toFixed(1)}</td><td><button class="del" data-del="${i}" title="刪除此輪" aria-label="刪除第 ${t.index} 輪">×</button></td></tr>`)
      .join('')}</tbody><tfoot><tr><td>平均</td><td></td><td>${f(sT.mean, 4)}</td><td>${f(sG.mean, 3)}</td><td></td><td></td></tr><tr><td>標準差</td><td></td><td>${f(sT.sd, 4)}</td><td>${f(sG.sd, 3)}</td><td></td><td></td></tr></tfoot></table>`;
  }
  $('trials').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-del]');
    if (!b) return;
    trials.splice(Number(b.dataset.del), 1);
    trials.forEach((t, i) => (t.index = i + 1));
    renderTrials();
    updateButtons();
  });
  $('clear').addEventListener('click', () => {
    if (!confirm('確定要清除所有紀錄嗎？尚未匯出的數據將會遺失。')) return;
    trials.length = 0;
    renderTrials();
    updateButtons();
  });
  $('export').addEventListener('click', () => {
    if (!trials.length) return;
    const name = downloadWorkbook(trials);
    toast(`已下載 ${name}`);
  });

  // ---------- 繪圖迴圈 ----------
  let raf = 0;
  let lastDraw = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!dirty || now - lastDraw < 66) return;
    lastDraw = now;
    dirty = false;
    const n = live.t.length;
    const step = Math.max(1, Math.floor(n / 900));
    const ds = liveChart.data.datasets;
    const cols = [live.x, live.y, live.z];
    for (let a = 0; a < 3; a++) {
      const arr: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i += step) arr.push({ x: live.t[i], y: cols[a][i] });
      ds[a].data = arr;
    }
    const tEnd = n ? live.t[n - 1] : LIVE_WINDOW;
    const xs = liveChart.options.scales!.x!;
    xs.max = Math.max(LIVE_WINDOW, Math.ceil(tEnd));
    xs.min = xs.max - LIVE_WINDOW;
    liveChart.update('none');
  };
  raf = requestAnimationFrame(loop);
  const analysisTimer = window.setInterval(liveAnalysis, 500);

  const beforeUnload = (e: BeforeUnloadEvent) => { if (trials.length || run) e.preventDefault(); };
  window.addEventListener('beforeunload', beforeUnload);

  renderTrials();
  updateButtons();
  createPeer();
  if (opts.demo) beginDemo();

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    clearInterval(analysisTimer);
    stopDemo?.();
    conn?.close();
    peer?.destroy();
    liveChart.destroy();
    acChart.destroy();
    window.removeEventListener('themechange', onTheme);
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
