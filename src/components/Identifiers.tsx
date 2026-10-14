import { Copy } from 'lucide-react'
import type { Identifier } from '../api/discogs/types'
import { digitsOnly, formatBarcodeInput } from '../lib/barcode'
import { toast } from './Toaster'

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied', { tone: 'success' })
  } catch {
    toast("Couldn't copy that", { tone: 'error' })
  }
}

// Barcodes first, then runouts, then the rest (label codes, rights societies…)
const ORDER = ['Barcode', 'Matrix / Runout']
const rank = (t: string) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length)

export function Identifiers({ identifiers }: { identifiers: Identifier[] }) {
  if (!identifiers.length) return <p className="text-sm text-stone-500">Nothing listed on Discogs.</p>
  const sorted = [...identifiers].sort((a, b) => rank(a.type) - rank(b.type))
  return (
    <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      {sorted.map((id, i) => {
        // spaced barcodes are easier to compare with the one on the sleeve
        const value = id.type === 'Barcode' && /^[\d\s-]+$/.test(id.value) ? formatBarcodeInput(digitsOnly(id.value)) : id.value
        return (
          <li key={i}>
            {/* tap a row to copy it, e.g. to paste a runout somewhere else */}
            <button
              type="button"
              onClick={() => copy(id.value)}
              title="Copy"
              className="group flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
            >
              <span className="w-32 shrink-0 text-sm text-stone-500">
                {id.type}
                {id.description && <span className="block text-xs">{id.description}</span>}
              </span>
              <span className="min-w-0 flex-1 text-right font-mono text-sm break-words">{value}</span>
              <Copy size={14} className="shrink-0 self-center text-stone-500 opacity-60 group-hover:opacity-100" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
