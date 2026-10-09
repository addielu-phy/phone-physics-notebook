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

export type PhoneMsg =
  | { type: 'hello'; ua: string; needsPermission: boolean }
  | { type: 'status'; state: SensorState; rate?: number; detail?: string }
  /** data：攤平成 [t(ms), ωx, ωy, ωz, t, ωx, …]；ω 單位 deg/s（DeviceMotion rotationRate 的 beta, gamma, alpha）。 */
  | { type: 'samples'; seq: number; data: number[] };

export type DeskMsg =
  | { type: 'welcome'; experiment: string }
  | { type: 'recording'; state: 'idle' | 'running' | 'paused' };

/** 在網址加上 ?debug 可開啟 PeerJS 除錯訊息（輸出到主控台）。 */
export const PEER_DEBUG: 0 | 3 = new URLSearchParams(location.search).has('debug') ? 3 : 0;
