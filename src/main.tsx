import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const swallowError = () => {};
const PWA_UPDATE_RELOAD_KEY = 'tuitui:pwa-update-reload-at';
const PWA_UPDATE_RELOAD_COOLDOWN_MS = 30_000;

function runWhenIdle(callback: () => void, timeout: number, fallbackDelay: number) {
  const requestIdle = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;

  if (typeof requestIdle === 'function') {
    requestIdle(callback, { timeout });
    return;
  }

  globalThis.setTimeout(callback, fallbackDelay);
}

function scheduleRum() {
  if (!import.meta.env.PROD) return;

  runWhenIdle(() => {
    void import('@/platform/rum')
      .then(({ initRum }) => initRum())
      .catch(swallowError);
  }, 1600, 1200);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

scheduleRum();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
  let hasNotifiedPwaUpdate = false;

  const reloadForPwaUpdate = () => {
    try {
      const lastReloadAt = Number(window.sessionStorage.getItem(PWA_UPDATE_RELOAD_KEY) || '0');
      if (Number.isFinite(lastReloadAt) && Date.now() - lastReloadAt < PWA_UPDATE_RELOAD_COOLDOWN_MS) return;
      window.sessionStorage.setItem(PWA_UPDATE_RELOAD_KEY, String(Date.now()));
    } catch {
      // Ignore blocked sessionStorage; a single controllerchange reload is still safe.
    }

    window.location.reload();
  };

  const notifyPwaUpdate = () => {
    if (hasNotifiedPwaUpdate) return;
    hasNotifiedPwaUpdate = true;
    window.dispatchEvent(new CustomEvent('tuitui:pwa-update'));
  };

  const watchInstallingWorker = (worker: ServiceWorker | null) => {
    if (!worker) return;

    const reportIfReady = () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        notifyPwaUpdate();
      }
    };

    reportIfReady();
    worker.addEventListener('statechange', reportIfReady);
  };

  const registerServiceWorker = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        void registration.update().catch(swallowError);
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyPwaUpdate();
        }
        watchInstallingWorker(registration.installing);
        registration.addEventListener('updatefound', () => {
          watchInstallingWorker(registration.installing);
        });
      })
      .catch(swallowError);
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadServiceWorkerController) {
      notifyPwaUpdate();
      reloadForPwaUpdate();
    }
    hadServiceWorkerController = true;
  });

  // 秒开目标下，SW 不能等很久才注册。首屏 React 启动后短延迟注册，
  // 让 App Shell 和静态资源尽早进入本地缓存，下一次打开更接近原生 App。
  runWhenIdle(registerServiceWorker, 700, 350);
}
