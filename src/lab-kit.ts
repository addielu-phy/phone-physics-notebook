/** 新實驗台共用元件：手機配對（PeerJS）、資料來源切換、開始／暫停／結束流程、圖表配色、CSV／Excel 匯出。 */
import { Chart, registerables, type ChartConfiguration } from 'chart.js';
import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { EXPERIMENTS } from './catalog';
import { icon } from './icons';
import { cssVar, esc, toast } from './layout';
import { makeCode, PEER_DEBUG, PEER_PREFIX, type DeskMsg, type PhoneMsg, type SensorKind, type SensorState, type SpectrumFrame } from './protocol';

Chart.register(...registerables);

export type Source = 'none' | 'phone' | 'demo';
export type RunState = 'idle' | 'running' | 'paused';
export type DataMsg = Extract<PhoneMsg, { type: 'samples' }> | SpectrumFrame;

// ---------------- HTML 片段 ----------------

const LABS: { id: string; short: string }[] = [
  { id: 'pendulum', short: '單擺' },
  { id: 'spring', short: '彈簧' },
  { id: 'centripetal', short: '向心' },
  { id: 'sound-spectrum', short: '聲音頻譜' },
];

export function labHead(expId: string, formulaHtml: string): string {
  const exp = EXPERIMENTS.find((e) => e.id === expId)!;
  const no = 'E-' + String(EXPERIMENTS.indexOf(exp) + 1).padStart(2, '0');
  const others = LABS.map((l) => (l.id === expId ? `<b>${l.short}</b>` : `<a href="#/lab/${l.id}">${l.short}</a>`)).join('・');
  return `<div class="lab-head">
    <div><div class="crumb"><a href="#/">首頁</a> ／ ${exp.category} ／ ${no}　<span class="lab-switch">實驗台：${others}</span></div>
    <h1>${icon(exp.icon)}${esc(exp.name)} <span class="demo-flag" id="demo-flag" hidden>示範模式</span></h1></div>
    <div class="hand red" style="font-size:19px">${formulaHtml}</div>
  </div>`;
}

export function purposePanel(purpose: string, steps: string[], gear: string): string {
  return `<details class="panel howto" open>
    <summary><h3>實驗目的與步驟 <span class="k">PROCEDURE</span></h3></summary>
    <p class="purpose"><b>目的</b>　${purpose}</p>
    <p class="purpose"><b>器材</b>　${gear}</p>
    <ol class="steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
  </details>`;
}

export function pairPanel(): string {
  return `<div class="panel" id="pair-panel">
    <h3>手機配對 <span class="k">STEP 1</span></h3>
    <div class="qr-box" id="qr"><div class="ph">產生配對碼中…</div></div>
    <div class="code" id="code">······</div>
    <div class="url" id="url"></div>
    <div class="status-line"><span class="dot wait" id="conn-dot"></span><span id="conn-text">連線配對伺服器中…</span></div>
    <div class="hint" id="conn-hint">用手機相機掃描 QR Code，在手機上按「啟用感測器」。</div>
  </div>`;
}

export function demoPanel(desc: string): string {
  return `<div class="panel">
    <h3>示範模式 <span class="k">DEMO</span></h3>
    <p class="hint" style="margin:0 0 10px">${desc}</p>
    <button class="btn" id="demo-btn" type="button" style="width:100%">開始示範</button>
  </div>`;
}

export function controlsHtml(): string {
  return `<div class="controls">
    <button class="btn primary" id="start" type="button">開始</button>
    <button class="btn" id="pause" type="button">暫停</button>
    <button class="btn" id="resume" type="button">繼續</button>
    <button class="btn danger" id="stop" type="button">結束並記錄</button>
    <span class="run-state" id="run-state">尚未開始</span>
  </div>`;
}

export function exportButtons(): string {
  return `<div class="foot"><button class="btn small" id="clear" type="button">清除全部</button><span class="exp-btns"><button class="btn small" id="csv-sum" type="button">CSV 摘要</button><button class="btn small" id="csv-raw" type="button">CSV 原始數據</button><button class="btn small primary" id="xlsx" type="button">匯出 Excel</button></span></div>`;
}

// ---------------- 圖表 ----------------

export function scaleOpts(title: string, extra: Record<string, unknown> = {}) {
  return { type: 'linear' as const, title: { display: true, text: title, color: cssVar('--muted') }, grid: { color: cssVar('--line') }, ticks: { color: cssVar('--muted'), maxTicksLimit: 10 }, ...extra };
}

export function makeChart(canvas: HTMLCanvasElement, cfg: ChartConfiguration): Chart {
  const o = (cfg.options ??= {});
  Object.assign(o, { animation: false, parsing: false, normalized: true, responsive: true, maintainAspectRatio: false });
  o.plugins = { tooltip: { enabled: false }, ...o.plugins, legend: { labels: { boxWidth: 14, color: cssVar('--text') }, ...(o.plugins?.legend ?? {}) } };
  return new Chart(canvas, cfg);
}

/** 主題切換時重設所有圖表格線與文字顏色；recolor 讓各實驗重新指定資料線顏色。 */
export function themeCharts(charts: Chart[], recolor: () => void): () => void {
  const on = () => {
    recolor();
    for (const c of charts) {
      for (const s of Object.values(c.options.scales ?? {})) {
        if (!s) continue;
        s.grid = { ...s.grid, color: cssVar('--line') };
        s.ticks = { ...s.ticks, color: cssVar('--muted') };
        const t = (s as { title?: { color?: string } }).title;
        if (t) t.color = cssVar('--muted');
      }
      if (c.options.plugins?.legend?.labels) c.options.plugins.legend.labels.color = cssVar('--text');
      c.update('none');
    }
  };
  window.addEventListener('themechange', on);
  return () => window.removeEventListener('themechange', on);
}

/** 依點數抽樣，避免圖表點太多。 */
export function thin<T>(arr: T[], max = 900): T[] {
  const step = Math.max(1, Math.ceil(arr.length / max));
  return step === 1 ? arr : arr.filter((_, i) => i % step === 0);
}

// ---------------- 匯出 ----------------

const stampName = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

export type Cell = string | number | null;

/** 下載 CSV（含 UTF-8 BOM，Excel 直接開啟中文不亂碼）。 */
export function downloadCsv(base: string, rows: Cell[][], demo: boolean): string {
  const q = (v: Cell) => {
    if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '\ufeff' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  const name = `${base}_${stampName()}${demo ? '_示範' : ''}.csv`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return name;
}

export function downloadXlsx(base: string, sheets: { name: string; rows: Cell[][]; cols?: number[] }[], demo: boolean): string {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.cols) ws['!cols'] = s.cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const name = `${base}_${stampName()}${demo ? '_示範' : ''}.xlsx`;
  XLSX.writeFile(wb, name, { compression: true });
  return name;
}

export const rnd = (v: number | null | undefined, d = 4): number | null => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
export const fmt = (v: number | null | undefined, d: number) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));

// ---------------- 配對＋流程控制 ----------------

export interface LabKitOptions {
  root: HTMLElement;
  expId: string;
  expName: string;
  kind: SensorKind;
  sensorName: string;
  streamingHint: string;
  maxTrials: number;
  trialCount: () => number;
  /** 啟動示範資料產生器，回傳停止函式；產生的訊息格式與手機相同。 */
  startDemo: (emit: (m: DataMsg) => void) => () => void;
  /** 目前資料來源送來的資料。 */
  onData: (m: DataMsg, from: Source) => void;
  onSourceChange: (s: Source) => void;
  /** 回傳 false 代表參數不合法、不開始。 */
  onStart: () => boolean;
  onPause?: () => void;
  onResume?: () => void;
  onStop: () => void;
  /** 每次按鈕狀態更新時呼叫（例如更新匯出按鈕）。 */
  onButtons?: () => void;
  autoDemo: boolean;
}

export interface LabKit {
  readonly source: Source;
  readonly runState: RunState;
  updateButtons(): void;
  restartDemo(): void;
  destroy(): void;
}

export function createLabKit(o: LabKitOptions): LabKit {
  const { root } = o;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  let source: Source = 'none';
  let runState: RunState = 'idle';
  let stopDemo: (() => void) | null = null;
  let phoneSensor: SensorState | null = null;
  let peer: Peer | null = null;
  let conn: DataConnection | null = null;
  let destroyed = false;
  let kindWarned = false;

  const setConn = (cls: 'ok' | 'wait' | 'bad', text: string, hint?: string) => {
    $('conn-dot').className = 'dot ' + cls;
    $('conn-text').textContent = text;
    if (hint !== undefined) $('conn-hint').textContent = hint;
  };
  const sendPhone = (msg: DeskMsg) => { if (conn?.open) conn.send(msg); };

  function setSource(s: Source) {
    source = s;
    const demo = s === 'demo';
    $('demo-flag').hidden = !demo;
    root.querySelectorAll<HTMLElement>('.demo-stamp').forEach((el) => (el.hidden = !demo));
    $('demo-btn').textContent = demo ? '結束示範' : '開始示範';
    o.onSourceChange(s);
    updateButtons();
  }
  function beginDemo() {
    stopDemo?.();
    setSource('demo');
    stopDemo = o.startDemo((m) => { if (source === 'demo') o.onData(m, 'demo'); });
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

  function createPeer() {
    const code = makeCode();
    peer?.destroy();
    peer = new Peer(PEER_PREFIX + code, { debug: PEER_DEBUG });
    setConn('wait', '連線配對伺服器中…');
    peer.on('open', async () => {
      const url = `${location.origin}${location.pathname}?sensor=${code}&exp=${encodeURIComponent(o.expId)}`;
      $('code').textContent = code;
      $('url').textContent = url;
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, url, { width: 190, margin: 1, color: { dark: '#14244f', light: '#ffffff' }, errorCorrectionLevel: 'M' });
      $('qr').replaceChildren(canvas);
      setConn('wait', '等待手機掃描…', `用手機相機掃描 QR Code，在手機上按「${o.kind === 'audio' ? '啟用麥克風' : '啟用感測器'}」。`);
    });
    peer.on('connection', (c) => {
      conn?.close();
      conn = c;
      kindWarned = false;
      c.on('open', () => {
        setConn('wait', `手機已連線，等待啟用${o.sensorName}…`);
        sendPhone({ type: 'welcome', experiment: o.expName, kind: o.kind, id: o.expId });
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

  function kindOk(k: SensorKind | undefined): boolean {
    if ((k ?? 'gyro') === o.kind) return true;
    if (!kindWarned) {
      kindWarned = true;
      setConn('bad', '手機開的是別的實驗', '請在手機上重新掃描這一頁的 QR Code。');
    }
    return false;
  }

  function onPhone(m: PhoneMsg) {
    if (m.type === 'hello') return;
    if (m.type === 'status') {
      if (!kindOk(m.kind)) return;
      phoneSensor = m.state;
      const unit = o.kind === 'audio' ? '幀/s' : 'Hz';
      const map: Record<SensorState, [cls: 'ok' | 'wait' | 'bad', text: string]> = {
        'waiting-permission': ['wait', `手機已連線，等待啟用${o.sensorName}…`],
        streaming: ['ok', `手機串流中${m.rate ? `（約 ${Math.round(m.rate)} ${unit}）` : ''}`],
        denied: ['bad', `手機拒絕了${o.sensorName}權限`],
        'no-sensor': ['bad', `這支手機沒有可用的${o.sensorName}`],
      };
      setConn(...map[m.state], m.detail ?? (m.state === 'streaming' ? o.streamingHint : undefined));
      if (m.state === 'streaming' && source === 'none') setSource('phone');
      if (m.state === 'streaming' && source === 'demo' && runState === 'idle') toast('手機已就緒，結束示範後即改用手機數據');
      return;
    }
    if (m.type === 'samples' || m.type === 'spectrum') {
      if (m.type === 'samples' && !kindOk(m.kind)) return;
      if (m.type === 'spectrum' && o.kind !== 'audio') return;
      if (source === 'none' && phoneSensor === 'streaming') setSource('phone');
      if (source === 'phone') o.onData(m, 'phone');
    }
  }

  function updateButtons() {
    const has = source !== 'none';
    const n = o.trialCount();
    const b = (id: string) => $<HTMLButtonElement>(id);
    b('start').disabled = runState !== 'idle' || !has || n >= o.maxTrials;
    b('pause').disabled = runState !== 'running';
    b('resume').disabled = runState !== 'paused' || !has;
    b('stop').disabled = runState === 'idle';
    b('demo-btn').disabled = runState !== 'idle';
    for (const id of ['csv-sum', 'csv-raw', 'xlsx', 'clear']) { const el = root.querySelector<HTMLButtonElement>('#' + id); if (el) el.disabled = !n; }
    const rs = $('run-state');
    rs.className = 'run-state' + (runState === 'running' ? ' on' : '');
    rs.textContent = runState === 'running' ? `● 第 ${n + 1} 輪記錄中` : runState === 'paused' ? `‖ 第 ${n + 1} 輪已暫停` : !has ? '請先連線手機或開始示範' : n >= o.maxTrials ? `已達 ${o.maxTrials} 輪上限` : '準備就緒';
    sendPhone({ type: 'recording', state: runState });
    o.onButtons?.();
  }
  function start() {
    if (runState !== 'idle' || !o.onStart()) return;
    runState = 'running';
    updateButtons();
  }
  function pause() { if (runState === 'running') { runState = 'paused'; o.onPause?.(); updateButtons(); } }
  function resume() { if (runState === 'paused') { runState = 'running'; o.onResume?.(); updateButtons(); } }
  function stop() { if (runState === 'idle') return; runState = 'idle'; o.onStop(); updateButtons(); }
  $('start').addEventListener('click', start);
  $('pause').addEventListener('click', pause);
  $('resume').addEventListener('click', resume);
  $('stop').addEventListener('click', stop);

  const beforeUnload = (e: BeforeUnloadEvent) => { if (o.trialCount() || runState !== 'idle') e.preventDefault(); };
  window.addEventListener('beforeunload', beforeUnload);

  updateButtons();
  createPeer();
  if (o.autoDemo) beginDemo();

  return {
    get source() { return source; },
    get runState() { return runState; },
    updateButtons,
    restartDemo() { if (source === 'demo' && runState === 'idle') beginDemo(); },
    destroy() {
      destroyed = true;
      stopDemo?.();
      conn?.close();
      peer?.destroy();
      window.removeEventListener('beforeunload', beforeUnload);
    },
  };
}

/** 清除全部紀錄的確認。 */
export function confirmClear(): boolean {
  return confirm('確定要清除所有紀錄嗎？尚未匯出的數據將會遺失。');
}
