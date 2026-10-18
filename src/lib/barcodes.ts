import type { Release } from '../api/discogs/types'
import { db } from '../db/db'
import { digitsOnly } from './barcode'

// Which releases a barcode belongs to, as far as Platter has seen. Discogs leaves barcodes out
// of the collection, so without this a scan in Play mode always means a search, even for a
// record you own. Barcodes are CC0 under the API terms, so these can be kept. Filled in from
// releases as they're loaded, scans, and batch adds.

// a 12-digit UPC and the same code as a 13-digit EAN are one barcode
export function barcodeKey(raw: string): string {
  const code = digitsOnly(raw)
  return code.length === 12 ? '0' + code : code
}

export async function rememberBarcode(raw: string, releaseIds: number[]) {
  const barcode = barcodeKey(raw)
  if (barcode.length < 8 || !releaseIds.length) return
  const known = (await db.barcodes.get(barcode))?.releaseIds ?? []
  const all = [...new Set([...known, ...releaseIds])]
  if (all.length !== known.length) await db.barcodes.put({ barcode, releaseIds: all })
}

export async function rememberRelease(r: Pick<Release, 'id' | 'identifiers'>) {
  for (const i of r.identifiers ?? []) if (i.type === 'Barcode') await rememberBarcode(i.value, [r.id])
}

export async function releasesWithBarcode(raw: string): Promise<number[]> {
  return (await db.barcodes.get(barcodeKey(raw)))?.releaseIds ?? []
}
