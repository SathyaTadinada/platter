import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DiscogsClient } from '../api/discogs/client'
import { useProfile } from '../components/Profile'
import { db } from '../db/db'
import { backgroundGapMs, fetchPrice } from '../lib/pricing'
import { backgroundHeld } from '../lib/task'
import { isFresh, type PriceEntry } from '../lib/value'
import { useSignedIn } from './session'

// One price check at a time, shared by every screen, so it keeps going while
// you move around the app.
type CheckState = { running: boolean; done: number; total: number; error: string | null }

let state: CheckState = { running: false, done: 0, total: 0, error: null }
let stopRequested = false
const listeners = new Set<() => void>()
const set = (patch: Partial<CheckState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function checkPrices(client: DiscogsClient, releaseIds: number[], currency: string) {
  if (state.running) return
  const now = Date.now()
  const fresh = new Set((await db.prices.toArray()).filter((p) => isFresh(p, currency, now)).map((p) => p.releaseId))
  const todo = [...new Set(releaseIds)].filter((id) => !fresh.has(id))
  if (!todo.length) return
  stopRequested = false
  set({ running: true, done: 0, total: todo.length, error: null })
  try {
    for (const id of todo) {
      // anything else going on goes first, including the gaps between a bulk action's requests
      while ((client.status.active > 0 || backgroundHeld()) && !stopRequested) await sleep(500)
      if (stopRequested) break
      const { requests } = await fetchPrice(client, id, currency)
      set({ done: state.done + 1 })
      await sleep(backgroundGapMs(client) * requests)
    }
    set({ running: false })
  } catch (e) {
    set({ running: false, error: stopRequested ? null : (e as Error).message })
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
  const entry = useLiveQuery(async () => (releaseId ? ((await db.prices.get(releaseId)) ?? null) : null), [releaseId])
  const fresh = entry && currency && isFresh(entry, currency) ? entry : undefined
  const missing = entry !== undefined && Boolean(currency) && !fresh
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    if (releaseId && currency && missing) fetchPrice(client, releaseId, currency).catch(() => setFailed(true))
  }, [client, releaseId, currency, missing])
  return { price: fresh, loading: !failed && (entry === undefined || missing), failed }
}
