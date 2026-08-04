import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Claude Artifact の window.storage を模倣するローカル版
if (!window.storage) {
  const store = {};
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
