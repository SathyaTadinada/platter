import type { LibraryItem } from '../db/db'
import { parseMoney, valueOf, type PriceEntry } from './value'

// Every record with what it's worth now, to print or keep as a PDF. Values follow the rest of the app: the
// suggested price for the copy's grade when there is one, otherwise the cheapest listing.

export type ReportRow = { item: LibraryItem; media?: string; sleeve?: string; paid?: number; value?: number }
export type ReportFields = { media?: number; sleeve?: number; paid?: number }

export function collectionReport(items: LibraryItem[], prices: Map<number, PriceEntry>, fields: ReportFields) {
  const get = (item: LibraryItem, id?: number) => (id !== undefined ? item.fields[id] || undefined : undefined)
  const rows: ReportRow[] = items
    .map((item) => {
      const media = get(item, fields.media)
      return {
        item,
        media,
        sleeve: get(item, fields.sleeve),
        paid: parseMoney(get(item, fields.paid)),
        value: valueOf(prices.get(item.releaseId), media)?.amount,
      }
    })
    .sort((a, b) => a.item.artist.localeCompare(b.item.artist) || a.item.title.localeCompare(b.item.title))
  const sum = (ns: (number | undefined)[]) => ns.reduce<number>((t, n) => t + (n ?? 0), 0)
  return {
    rows,
    value: sum(rows.map((r) => r.value)),
    paid: sum(rows.map((r) => r.paid)),
    unpriced: rows.filter((r) => r.value === undefined).length,
  }
}
