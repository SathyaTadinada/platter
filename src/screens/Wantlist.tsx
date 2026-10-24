import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, BellRing, Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addWant, removeWant } from '../api/discogs/endpoints'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { toast } from '../components/Toaster'
import { Notice, Screen, Spinner, useBack } from '../components/ui'
import { db, type WantItem } from '../db/db'
import { useCurrency, useWatches } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { fetchPrice } from '../lib/pricing'
import { setWatch, type Watch } from '../lib/priceWatch'
import { formatMoney, type PriceEntry } from '../lib/value'
import { WatchSheet } from './wantlist/WatchSheet'
import { syncWants } from '../lib/sync'

// What you're looking for. Each one opens its release page, where it can be added
// to the collection; the heart takes it off the list.
export function Wantlist() {
  const { client, username } = useSignedIn()
  const back = useBack('/')
  const [error, setError] = useState<string | null>(null)
  const wants = useLiveQuery(() => db.wants.toArray(), [])
  const currency = useCurrency()
  const watched = useWatches()
  const [watching, setWatching] = useState<WantItem | null>(null)
  const owned = useLiveQuery(async () => {
    const items = await db.collection.toArray()
    return { releases: new Set(items.map((i) => i.releaseId)), masters: new Set(items.map((i) => i.masterId).filter(Boolean)) }
  }, [])

  // wants synced before this page existed have no title yet
  const missing = wants?.some((w) => !w.title)
  useEffect(() => {
    if (missing) syncWants(client, username).catch((e) => setError((e as Error).message))
  }, [missing, client, username])

  async function remove(w: WantItem) {
    try {
      await removeWant(client, username, w.releaseId)
      await db.wants.delete(w.releaseId)
      toast(`Took ${w.title ?? 'it'} off your wantlist`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await addWant(client, username, w.releaseId)
            await db.wants.put(w)
          },
        },
      })
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    }
  }

  async function saveWatch(w: WantItem, watch: Watch | null) {
    setWatching(null)
    await setWatch(w.releaseId, watch)
    if (!watch || !currency) return
    toast(`Watching ${w.title ?? 'it'} for ${formatMoney(watch.max, currency)} or less`, { tone: 'success' })
    // the current price right away, rather than on the next check
    if (!watched?.prices.has(w.releaseId)) fetchPrice(client, w.releaseId, currency).catch(() => {})
  }

  // ones listed under your price first, then newest first
  const under = watched?.under ?? new Set<number>()
  const sorted = [...(wants ?? [])].sort(
    (a, b) => Number(under.has(b.releaseId)) - Number(under.has(a.releaseId)) || (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''),
  )
  const note = (w: WantItem) =>
    owned?.releases.has(w.releaseId) ? 'You own this one' : owned?.masters.has(w.masterId) ? 'You own another pressing' : undefined

  return (
    // the empty state centers on the whole page, like the other empty states
    <Screen title="Wantlist" back={back} width={wants && !wants.length ? 'full' : 'narrow'}>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!wants ? (
        <Spinner />
      ) : !wants.length ? (
        <div className="py-12 text-center">
          <Heart size={40} className="mx-auto text-stone-400" aria-hidden />
          <p className="mt-3 font-semibold">Nothing on your wantlist</p>
          <p className="mt-1 text-sm text-stone-500">Search for a record and tap Add to wantlist.</p>
        </div>
      ) : (
        <>
          {under.size > 0 && (
            <div className="mb-4">
              <Notice tone="success">
                {under.size === 1 ? 'One record is' : `${under.size} records are`} listed at or under the price you set.
              </Notice>
            </div>
          )}
          <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
            {sorted.map((w) => {
              const watch = watched?.watches[w.releaseId]
              const price = watched?.prices.get(w.releaseId)
              return (
                <li key={w.releaseId} className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <RecordRow
                      item={{
                        instanceId: 0,
                        cover: undefined,
                        thumb: w.thumb,
                        title: w.title ?? `Release ${w.releaseId}`,
                        artist: w.artist ?? '',
                      }}
                      href={`/release/${w.releaseId}`}
                      detail={[w.artist, w.format?.split(',')[0], w.year].filter(Boolean).join(' · ')}
                    >
                      {watch && currency ? (
                        <WatchedPrice watch={watch} price={price} under={under.has(w.releaseId)} currency={currency} />
                      ) : (
                        note(w) && <span className="text-xs font-medium text-accent">{note(w)}</span>
                      )}
                    </RecordRow>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWatching(w)}
                    disabled={!currency}
                    aria-label={watch ? `Change the price you'd pay for ${w.title ?? 'this'}` : `Watch the price of ${w.title ?? 'this'}`}
                    title={watch ? 'Change your price' : 'Watch the price'}
                    className={`shrink-0 rounded-full p-2.5 hover:bg-stone-100 dark:hover:bg-stone-800 ${watch ? 'text-accent' : 'text-stone-400'}`}
                  >
                    {watch ? <BellRing size={20} /> : <Bell size={20} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(w)}
                    aria-label={`Take ${w.title ?? 'this'} off your wantlist`}
                    title="Take off your wantlist"
                    className="mr-2 shrink-0 rounded-full p-2.5 text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Heart size={20} className="fill-current" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {watching && currency && (
        <WatchSheet
          want={watching}
          watch={watched?.watches[watching.releaseId]}
          price={watched?.prices.get(watching.releaseId)}
          currency={currency}
          onSave={(watch) => saveWatch(watching, watch)}
          onClose={() => setWatching(null)}
        />
      )}
      {wants && wants.length > 0 && (
        <p className="mt-4">
          <DiscogsCredit url={`https://www.discogs.com/wantlist?user=${encodeURIComponent(username)}`} />
        </p>
      )}
    </Screen>
  )
}

// For a watched record: the cheapest copy now, and the price you'd pay
function WatchedPrice({ watch, price, under, currency }: { watch: Watch; price?: PriceEntry; under: boolean; currency: string }) {
  const money = (n: number) => formatMoney(n, currency)
  return (
    <span className="block text-right">
      {!price ? (
        <span className="block h-4 w-12 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      ) : price.lowest !== null ? (
        <span className={`block text-sm font-semibold tabular-nums ${under ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
          {money(price.lowest)}
        </span>
      ) : (
        <span className="block text-xs text-stone-500">None for sale</span>
      )}
      <span className="block text-xs text-stone-500 tabular-nums">{`max ${formatMoney(watch.max, currency, { whole: Number.isInteger(watch.max) })}`}</span>
    </span>
  )
}
