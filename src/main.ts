import './styles.css';
import { renderHome } from './home';
import { renderCentripetalLab } from './lab-centripetal';
import { renderPendulumLab } from './lab-pendulum';
import { renderSoundLab } from './lab-sound';
import { renderSpringLab } from './lab-spring';
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
  } else if (hash.startsWith('/lab/spring')) {
    document.title = '彈簧振動｜手機物理實驗室';
    cleanup = renderSpringLab(root, { demo: hash === '/lab/spring/demo' });
  } else if (hash.startsWith('/lab/centripetal')) {
    document.title = '向心加速度｜手機物理實驗室';
    cleanup = renderCentripetalLab(root, { demo: hash === '/lab/centripetal/demo' });
  } else if (hash.startsWith('/lab/sound-spectrum')) {
    document.title = '聲音頻譜｜手機物理實驗室';
    cleanup = renderSoundLab(root, { demo: hash === '/lab/sound-spectrum/demo' });
  } else {
    document.title = '手機物理實驗室';
    renderHome(root);
  }
  window.scrollTo(0, 0);
}

if (sensorCode !== null) {
  document.title = '手機感測端｜手機物理實驗室';
  renderSensor(root, sensorCode, params.get('exp'));
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
