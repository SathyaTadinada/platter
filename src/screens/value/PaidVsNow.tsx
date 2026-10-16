import { Link } from 'wouter'
import { Card, Section } from '../../components/ui'
import type { LibraryItem } from '../../db/db'
import { change, paidTotal, parseMoney } from '../../lib/value'
import { pct, RecordRow } from '../../components/stats'
import { card, down, up, type Money, type Valued } from './shared'
import { Delta } from './ValueChart'

export function PaidVsNow({
  items,
  valued,
  paidField,
  money,
}: {
  items: LibraryItem[]
  valued: Valued[]
  paidField?: number
  money: Money
}) {
  const paid = paidTotal(items, paidField)
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
              'Fill in Purchase Price on your records to see what you paid next to what they go for now.'
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
  const gains = rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff)
  const losses = rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff)
  const most = Math.max(spent, worth)
  const rising = worth >= spent

  return (
    <Section title="Paid vs now">
      <Card>
        {rows.length ? (
          <>
            <Delta {...change(spent, worth)} money={money} />
            {rows.length < paid.count && (
              <p className="mt-2 text-sm text-stone-500">
                {rows.length} of {paid.count} records so far
              </p>
            )}
            <div className="mt-4 space-y-2.5">
              <BarLine label="Paid" amount={money(spent)} width={pct(spent, most)} className="bg-stone-400 dark:bg-stone-600" />
              <BarLine label="Now" amount={money(worth)} width={pct(worth, most)} className={rising ? 'bg-emerald-500' : 'bg-red-500'} />
            </div>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums">{money(paid.total)}</p>
            <p className="text-sm text-stone-500">
              paid for {paid.count} record{paid.count === 1 ? '' : 's'}. Current prices show up here once they're in.
            </p>
          </>
        )}
      </Card>
      {gains.length > 0 && <Movers title="Biggest gains" rows={gains.slice(0, 3)} money={money} />}
      {losses.length > 0 && <Movers title="Biggest drops" rows={losses.slice(0, 3)} money={money} />}
    </Section>
  )
}

export function BarLine({ label, amount, width, className }: { label: string; amount: string; width: string; className: string }) {
  return (
    <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <span className={`block h-full rounded-full ${className}`} style={{ width }} />
      </span>
      <span className="font-medium tabular-nums">{amount}</span>
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
