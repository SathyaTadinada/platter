import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { barcodeKey, rememberBarcode, rememberRelease, releasesWithBarcode } from './barcodes'

beforeEach(() => db.barcodes.clear())

describe('barcodes', () => {
  it('treats a UPC and the same code as an EAN as one barcode', () => {
    expect(barcodeKey('6 02547 30677 7')).toBe('0602547306777')
    expect(barcodeKey('0602547306777')).toBe('0602547306777')
  })

  it('collects the releases a barcode belongs to', async () => {
    await rememberBarcode('602547306777', [1])
    await rememberBarcode('0 602547 306777', [2, 1])
    expect(await releasesWithBarcode('602547306777')).toEqual([1, 2])
    expect(await releasesWithBarcode('5012394144777')).toEqual([])
  })

  it("learns a release's barcodes from its identifiers", async () => {
    await rememberRelease({
      id: 7,
      identifiers: [
        { type: 'Barcode', value: '5 012394 144777' },
        { type: 'Matrix / Runout', value: 'PB 41447 A2' },
      ],
    } as never)
    expect(await releasesWithBarcode('5012394144777')).toEqual([7])
  })
})
