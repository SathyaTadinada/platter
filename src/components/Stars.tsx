import { Star } from 'lucide-react'
import { useState } from 'react'

export function Stars({ value, onChange, size = 22 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  if (!onChange) {
    if (!value) return null
    return (
      <span className="inline-flex text-accent" aria-label={`${value} out of 5 stars`}>
        {Array.from({ length: value }, (_, i) => (
          <Star key={i} size={size} fill="currentColor" strokeWidth={0} aria-hidden />
        ))}
      </span>
    )
  }
  return <EditableStars value={value} onChange={onChange} size={size} />
}

function EditableStars({ value, onChange, size }: { value: number; onChange: (n: number) => void; size: number }) {
  // while hovering, show what clicking would set
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)}
          // clicking the current rating clears it
          onClick={() => onChange(value === n ? 0 : n)}
          className="p-1 text-accent transition-transform hover:scale-110"
        >
          <Star
            size={size}
            fill={n <= shown ? 'currentColor' : 'none'}
            strokeWidth={1.75}
            className={hover && n <= hover && n > value ? 'opacity-60' : ''}
            aria-hidden
          />
        </button>
      ))}
    </div>
  )
}
