import Peer, { type DataConnection } from 'peerjs';
import { esc, SITE_NAME } from './layout';
import { isValidCode, PEER_DEBUG, PEER_PREFIX, type DeskMsg, type PhoneMsg, type SensorState } from './protocol';

type DMEWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function renderSensor(root: HTMLElement, rawCode: string): void {
  const code = rawCode.trim().toUpperCase();
  const DME = (window as unknown as { DeviceMotionEvent?: DMEWithPermission }).DeviceMotionEvent;
  const needsPermission = typeof DME?.requestPermission === 'function';

  root.innerHTML = `<div class="sensor-page">
  <div class="label">手機感測端 · SENSOR</div>
  <h1>${SITE_NAME}</h1>
  <div class="muted" style="font-size:15px">實驗：<b id="exp-name" style="color:var(--ink)">單擺測 g</b>　配對碼：<span class="mono" style="color:var(--ink);letter-spacing:.15em">${esc(code)}</span></div>
  <div class="big-status"><span class="dot wait" id="dot"></span><span id="status">連線中…</span></div>
  <div class="hint" id="detail" style="margin:0 0 12px">正在連線到電腦端。</div>
  <div id="rec" class="rec-banner" hidden>● 電腦正在記錄</div>
  <button class="btn primary" id="enable" type="button">啟用感測器</button>
  <button class="btn" id="retry" type="button" hidden style="margin-top:10px">重新連線</button>
  <div class="vals"><div><small>ωx</small><b id="vx">—</b></div><div><small>ωy</small><b id="vy">—</b></div><div><small>ωz</small><b id="vz">—</b></div></div>
  <dl class="kv"><dt>取樣率</dt><dd id="rate">—</dd><dt>已傳送</dt><dd id="sent">0 筆</dd><dt>螢幕常亮</dt><dd id="wake">—</dd></dl>
  <div class="tips"><b>小提醒</b><ul style="margin:4px 0 0;padding-left:20px">
    <li>量測期間請保持此頁面在前景，不要鎖定螢幕。</li>
    <li>將手機牢固地綁在擺錘上，讓擺動平面固定。</li>
    <li>單位為 deg/s；電腦會自動選擇擺動最明顯的軸。</li>
  </ul></div>
</div>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const setStatus = (cls: 'ok' | 'wait' | 'bad', text: string, detail?: string) => {
    $('dot').className = 'dot ' + cls;
    $('status').textContent = text;
    if (detail !== undefined) $('detail').textContent = detail;
  };

  if (!isValidCode(code)) {
    setStatus('bad', '配對碼無效', '請回到電腦畫面，重新掃描 QR Code。');
    $('enable').hidden = true;
    return;
  }
  if (!window.isSecureContext) {
    setStatus('bad', '需要 HTTPS 連線', '瀏覽器只在 HTTPS 網址下提供動作感測器，請使用正式網址開啟。');
  }

  // ---------- 感測器 ----------
  let sensorState: SensorState = 'waiting-permission';
  let buffer: number[] = [];
  let seq = 0;
  let sent = 0;
  let gotRotation = false;
  const stamps: number[] = [];
  let last: [number, number, number] | null = null;

  const onMotion = (e: DeviceMotionEvent) => {
    const r = e.rotationRate;
    if (!r || r.alpha === null || r.beta === null || r.gamma === null) return;
    gotRotation = true;
    const t = e.timeStamp || performance.now();
    buffer.push(t, r.beta, r.gamma, r.alpha);
    last = [r.beta, r.gamma, r.alpha];
    stamps.push(t);
    while (stamps.length && stamps[0] < t - 2000) stamps.shift();
  };
  const rate = () => (stamps.length > 1 ? ((stamps.length - 1) * 1000) / (stamps[stamps.length - 1] - stamps[0]) : 0);

  async function enable() {
    try {
      if (needsPermission) {
        const res = await DME!.requestPermission!();
        if (res !== 'granted') {
          sensorState = 'denied';
          setStatus('bad', '未取得感測器權限', 'iPhone：請到「設定 › Safari › 動作與方向取用」開啟後重新整理此頁。');
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
    $('enable').hidden = true;
    void requestWake();
    setTimeout(() => {
      if (!gotRotation) {
        sensorState = 'no-sensor';
        setStatus('bad', '讀不到陀螺儀數據', '這支手機可能沒有陀螺儀，或瀏覽器封鎖了感測器。');
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
  const sendStatus = () => send({ type: 'status', state: sensorState, rate: rate() || undefined });
  function updateConnStatus() {
    if (!conn?.open) return;
    if (sensorState === 'streaming') setStatus('ok', '已連線，串流中', '把手機固定在擺錘上，接著在電腦按「開始」。');
    else if (sensorState === 'waiting-permission') setStatus('wait', '已連線電腦', '請按下方「啟用感測器」。');
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
        send({ type: 'hello', ua: navigator.userAgent, needsPermission });
        sendStatus();
        updateConnStatus();
      });
      c.on('data', (raw) => {
        const m = raw as DeskMsg;
        if (m.type === 'welcome') $('exp-name').textContent = m.experiment;
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

  // 每 80 ms 傳送一批；未連線時只保留最近 2 秒
  setInterval(() => {
    if (!buffer.length) return;
    if (conn?.open) {
      send({ type: 'samples', seq: seq++, data: buffer });
      sent += buffer.length / 4;
      buffer = [];
    } else if (buffer.length > 4 * 200) {
      buffer = buffer.slice(-4 * 200);
    }
  }, 80);
  setInterval(() => {
    if (last) { $('vx').textContent = last[0].toFixed(1); $('vy').textContent = last[1].toFixed(1); $('vz').textContent = last[2].toFixed(1); }
    const r = rate();
    $('rate').textContent = r ? `${r.toFixed(0)} Hz` : '—';
    $('sent').textContent = `${sent.toLocaleString('zh-TW')} 筆`;
  }, 250);
  setInterval(() => { if (sensorState === 'streaming') sendStatus(); }, 2000);
}
