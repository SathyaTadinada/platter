import { useState } from 'react'
import { Row } from '../../components/CopyDetails'
import { PriceInput } from '../../components/PriceInput'
import { Sheet } from '../../components/Sheet'
import { Button, List } from '../../components/ui'
import type { WantItem } from '../../db/db'
import type { Watch } from '../../lib/priceWatch'
import { formatMoney, parseMoney, type PriceEntry } from '../../lib/value'

// The most you'd pay for a record on the wantlist
export function WatchSheet({
  want,
  watch,
  price,
  currency,
  onSave,
  onClose,
}: {
  want: WantItem
  watch?: Watch
  price?: PriceEntry
  currency: string
  onSave: (w: Watch | null) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(watch && watch.currency === currency ? String(watch.max) : '')
  const max = parseMoney(value)
  const valid = max !== undefined && max > 0
  return (
    <Sheet
      title="Watch the price"
      onClose={onClose}
      width="md"
      bodyClassName="p-4"
      footer={
        <div className="grid grid-cols-2 gap-2">
          {watch ? (
            <Button variant="secondary" onClick={() => onSave(null)}>
              Stop watching
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button type="submit" form="watch-form" disabled={!valid}>
            {watch ? 'Save' : 'Watch'}
          </Button>
        </div>
      }
    >
      <form
        id="watch-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onSave({ max, currency })
        }}
      >
        <p className="mb-3 truncate font-semibold">
          {want.title}
          {want.artist && <span className="font-normal text-stone-500"> · {want.artist}</span>}
        </p>
        <List>
          <Row label="Most you'd pay">
            <PriceInput value={value} onChange={setValue} aria-label="Most you'd pay" placeholder="Set" />
          </Row>
          {price && (
            <Row label="Cheapest now">
              <span className="block px-2 text-right font-medium tabular-nums">
                {price.lowest !== null ? `${formatMoney(price.lowest, currency)} · ${price.forSale} for sale` : 'None for sale'}
              </span>
            </Row>
          )}
        </List>
        <p className="mt-3 text-sm text-stone-500">Checked while Platter is open.</p>
      </form>
    </Sheet>
  )
}
