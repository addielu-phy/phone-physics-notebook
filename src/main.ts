import './styles.css';
import { renderHome } from './home';
import { renderPendulumLab } from './lab-pendulum';
import { initTheme } from './layout';
import { renderSensor } from './sensor';

initTheme();
const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const sensorCode = params.get('sensor');
let cleanup: (() => void) | void;

function route() {
  cleanup?.();
  cleanup = undefined;
  const hash = location.hash.replace(/^#/, '') || '/';
  if (hash.startsWith('/lab/pendulum')) {
    document.title = '單擺測 g｜手機物理實驗室';
    cleanup = renderPendulumLab(root, { demo: hash === '/lab/pendulum/demo' });
  } else {
    document.title = '手機物理實驗室';
    renderHome(root);
  }
  window.scrollTo(0, 0);
}

if (sensorCode !== null) {
  document.title = '手機感測端｜手機物理實驗室';
  renderSensor(root, sensorCode);
} else {
  window.addEventListener('hashchange', route);
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-scroll]');
    if (!a) return;
    e.preventDefault();
    const go = () => document.getElementById(a.dataset.scroll!)?.scrollIntoView({ behavior: 'smooth' });
    if (location.hash && location.hash !== '#/') { location.hash = '#/'; setTimeout(go, 50); } else go();
  });
  route();
}
