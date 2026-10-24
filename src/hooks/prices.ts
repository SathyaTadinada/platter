import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DiscogsClient } from '../api/discogs/client'
import { useProfile } from '../components/Profile'
import { db } from '../db/db'
import { fetchMasterYear, staleMasters } from '../lib/masters'
import { backgroundGapMs, fetchPrice } from '../lib/pricing'
import { fetchLength, staleLengths } from '../lib/stylus'
import { backgroundHeld } from '../lib/task'
import { getWatches, underPrice, type Watches } from '../lib/priceWatch'
import { isFresh, type PriceEntry } from '../lib/value'
import { useSignedIn } from './session'

// One price check at a time, shared by every screen, so it keeps going while
// you move around the app.
type CheckState = { running: boolean; stage: 'years' | 'lengths' | 'prices'; done: number; total: number; error: string | null }

let state: CheckState = { running: false, stage: 'prices', done: 0, total: 0, error: null }
let stopRequested = false
// set before the first await, so a second call that arrives meanwhile (a sync and newly
// added records, say) doesn't start its own loop
let busy = false
const listeners = new Set<() => void>()
const set = (patch: Partial<CheckState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function checkPrices(client: DiscogsClient, releaseIds: number[], currency: string) {
  if (busy) return
  busy = true
  try {
    const now = Date.now()
    const fresh = new Set((await db.prices.toArray()).filter((p) => isFresh(p, currency, now)).map((p) => p.releaseId))
    const todo = [...new Set(releaseIds)].filter((id) => !fresh.has(id))
    stopRequested = false
    // anything else going on goes first, including the gaps between a bulk action's requests
    const wait = async () => {
      while ((client.status.active > 0 || backgroundHeld()) && !stopRequested) await sleep(500)
      return !stopRequested
    }
    const bg = client.background
    // original years first: there's one per album, and the collection's decades depend on them
    const masters = await staleMasters()
    if (masters.length) {
      set({ running: true, stage: 'years', done: 0, total: masters.length, error: null })
      try {
        for (const id of masters) {
          if (!(await wait())) break
          await fetchMasterYear(bg, id)
          set({ done: state.done + 1 })
          await sleep(backgroundGapMs(client))
        }
      } catch {
        // try again next time
      }
      set({ running: false })
    }
    // then running times of played records, for stylus hours
    const lengths = stopRequested ? [] : await staleLengths()
    if (lengths.length) {
      set({ running: true, stage: 'lengths', done: 0, total: lengths.length, error: null })
      try {
        for (const id of lengths) {
          if (!(await wait())) break
          await fetchLength(bg, id)
          set({ done: state.done + 1 })
          await sleep(backgroundGapMs(client))
        }
      } catch {
        // try again next time
      }
      set({ running: false })
    }
    if (todo.length && !stopRequested) {
      set({ running: true, stage: 'prices', done: 0, total: todo.length, error: null })
      for (const id of todo) {
        if (!(await wait())) break
        const { requests } = await fetchPrice(bg, id, currency)
        set({ done: state.done + 1 })
        await sleep(backgroundGapMs(client) * requests)
      }
      set({ running: false })
    }
  } catch (e) {
    set({ running: false, error: stopRequested ? null : (e as Error).message })
  } finally {
    busy = false
  }
}

export const stopPriceCheck = () => {
  stopRequested = true
  set({ error: null })
}

export function usePriceCheck() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

// undefined until the profile loads, so nothing gets fetched in the wrong currency
export function useCurrency(): string | undefined {
  const profile = useProfile()
  return profile ? (profile.curr_abbr ?? 'USD') : undefined
}

// Prices fetched in the last six hours, by release
export function useFreshPrices(currency: string | undefined) {
  return useLiveQuery(async () => {
    if (!currency) return undefined
    const now = Date.now()
    const map = new Map<number, PriceEntry>()
    for (const p of await db.prices.toArray()) if (isFresh(p, currency, now)) map.set(p.releaseId, p)
    return map
  }, [currency])
}

// One release's price, fetched if there isn't a fresh one
export function usePrice(releaseId: number | undefined, currency: string | undefined) {
  const { client } = useSignedIn()
  // tagged with the release it's for: when releaseId changes, the last answer sticks around until
  // the new one is in, and taking it for this release's would mean fetching a price that's fresh
  const found = useLiveQuery(async () => ({ releaseId, entry: releaseId ? ((await db.prices.get(releaseId)) ?? null) : null }), [releaseId])
  const entry = found && found.releaseId === releaseId ? found.entry : undefined
  const fresh = entry && currency && isFresh(entry, currency) ? entry : undefined
  const missing = entry !== undefined && Boolean(currency) && !fresh
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    if (releaseId && currency && missing) fetchPrice(client, releaseId, currency).catch(() => setFailed(true))
  }, [client, releaseId, currency, missing])
  return { price: fresh, loading: !failed && (entry === undefined || missing), failed }
}

// Newly added records have no price until the next sync; fetch theirs a few seconds after
// they show up
export function useNewRecordPrices() {
  const { client, session } = useSignedIn()
  const currency = useCurrency()
  const check = usePriceCheck()
  const missing = useLiveQuery(async () => {
    if (!currency) return []
    const priced = new Set((await db.prices.toArray()).filter((p) => p.currency === currency).map((p) => p.releaseId))
    const ids = (await db.collection.toArray()).map((i) => i.releaseId).filter((id) => !priced.has(id))
    return [...new Set(ids)].sort((a, b) => a - b)
  }, [currency])
  const key = missing?.join(',') ?? ''
  useEffect(() => {
    if (!key || !currency || check.running || check.error || session.expired) return
    const t = setTimeout(() => checkPrices(client, key.split(',').map(Number), currency), 3000)
    return () => clearTimeout(t)
  }, [key, currency, client, check.running, check.error, session.expired])
}

// Wantlist records with a price to watch (ones taken off the wantlist don't count), their
// prices if fresh, and which are listed at or under the price
export function useWatches() {
  const currency = useCurrency()
  return useLiveQuery(async () => {
    const [all, wants] = await Promise.all([getWatches(), db.wants.toArray()])
    const wanted = new Set(wants.map((w) => w.releaseId))
    const watches: Watches = Object.fromEntries(Object.entries(all).filter(([id]) => wanted.has(Number(id))))
    const ids = Object.keys(watches).map(Number)
    const now = Date.now()
    const prices = new Map<number, PriceEntry>()
    for (const p of await db.prices.bulkGet(ids)) if (p && currency && isFresh(p, currency, now)) prices.set(p.releaseId, p)
    const under = new Set(ids.filter((id) => underPrice(prices.get(id), watches[id])))
    return { watches, prices, under }
  }, [currency])
}

// Keeps watched prices fresh while the app is open: soon after one is added, then every so
// often (checkPrices skips the ones still fresh)
const WATCH_EVERY = 30 * 60 * 1000
export function useWatchedPrices() {
  const { client, session } = useSignedIn()
  const currency = useCurrency()
  const watches = useWatches()?.watches
  const key = watches ? Object.keys(watches).join(',') : ''
  useEffect(() => {
    if (!key || !currency || session.expired) return
    const run = () => checkPrices(client, key.split(',').map(Number), currency)
    const first = setTimeout(run, 3000)
    const every = setInterval(run, WATCH_EVERY)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [key, currency, client, session.expired])
}
