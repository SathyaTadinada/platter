/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// wrangler.jsonc, without its comments and trailing commas
const wrangler = JSON.parse(
  readFileSync('wrangler.jsonc', 'utf8')
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, text) => text ?? '')
    .replace(/,(\s*[}\]])/g, '$1'),
)
const SITE = wrangler.vars?.SITE ? new URL(wrangler.vars.SITE).origin : ''
const ACCOUNTS = Boolean(wrangler.d1_databases?.length)

export default defineConfig({
  define: { __SITE__: JSON.stringify(SITE), __ACCOUNTS__: JSON.stringify(ACCOUNTS) },
  plugins: [
    react(),
    tailwindcss(),
    { name: 'site', transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE%', SITE) } },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Platter',
        short_name: 'Platter',
        description: 'A better way to manage your Discogs collection.',
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
        // cache them the first time they're used instead. og.png is only for link previews.
        globIgnores: ['ocr/**', 'og.png'],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'), handler: 'CacheFirst', options: { cacheName: 'ocr' } },
          // Pages come from the network first, so opening the app gets the current version
          // (iOS takes the status bar style from the page it launches with). Offline, the
          // last page fetched, or the precached one, is used for every route. On a weak signal it
          // waits a second and a half for the network, then opens from what's saved.
          {
            urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 1.5,
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
  // the Worker, when it's running locally (npx wrangler dev)
  server: { host: true, proxy: { '/api': 'http://localhost:8787' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
})
