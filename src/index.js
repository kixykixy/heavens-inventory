import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const val = localStorage.getItem(key);
      return val ? { key, value: val } : null;
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
      return { key, value };
    },
    delete: async (key) => {
      localStorage.removeItem(key);
      return { key, deleted: true };
    },
    list: async (prefix) => {
      const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
      return { keys };
    }
  };
}

// Service Worker登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Android ホーム画面追加バナー（1回のみ）
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem('pwa-installed')) {
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a2332;color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;z-index:9999;box-shadow:0 -2px 12px rgba(0,0,0,0.3);font-family:sans-serif;';
    banner.innerHTML = `
      <span style="font-size:14px;font-weight:600;">📦 ホーム画面に追加</span>
      <div style="display:flex;gap:8px;">
        <button id="install-dismiss" style="background:rgba(255,255,255,0.15);color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;">後で</button>
        <button id="install-btn" style="background:#f59e0b;color:#1a2332;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">追加する</button>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('install-btn').addEventListener('click', () => {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((result) => {
        if (result.outcome === 'accepted') {
          localStorage.setItem('pwa-installed', '1');
        }
        banner.remove();
        deferredPrompt = null;
      });
    });

    document.getElementById('install-dismiss').addEventListener('click', () => {
      localStorage.setItem('pwa-installed', '1');
      banner.remove();
    });
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

