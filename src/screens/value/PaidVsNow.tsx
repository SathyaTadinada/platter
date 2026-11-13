import { useState } from 'react'
import { Link } from 'wouter'
import { Sheet } from '../../components/Sheet'
import { Card, Section } from '../../components/ui'
import type { LibraryItem } from '../../db/db'
import { change, paidTotal, parseMoney } from '../../lib/value'
import { RecordRow } from '../../components/stats'
import { card, down, up, type Money, type Valued } from './shared'
import { Delta } from './ValueChart'

export function PaidVsNow({
  items,
  valued,
  fields,
  paidField,
  money,
}: {
  items: LibraryItem[]
  valued: Valued[]
  fields: 'loading' | 'error' | 'ready' // the collection fields from Discogs, which say where the price paid is
  paidField?: number
  money: Money
}) {
  const paid = paidTotal(items, paidField)
  const [listing, setListing] = useState(false)
  if (fields !== 'ready')
    return (
      <Section title="Paid vs now">
        <Card>
          {fields === 'loading' ? (
            <p className="h-12 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
          ) : (
            <p className="text-sm text-stone-500">Couldn't get your collection fields from Discogs right now.</p>
          )}
        </Card>
      </Section>
    )
  if (!paid.count || paidField === undefined)
    return (
      <Section title="Paid vs now">
        <Card>
          <p className="text-sm text-stone-500">
            {paidField === undefined ? (
              <>
                This needs a Purchase Price field.{' '}
                <Link href="/setup" className="font-medium underline underline-offset-2">
                  Set it up
                </Link>
              </>
            ) : (
              'No purchase prices yet.'
            )}
          </p>
        </Card>
      </Section>
    )

  const rows = valued
    .map((v) => ({ ...v, paid: parseMoney(v.item.fields[paidField]) }))
    .filter((v): v is Valued & { paid: number } => v.paid !== undefined)
    .map((v) => ({ ...v, diff: v.value.amount - v.paid }))
  const spent = rows.reduce((n, r) => n + r.paid, 0)
  const worth = rows.reduce((n, r) => n + r.value.amount, 0)
  // bought, but nothing to compare with: nobody's selling a copy, or the price isn't checked yet
  const counted = new Set(rows.map((r) => r.item.instanceId))
  const left = items.filter((i) => (parseMoney(i.fields[paidField]) ?? -1) >= 0 && !counted.has(i.instanceId))
  const gains = rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff)
  const losses = rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff)

  // behind the (i), so the card itself stays clean; the (i) only shows when something's left out
  const note = rows.length > 0 && left.length > 0 && (
    <>
      Leaves out {left.length} record{left.length === 1 ? '' : 's'} without a current price.{' '}
      <button type="button" onClick={() => setListing(true)} className="font-medium underline underline-offset-2">
        See which
      </button>
    </>
  )

  return (
    <Section title="Paid vs now" info={note}>
      {listing && (
        <Sheet title="Not counted" onClose={() => setListing(false)}>
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {left.map((i) => (
              <li key={i.instanceId}>
                <RecordRow item={i} detail={i.artist}>
                  <span className="text-sm text-stone-500 tabular-nums">Paid {money(parseMoney(i.fields[paidField])!)}</span>
                </RecordRow>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      <Card>
        {rows.length ? (
          <>
            <Delta {...change(spent, worth)} money={money} />
            <PaidBar paid={spent} now={worth} money={money} />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums">{money(paid.total)}</p>
            <p className="text-sm text-stone-500">
              paid for {paid.count} record{paid.count === 1 ? '' : 's'}
            </p>
          </>
        )}
      </Card>
      {gains.length > 0 && <Movers title="Biggest gains" rows={gains.slice(0, 3)} money={money} />}
      {losses.length > 0 && <Movers title="Biggest drops" rows={losses.slice(0, 3)} money={money} />}
    </Section>
  )
}

// One bar for both amounts: what you paid, plus what it's gained since in green, or with what
// it's lost marked in red at the end
function PaidBar({ paid, now, money }: { paid: number; now: number; money: Money }) {
  const most = Math.max(paid, now)
  const share = (n: number) => `${most > 0 ? (n / most) * 100 : 0}%`
  return (
    <div className="mt-4">
      <div
        role="img"
        aria-label={`Paid ${money(paid)}, now ${money(now)}`}
        className="flex h-3 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
      >
        <span className="h-full bg-stone-400 dark:bg-stone-500" style={{ width: share(Math.min(paid, now)) }} />
        {now > paid && (
          <span className="h-full border-l-2 border-white bg-emerald-500 dark:border-stone-900" style={{ width: share(now - paid) }} />
        )}
        {now < paid && (
          <span className="h-full border-l-2 border-white bg-red-500 dark:border-stone-900" style={{ width: share(paid - now) }} />
        )}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-sm">
        <span className="text-stone-500">
          Paid <span className="font-medium text-stone-900 tabular-nums dark:text-stone-100">{money(paid)}</span>
        </span>
        <span className="text-stone-500">
          Now <span className="font-medium text-stone-900 tabular-nums dark:text-stone-100">{money(now)}</span>
        </span>
      </div>
    </div>
  )
}

export function Movers({ title, rows, money }: { title: string; rows: (Valued & { paid: number; diff: number })[]; money: Money }) {
  return (
    <div className={`overflow-hidden ${card}`}>
      <p className="px-4 pt-3 pb-1 text-xs font-semibold text-stone-500">{title}</p>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {rows.map((r) => (
          <li key={r.item.instanceId}>
            <RecordRow item={r.item} detail={`${money(r.paid)} → ${money(r.value.amount)}`}>
              <span className={`text-sm font-semibold tabular-nums ${r.diff >= 0 ? up : down}`}>
                {r.diff >= 0 ? '+' : '−'}
                {money(Math.abs(r.diff))}
              </span>
            </RecordRow>
          </li>
        ))}
      </ul>
    </div>
  )
}
