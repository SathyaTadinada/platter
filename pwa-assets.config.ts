import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Source is a full-bleed square; iOS and Android apply their own rounding,
// so no padding or white background on the home screen icons.
const dark = { background: '#1c1917', fit: 'contain' } as const

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0, resizeOptions: dark },
    maskable: { sizes: [512], padding: 0, resizeOptions: dark },
  },
  images: ['public/icon.svg'],
})
