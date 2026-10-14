import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Serve the .wasm ourselves; by default zxing-wasm pulls it from a CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
})

const OPTIONS: ReaderOptions = {
  formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'],
  tryHarder: true,
  tryRotate: false,
  maxNumberOfSymbols: 1,
}

export async function decodeFrame(img: ImageData): Promise<string | null> {
  const [hit] = await readBarcodes(img, OPTIONS)
  return hit?.isValid ? hit.text : null
}

// Load the module early so the first frame doesn't wait on it
export const warmUp = () => prepareZXingModule({ fireImmediately: true })
