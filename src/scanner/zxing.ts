import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Serve the .wasm ourselves; by default zxing-wasm pulls it from a CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

const BASE: ReaderOptions = {
  formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'],
  tryHarder: true,
  maxNumberOfSymbols: 1,
}

export type Binarizer = 'LocalAverage' | 'GlobalHistogram'

export async function decodeFrame(img: ImageData, binarizer: Binarizer = 'LocalAverage'): Promise<string | null> {
  const [hit] = await readBarcodes(img, { ...BASE, binarizer, tryRotate: false })
  return hit?.isValid ? hit.text : null
}

// For still photos: slower settings are fine, it's one image
export async function decodeImage(file: Blob): Promise<string | null> {
  for (const binarizer of ['LocalAverage', 'GlobalHistogram'] as const) {
    const [hit] = await readBarcodes(file, { ...BASE, binarizer, tryRotate: true, tryDownscale: true })
    if (hit?.isValid) return hit.text
  }
  return null
}

// Load the module early so the first frame doesn't wait on it
export const warmUp = () => prepareZXingModule({ fireImmediately: true })
