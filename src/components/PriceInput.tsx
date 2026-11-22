import { useLayoutEffect, useMemo, useReducer, useRef, useState, type InputHTMLAttributes } from 'react'
import { formatPrice } from '../lib/metadata'
import { parseMoney } from '../lib/value'
import { inline } from './CopyDetails'
import { useProfile } from './Profile'

// How a price is written here: what goes before and after the number, and the decimal point
export type PriceStyle = { before: string; after: string; point: string; locale?: string }

export function priceStyle(currency: string, locale?: string): PriceStyle {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(1234.5)
    const first = parts.findIndex((p) => p.type === 'integer')
    const last = parts.findLastIndex((p) => p.type === 'integer' || p.type === 'fraction')
    const join = (ps: Intl.NumberFormatPart[]) => ps.map((p) => p.value).join('')
    return {
      before: join(parts.slice(0, first)),
      after: join(parts.slice(last + 1)),
      point: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      locale,
    }
  } catch {
    return { before: '', after: ` ${currency}`, point: '.', locale }
  }
}

// Up to 9 digits, then a decimal point and two places after it at most
export function cleanPrice(s: string): string {
  const m = s.replace(/[^\d.]/g, '').match(/^(\d*)(?:\.(.*))?/)!
  const whole = m[1].slice(0, 9)
  return m[2] === undefined ? whole : `${whole}.${m[2].replace(/\./g, '').slice(0, 2)}`
}

// The number in a saved price ("$1,250.00" → "1250"), for editing
export function plainPrice(value: string): string {
  const n = parseMoney(value)
  if (n === undefined) return cleanPrice(value.replace(',', '.'))
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

// The number as you're typing it, written as a price: "1234.5" → "$1,234.5"
export function showPrice(raw: string, s: PriceStyle): string {
  if (!raw) return ''
  const [whole, cents] = raw.split('.')
  const grouped = new Intl.NumberFormat(s.locale, { maximumFractionDigits: 0 }).format(Number(whole || '0'))
  return s.before + grouped + (cents === undefined ? '' : s.point + cents) + s.after
}

// What was typed, back to just the number: the digits and the decimal point
export function readPrice(text: string, s: PriceStyle): string {
  let t = text
  if (s.before && t.startsWith(s.before)) t = t.slice(s.before.length)
  if (s.after && t.endsWith(s.after)) t = t.slice(0, -s.after.length)
  return cleanPrice(
    [...t]
      .filter((c) => /\d/.test(c) || c === s.point)
      .join('')
      .replace(s.point, '.'),
  )
}

// A price field like the others, written as a price while you type ("$1,234.5"), with the
// symbol and commas put in for you
export function PriceInput({
  value,
  onChange,
  className = '',
  placeholder = 'Add',
  ...props
}: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const currency = useProfile()?.curr_abbr ?? 'USD'
  const style = useMemo(() => priceStyle(currency), [currency])
  const [raw, setRaw] = useState<string | null>(null) // the number, while editing
  const ref = useRef<HTMLInputElement>(null)
  // how many of the number's characters are after the caret, to put it back once the commas move
  const caret = useRef<number | null>(null)
  // a key that changes nothing (a third decimal place, say) still needs the caret put back
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  // the tap that opens the field puts the caret at the end, not wherever it landed; later taps place it
  const opening = useRef(false)
  const text = raw === null ? (formatPrice(value, currency) ?? '') : showPrice(raw, style)
  const counts = (c: string) => /\d/.test(c) || c === style.point

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || caret.current === null || document.activeElement !== el) return
    let pos = el.value.length - (el.value ? style.after.length : 0)
    for (let n = 0; n < caret.current && pos > 0;) if (counts(el.value[--pos])) n++
    el.setSelectionRange(pos, pos)
    caret.current = null
  })

  return (
    <input
      {...props}
      ref={ref}
      value={text}
      inputMode="decimal"
      autoComplete="off"
      placeholder={raw === null ? placeholder : showPrice('0.00', style)}
      onFocus={(e) => {
        setRaw(plainPrice(value))
        caret.current = 0
        opening.current = true
        props.onFocus?.(e)
      }}
      onClick={(e) => {
        if (opening.current) {
          caret.current = 0
          redraw()
        }
        opening.current = false
        props.onClick?.(e)
      }}
      onChange={(e) => {
        opening.current = false
        const el = e.target
        const right = [...el.value.slice(el.selectionStart ?? el.value.length)].filter(counts).length
        let next = readPrice(el.value, style)
        // backspacing over a comma takes the digit before it, rather than the comma coming straight back
        if (next === (raw ?? '') && el.value.length < text.length) {
          const i = next.length - right
          if (i > 0) next = next.slice(0, i - 1) + next.slice(i)
        }
        caret.current = right
        setRaw(next)
        redraw()
        onChange(next)
      }}
      onBlur={(e) => {
        setRaw(null)
        props.onBlur?.(e)
      }}
      className={`${inline} ${className}`}
    />
  )
}
