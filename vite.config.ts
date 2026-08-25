import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// vitest/config re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Audio never goes near the service worker cache — it lives in IndexedDB
      // under the app's own control (ADR 0005).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Workbox keeps precaches from older revisions by default. On a phone
        // with a small quota that is dead weight, and it makes "am I on the old
        // build?" harder to answer than it needs to be.
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Choreo Planner',
        short_name: 'Choreo',
        description: 'Plan pole choreography against a song, one 8-count at a time.',
        theme_color: '#0f0d13',
        background_color: '#0f0d13',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
