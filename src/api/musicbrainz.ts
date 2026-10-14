import { readCache, writeCache } from '../db/cache'

// MusicBrainz asks for at most one request per second.
const MIN_GAP = 1100
const CACHE_AGE = 24 * 60 * 60 * 1000

let last = 0
let chain: Promise<unknown> = Promise.resolve()

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = last + MIN_GAP - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    last = Date.now()
    return fn()
  })
  chain = run.catch(() => undefined)
  return run
}

export type MbRelease = {
  mbid: string
  title: string
  artist: string
  date?: string
  country?: string
}

type MbSearchResponse = {
  count: number
  releases: {
    id: string
    title: string
    date?: string
    country?: string
    'artist-credit'?: { name: string; joinphrase?: string }[]
  }[]
}

export function parseMbSearch(data: MbSearchResponse): MbRelease[] {
  return data.releases.map((r) => ({
    mbid: r.id,
    title: r.title,
    artist: (r['artist-credit'] ?? []).map((a) => a.name + (a.joinphrase ?? '')).join(''),
    date: r.date,
    country: r.country,
  }))
}

export async function searchMbBarcode(barcode: string, fetchFn: typeof fetch = fetch): Promise<MbRelease[]> {
  const key = `mb:barcode:${barcode}`
  const hit = await readCache<MbRelease[]>(key, CACHE_AGE)
  if (hit) return hit
  const url = `https://musicbrainz.org/ws/2/release?query=barcode:${encodeURIComponent(barcode)}&fmt=json&limit=5`
  const res = await throttled(() => fetchFn(url))
  if (!res.ok) throw new Error(`MusicBrainz returned ${res.status}`)
  const releases = parseMbSearch((await res.json()) as MbSearchResponse)
  await writeCache(key, releases)
  return releases
}

// Redirects to archive.org; 404s when there is no front cover.
export const coverArtUrl = (mbid: string) => `https://coverartarchive.org/release/${mbid}/front-250`
