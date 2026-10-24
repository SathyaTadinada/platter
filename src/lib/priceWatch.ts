import { getSetting, setSetting } from '../db/db'
import type { PriceEntry } from './value'

// Prices you'd pay for records on the wantlist. While the app is open, those records' prices
// are kept fresh like the collection's, and any listed at or under your price is marked.
// Kept on this device only; there's nowhere on Discogs to put them.

export type Watch = { max: number; currency: string }
export type Watches = Record<number, Watch> // by release id

const KEY = 'priceWatch'

export const getWatches = async () => (await getSetting<Watches>(KEY)) ?? {}

export async function setWatch(releaseId: number, watch: Watch | null) {
  const all = await getWatches()
  if (watch) all[releaseId] = watch
  else delete all[releaseId]
  await setSetting(KEY, all)
}

// A copy listed at or under the price, going by a price fetched in the same currency
export const underPrice = (price: PriceEntry | undefined, watch: Watch | undefined) =>
  Boolean(watch && price && price.currency === watch.currency && price.lowest !== null && price.lowest <= watch.max)
