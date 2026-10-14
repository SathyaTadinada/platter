import { Check, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; checked?: boolean }

// Small dropdown, behind a "more" button unless given its own; closes on outside click or Escape
export function Menu({
  label,
  items,
  button,
  buttonClassName = 'rounded-full p-2 text-stone-700 hover:bg-stone-200 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800 dark:active:bg-stone-800',
  align = 'right',
  className = '',
}: {
  label: string
  items: MenuItem[]
  button?: ReactNode
  buttonClassName?: string
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={buttonClassName}
      >
        {button ?? <MoreHorizontal size={20} />}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1 max-h-[70dvh] min-w-56 overflow-y-auto ${align === 'right' ? 'right-0' : 'left-0'} overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
            >
              {item.icon && <span className="text-stone-500">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.checked && <Check size={16} className="text-accent" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
