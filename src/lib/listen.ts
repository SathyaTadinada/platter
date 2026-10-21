import { readCache, writeCache } from '../db/cache'
import { digitsOnly } from './barcode'

// Links to hear a record. Search links need no lookup; Apple Music (and album.link,
// which lists every service for an Apple Music album) need the album's Apple ID,
// found from the barcode or by name. Nothing is looked up until a link is tapped.

const q = (artist: string, title: string) => encodeURIComponent(`${artist} ${title}`.replace(/\s+/g, ' ').trim())

export function searchLinks(artist: string, title: string) {
  return {
    // no "/albums" on the end: the Spotify app (which iOS opens for this link) reads
    // the last part of the path as the search, so it searched for "albums"
    spotify: `https://open.spotify.com/search/${q(artist, title)}`,
    youtube: `https://music.youtube.com/search?q=${q(artist, title)}`,
    apple: `https://music.apple.com/search?term=${q(artist, title)}`,
    // for "All services" when Apple Music doesn't have it, so there's no album.link page
    web: `https://www.google.com/search?q=${q(artist, title)}%20album`,
  }
}

export type AppleAlbum = { id: number; url: string; artist: string; title: string }
type ItunesAlbum = { collectionType?: string; collectionId: number; collectionViewUrl: string; artistName: string; collectionName: string }

// "Bewitched (Deluxe Edition)" and "BEWITCHED!" both become "bewitched"
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s[([].*?[)\]]/g, '')
    .replace(/\s-\s.*$/, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// The search result that is really this album, if any
export function pickAlbum(results: ItunesAlbum[], artist: string, title: string): AppleAlbum | null {
  const a = norm(artist)
  const t = norm(title)
  const albums = results.filter((r) => !r.collectionType || r.collectionType === 'Album')
  const match =
    albums.find((r) => norm(r.collectionName) === t && norm(r.artistName) === a) ??
    albums.find((r) => norm(r.collectionName) === t && (norm(r.artistName).includes(a) || a.includes(norm(r.artistName))))
  return match ? toAlbum(match) : null
}

// a song's collectionViewUrl points at the track ("?i=123"); keep just the album
const toAlbum = (r: ItunesAlbum): AppleAlbum => {
  const url = new URL(r.collectionViewUrl)
  url.searchParams.delete('i')
  return { id: r.collectionId, url: url.href, artist: r.artistName, title: r.collectionName }
}

const store = () => {
  try {
    return new Intl.Locale(navigator.language).region?.toLowerCase() ?? 'us'
  } catch {
    return 'us'
  }
}

const DAY = 24 * 60 * 60 * 1000
const MONTH = 30 * DAY

export async function findAppleAlbum(
  key: string, // cache key, e.g. the Discogs release id
  barcodes: string[],
  artist: string,
  title: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppleAlbum | null> {
  // misses are only trusted for a day, since Apple's search comes and goes
  const cacheKey = `apple2:${key}` // "2" drops misses cached for a month before song search
  const hit = await readCache<{ album: AppleAlbum | null }>(cacheKey, MONTH)
  if (hit?.album) return hit.album
  if (hit && (await readCache(cacheKey, DAY))) return null

  const get = async (url: string) => {
    const res = await fetchFn(url)
    if (!res.ok) throw new Error(`Apple returned ${res.status}`)
    return ((await res.json()) as { results: ItunesAlbum[] }).results
  }
  let album: AppleAlbum | null = null
  for (const b of barcodes.map(digitsOnly).filter((d) => d.length >= 12)) {
    const found = (await get(`https://itunes.apple.com/lookup?upc=${b}&entity=album&country=${store()}`)).find((r) => r.collectionId)
    if (found) {
      album = toAlbum(found)
      break
    }
  }
  // Apple's album search misses some albums its song search finds (Peter Cat Recording
  // Co.'s "Bismillah"), and songs carry their album, so try those next
  for (const entity of ['album', 'song']) {
    album ??= pickAlbum(
      await get(`https://itunes.apple.com/search?term=${q(artist, title)}&entity=${entity}&limit=25&country=${store()}`),
      artist,
      title,
    )
  }
  await writeCache(cacheKey, { album })
  return album
}

export const allServicesUrl = (album: AppleAlbum) => `https://album.link/i/${album.id}`
