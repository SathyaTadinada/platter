import type { LibraryItem } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { checkPrices, usePriceCheck } from '../hooks/prices'

// Sorting by value only works for records with a recent price
export function PriceCoverage({ items, prices, currency }: { items: LibraryItem[]; prices: Map<number, unknown>; currency: string }) {
  const { client } = useSignedIn()
  const check = usePriceCheck()
  const ids = [...new Set(items.map((i) => i.releaseId))]
  const priced = ids.filter((id) => prices.has(id)).length
  if (!check.running && priced >= ids.length) return null
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl bg-stone-100 px-3 py-2 text-sm dark:bg-stone-900">
      {check.running ? (
        <>
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-stone-500" />
          <span className="tabular-nums">
            Getting prices · {check.done} of {check.total}
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            {check.error
              ? `Couldn't get prices: ${check.error}`
              : priced
                ? `Prices for ${priced} of ${ids.length} records.`
                : 'No prices yet.'}
          </span>
          <button type="button" onClick={() => checkPrices(client, ids, currency)} className="shrink-0 font-semibold">
            {check.error ? 'Try again' : priced ? 'Get the rest' : 'Get prices'}
          </button>
        </>
      )}
    </div>
  )
}
