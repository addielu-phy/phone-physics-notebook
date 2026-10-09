export const SITE_NAME = '手機物理實驗室';

const LOGO = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6h22l6 6v30H10z"/><path d="M32 6v6h6"/><path d="M15 32 q3-12 6 0 t6 0 t6 0" stroke="var(--red)"/><path d="M15 18h12M15 23h8"/></svg>`;
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>';

export function header(): string {
  return `<header class="site-header">
  <a class="logo" href="#/"><span>${LOGO}</span><span><b>${SITE_NAME}</b><small>LAB NOTEBOOK · VOL.1</small></span></a>
  <nav class="site-nav" aria-label="主選單"><a href="#/">首頁</a><a href="#/" data-scroll="exps">實驗目錄</a><a href="#/" data-scroll="how">使用方式</a><a href="#/lab/pendulum">單擺實驗</a>${themeButton()}</nav>
</header>`;
}

export function footer(): string {
  return `<footer class="site-footer"><span><b>${SITE_NAME}</b>　純前端・免安裝・免登入・資料不上傳伺服器</span><span>里程碑 1　·　v0.1</span></footer>`;
}

export function themeButton(): string {
  const dark = document.documentElement.dataset.theme === 'dark';
  return `<button class="theme-btn" type="button" data-theme-toggle aria-label="切換亮色／暗色主題">${dark ? SUN + '亮色' : MOON + '暗色'}</button>`;
}

export function initTheme(): void {
  const saved = localStorage.getItem('ppn-theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved ?? (prefersDark ? 'dark' : 'light');
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-theme-toggle]');
    if (!btn) return;
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ppn-theme', next);
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => (b.outerHTML = themeButton()));
    window.dispatchEvent(new CustomEvent('themechange'));
  });
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function toast(msg: string): void {
  let el = document.querySelector<HTMLDivElement>('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  window.clearTimeout(Number(el.dataset.t));
  el.dataset.t = String(window.setTimeout(() => el!.classList.remove('show'), 2600));
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
