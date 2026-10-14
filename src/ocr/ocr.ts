import type { Worker } from 'tesseract.js'

// On-device text recognition with Tesseract, loaded only when first used.
let worker: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  worker ??= import('tesseract.js').then(({ createWorker, OEM }) =>
    createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      workerBlobURL: false, // a blob: worker would need a looser CSP
    }),
  )
  worker.catch(() => (worker = null))
  return worker
}

// Grayscale, stretch the contrast and optionally rotate. Etched dead wax and
// worn spines are low contrast, and OCR does much better on a cleaned-up image.
async function prepare(image: Blob, degrees: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(image)
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const turn = degrees % 180 !== 0
  const canvas = document.createElement('canvas')
  canvas.width = turn ? h : w
  canvas.height = turn ? w : h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h)
  bmp.close()

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  let lo = 255
  let hi = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = g
    if (g < lo) lo = g
    if (g > hi) hi = g
  }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - lo) / range) * 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.putImageData(img, 0, 0)
  return canvas
}

export type OcrProgress = (stage: string) => void

// Reads text from a photo. `rotations` tries several orientations (spines are
// usually sideways) and returns all the text found.
export async function readText(image: Blob, rotations: number[] = [0], onProgress?: OcrProgress): Promise<string> {
  onProgress?.('Loading text recognition')
  const w = await getWorker()
  // sparse text: etchings and spines aren't paragraphs
  await w.setParameters({ tessedit_pageseg_mode: '11' as never })
  const texts: string[] = []
  for (const [i, deg] of rotations.entries()) {
    onProgress?.(rotations.length > 1 ? `Reading (${i + 1} of ${rotations.length})` : 'Reading')
    const { data } = await w.recognize(await prepare(image, deg))
    texts.push(data.text)
  }
  return texts.join('\n')
}
