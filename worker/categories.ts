// What syncs, grouped the way the Sync page lists it. Shared by the Worker and the app, so they agree
// on which rows a switched-off category covers.

const CATEGORIES = ['plays', 'value', 'covers', 'batch', 'settings', 'listenbrainz', 'catalog'] as const
export type Category = (typeof CATEGORIES)[number]

export function categoryOf(kind: string, key: string): Category {
  switch (kind) {
    case 'play':
      return 'plays'
    case 'value':
      return 'value'
    case 'cover':
      return 'covers'
    case 'batch':
      return 'batch'
    case 'year':
    case 'length':
    case 'barcode':
      return 'catalog'
    default:
      // settings and preferences, apart from a few that belong elsewhere. 'listenbrainz' is the
      // scrobbling connections, Last.fm's too (the name is older than that).
      if (kind === 'setting' && (key === 'listenbrainz' || key === 'lastfm')) return 'listenbrainz'
      if (kind === 'setting' && key === 'batchShared') return 'batch'
      return 'settings'
  }
}

export const parseOff = (x: unknown): Category[] =>
  Array.isArray(x) ? [...new Set(x.filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c)))] : []
