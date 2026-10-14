import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: r('.'),
  publicDir: r('../../public'),
  build: { outDir: r('../../dist'), emptyOutDir: true },
  server: { host: true },
})
