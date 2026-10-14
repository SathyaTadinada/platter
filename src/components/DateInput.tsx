import { X } from 'lucide-react'

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export const formatDay = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

// A date shown the way the rest of the page shows dates ("Oct 14, 2026", or "Not set"),
// with the browser's own picker underneath: tapping the text opens the iOS wheel or the
// desktop calendar. The native field itself stays invisible, so its segmented editing
// and highlight colors never show.
export function DateInput({
  value,
  onChange,
  label,
  extra,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  extra?: React.ReactNode // e.g. a "Today" shortcut while it's empty
}) {
  const set = isoDate.test(value)
  return (
    <div className="flex items-center justify-end gap-1">
      {!set && extra}
      <label className="relative flex min-h-10 cursor-pointer items-center rounded-lg px-2 hover:bg-stone-100 focus-within:ring-2 focus-within:ring-accent-500/60 dark:hover:bg-stone-800">
        <span className={set ? 'font-medium' : 'text-stone-500'}>{set ? formatDay(value) : 'Not set'}</span>
        <input
          type="date"
          aria-label={label}
          value={set ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker()
            } catch {
              // older browsers open it on their own
            }
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      {set && (
        <button
          type="button"
          aria-label={`Clear ${label}`}
          onClick={() => onChange('')}
          className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-300"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
