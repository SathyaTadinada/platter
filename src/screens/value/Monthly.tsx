import { useState } from 'react'
import { Card } from '../../components/ui'
import type { LibraryItem } from '../../db/db'
import { byMonth, parseMoney } from '../../lib/value'
import { MonthBars, Toggle } from '../../components/stats'
import type { Money } from './shared'

// Money spent (purchase price by purchase date, or date added) or records added, per month
export function Monthly({
  items,
  paidField,
  dateField,
  money,
  currency,
}: {
  items: LibraryItem[]
  paidField?: number
  dateField?: number
  money: Money
  currency: string
}) {
  const canSpend = paidField !== undefined
  // start on records added when there's nothing to add up yet
  const anySpent = canSpend && items.some((i) => parseMoney(i.fields[paidField]) !== undefined)
  const [show, setShow] = useState<'spent' | 'added'>(anySpent ? 'spent' : 'added')
  const rows =
    show === 'spent' && paidField !== undefined
      ? items.flatMap((i) => {
          const amount = parseMoney(i.fields[paidField])
          const date = (dateField !== undefined && i.fields[dateField]) || i.dateAdded
          return amount !== undefined ? [{ date, amount }] : []
        })
      : items.map((i) => ({ date: i.dateAdded, amount: 1 }))
  const months = byMonth(rows, 12)
  const sum = months.reduce((n, m) => n + m.total, 0)
  const text = (n: number) => (show === 'spent' ? money(n, true) : String(n))
  const compact = (n: number) =>
    n < 1000
      ? money(n, true)
      : new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n)
  return (
    <Card>
      {canSpend && (
        <Toggle
          options={[
            ['spent', 'Spent'],
            ['added', 'Added'],
          ]}
          value={show}
          onChange={setShow}
        />
      )}
      <p className="mb-3 text-sm">
        <span className="text-xl font-bold tabular-nums">{text(sum)}</span>{' '}
        <span className="text-stone-500">{show === 'spent' ? 'spent' : 'added'} in the last 12 months</span>
      </p>
      <MonthBars months={months} text={text} short={show === 'spent' ? compact : String} />
    </Card>
  )
}
