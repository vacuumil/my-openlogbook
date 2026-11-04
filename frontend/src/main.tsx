import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary, reloadFresh } from './components/ErrorBoundary';
import 'leaflet/dist/leaflet.css';
import './index.css';

// A screen's file from before the last deploy is gone: load the new version once instead of failing
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('openlogbook_stale_reload_at')) || 0;
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('openlogbook_stale_reload_at', String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  void reloadFresh();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
