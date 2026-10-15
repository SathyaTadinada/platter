import { readCache, writeCache } from '../db/cache'
import { digitsOnly } from './barcode'

// Links to hear a record. Search links need no lookup; Apple Music (and album.link,
// which lists every service for an Apple Music album) need the album's Apple ID,
// found from the barcode or by name. Nothing is looked up until a link is tapped.

const q = (artist: string, title: string) => encodeURIComponent(`${artist} ${title}`.trim())

export function searchLinks(artist: string, title: string) {
  return {
    spotify: `https://open.spotify.com/search/${q(artist, title)}/albums`,
    youtube: `https://music.youtube.com/search?q=${q(artist, title)}`,
    apple: `https://music.apple.com/search?term=${q(artist, title)}`,
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
  return match ? { id: match.collectionId, url: match.collectionViewUrl, artist: match.artistName, title: match.collectionName } : null
}

const store = () => {
  try {
    return new Intl.Locale(navigator.language).region?.toLowerCase() ?? 'us'
  } catch {
    return 'us'
  }
}

const MONTH = 30 * 24 * 60 * 60 * 1000

export async function findAppleAlbum(
  key: string, // cache key, e.g. the Discogs release id
  barcodes: string[],
  artist: string,
  title: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppleAlbum | null> {
  const cacheKey = `apple:${key}`
  const hit = await readCache<{ album: AppleAlbum | null }>(cacheKey, MONTH)
  if (hit) return hit.album

  const get = async (url: string) => {
    const res = await fetchFn(url)
    if (!res.ok) throw new Error(`Apple returned ${res.status}`)
    return ((await res.json()) as { results: ItunesAlbum[] }).results
  }
  let album: AppleAlbum | null = null
  for (const b of barcodes.map(digitsOnly).filter((d) => d.length >= 12)) {
    const found = (await get(`https://itunes.apple.com/lookup?upc=${b}&entity=album&country=${store()}`)).find((r) => r.collectionId)
    if (found) {
      album = { id: found.collectionId, url: found.collectionViewUrl, artist: found.artistName, title: found.collectionName }
      break
    }
  }
  album ??= pickAlbum(
    await get(`https://itunes.apple.com/search?term=${q(artist, title)}&entity=album&limit=15&country=${store()}`),
    artist,
    title,
  )
  await writeCache(cacheKey, { album })
  return album
}

export const allServicesUrl = (album: AppleAlbum) => `https://album.link/i/${album.id}`
