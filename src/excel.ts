import * as XLSX from 'xlsx';
import { stats } from './analysis';

export interface TrialRecord {
  index: number;
  length: number;
  period: number;
  g: number;
  axis: string;
  duration: number;
  strength: number;
  source: 'demo' | 'phone';
  startedAt: Date;
  /** 每列 [t(s), 分段, ωx, ωy, ωz] */
  rows: number[][];
}

const r = (v: number, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

export function buildWorkbook(trials: TrialRecord[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const anyDemo = trials.some((t) => t.source === 'demo');
  const info: (string | number | null)[][] = [
    ['手機物理實驗室｜單擺測 g'],
    [],
    ['項目', '內容'],
    ['資料來源', anyDemo ? (trials.every((t) => t.source === 'demo') ? '示範（合成資料，非實際量測）' : '混合：含示範（合成資料）與手機量測') : '手機陀螺儀（DeviceMotion rotationRate）'],
    ['匯出時間', new Date().toLocaleString('zh-TW', { hour12: false })],
    ['輪數', trials.length],
    ['週期分析方法', '取擺動最明顯的角速度軸，重新取樣為 100 Hz 後計算自相關，第一個正峰位置（拋物線內插）即為週期 T'],
    ['重力加速度公式', 'g = 4π²L / T²（小角度近似）'],
    ['角速度單位', 'deg/s'],
    ['時間 t', '自本輪開始起算的秒數（手機時鐘）；暫停期間不記錄，分段編號在每次繼續時加一'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols'] = [{ wch: 16 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, '說明');

  const head = ['輪次', '擺長 L (m)', '週期 T (s)', '頻率 f (Hz)', 'g (m/s²)', '分析軸', '量測時長 (s)', '樣本數', '自相關峰值', '來源', '開始時間'];
  const body = trials.map((t) => [
    t.index, r(t.length, 4), r(t.period, 5), r(1 / t.period, 5), r(t.g, 4), t.axis, r(t.duration, 2), t.rows.length, r(t.strength, 3),
    t.source === 'demo' ? '示範' : '手機', t.startedAt.toLocaleTimeString('zh-TW', { hour12: false }),
  ]);
  const sT = stats(trials.map((t) => t.period));
  const sG = stats(trials.map((t) => t.g));
  const summary = [
    head, ...body, [],
    ['統計', '', 'T', '', 'g'],
    ['平均', '', r(sT.mean, 5), '', r(sG.mean, 4)],
    ['樣本標準差', '', sT.sd === null ? null : r(sT.sd, 5), '', sG.sd === null ? null : r(sG.sd, 4)],
    ['平均值標準誤', '', sT.sem === null ? null : r(sT.sem, 5), '', sG.sem === null ? null : r(sG.sem, 4)],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(summary);
  wsSum['!cols'] = head.map((h) => ({ wch: Math.max(10, h.length * 2) }));
  XLSX.utils.book_append_sheet(wb, wsSum, '多輪摘要');

  for (const t of trials) {
    const ws = XLSX.utils.aoa_to_sheet([
      ['t (s)', '分段', 'ωx (deg/s)', 'ωy (deg/s)', 'ωz (deg/s)'],
      ...t.rows.map((row) => [r(row[0], 4), row[1], r(row[2], 3), r(row[3], 3), r(row[4], 3)]),
    ]);
    ws['!cols'] = [{ wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, `第${t.index}輪原始數據${t.source === 'demo' ? '(示範)' : ''}`);
  }
  return wb;
}

export function downloadWorkbook(trials: TrialRecord[]): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `單擺測g_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${trials.some((t) => t.source === 'demo') ? '_示範' : ''}.xlsx`;
  XLSX.writeFile(buildWorkbook(trials), name, { compression: true });
  return name;
}
