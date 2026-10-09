export type Category = '力學' | '聲音' | '光學' | '環境' | '自訂';

export interface Experiment {
  id: string;
  name: string;
  category: Category;
  sensor: string;
  icon: IconKey;
  summary: string;
  formula: string;
  available: boolean;
}

export type IconKey =
  | 'pendulum' | 'spring' | 'rotate' | 'spectrum' | 'stopwatch' | 'bounce'
  | 'camera' | 'gps' | 'custom' | 'accel' | 'gyro' | 'tilt' | 'history'
  | 'color' | 'magnet' | 'light' | 'motion';

export const CATEGORIES: Category[] = ['力學', '聲音', '光學', '環境', '自訂'];

export const EXPERIMENTS: Experiment[] = [
  { id: 'pendulum', name: '單擺測 g', category: '力學', sensor: '陀螺儀', icon: 'pendulum', summary: '由擺動週期反推重力加速度，可多輪量測並計算平均與標準差。', formula: 'g = 4π²L / T²', available: true },
  { id: 'acceleration', name: '加速度', category: '力學', sensor: '加速度計', icon: 'accel', summary: '即時顯示 x、y、z 三軸與合加速度隨時間的變化。', formula: '|a| = √(ax² + ay² + az²)', available: false },
  { id: 'angular-velocity', name: '角速度', category: '力學', sensor: '陀螺儀', icon: 'gyro', summary: '觀察手機繞三軸轉動時的角速度曲線。', formula: 'ω = dθ / dt', available: false },
  { id: 'tilt', name: '傾角', category: '力學', sensor: '加速度計', icon: 'tilt', summary: '由重力方向求出手機的傾斜角，可用於斜面實驗。', formula: 'θ = atan(ax / az)', available: false },
  { id: 'spring', name: '彈簧振動', category: '力學', sensor: '加速度計', icon: 'spring', summary: '量測彈簧振子的週期與頻率，觀察簡諧運動。', formula: 'T = 2π√(m / k)', available: false },
  { id: 'spring-constant', name: '彈簧常數', category: '力學', sensor: '加速度計', icon: 'spring', summary: '改變懸掛質量，由 T²–m 圖的斜率求出彈力常數 k。', formula: 'k = 4π² / 斜率', available: false },
  { id: 'accel-spectrum', name: '加速度頻譜', category: '力學', sensor: '加速度計', icon: 'spectrum', summary: '對振動訊號做頻譜分析，找出主要振動頻率。', formula: 'FFT → f₀', available: false },
  { id: 'vibration-history', name: '振動歷史', category: '力學', sensor: '加速度計', icon: 'history', summary: '以熱圖呈現振動頻率隨時間的變化。', formula: 'f(t)', available: false },
  { id: 'centripetal', name: '向心加速度', category: '力學', sensor: '加速度計＋陀螺儀', icon: 'rotate', summary: '手機放在轉盤上，同時量測 ω 與 a，驗證 a = ω²r。', formula: 'a = ω²r', available: false },
  { id: 'centripetal-fit', name: '向心半徑擬合', category: '力學', sensor: '加速度計＋陀螺儀', icon: 'rotate', summary: '以多個轉速點做 a–ω² 線性擬合，由斜率求出半徑。', formula: 'r = 斜率', available: false },
  { id: 'motion-timer', name: '運動觸發秒錶', category: '力學', sensor: '加速度計', icon: 'motion', summary: '加速度超過門檻時自動計時，量測運動的時間間隔。', formula: 'Δt = t₂ − t₁', available: false },
  { id: 'sound-spectrum', name: '聲音頻譜', category: '聲音', sensor: '麥克風', icon: 'spectrum', summary: '即時分析聲音頻率，看見音叉、樂器與人聲的基頻與泛音。', formula: 'f₀, 2f₀, 3f₀ …', available: false },
  { id: 'sound-history', name: '聲音歷史', category: '聲音', sensor: '麥克風', icon: 'history', summary: '記錄主頻率隨時間的變化，觀察都卜勒效應或滑音。', formula: 'f(t)', available: false },
  { id: 'sound-timer', name: '聲控秒錶', category: '聲音', sensor: '麥克風', icon: 'stopwatch', summary: '以拍手聲觸發開始與停止，適合量測自由落體時間。', formula: 'Δt = t₂ − t₁', available: false },
  { id: 'bounce', name: '反彈碰撞', category: '聲音', sensor: '麥克風', icon: 'bounce', summary: '由球落地聲的時間間隔，推算反彈高度與恢復係數。', formula: 'h = g·Δt² / 8', available: false },
  { id: 'camera-brightness', name: '相機亮度', category: '光學', sensor: '相機', icon: 'camera', summary: '量測畫面中央亮度，探討光強與距離的關係。', formula: 'I ∝ 1 / r²', available: false },
  { id: 'camera-color', name: '顏色分析', category: '光學', sensor: '相機', icon: 'color', summary: '讀取畫面中央的 RGB 數值，觀察顏色與濾光片。', formula: '(R, G, B)', available: false },
  { id: 'optical-timer', name: '光學秒錶', category: '光學', sensor: '相機', icon: 'stopwatch', summary: '物體遮住鏡頭時觸發計時，可當作光電閘使用。', formula: 'Δt = t₂ − t₁', available: false },
  { id: 'gps', name: 'GPS 運動', category: '環境', sensor: 'GPS 定位', icon: 'gps', summary: '記錄位置、速率與累積路程，畫出運動軌跡。', formula: 'v = Δs / Δt', available: false },
  { id: 'magnetic', name: '磁場', category: '環境', sensor: '磁力計', icon: 'magnet', summary: '量測周遭磁場強度（僅支援部分 Android 瀏覽器）。', formula: 'B (μT)', available: false },
  { id: 'illuminance', name: '照度', category: '環境', sensor: '環境光感測器', icon: 'light', summary: '量測環境照度（僅支援部分 Android 瀏覽器）。', formula: 'E (lx)', available: false },
  { id: 'custom', name: '教師自訂實驗', category: '自訂', sensor: '任選感測器', icon: 'custom', summary: '自選感測器與分析方式，設計自己的探究活動。', formula: 'y = f(x)', available: false },
];
