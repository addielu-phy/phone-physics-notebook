import Peer, { type DataConnection } from 'peerjs';
import { EXPERIMENTS } from './catalog';
import { esc, SITE_NAME } from './layout';
import { EXP_KIND, isValidCode, KIND_STRIDE, PEER_DEBUG, PEER_PREFIX, type DeskMsg, type PhoneMsg, type SensorKind, type SensorState } from './protocol';

type DMEWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

interface KindUI { sensor: string; labels: [string, string, string]; unitNote: string }
const KIND_UI: Record<SensorKind, KindUI> = {
  gyro: { sensor: '陀螺儀', labels: ['ωx', 'ωy', 'ωz'], unitNote: '單位為 deg/s；電腦會自動選擇擺動最明顯的軸。' },
  accel: { sensor: '加速度計', labels: ['ax', 'ay', 'az'], unitNote: '單位為 m/s²（含重力）；靜止平放時 az 約為 9.8。' },
  motion: { sensor: '加速度計＋陀螺儀', labels: ['a水平', '|ω|', '傾角(靜止)'], unitNote: 'a水平 單位 m/s²、|ω| 單位 rad/s；傾角應小於 5°（手機要平放）。' },
  audio: { sensor: '麥克風', labels: ['主頻 Hz', '音量 dB', '頻寬'], unitNote: '頻譜在手機上計算，只把頻譜傳到電腦，不傳送錄音。' },
};

const EXP_TIPS: Record<string, string[]> = {
  pendulum: ['將手機牢固地綁在擺錘上，讓擺動平面固定。'],
  spring: ['把手機放進夾鏈袋或手機套，牢牢掛在彈簧下端。', '只沿鉛直方向上下振動，避免左右搖晃。'],
  centripetal: ['手機螢幕朝上平放在轉盤上，用膠帶固定，不要放在轉軸正中央。', '量好轉軸到手機中心的距離 r，輸入到電腦。'],
  'sound-spectrum': ['手機麥克風（通常在底部）對準聲源，距離約 10–30 cm。', '保持環境安靜；敲音叉或吹奏一個穩定的音即可。'],
};

export function renderSensor(root: HTMLElement, rawCode: string, expParam: string | null): void {
  const code = rawCode.trim().toUpperCase();
  const DME = (window as unknown as { DeviceMotionEvent?: DMEWithPermission }).DeviceMotionEvent;
  let expId = expParam && EXP_KIND[expParam] ? expParam : 'pendulum';
  let kind: SensorKind = EXP_KIND[expId];
  const needsMotionPermission = () => kind !== 'audio' && typeof DME?.requestPermission === 'function';
  const expName = (id: string) => EXPERIMENTS.find((e) => e.id === id)?.name ?? '單擺測 g';

  root.innerHTML = `<div class="sensor-page">
  <div class="label">手機感測端 · SENSOR</div>
  <h1>${SITE_NAME}</h1>
  <div class="muted" style="font-size:15px">實驗：<b id="exp-name" style="color:var(--ink)">${esc(expName(expId))}</b>　配對碼：<span class="mono" style="color:var(--ink);letter-spacing:.15em">${esc(code)}</span></div>
  <div class="muted" style="font-size:14px">使用感測器：<span id="kind-name">${KIND_UI[kind].sensor}</span></div>
  <div class="big-status"><span class="dot wait" id="dot"></span><span id="status">連線中…</span></div>
  <div class="hint" id="detail" style="margin:0 0 12px">正在連線到電腦端。</div>
  <div id="rec" class="rec-banner" hidden>● 電腦正在記錄</div>
  <button class="btn primary" id="enable" type="button">啟用感測器</button>
  <button class="btn" id="retry" type="button" hidden style="margin-top:10px">重新連線</button>
  <div class="vals"><div><small id="l0"></small><b id="vx">—</b></div><div><small id="l1"></small><b id="vy">—</b></div><div><small id="l2"></small><b id="vz">—</b></div></div>
  <dl class="kv"><dt>取樣率</dt><dd id="rate">—</dd><dt>已傳送</dt><dd id="sent">0 筆</dd><dt>螢幕常亮</dt><dd id="wake">—</dd></dl>
  <div class="tips"><b>小提醒</b><ul style="margin:4px 0 0;padding-left:20px" id="tips"></ul></div>
</div>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const setStatus = (cls: 'ok' | 'wait' | 'bad', text: string, detail?: string) => {
    $('dot').className = 'dot ' + cls;
    $('status').textContent = text;
    if (detail !== undefined) $('detail').textContent = detail;
  };
  function applyKindUI() {
    const ui = KIND_UI[kind];
    $('exp-name').textContent = expName(expId);
    $('kind-name').textContent = ui.sensor;
    ui.labels.forEach((l, i) => ($('l' + i).textContent = l));
    $('enable').textContent = kind === 'audio' ? '啟用麥克風' : '啟用感測器';
    $('tips').innerHTML = ['量測期間請保持此頁面在前景，不要鎖定螢幕。', ...(EXP_TIPS[expId] ?? []), ui.unitNote].map((s) => `<li>${esc(s)}</li>`).join('');
  }
  applyKindUI();

  if (!isValidCode(code)) {
    setStatus('bad', '配對碼無效', '請回到電腦畫面，重新掃描 QR Code。');
    $('enable').hidden = true;
    return;
  }
  if (!window.isSecureContext) {
    setStatus('bad', '需要 HTTPS 連線', '瀏覽器只在 HTTPS 網址下提供感測器與麥克風，請使用正式網址開啟。');
  }

  // ---------- 感測器 ----------
  let sensorState: SensorState = 'waiting-permission';
  let enabled = false;
  let buffer: number[] = [];
  let seq = 0;
  let sent = 0;
  let gotData = false;
  const stamps: number[] = [];
  let last: [string, string, string] | null = null;
  const stamp = (t: number) => {
    stamps.push(t);
    while (stamps.length && stamps[0] < t - 2000) stamps.shift();
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const t = e.timeStamp || performance.now();
    if (kind === 'gyro') {
      const r = e.rotationRate;
      if (!r || r.alpha === null || r.beta === null || r.gamma === null) return;
      buffer.push(t, r.beta, r.gamma, r.alpha);
      last = [r.beta.toFixed(1), r.gamma.toFixed(1), r.alpha.toFixed(1)];
    } else if (kind === 'accel') {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      buffer.push(t, a.x, a.y, a.z);
      last = [a.x.toFixed(2), a.y.toFixed(2), a.z.toFixed(2)];
    } else if (kind === 'motion') {
      const a = e.accelerationIncludingGravity, r = e.rotationRate;
      if (!a || a.x === null || a.y === null || a.z === null || !r || r.alpha === null || r.beta === null || r.gamma === null) return;
      buffer.push(t, a.x, a.y, a.z, r.beta, r.gamma, r.alpha);
      const g = Math.hypot(a.x, a.y, a.z) || 1;
      const w = (Math.hypot(r.alpha, r.beta, r.gamma) * Math.PI) / 180;
      last = [Math.hypot(a.x, a.y).toFixed(2), w.toFixed(2), `${((Math.acos(Math.min(1, Math.abs(a.z) / g)) * 180) / Math.PI).toFixed(1)}°`];
    } else return;
    gotData = true;
    stamp(t);
  };
  const rate = () => (stamps.length > 1 ? ((stamps.length - 1) * 1000) / (stamps[stamps.length - 1] - stamps[0]) : 0);

  // ---------- 麥克風 ----------
  let audioStop: (() => void) | null = null;
  async function enableAudio(): Promise<boolean> {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      sensorState = 'no-sensor';
      setStatus('bad', '此瀏覽器無法使用麥克風', '請確認以 HTTPS 正式網址開啟，並使用 Safari 或 Chrome。');
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (err) {
      const name = (err as { name?: string }).name;
      sensorState = name === 'NotFoundError' ? 'no-sensor' : 'denied';
      setStatus('bad', name === 'NotFoundError' ? '找不到麥克風' : '未取得麥克風權限', 'iPhone：設定 › Safari › 麥克風 改為「詢問」或「允許」；Android：網址列左側的權限圖示 › 麥克風 › 允許，然後重新整理此頁。');
      return false;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume().catch(() => undefined);
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 8192;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    const fbuf = new Float32Array(an.frequencyBinCount);
    const tbuf = new Float32Array(an.fftSize);
    const id = window.setInterval(() => {
      if (ctx.state === 'suspended') void ctx.resume();
      an.getFloatFrequencyData(fbuf);
      an.getFloatTimeDomainData(tbuf);
      const binHz = ctx.sampleRate / an.fftSize;
      const nMax = Math.min(fbuf.length, Math.ceil(5000 / binHz) + 1);
      const db = new Array<number>(nMax);
      let pk = 3;
      for (let i = 0; i < nMax; i++) {
        const v = fbuf[i];
        db[i] = Number.isFinite(v) ? Math.max(-140, Math.round(v)) : -140;
        if (i >= 3 && fbuf[i] > fbuf[pk]) pk = i;
      }
      let s = 0;
      for (let i = 0; i < tbuf.length; i++) s += tbuf[i] * tbuf[i];
      const level = 10 * Math.log10(s / tbuf.length || 1e-14);
      const t = performance.now();
      stamp(t);
      gotData = true;
      last = [(pk * binHz).toFixed(0), level.toFixed(0), `${binHz.toFixed(1)}`];
      const msg: PhoneMsg = { type: 'spectrum', seq: seq++, t, binHz, db, level: Math.round(level * 10) / 10 };
      if (conn?.open) { conn.send(msg); sent += 1; }
    }, 100);
    audioStop = () => { clearInterval(id); stream.getTracks().forEach((tr) => tr.stop()); void ctx.close(); };
    return true;
  }

  async function enable() {
    if (kind === 'audio') {
      $<HTMLButtonElement>('enable').disabled = true;
      const ok = await enableAudio();
      $<HTMLButtonElement>('enable').disabled = false;
      if (!ok) { sendStatus(); return; }
    } else {
      try {
        if (needsMotionPermission()) {
          const res = await DME!.requestPermission!();
          if (res !== 'granted') {
            sensorState = 'denied';
            setStatus('bad', '未取得感測器權限', 'iPhone：把 Safari 完全關閉後重新掃描，出現「動作與方向」詢問時按「允許」；Android：點網址列左側的權限圖示，允許「動作感應器」後重新整理。');
            sendStatus();
            return;
          }
        }
      } catch {
        sensorState = 'denied';
        setStatus('bad', '無法要求感測器權限', '請重新整理頁面後再試一次。');
        sendStatus();
        return;
      }
      if (!DME) {
        sensorState = 'no-sensor';
        setStatus('bad', '此瀏覽器不支援動作感測器');
        sendStatus();
        return;
      }
      window.addEventListener('devicemotion', onMotion);
    }
    enabled = true;
    $('enable').hidden = true;
    void requestWake();
    setTimeout(() => {
      if (!gotData) {
        sensorState = 'no-sensor';
        setStatus('bad', `讀不到${KIND_UI[kind].sensor}數據`, `這支手機可能沒有${KIND_UI[kind].sensor}，或瀏覽器封鎖了感測器。`);
      } else {
        sensorState = 'streaming';
        updateConnStatus();
      }
      sendStatus();
    }, 1500);
  }
  $('enable').addEventListener('click', enable);

  // ---------- 螢幕常亮 ----------
  type WakeLockSentinelLike = { released: boolean; release(): Promise<void>; addEventListener(t: string, f: () => void): void };
  let wake: WakeLockSentinelLike | null = null;
  async function requestWake() {
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl) { $('wake').textContent = '不支援，請手動關閉自動鎖定'; return; }
    try {
      wake = await wl.request('screen');
      $('wake').textContent = '已開啟';
      wake.addEventListener('release', () => ($('wake').textContent = '已釋放'));
    } catch {
      $('wake').textContent = '無法開啟';
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sensorState === 'streaming' && (!wake || wake.released)) void requestWake();
  });

  // ---------- 連線 ----------
  let peer: Peer | null = null;
  let conn: DataConnection | null = null;
  const send = (m: PhoneMsg) => { if (conn?.open) conn.send(m); };
  const sendStatus = () => send({ type: 'status', state: sensorState, rate: rate() || undefined, kind });
  const READY_HINT: Record<string, string> = {
    pendulum: '把手機固定在擺錘上，接著在電腦按「開始」。',
    spring: '把手機掛在彈簧下端，拉下約 2–3 cm 放手，接著在電腦按「開始」。',
    centripetal: '把手機平放固定在轉盤上，轉動轉盤並在電腦按「開始」。',
    'sound-spectrum': '讓聲源發出穩定的聲音，電腦上會即時顯示頻譜。',
  };
  function updateConnStatus() {
    if (!conn?.open) return;
    if (sensorState === 'streaming') setStatus('ok', '已連線，串流中', READY_HINT[expId] ?? '');
    else if (sensorState === 'waiting-permission') setStatus('wait', '已連線電腦', `請按下方「${kind === 'audio' ? '啟用麥克風' : '啟用感測器'}」。`);
  }
  function connect() {
    $('retry').hidden = true;
    setStatus('wait', '連線中…', '正在連線到電腦端。');
    peer?.destroy();
    peer = new Peer({ debug: PEER_DEBUG });
    peer.on('open', () => {
      const c = peer!.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      conn = c;
      c.on('open', () => {
        send({ type: 'hello', ua: navigator.userAgent, needsPermission: needsMotionPermission(), kind });
        sendStatus();
        updateConnStatus();
      });
      c.on('data', (raw) => {
        const m = raw as DeskMsg;
        if (m.type === 'welcome') {
          // 舊版 QR Code 沒有 exp 參數時，以電腦端告知的實驗為準（尚未啟用感測器才切換）
          if (!enabled && m.id && EXP_KIND[m.id] && m.id !== expId) {
            expId = m.id;
            kind = EXP_KIND[m.id];
            applyKindUI();
            updateConnStatus();
          }
          $('exp-name').textContent = m.experiment;
        }
        if (m.type === 'recording') {
          const rec = $('rec');
          rec.hidden = m.state === 'idle';
          rec.textContent = m.state === 'paused' ? '‖ 電腦已暫停記錄' : '● 電腦正在記錄';
        }
      });
      c.on('close', () => {
        setStatus('bad', '與電腦的連線中斷', '請確認電腦頁面仍開著，再按「重新連線」。');
        $('retry').hidden = false;
        $('rec').hidden = true;
      });
    });
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      $('retry').hidden = false;
      if (type === 'peer-unavailable') setStatus('bad', '找不到電腦端', '電腦頁面可能已關閉或重新整理過，請重新掃描電腦上的 QR Code。');
      else setStatus('bad', '連線失敗', '請確認手機網路正常後按「重新連線」。');
    });
  }
  $('retry').addEventListener('click', connect);
  connect();
  window.addEventListener('pagehide', () => audioStop?.());

  // 每 80 ms 傳送一批動作樣本；未連線時只保留最近 2 秒
  setInterval(() => {
    if (!buffer.length || kind === 'audio') return;
    const stride = KIND_STRIDE[kind];
    if (conn?.open) {
      send({ type: 'samples', seq: seq++, data: buffer, kind });
      sent += buffer.length / stride;
      buffer = [];
    } else if (buffer.length > stride * 200) {
      buffer = buffer.slice(-stride * 200);
    }
  }, 80);
  setInterval(() => {
    if (last) { $('vx').textContent = last[0]; $('vy').textContent = last[1]; $('vz').textContent = last[2]; }
    const r = rate();
    $('rate').textContent = r ? `${r.toFixed(0)} ${kind === 'audio' ? '幀/s' : 'Hz'}` : '—';
    $('sent').textContent = `${sent.toLocaleString('zh-TW')} ${kind === 'audio' ? '幀' : '筆'}`;
  }, 250);
  setInterval(() => { if (sensorState === 'streaming') sendStatus(); }, 2000);
}
