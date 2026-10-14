import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Source is a full-bleed square; iOS and Android apply their own rounding,
// so no padding or extra background on the home screen icons.
const bg = { background: '#f5f1ea', fit: 'contain' } as const

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0, resizeOptions: bg },
    maskable: { sizes: [512], padding: 0, resizeOptions: bg },
  },
  images: ['public/icon.svg'],
})
