import { useId, useState } from 'react'
import { formatLoan, lentFor, loanName, parseLoan } from '../lib/loans'
import { inline, Row } from './CopyDetails'
import { Sheet } from './Sheet'
import { toast } from './Toaster'
import { Button } from './ui'

// The Lent To field on a record page: who has it and for how long, or a way to lend it
export function LoanField({
  label,
  value,
  suggestions,
  saved,
  onSave,
}: {
  label: string
  value: string
  suggestions: string[]
  saved: boolean
  onSave: (v: string) => Promise<void> | void
}) {
  const [lending, setLending] = useState(false)
  const loan = parseLoan(value)

  async function returned() {
    await onSave('')
    toast(`Marked as back from ${loan!.to}`, { action: { label: 'Undo', onClick: () => onSave(value) } })
  }

  return (
    <Row label={label} saved={saved}>
      {loan ? (
        <span className="flex items-center justify-end gap-2">
          <span className="min-w-0 text-right">
            <span className="block truncate font-medium">{loan.to}</span>
            {loan.since && <span className="block text-xs text-stone-500">{lentFor(loan.since)}</span>}
          </span>
          <button
            type="button"
            onClick={returned}
            className="shrink-0 rounded-full bg-stone-200 px-3 py-1 text-sm font-medium hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            Got it back
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setLending(true)} className={`${inline} cursor-pointer font-normal text-stone-500`}>
          Lend it
        </button>
      )}
      {lending && (
        <LendSheet
          names={[...new Set(suggestions.map(loanName))]}
          onLend={(to) => {
            setLending(false)
            return onSave(formatLoan(to))
          }}
          onClose={() => setLending(false)}
        />
      )}
    </Row>
  )
}

function LendSheet({ names, onLend, onClose }: { names: string[]; onLend: (to: string) => void; onClose: () => void }) {
  const id = useId()
  const [to, setTo] = useState('')
  return (
    <Sheet
      title="Lend it"
      onClose={onClose}
      bodyClassName="p-4"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!to.trim()}>
            Lend
          </Button>
        </div>
      }
    >
      <form
        id={`${id}-form`}
        onSubmit={(e) => {
          e.preventDefault()
          if (to.trim()) onLend(to)
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Who's borrowing it?</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            list={names.length ? `${id}-names` : undefined}
            autoComplete="off"
            autoCapitalize="words"
            placeholder="Name"
            className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900"
          />
        </label>
        {names.length > 0 && (
          <datalist id={`${id}-names`}>
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        )}
      </form>
    </Sheet>
  )
}
