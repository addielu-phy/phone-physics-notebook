/** 手機與電腦之間的訊息格式（PeerJS DataConnection，JSON）。 */

export const PEER_PREFIX = 'ppnb-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(len = 6): string {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => ALPHABET[v % ALPHABET.length]).join('');
}

export const isValidCode = (c: string) => /^[A-Z2-9]{4,12}$/.test(c);

export type SensorState = 'waiting-permission' | 'streaming' | 'denied' | 'no-sensor';

/**
 * 感測模式（決定手機要讀哪個感測器、每筆樣本有幾個欄位）：
 * - gyro：[t, ωx, ωy, ωz]（deg/s）
 * - accel：[t, ax, ay, az]（m/s²，含重力 accelerationIncludingGravity）
 * - motion：[t, ax, ay, az, ωx, ωy, ωz]（加速度含重力 m/s²＋角速度 deg/s）
 * - audio：不送 samples，改送 spectrum（麥克風頻譜）
 */
export type SensorKind = 'gyro' | 'accel' | 'motion' | 'audio';

export const KIND_STRIDE: Record<Exclude<SensorKind, 'audio'>, number> = { gyro: 4, accel: 4, motion: 7 };

/** 實驗 id → 感測模式。 */
export const EXP_KIND: Record<string, SensorKind> = {
  pendulum: 'gyro',
  spring: 'accel',
  centripetal: 'motion',
  'sound-spectrum': 'audio',
};

export interface SpectrumFrame {
  type: 'spectrum';
  seq: number;
  /** 手機時鐘（ms） */
  t: number;
  /** 每個頻率格的寬度 Hz */
  binHz: number;
  /** 第 0 格起的功率頻譜（dBFS，取整數），只送到約 5 kHz */
  db: number[];
  /** 時域 RMS 音量（dBFS） */
  level: number;
}

export type PhoneMsg =
  | { type: 'hello'; ua: string; needsPermission: boolean; kind?: SensorKind }
  | { type: 'status'; state: SensorState; rate?: number; detail?: string; kind?: SensorKind }
  /** data：攤平成 [t(ms), v1, v2, …, t, v1, …]，欄位依 kind 而定（未標 kind 時視為 gyro）。 */
  | { type: 'samples'; seq: number; data: number[]; kind?: SensorKind }
  | SpectrumFrame;

export type DeskMsg =
  | { type: 'welcome'; experiment: string; kind?: SensorKind; id?: string }
  | { type: 'recording'; state: 'idle' | 'running' | 'paused' };

/** 在網址加上 ?debug 可開啟 PeerJS 除錯訊息（輸出到主控台）。 */
export const PEER_DEBUG: 0 | 3 = new URLSearchParams(location.search).has('debug') ? 3 : 0;
