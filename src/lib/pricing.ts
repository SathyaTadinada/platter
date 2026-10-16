import { DiscogsError, type DiscogsClient } from '../api/discogs/client'
import { getCollectionValue, getMarketplaceStats, getPriceSuggestions } from '../api/discogs/endpoints'
import { db, getSetting, setSetting } from '../db/db'
import { localDate, parseMoney, type PriceEntry, type ValueSnapshot } from './value'

// Price suggestions only work once seller settings are filled in. When they
// aren't, don't ask again for a day.
const SUGGESTIONS_KEY = 'priceSuggestions'
const RECHECK = 24 * 60 * 60 * 1000
type SuggestionsState = { available: boolean; at: number }

async function suggestionsWorth(now: number) {
  const s = await getSetting<SuggestionsState>(SUGGESTIONS_KEY)
  return !s || s.available || now - s.at > RECHECK
}

// Background price checks use a bit over half the rate limit, leaving the rest
// for whatever else is going on
const BACKGROUND_SHARE = 0.6
export const backgroundGapMs = (client: DiscogsClient) => 60_000 / (client.requestsPerMinute * BACKGROUND_SHARE)

export async function fetchPrice(
  client: DiscogsClient,
  releaseId: number,
  currency: string,
  now = Date.now,
): Promise<{ price: PriceEntry; requests: number }> {
  const stats = await getMarketplaceStats(client, releaseId, currency)
  let requests = 1
  let suggested: Record<string, number> | undefined
  if (await suggestionsWorth(now())) {
    requests++
    try {
      const s = await getPriceSuggestions(client, releaseId)
      suggested = Object.fromEntries(
        Object.entries(s)
          .filter(([, v]) => v?.currency === currency)
          .map(([k, v]) => [k, Math.round(v.value * 100) / 100]),
      )
      await setSetting(SUGGESTIONS_KEY, { available: true, at: now() })
    } catch (e) {
      if (!(e instanceof DiscogsError)) throw e
      if (e.status === 401 || e.status === 403 || /seller settings/i.test(e.message)) {
        await setSetting(SUGGESTIONS_KEY, { available: false, at: now() })
      }
      // any other 4xx just means no suggestions for this one
      else if (e.status >= 500) throw e
    }
  }
  const lowest = stats.lowest_price
  const entry: PriceEntry = {
    releaseId,
    at: now(),
    currency,
    lowest: lowest && lowest.currency === currency ? lowest.value : null,
    forSale: stats.num_for_sale ?? 0,
    blocked: stats.blocked_from_sale || undefined,
    suggested: suggested && Object.keys(suggested).length ? suggested : undefined,
  }
  await db.prices.put(entry)
  return { price: entry, requests }
}

// The collection's value from Discogs, saved as today's reading. Skips the cache when the
// record count has changed since the last reading.
export async function recordCollectionValue(client: DiscogsClient, username: string, currency: string, now = Date.now()) {
  const count = await db.collection.count()
  const last = await db.valueHistory.orderBy('date').last()
  const v = await getCollectionValue(client, username, last !== undefined && last.count !== count)
  const [min, median, max] = [v.minimum, v.median, v.maximum].map(parseMoney)
  if (min === undefined || median === undefined || max === undefined) return undefined
  const snap: ValueSnapshot = { date: localDate(now), at: now, currency, min, median, max, count }
  await db.valueHistory.put(snap)
  return { snap, raw: v }
}

export async function recordedToday(now = Date.now()) {
  return Boolean(await db.valueHistory.get(localDate(now)))
}
