import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

if (isLocalhost && 'serviceWorker' in navigator) {
  // Prevent stale localhost bundles by removing previously registered workers and caches.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
    });
  });

  if ('caches' in window) {
    caches.keys().then((cacheKeys) => {
      cacheKeys.forEach((cacheKey) => {
        caches.delete(cacheKey);
      });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
