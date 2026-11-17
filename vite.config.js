import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // base './' – aplikace funguje na kořenové adrese i v podsložce
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    // Režim bez internetu: po prvním otevření se celá aplikace uloží do zařízení
    // (service worker) a příště se spustí i bez signálu.
    VitePWA({
      registerType: 'prompt', // nová verze se nenačte uprostřed práce – uživatel ji potvrdí
      injectRegister: false, // registraci řešíme sami v src/pwa.js
      manifest: false, // používáme vlastní public/site.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico,svg,ttf,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
