import type { IconKey } from './catalog';

const PATHS: Record<IconKey, string> = {
  pendulum: '<line x1="8" y1="6" x2="40" y2="6"/><line x1="24" y1="6" x2="33" y2="33"/><circle cx="34.5" cy="37" r="5"/><path d="M13 31 Q24 41 35 31" stroke-dasharray="2 3.5"/>',
  spring: '<line x1="10" y1="4" x2="38" y2="4"/><path d="M24 4 v4 l-8 3 l16 4 l-16 4 l16 4 l-16 4 l8 3 v3"/><rect x="16" y="34" width="16" height="10" rx="2"/>',
  rotate: '<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="2.5"/><line x1="24" y1="24" x2="34" y2="14"/><circle cx="35.5" cy="12.5" r="3.2"/>',
  spectrum: '<path d="M6 42 V30 M12 42 V18 M18 42 V26 M24 42 V8 M30 42 V22 M36 42 V32 M42 42 V37"/>',
  stopwatch: '<circle cx="24" cy="27" r="15"/><line x1="24" y1="27" x2="24" y2="18"/><line x1="24" y1="27" x2="30" y2="30"/><line x1="19" y1="5" x2="29" y2="5"/><line x1="24" y1="5" x2="24" y2="12"/>',
  bounce: '<circle cx="39" cy="10" r="4"/><path d="M4 10 Q9 44 15 44 Q21 18 27 44 Q31 28 35 44 Q37.5 38 40 44"/><line x1="2" y1="45.5" x2="46" y2="45.5"/>',
  camera: '<rect x="5" y="14" width="38" height="26" rx="4"/><circle cx="24" cy="27" r="7.5"/><path d="M16 14 l3-5 h10 l3 5"/>',
  gps: '<path d="M24 44 C24 44 10 29 10 19 a14 14 0 0 1 28 0 C38 29 24 44 24 44Z"/><circle cx="24" cy="19" r="5"/>',
  custom: '<rect x="6" y="6" width="36" height="36" rx="5"/><line x1="24" y1="15" x2="24" y2="33"/><line x1="15" y1="24" x2="33" y2="24"/>',
  accel: '<path d="M6 40 L42 40 M6 40 L6 6"/><path d="M10 36 C20 34 28 24 40 10"/><path d="M33 10 h7 v7"/>',
  gyro: '<ellipse cx="24" cy="24" rx="18" ry="8"/><ellipse cx="24" cy="24" rx="8" ry="18"/><circle cx="24" cy="24" r="3"/>',
  tilt: '<path d="M4 42 H44 L4 18 Z"/><rect x="14" y="20" width="12" height="7" transform="rotate(31 20 24)"/><path d="M34 42 A12 12 0 0 0 31 34"/>',
  history: '<path d="M6 42 H42 M6 42 V6"/><path d="M10 34 h6 v-6 h6 v-8 h6 v4 h6 v-10 h6"/>',
  color: '<circle cx="18" cy="18" r="10"/><circle cx="30" cy="18" r="10"/><circle cx="24" cy="29" r="10"/>',
  magnet: '<path d="M12 6 v18 a12 12 0 0 0 24 0 V6 h-8 v18 a4 4 0 0 1 -8 0 V6 Z"/><line x1="12" y1="13" x2="20" y2="13"/><line x1="28" y1="13" x2="36" y2="13"/>',
  light: '<circle cx="24" cy="24" r="8"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M10 38l4-4M34 14l4-4"/>',
  motion: '<path d="M8 34 h10 l4-12 l6 20 l4-14 h8"/><circle cx="38" cy="12" r="5"/>',
};

export function icon(key: IconKey, cls = 'ico'): string {
  return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[key]}</svg>`;
}
