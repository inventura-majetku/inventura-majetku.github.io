// Režim bez internetu (service worker) + upozornění na novou verzi.
import { registerSW } from 'virtual:pwa-register';

const $ = (id) => document.getElementById(id);

export function initPwa() {
  // Indikátor připojení v záhlaví
  const updateOnline = () => {
    $('offline-badge').hidden = navigator.onLine;
  };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      $('update-banner').hidden = false;
    },
    onOfflineReady() {
      toast('Aplikace je uložená v zařízení a funguje i bez internetu.');
    },
    onRegisteredSW(_url, reg) {
      // Novou verzi hledáme i během dlouhé práce (každou hodinu, jen když je signál).
      if (reg) setInterval(() => navigator.onLine && reg.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  $('update-now').addEventListener('click', () => {
    $('update-now').disabled = true;
    updateSW(true); // aktivuje novou verzi a obnoví stránku (rozpracovaná inventura zůstane)
  });
  $('update-later').addEventListener('click', () => {
    $('update-banner').hidden = true;
  });
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 5000);
}
