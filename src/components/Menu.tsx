import { Check, MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

// checkedMark: shown on the checked item in place of the tick, e.g. which way a sort runs
export type MenuItem = {
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  checked?: boolean
  checkedMark?: ReactNode
}

// Small dropdown, behind a "more" button unless given its own. Arrow keys move through it;
// it closes on Escape, an outside click, or focus moving elsewhere.
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
  const trigger = useRef<HTMLButtonElement>(null)
  const menuItems = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)') ?? [])]

  useEffect(() => {
    if (!open) return
    menuItems()[0]?.focus()
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return
    const list = menuItems()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const to = ({ ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: list.length - 1 } as Record<string, number>)[e.key]
    if (e.key === 'Escape') {
      setOpen(false)
      trigger.current?.focus()
    } else if (to !== undefined && list.length) {
      list[(to + list.length) % list.length].focus()
    } else return
    e.preventDefault()
  }

  return (
    <div
      ref={ref}
      onKeyDown={onKeyDown}
      // tabbing out closes it. No relatedTarget is usually a click inside, since Safari doesn't focus buttons.
      onBlur={(e) => e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      className={`relative ${className}`}
    >
      <button
        ref={trigger}
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
          aria-label={label}
          className={`absolute top-full z-30 mt-1 max-h-[70dvh] min-w-56 overflow-y-auto ${align === 'right' ? 'right-0' : 'left-0'} overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
                item.onSelect()
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-stone-100 focus-visible:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800 dark:focus-visible:bg-stone-800"
            >
              {item.icon && <span className="text-stone-500">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.checked && (item.checkedMark ?? <Check size={16} className="text-accent" aria-hidden />)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
