// Copies Tesseract's worker, engine and English data into public/ocr so they're
// served from our own domain instead of a CDN. Runs before dev and build.
import { copyFile, mkdir } from 'node:fs/promises'

const from = (p) => new URL(`../node_modules/${p}`, import.meta.url)
const to = (p) => new URL(`../public/ocr/${p}`, import.meta.url)

await mkdir(to('core/'), { recursive: true })
await mkdir(to('lang/'), { recursive: true })
await copyFile(from('tesseract.js/dist/worker.min.js'), to('worker.min.js'))
for (const v of ['', '-simd', '-relaxedsimd']) {
  await copyFile(from(`tesseract.js-core/tesseract-core${v}-lstm.wasm.js`), to(`core/tesseract-core${v}-lstm.wasm.js`))
}
// "best_int": the accurate model, stored compactly (about 3 MB)
await copyFile(from('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), to('lang/eng.traineddata.gz'))
