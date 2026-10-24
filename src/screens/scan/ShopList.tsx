import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'wouter'
import { searchReleases } from '../../api/discogs/endpoints'
import { searchMbBarcode } from '../../api/musicbrainz'
import { Cover, DiscogsCredit } from '../../components/ReleaseCardView'
import { db } from '../../db/db'
import { useCurrency, usePrice } from '../../hooks/prices'
import { useSignedIn } from '../../hooks/session'
import { useAsync } from '../../hooks/useAsync'
import { useSearchCovers } from '../../hooks/useSearchCovers'
import { formatBarcodeInput } from '../../lib/barcode'
import { toCard } from '../../lib/format'
import { lookupBarcode } from '../../lib/lookup'
import { shopCheck, type Scanned } from '../../lib/shop'
import { formatMoney } from '../../lib/value'

// Records scanned in Shop mode, newest first, each with whether you have it and what it goes for
export function ShopList({ list, onClear }: { list: Scanned[]; onClear: () => void }) {
  // a barcode typed at the bottom of the page shouldn't land out of sight
  const listRef = useRef<HTMLUListElement>(null)
  const newest = list[0]?.at
  const first = useRef(newest)
  useEffect(() => {
    if (newest !== first.current) listRef.current?.firstElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [newest])

  if (!list.length) {
    return (
      <p className="mt-4 rounded-2xl bg-stone-100 p-4 text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-400">
        Scan records in a shop to see if you already have them, whether they're on your wantlist, and what they go for on Discogs. Nothing
        gets added.
      </p>
    )
  }
  return (
    <section className="mt-4" aria-label="Scanned records">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Scanned</h2>
        <button type="button" onClick={onClear} className="text-sm font-medium text-stone-600 hover:underline dark:text-stone-400">
          Clear
        </button>
      </div>
      <ul ref={listRef} className="space-y-2 [&>li]:scroll-mt-44">
        {list.map((s) => (
          <ShopRow key={s.barcode} barcode={s.barcode} />
        ))}
      </ul>
      <p className="mt-3 px-1">
        <DiscogsCredit />
      </p>
    </section>
  )
}

const row =
  'flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800'
const badge = 'rounded-full px-2 py-0.5 text-xs font-medium'

function ShopRow({ barcode }: { barcode: string }) {
  const { client, session } = useSignedIn()
  const currency = useCurrency()
  const lookup = useAsync(
    () =>
      lookupBarcode(barcode, {
        searchDiscogs: (p) => searchReleases(client, p).then((r) => r.results),
        searchMb: (b) => searchMbBarcode(b),
      }),
    [barcode, client],
  )
  const exact = lookup.data?.kind === 'discogs' ? lookup.data.results : []
  const check = useLiveQuery(async () => {
    if (!exact.length) return undefined
    const [owned, wants] = await Promise.all([db.collection.toArray(), db.wants.toArray()])
    return shopCheck(exact, owned, wants)
  }, [lookup.data])
  // of several pressings, the one you have says best what this is
  const shown = exact.find((r) => r.id === check?.owned?.releaseId) ?? exact[0]
  const card = shown && toCard(shown)
  const single = exact.length === 1 ? card : undefined
  const { price, loading: pricing } = usePrice(single?.id, currency)
  // the demo searches signed out, and those results come without images
  const covers = useSearchCovers(card && !card.thumb ? [card.id] : [], session.kind === 'demo')
  const code = formatBarcodeInput(barcode)

  if (lookup.loading) {
    return (
      <li className={row} aria-busy>
        <span className="size-14 shrink-0 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">Looking up…</span>
          <span className="block text-stone-500 tabular-nums">{code}</span>
        </span>
      </li>
    )
  }

  if (lookup.error) {
    return (
      <li className={row}>
        <Cover size="size-14" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">Couldn't look it up</span>
          <span className="block truncate text-stone-500">{lookup.error.message}</span>
        </span>
        <button type="button" onClick={lookup.reload} className="shrink-0 text-sm font-semibold">
          Try again
        </button>
      </li>
    )
  }

  if (!card) {
    const mb = lookup.data?.kind === 'musicbrainz' ? lookup.data.mb : undefined
    return (
      <li>
        <Link href={`/results?barcode=${barcode}`} className={row}>
          <Cover size="size-14" />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">{mb ? `${mb.artist} – ${mb.title}` : 'Not on Discogs by barcode'}</span>
            <span className="block text-stone-500">{mb ? 'Not on Discogs by barcode' : code}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-stone-400" aria-hidden />
        </Link>
      </li>
    )
  }

  const details = single ? [single.year, single.format].filter(Boolean).join(' · ') : `${exact.length} pressings share this barcode`
  return (
    <li>
      <Link href={single ? `/release/${single.id}` : `/results?barcode=${barcode}`} className={row}>
        <Cover src={card.thumb ?? covers.get(card.id)} size="size-14" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{card.title}</span>
          <span className="block truncate text-sm text-stone-600 dark:text-stone-400">{card.artist}</span>
          {details && <span className="block truncate text-xs text-stone-500">{details}</span>}
          {check && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {check.owned ? (
                <span className={`${badge} bg-accent-100 text-accent dark:bg-accent/20`}>You own this</span>
              ) : check.otherPressing ? (
                <span className={`${badge} bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300`}>
                  You own another pressing
                </span>
              ) : (
                <span className={`${badge} ring-1 ring-stone-300 text-stone-600 ring-inset dark:text-stone-400 dark:ring-stone-700`}>
                  Not in your collection
                </span>
              )}
              {check.wanted && (
                <span className={`${badge} bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200`}>
                  On your wantlist
                </span>
              )}
            </span>
          )}
        </span>
        <span className="shrink-0 pl-1 text-right">
          {single && currency ? (
            pricing ? (
              <span className="block h-4 w-12 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
            ) : price?.blocked ? (
              <span className="block text-xs text-stone-500">Not sold on Discogs</span>
            ) : price?.lowest != null ? (
              <>
                <span className="block text-xs text-stone-500">from</span>
                <span className="block font-semibold tabular-nums">{formatMoney(price.lowest, currency)}</span>
                <span className="block text-xs text-stone-500">{price.forSale} for sale</span>
              </>
            ) : price ? (
              <span className="block text-xs text-stone-500">None for sale</span>
            ) : null
          ) : (
            <ChevronRight size={18} className="text-stone-400" aria-hidden />
          )}
        </span>
      </Link>
    </li>
  )
}
