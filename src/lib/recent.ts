import { getSetting, setSetting } from '../db/db'

export type RecentSearch = { kind: 'barcode' | 'catno' | 'title'; label: string; url: string; at: number }

const KEY = 'recentSearches'
const KEEP = 8

// Remembers a lookup so it can be repeated from the Search page; newest first, no repeats
export async function rememberSearch(entry: Omit<RecentSearch, 'at'>, now = Date.now()) {
  const list = (await getSetting<RecentSearch[]>(KEY)) ?? []
  const next = [{ ...entry, at: now }, ...list.filter((r) => r.url !== entry.url)].slice(0, KEEP)
  await setSetting(KEY, next)
}

export const clearSearches = () => setSetting(KEY, [])
export const RECENT_SEARCHES_KEY = KEY
