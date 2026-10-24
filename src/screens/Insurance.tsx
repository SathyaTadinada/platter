import { useLiveQuery } from 'dexie-react-hooks'
import { Printer } from 'lucide-react'
import { PriceCoverage } from '../components/PriceCoverage'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { statCard } from '../components/stats'
import { Button, IconButton, Screen, Spinner } from '../components/ui'
import { useCurrency, useFreshPrices } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { shortGrade } from '../lib/format'
import { insuranceReport } from '../lib/insurance'
import { libraryItems } from '../lib/masters'
import { recordCollectionValue } from '../lib/pricing'
import { formatMoney } from '../lib/value'

// A list of the whole collection with values, laid out to print or save as a PDF
export function Insurance() {
  const { client, username } = useSignedIn()
  const currency = useCurrency()
  const prices = useFreshPrices(currency)
  const matches = useFieldMatches()
  const items = useLiveQuery(libraryItems, [])
  const discogs = useAsync(
    () => (currency ? recordCollectionValue(client, username, currency) : Promise.resolve(undefined)),
    [client, username, currency],
  )

  if (!items || !prices || !currency || !matches) {
    return (
      <Screen title="Insurance report" back="/">
        <Spinner />
      </Screen>
    )
  }

  const field = (key: Parameters<typeof fieldFor>[1]) => fieldFor(matches, key)?.id
  const report = insuranceReport(items, prices, {
    media: field('mediaCondition'),
    sleeve: field('sleeveCondition'),
    paid: field('purchasePrice'),
  })
  const money = (n?: number) => (n === undefined ? '—' : formatMoney(n, currency))
  const showPaid = report.paid > 0
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <Screen
      title="Insurance report"
      back="/"
      width="full"
      actions={
        <>
          <IconButton label="Print or save as PDF" onClick={() => window.print()} className="sm:hidden">
            <Printer size={20} />
          </IconButton>
          <span className="hidden sm:block">
            <Button variant="secondary" onClick={() => window.print()} className="min-h-9 px-3 text-sm">
              <Printer size={18} aria-hidden />
              Print or save as PDF
            </Button>
          </span>
        </>
      }
    >
      <div className="print:hidden">
        <PriceCoverage items={items} prices={prices} currency={currency} />
      </div>

      <header className="mb-6">
        <h1 className="mb-2 hidden text-sm font-semibold tracking-wide text-stone-500 uppercase print:block">Insurance report</h1>
        <p className="text-sm text-stone-500">Record collection of {username}</p>
        <h2 className="text-2xl font-bold tracking-tight">{date}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
          <Total label="Records" value={items.length.toLocaleString()} />
          <Total label="Total value" value={money(report.value)} />
          {showPaid && <Total label="Paid" value={money(report.paid)} />}
          {discogs.data && <Total label="Discogs estimate" value={`${discogs.data.raw.minimum} – ${discogs.data.raw.maximum}`} />}
        </div>
      </header>

      {/* phones get a list; the table needs a wider screen, or paper */}
      <ul className={`divide-y divide-stone-200 overflow-hidden md:hidden print:hidden dark:divide-stone-800 ${statCard}`}>
        {report.rows.map(({ item, media, sleeve, paid, value }) => (
          <li key={item.instanceId} className="flex gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block truncate text-stone-500">{[item.artist, item.year || ''].filter(Boolean).join(' · ')}</span>
              <span className="block text-xs text-stone-500">{grades(media, sleeve)}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              <span className="block font-semibold">{money(value)}</span>
              {showPaid && paid !== undefined && <span className="block text-xs text-stone-500">paid {money(paid)}</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className={`hidden overflow-x-auto md:block print:block print:overflow-visible print:ring-0 ${statCard}`}>
        <table className="w-full min-w-[40rem] text-left text-sm print:min-w-0 print:text-[9pt]">
          <thead className="border-b border-stone-200 text-xs text-stone-500 dark:border-stone-800">
            <tr>
              <th className="px-2 py-2 first:pl-3 last:pr-3 font-medium">Artist</th>
              <th className="px-2 py-2 first:pl-3 last:pr-3 font-medium">Title</th>
              <th className="px-2 py-2 first:pl-3 last:pr-3 font-medium">Label</th>
              <th className="px-2 py-2 first:pl-3 last:pr-3 font-medium">Format</th>
              <th className="px-2 py-2 first:pl-3 last:pr-3 font-medium">Year</th>
              <th className="px-2 py-2 first:pl-3 last:pr-3 font-medium">Condition</th>
              {showPaid && <th className="px-2 py-2 first:pl-3 last:pr-3 text-right font-medium">Paid</th>}
              <th className="px-2 py-2 first:pl-3 last:pr-3 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {report.rows.map(({ item, media, sleeve, paid, value }) => (
              <tr key={item.instanceId} className="break-inside-avoid align-top">
                <td className="px-2 py-2 first:pl-3 last:pr-3">{item.artist}</td>
                <td className="px-2 py-2 first:pl-3 last:pr-3 font-medium">{item.title}</td>
                <td className="px-2 py-2 first:pl-3 last:pr-3 text-stone-600 dark:text-stone-400">
                  {[item.label, item.catno].filter(Boolean).join(' · ')}
                </td>
                <td className="px-2 py-2 first:pl-3 last:pr-3 text-stone-600 dark:text-stone-400">{item.format}</td>
                <td className="px-2 py-2 first:pl-3 last:pr-3 tabular-nums">{item.year || ''}</td>
                <td className="px-2 py-2 first:pl-3 last:pr-3 whitespace-nowrap">{grades(media, sleeve)}</td>
                {showPaid && <td className="px-2 py-2 first:pl-3 last:pr-3 text-right tabular-nums">{money(paid)}</td>}
                <td className="px-2 py-2 first:pl-3 last:pr-3 text-right font-medium tabular-nums">{money(value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 font-semibold dark:border-stone-700">
            <tr>
              <td className="px-2 py-2 first:pl-3 last:pr-3" colSpan={6}>
                Total
              </td>
              {showPaid && <td className="px-2 py-2 first:pl-3 last:pr-3 text-right tabular-nums">{money(report.paid)}</td>}
              <td className="px-2 py-2 first:pl-3 last:pr-3 text-right tabular-nums">{money(report.value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-4 max-w-3xl text-sm text-stone-500">
        Condition is media / sleeve. Values are Discogs marketplace prices on {date}: the suggested price for the copy's condition where
        Discogs has one, otherwise the cheapest copy for sale.
        {report.unpriced > 0 &&
          (report.unpriced === 1
            ? ' One record has no current price, so it isn’t in the total.'
            : ` ${report.unpriced} records have no current price, so they aren’t in the total.`)}
      </p>
      <p className="mt-2">
        <DiscogsCredit url={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`} />
      </p>
    </Screen>
  )
}

const grades = (media?: string, sleeve?: string) => [media, sleeve].map((g) => (g ? shortGrade(g) : '—')).join(' / ')

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${statCard} p-3 print:p-2 print:ring-stone-300`}>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}
