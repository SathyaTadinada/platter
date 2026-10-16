import { useState, type InputHTMLAttributes } from 'react'
import { useProfile } from './Profile'

// "$" (or "€"…) for a currency, and whether it goes before or after the number
function symbolOf(currency: string) {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(1)
    const i = parts.findIndex((p) => p.type === 'currency')
    return { symbol: parts[i]?.value ?? currency, after: i > parts.findIndex((p) => p.type === 'integer') }
  } catch {
    return { symbol: currency, after: false }
  }
}

// A price field that shows the currency symbol next to the number while there is one (or
// while typing), and "Add" when empty. The input sizes itself to its text, so the symbol
// sits right beside the number in a right-aligned row.
export function PriceInput({
  value,
  onChange,
  className = '',
  placeholder = 'Add',
  ...props
}: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const currency = useProfile()?.curr_abbr ?? 'USD'
  const { symbol, after } = symbolOf(currency)
  const [focused, setFocused] = useState(false)
  // saved values are formatted ("$12.00"); edit just the number
  const shown = value.replace(symbol, '').trim()
  const sign = (shown || focused) && <span className="shrink-0 font-medium text-stone-500">{symbol}</span>

  return (
    <label
      className={`flex min-h-10 w-full min-w-0 cursor-text items-center justify-end gap-0.5 rounded-lg px-2 hover:bg-stone-100 focus-within:bg-stone-100 focus-within:ring-2 focus-within:ring-accent/60 dark:hover:bg-stone-800 dark:focus-within:bg-stone-800 ${className}`}
    >
      {!after && sign}
      {/* the hidden copy of the text gives the input its width */}
      <span
        className="inline-grid min-w-0 after:invisible after:col-start-1 after:row-start-1 after:font-medium after:whitespace-pre after:content-[attr(data-value)]"
        data-value={shown || placeholder}
      >
        <input
          {...props}
          value={shown}
          inputMode="decimal"
          placeholder={placeholder}
          size={1}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            props.onBlur?.(e)
          }}
          className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-right font-medium placeholder:font-normal placeholder:text-stone-500 focus:outline-none"
        />
      </span>
      {after && sign}
    </label>
  )
}
