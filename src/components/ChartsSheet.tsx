import { Menu } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { defaultLayout, getLayout, move, setLayout, subscribeLayout, toggle, VALUE_SECTIONS, type SectionKey } from '../lib/statsLayout'
import { Sheet } from './Sheet'
import { Button } from './ui'

const label = Object.fromEntries(VALUE_SECTIONS) as Record<string, string>

type Drag = { key: SectionKey; from: number; startY: number; dy: number; rowH: number }

// Turn the Value view's sections on and off, and drag them into a different order
export function ChartsSheet({ onClose }: { onClose: () => void }) {
  const layout = useSyncExternalStore(subscribeLayout, getLayout)
  const [drag, setDrag] = useState<Drag | null>(null)

  const last = layout.order.length - 1
  const target = drag ? Math.min(last, Math.max(0, drag.from + Math.round(drag.dy / drag.rowH))) : -1

  // rows between the dragged one and where it would land slide over to make room
  const offset = (i: number) => {
    if (!drag) return 0
    if (i === drag.from) return drag.dy
    if (drag.from < target && i > drag.from && i <= target) return -drag.rowH
    if (target < drag.from && i >= target && i < drag.from) return drag.rowH
    return 0
  }

  return (
    <Sheet
      title="Choose charts"
      onClose={onClose}
      width="md"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setLayout(defaultLayout())}>
            Reset
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <ul>
        {layout.order.map((k, i) => {
          const shown = !layout.hidden.includes(k)
          const dragging = drag?.key === k
          return (
            <li
              key={k}
              style={{ transform: `translateY(${offset(i)}px)` }}
              className={`relative flex items-center gap-2 border-b border-stone-200 bg-white px-5 py-2 last:border-b-0 dark:border-stone-800 dark:bg-stone-900 ${
                dragging ? 'z-10 shadow-lg ring-1 ring-stone-200 dark:ring-stone-700' : drag ? 'transition-transform duration-150' : ''
              }`}
            >
              <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={shown} onChange={() => setLayout(toggle(layout, k))} className="size-5" />
                <span className={shown ? '' : 'text-stone-500'}>{label[k]}</span>
              </label>
              <button
                type="button"
                aria-label={`Reorder ${label[k]}`}
                title="Drag to reorder"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  const rowH = e.currentTarget.closest('li')!.offsetHeight
                  setDrag({ key: k, from: i, startY: e.clientY, dy: 0, rowH })
                }}
                onPointerMove={(e) => drag && setDrag({ ...drag, dy: e.clientY - drag.startY })}
                onPointerUp={() => {
                  if (drag && target !== drag.from) setLayout(move(layout, drag.key, target))
                  setDrag(null)
                }}
                onPointerCancel={() => setDrag(null)}
                // arrow keys do the same without a pointer
                onKeyDown={(e) => {
                  const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1
                  if (to < 0 || to > last) return
                  e.preventDefault()
                  setLayout(move(layout, k, to))
                }}
                className={`-mr-2 touch-none rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 ${
                  dragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                <Menu size={20} />
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
