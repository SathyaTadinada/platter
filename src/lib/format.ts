import type { SearchFormat, SearchResult } from '../api/discogs/types'

export type ReleaseCard = {
  id: number
  artist: string
  title: string
  thumb?: string
  cover?: string
  label?: string
  catno?: string
  year?: string
  country?: string
  format?: string
  masterId?: number
  discogsUrl: string
  raw: SearchResult
}

// "Artist (2)" -> "Artist"; Discogs adds numbers to tell same-named artists apart
export const cleanArtist = (name: string) => name.replace(/\s\(\d+\)$/, '').replace(/\*$/, '')

export function splitTitle(full: string): { artist: string; title: string } {
  const i = full.indexOf(' - ')
  if (i < 0) return { artist: '', title: full }
  return { artist: cleanArtist(full.slice(0, i)), title: full.slice(i + 3) }
}

// Discogs files notes about a whole multi-format release ("Limited Edition" on a box
// with an LP and a CD) under a pseudo-format called "All Media"
export const ALL_MEDIA = 'All Media'

export function describeFormats(formats?: SearchFormat[], fallback?: string[]): string | undefined {
  if (formats?.length) {
    const extras = (f: SearchFormat) => [...(f.descriptions ?? []), ...(f.text ? [f.text] : [])]
    const media = formats
      .filter((f) => f.name !== ALL_MEDIA)
      .map((f) => {
        const qty = Number(f.qty) > 1 ? `${f.qty}× ` : ''
        const extra = extras(f)
        return qty + f.name + (extra.length ? `, ${extra.join(', ')}` : '')
      })
      .join(' + ')
    const whole = formats.filter((f) => f.name === ALL_MEDIA).flatMap(extras)
    return [media, whole.join(', ')].filter(Boolean).join(' · ') || undefined
  }
  if (fallback?.length) return [...new Set(fallback.filter((f) => f !== ALL_MEDIA))].join(', ') || undefined
}

export function discogsUrl(uri: string): string {
  return uri.startsWith('http') ? uri : `https://www.discogs.com${uri}`
}

// Discogs uses a placeholder "spacer.gif" when there is no image
const realImage = (url?: string) => (url && !url.endsWith('spacer.gif') ? url : undefined)

export function toCard(r: SearchResult): ReleaseCard {
  const { artist, title } = splitTitle(r.title)
  return {
    id: r.id,
    artist,
    title,
    thumb: realImage(r.thumb),
    cover: realImage(r.cover_image),
    label: r.label?.[0],
    catno: r.catno && r.catno !== 'none' ? r.catno : undefined,
    year: r.year && r.year !== '0' ? r.year : undefined,
    country: r.country,
    format: describeFormats(r.formats, r.format),
    masterId: r.master_id || undefined,
    discogsUrl: discogsUrl(r.uri),
    raw: r,
  }
}

// "Very Good Plus (VG+)" -> "VG+", "Near Mint (NM or M-)" -> "NM"
export const shortGrade = <T extends string | undefined>(condition: T): T =>
  (condition?.match(/\(([^)]+)\)/)?.[1].split(' or ')[0] ?? condition) as T
