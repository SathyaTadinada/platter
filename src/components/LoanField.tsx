import { useId, useState } from 'react'
import { formatLoan, lentFor, loanName, parseLoan } from '../lib/loans'
import { inline, Row } from './CopyDetails'
import { toast } from './Toaster'

// The Lent To field on a record page: who has it and for how long, or the name typed in like
// any other field (saved with today's date, so the page can say how long it's been out)
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
  const id = useId()
  const [draft, setDraft] = useState('')
  const loan = parseLoan(value)
  const names = [...new Set(suggestions.map(loanName))]

  async function returned() {
    await onSave('')
    toast(`Marked as back from ${loan!.to}`, { action: { label: 'Undo', onClick: () => onSave(value) } })
  }

  async function lend() {
    const to = draft.trim()
    if (!to) return
    setDraft('')
    await onSave(formatLoan(to))
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
        <>
          <input
            aria-label={label}
            value={draft}
            placeholder="Add"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={lend}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            list={names.length ? `${id}-names` : undefined}
            autoComplete="off"
            autoCapitalize="words"
            className={inline}
          />
          {names.length > 0 && (
            <datalist id={`${id}-names`}>
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          )}
        </>
      )}
    </Row>
  )
}
