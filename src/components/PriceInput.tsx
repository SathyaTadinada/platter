import { useState, type InputHTMLAttributes } from 'react'
import { formatPrice } from '../lib/metadata'
import { parseMoney } from '../lib/value'
import { inline } from './CopyDetails'
import { useProfile } from './Profile'

// Up to 9 digits, then one decimal point (or comma) and two places after it at most. The first
// point or comma typed is the decimal one, since nothing here is written with thousands separators.
export function cleanPrice(s: string): string {
  const m = s.replace(/[^\d.,]/g, '').match(/^(\d*)(?:([.,])(.*))?/)!
  const whole = m[1].slice(0, 9)
  return m[2] === undefined ? whole : `${whole}${m[2]}${m[3].replace(/[.,]/g, '').slice(0, 2)}`
}

// The number in a saved price ("$1,250.00" → "1250"), for editing
export function plainPrice(value: string): string {
  const n = parseMoney(value)
  if (n === undefined) return cleanPrice(value)
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

// A price field like the others: the price as it reads ("$12.00", or "Add") until you tap it,
// then just the number while you type.
export function PriceInput({
  value,
  onChange,
  className = '',
  placeholder = 'Add',
  ...props
}: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const currency = useProfile()?.curr_abbr ?? 'USD'
  const [text, setText] = useState<string | null>(null) // while editing
  return (
    <input
      {...props}
      value={text ?? formatPrice(value, currency) ?? ''}
      inputMode="decimal"
      autoComplete="off"
      placeholder={text === null ? placeholder : '0.00'}
      onFocus={(e) => {
        setText(plainPrice(value))
        // swapping the text puts the caret at the start; typing goes on the end
        const el = e.currentTarget
        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
        props.onFocus?.(e)
      }}
      onChange={(e) => {
        const next = cleanPrice(e.target.value)
        setText(next)
        onChange(next)
      }}
      onBlur={(e) => {
        setText(null)
        props.onBlur?.(e)
      }}
      className={`${inline} ${className}`}
    />
  )
}
