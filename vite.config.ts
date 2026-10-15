/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Platter',
        short_name: 'Platter',
        description: "Catalog your records on Discogs. Scan a barcode and it's in your collection.",
        theme_color: '#1c1917',
        background_color: '#1c1917',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // take over right away so a deploy reaches phones on the next open
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        // OCR files are big and only needed when someone reads a runout or spine;
        // cache them the first time they're used instead
        globIgnores: ['ocr/**'],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'), handler: 'CacheFirst', options: { cacheName: 'ocr' } },
          // The page itself comes from the network when there is one, so opening the app
          // gets the current version. iOS reads things like the status bar style from the
          // page it launches with, and a cached old page would hold those back a whole launch.
          // Offline, the last page fetched (or the precached one) is used for every route.
          {
            urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              plugins: [
                { cacheKeyWillBeUsed: async () => '/' },
                { handlerDidError: async () => caches.match('/index.html', { ignoreSearch: true }) },
              ],
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: null, // the rule above handles pages
      },
    }),
  ],
  server: { host: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
})
