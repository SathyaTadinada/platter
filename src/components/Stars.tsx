import { Star } from 'lucide-react'

export function Stars({ value, onChange, size = 22 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  if (!onChange) {
    if (!value) return null
    return (
      <span className="inline-flex text-amber-500" aria-label={`${value} out of 5 stars`}>
        {Array.from({ length: value }, (_, i) => (
          <Star key={i} size={size} fill="currentColor" strokeWidth={0} aria-hidden />
        ))}
      </span>
    )
  }
  return (
    <div className="flex" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          // tapping the current rating clears it
          onClick={() => onChange(value === n ? 0 : n)}
          className="p-1 text-amber-500"
        >
          <Star size={size} fill={n <= value ? 'currentColor' : 'none'} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  )
}
