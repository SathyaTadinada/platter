import { useId, useState } from 'react'
import type { CollectionField } from '../../api/discogs/types'
import { DateInput } from '../../components/DateInput'
import { inline, kindOf, Row } from '../../components/CopyDetails'
import { PriceInput } from '../../components/PriceInput'
import { Sheet } from '../../components/Sheet'
import { Button, List } from '../../components/ui'
import { useFieldSuggestions } from '../../hooks/useFields'
import type { FieldKey, FieldMatch } from '../../lib/fields'
import { formatLoan } from '../../lib/loans'
import { formatPrice } from '../../lib/metadata'

const KEEP = 'keep'
const KEEP_LABEL = 'Leave as is'
// play counts and dates come from logging plays; setting them in bulk would undo that
const SKIP: FieldKey[] = ['playCount', 'lastPlayed']

// Sets custom fields on every selected record at once. Anything left as is isn't touched.
export function BulkEditSheet({
  count,
  fields,
  matches,
  currency,
  onApply,
  onClose,
}: {
  count: number
  fields: CollectionField[]
  matches: FieldMatch[] | null
  currency: string
  onApply: (changes: Record<number, string>) => void
  onClose: () => void
}) {
  const id = useId()
  const [changes, setChanges] = useState<Record<number, string>>({})
  const [stores, locations] = useFieldSuggestions(matches, ['purchasedFrom', 'location'])
  const keyOf = (f: CollectionField) => matches?.find((m) => m.field?.id === f.id)?.spec.key
  const shown = fields.filter((f) => !SKIP.includes(keyOf(f) as FieldKey))

  const set = (f: CollectionField, v: string | undefined) =>
    setChanges((c) => {
      const next = { ...c }
      if (v === undefined) delete next[f.id]
      else next[f.id] = v
      return next
    })
  // typed fields: empty means leave it alone
  const typed = (f: CollectionField, v: string) => set(f, v.trim() ? v : undefined)

  function apply() {
    const out: Record<number, string> = {}
    for (const f of shown) {
      if (!(f.id in changes)) continue
      const kind = kindOf(f, keyOf(f))
      const v = changes[f.id].trim()
      out[f.id] = kind === 'price' ? (formatPrice(v, currency) ?? '') : kind === 'loan' && v ? formatLoan(v) : v
    }
    onApply(out)
  }

  const n = Object.keys(changes).length
  const records = `${count} record${count === 1 ? '' : 's'}`

  return (
    <Sheet
      title={`Edit ${records}`}
      onClose={onClose}
      bodyClassName="space-y-3 p-4"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!n}>
            {n ? `Update ${count}` : 'Update'}
          </Button>
        </div>
      }
    >
      <p className="px-1 text-sm text-stone-500">Only the fields you change are updated.</p>
      <List>
        {shown.map((f) => {
          const key = keyOf(f)
          const value = changes[f.id] ?? ''
          switch (kindOf(f, key)) {
            case 'select':
              return (
                <Row key={f.id} label={f.name}>
                  <select
                    aria-label={f.name}
                    value={f.id in changes ? value : KEEP}
                    onChange={(e) => set(f, e.target.value === KEEP ? undefined : e.target.value)}
                    className={`${inline} cursor-pointer appearance-none [text-align-last:right] ${f.id in changes ? '' : 'font-normal text-stone-500'}`}
                  >
                    <option value={KEEP}>{KEEP_LABEL}</option>
                    <option value="">Not set</option>
                    {f.type === 'dropdown' &&
                      f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                  </select>
                </Row>
              )
            case 'price':
              return (
                <Row key={f.id} label={f.name}>
                  <PriceInput aria-label={f.name} value={value} onChange={(v) => typed(f, v)} placeholder={KEEP_LABEL} />
                </Row>
              )
            case 'date':
              return (
                <Row key={f.id} label={f.name}>
                  <DateInput value={value} onChange={(v) => typed(f, v)} label={f.name} placeholder={KEEP_LABEL} />
                </Row>
              )
            case 'notes':
              return (
                <Row key={f.id} label={f.name} stacked>
                  <textarea
                    aria-label={f.name}
                    value={value}
                    rows={3}
                    placeholder={KEEP_LABEL}
                    onChange={(e) => typed(f, e.target.value)}
                    className={`${inline} resize-none py-2 !text-left`}
                  />
                </Row>
              )
            default: {
              const list = key === 'purchasedFrom' ? stores : key === 'location' ? locations : []
              return (
                <Row key={f.id} label={f.name}>
                  <input
                    aria-label={f.name}
                    value={value}
                    placeholder={KEEP_LABEL}
                    onChange={(e) => typed(f, e.target.value)}
                    list={list.length ? `${id}-${f.id}` : undefined}
                    autoComplete="off"
                    className={inline}
                  />
                  {list.length > 0 && (
                    <datalist id={`${id}-${f.id}`}>
                      {list.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  )}
                </Row>
              )
            }
          }
        })}
      </List>
    </Sheet>
  )
}
