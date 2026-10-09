import { CATEGORIES, EXPERIMENTS, type Category } from './catalog';
import { icon } from './icons';
import { footer, header } from './layout';

function wavePath(w: number, h: number, x0: number, y0: number, cycles: number, decay: number, amp: number): string {
  let d = '';
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const y = y0 + h / 2 - amp * h * Math.exp(-decay * t) * Math.cos(2 * Math.PI * cycles * t);
    d += `${i ? 'L' : 'M'}${(x0 + t * w).toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export function renderHome(root: HTMLElement): void {
  const avail = EXPERIMENTS.filter((e) => e.available).length;
  root.innerHTML = `<div class="page"><div class="holes"></div>
${header()}
<main>
<section class="hero">
  <div>
    <div class="label">Experiment 00 · 實驗目的</div>
    <h1>一支手機，<br>就是一整間<span class="circ">實驗室<svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true"><path d="M18 52 C14 18 120 6 176 26 C206 38 196 82 120 90 C60 96 10 84 14 52 C16 34 50 20 80 16" fill="none" stroke="var(--red)" stroke-width="2.6" stroke-linecap="round"/></svg></span></h1>
    <div class="aside-note">↖ 加速度計、陀螺儀、麥克風、相機都在裡面</div>
    <p class="tagline">手機負責量測，電腦即時繪圖與分析，<mark>免安裝、免登入、資料不上傳伺服器</mark>。掃描 QR Code 後即可開始記錄，並一鍵匯出 Excel 寫進實驗報告。</p>
    <div class="btns">
      <a class="btn primary" href="#/lab/pendulum">進入實驗室 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg></a>
      <a class="btn" href="#/lab/pendulum/demo">試用示範 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/></svg></a>
    </div>
  </div>
  <figure class="fig">
    <svg viewBox="0 0 520 280" fill="none" role="img" aria-label="單擺角位移隨時間衰減的示意圖">
      <defs><pattern id="mm" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0V10H0" stroke="rgba(200,55,45,.14)"/></pattern><pattern id="cm" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0V50H0" stroke="rgba(200,55,45,.3)"/></pattern></defs>
      <rect x="40" y="10" width="470" height="240" fill="url(#mm)"/><rect x="40" y="10" width="470" height="240" fill="url(#cm)"/>
      <path d="M40 10V250M40 130H510" stroke="var(--text)" stroke-width="1.4"/>
      <path d="${wavePath(460, 230, 44, 15, 6, 1.4, 0.45)}" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round"/>
      <ellipse cx="121" cy="46" rx="12" ry="9" stroke="var(--red)" stroke-width="1.8"/><ellipse cx="198" cy="65" rx="12" ry="9" stroke="var(--red)" stroke-width="1.8"/>
      <path d="M121 30 V20 H198 V48" stroke="var(--red)" stroke-width="1.4" stroke-dasharray="4 3"/>
      <g font-family="Courier Prime,monospace" font-size="12" fill="var(--muted)"><text x="6" y="16">+30°</text><text x="22" y="134">0</text><text x="6" y="250">−30°</text><text x="478" y="268">t / s</text></g>
    </svg>
    <span class="hw" style="left:150px;top:4px">T ≈ 1.42 s</span>
    <span class="hw" style="right:36px;top:52px;transform:rotate(-3deg)">振幅逐漸衰減 → 有阻尼！</span>
    <figcaption><span>圖 1　單擺角位移 θ–t（示意）</span><span class="hand red">g = 4π²L / T²</span></figcaption>
  </figure>
</section>

<section id="exps">
  <h2><span class="no">01</span>實驗目錄</h2>
  <p class="sub">共 ${EXPERIMENTS.length} 個實驗，目前開放 ${avail} 個，其餘陸續推出。點選分頁或輸入關鍵字篩選。</p>
  <div class="toolbar">
    <div class="tabs" role="tablist">${(['全部', ...CATEGORIES] as const).map((c, i) => `<button role="tab" data-cat="${c}" class="${i ? '' : 'active'}" aria-selected="${!i}">${c}<span class="cnt">${c === '全部' ? EXPERIMENTS.length : EXPERIMENTS.filter((e) => e.category === c).length}</span></button>`).join('')}</div>
    <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20l3.5-1 11-11-2.5-2.5-11 11z"/><path d="M14.5 6.5l3 3"/></svg><input id="search" type="search" placeholder="查詢實驗名稱或感測器…" aria-label="搜尋實驗"></label>
  </div>
  <div class="tbl-wrap">
    <table class="cat-table"><thead><tr><th>No.</th><th>實驗名稱</th><th class="desc">說明</th><th>感測器</th><th>關鍵公式</th><th>分類</th><th></th></tr></thead><tbody id="exp-rows"></tbody></table>
    <div class="tbl-foot"><span>※ 所有數據皆可匯出為 .xlsx</span><span class="hand red">先從「單擺測 g」開始吧 ★</span></div>
  </div>
</section>

<section id="how">
  <h2><span class="no">02</span>使用方式</h2>
  <p class="sub">準備器材：一台電腦、一支有陀螺儀的手機，兩者都能連上網路即可。</p>
  <div class="proc">
    <div class="s"><span class="n">1</span><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="10" width="52" height="34" rx="3"/><path d="M22 54h20M32 44v10"/><path d="M14 33 q5-14 10 0 t10 0 t10 0" stroke="var(--red)"/></svg><h3>電腦開啟網站</h3><p>在電腦上選擇實驗，畫面會顯示一組配對用的 QR Code。投影到大螢幕，全班都看得到。</p></div>
    <div class="s"><span class="n">2</span><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="4" width="28" height="56" rx="5"/><rect x="24" y="16" width="7" height="7"/><rect x="34" y="16" width="7" height="7"/><rect x="24" y="27" width="7" height="7"/><path d="M35 28h5v5M35 34h2" stroke="var(--red)"/><path d="M28 52h8"/></svg><h3>手機掃描 QR Code</h3><p>手機開啟感測頁面並自動連線，點一下「啟用感測器」允許權限即可。</p></div>
    <div class="s"><span class="n">3</span><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="48" height="52" rx="2"/><path d="M8 18h48M8 30h48M8 42h48M24 6v52M40 6v52"/><path d="M42 50l4 4 9-11" stroke="var(--red)"/></svg><h3>量測並匯出 Excel</h3><p>即時繪圖、自動算出週期與 g，多輪比較平均與標準差，最後一鍵匯出 Excel。</p></div>
  </div>
</section>
</main>
${footer()}
</div>`;

  const rows = root.querySelector<HTMLTableSectionElement>('#exp-rows')!;
  let cat: '全部' | Category = '全部';
  let q = '';
  const draw = () => {
    const list = EXPERIMENTS.filter((e) => (cat === '全部' || e.category === cat) && (!q || `${e.name}${e.summary}${e.sensor}${e.category}`.toLowerCase().includes(q.toLowerCase())));
    rows.innerHTML = list.length
      ? list.map((e) => {
          const no = 'E-' + String(EXPERIMENTS.indexOf(e) + 1).padStart(2, '0');
          return `<tr class="${e.available ? 'avail' : 'soon'}"><td class="id">${no}</td><td class="name"><div>${icon(e.icon)}${e.name}</div></td><td class="desc">${e.summary}</td><td><span class="tag">${e.sensor}</span></td><td class="f">${e.formula}</td><td class="cat">${e.category}</td><td class="status">${e.available ? `<a class="btn small primary" href="#/lab/${e.id}">開始 →</a>` : '<span class="soon-badge">即將推出</span>'}</td></tr>`;
        }).join('')
      : '<tr class="empty"><td colspan="7">目錄裡沒有這個實驗，換個關鍵字試試。</td></tr>';
  };
  root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      cat = b.dataset.cat as typeof cat;
      root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      draw();
    }),
  );
  root.querySelector<HTMLInputElement>('#search')!.addEventListener('input', (e) => { q = (e.target as HTMLInputElement).value.trim(); draw(); });
  draw();
}
