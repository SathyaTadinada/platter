import type { SearchParams, SearchResult } from '../api/discogs/types'
import type { MbRelease } from '../api/musicbrainz'
import { barcodeVariants, digitsOnly } from './barcode'

export type LookupDeps = {
  searchDiscogs: (p: SearchParams) => Promise<SearchResult[]>
  searchMb: (barcode: string) => Promise<MbRelease[]>
}

export type LookupResult =
  | { kind: 'discogs'; barcode: string; results: SearchResult[] }
  | { kind: 'musicbrainz'; barcode: string; mb: MbRelease; results: SearchResult[] }
  | { kind: 'none'; barcode: string; mb: MbRelease[] }

// Discogs barcode search is fuzzy and returns unrelated releases for codes it
// doesn't know, so keep only results whose listed barcode really matches.
export function exactBarcodeMatches(results: SearchResult[], variants: string[]): SearchResult[] {
  return results.filter((r) =>
    (r.barcode ?? []).some((b) => {
      const d = digitsOnly(b)
      return variants.some((v) => d === v || (v.length >= 12 && d.includes(v)))
    }),
  )
}

// Barcode on Discogs first; if nothing, ask MusicBrainz what the record is
// and search Discogs by artist and title instead.
export async function lookupBarcode(raw: string, deps: LookupDeps): Promise<LookupResult> {
  const variants = barcodeVariants(raw)
  const barcode = variants[0]
  for (const v of variants) {
    const results = exactBarcodeMatches(await deps.searchDiscogs({ barcode: v }), variants)
    if (results.length) return { kind: 'discogs', barcode, results }
  }

  const mb = await deps.searchMb(barcode).catch(() => [])
  const tried = new Set<string>()
  for (const m of mb.slice(0, 3)) {
    const key = `${m.artist}|${m.title}`.toLowerCase()
    if (tried.has(key) || !m.title) continue
    tried.add(key)
    const results = await deps.searchDiscogs({ artist: m.artist, release_title: m.title })
    if (results.length) return { kind: 'musicbrainz', barcode, mb: m, results }
  }
  return { kind: 'none', barcode, mb }
}
