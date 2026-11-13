import { Menu } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { place, toggle, type LayoutStore, type Side } from '../lib/statsLayout'
import { Sheet } from './Sheet'
import { Button } from './ui'

const SIDES: Side[] = ['left', 'right']
const other = (s: Side): Side => (s === 'left' ? 'right' : 'left')

type Drag<K> = {
  key: K
  from: Side
  index: number
  startX: number
  startY: number
  dx: number
  dy: number
  rowH: number
  // where the row, both columns, and their rows were when the drag started
  row: DOMRect
  bounds: DOMRect
  lists: Record<Side, { rect: DOMRect; rows: DOMRect[] }>
}

// How far the row has moved, kept inside the two columns so it never slides off the sheet
function moveBy<K>(d: Drag<K>, x: number, y: number): Drag<K> {
  const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)
  return {
    ...d,
    dx: clamp(x - d.startX, d.bounds.left - d.row.left, d.bounds.right - d.row.right),
    // a row's worth below, to reach the end of the longer column
    dy: clamp(y - d.startY, d.bounds.top - d.row.top, d.bounds.bottom - d.row.bottom + d.rowH),
  }
}

// Where a dragged row would land: the column its middle is over (or the nearest one), and the
// position among that column's other rows
function dropAt<K>(d: Drag<K>): { side: Side; index: number } {
  const x = d.row.left + d.row.width / 2 + d.dx
  const y = d.row.top + d.row.height / 2 + d.dy
  const distance = (r: DOMRect) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))
  const side = distance(d.lists.left.rect) <= distance(d.lists.right.rect) ? 'left' : 'right'
  const rows = d.lists[side].rows.filter((_, i) => !(side === d.from && i === d.index))
  return { side, index: rows.filter((r) => r.top + r.height / 2 < y).length }
}

// Turn a Stats view's sections on and off, and drag them into either column and a different order
export function ChartsSheet<K extends string>({ store, onClose }: { store: LayoutStore<K>; onClose: () => void }) {
  const layout = useSyncExternalStore(store.subscribe, store.get)
  const label = Object.fromEntries(store.sections) as Record<K, string>
  const [drag, setDrag] = useState<Drag<K> | null>(null)
  const lists = useRef<Record<Side, HTMLUListElement | null>>({ left: null, right: null })
  const columns = useRef<HTMLDivElement>(null)
  const drop = drag ? dropAt(drag) : null
  // a row moved to the other column with the keyboard is a new element there; keep focus on it
  const [moved, setMoved] = useState<K | null>(null)
  useEffect(() => {
    if (moved) document.querySelector<HTMLElement>(`[data-move="${moved}"]`)?.focus()
  }, [moved, layout])

  // rows after the dragged one close its gap, and rows from where it would land open one
  const offset = (side: Side, i: number) => {
    if (!drag || !drop) return { x: 0, y: 0 }
    if (side === drag.from && i === drag.index) return { x: drag.dx, y: drag.dy }
    const closing = side === drag.from && i > drag.index
    const at = closing ? i - 1 : i
    const opening = side === drop.side && at >= drop.index
    return { x: 0, y: (closing ? -drag.rowH : 0) + (opening ? drag.rowH : 0) }
  }

  function start(e: React.PointerEvent<HTMLButtonElement>, key: K, side: Side, index: number) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const measure = (s: Side) => {
      const ul = lists.current[s]!
      return { rect: ul.getBoundingClientRect(), rows: [...ul.children].map((li) => li.getBoundingClientRect()) }
    }
    const li = e.currentTarget.closest('li')!
    const rowH = li.offsetHeight
    setDrag({
      key,
      from: side,
      index,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      rowH,
      row: li.getBoundingClientRect(),
      bounds: columns.current!.getBoundingClientRect(),
      lists: { left: measure('left'), right: measure('right') },
    })
  }

  return (
    <Sheet
      title="Choose charts"
      onClose={onClose}
      width="xl"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => store.set(store.defaults())}>
            Reset
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div ref={columns} className="grid gap-x-4 gap-y-2 p-4 sm:grid-cols-2">
        {SIDES.map((side) => (
          <section key={side} aria-labelledby={`charts-${side}`}>
            <h3 id={`charts-${side}`} className="mb-2 px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
              {side === 'left' ? 'Left column' : 'Right column'}
            </h3>
            <ul
              ref={(el) => {
                lists.current[side] = el
              }}
              // the column a row is headed for grows by a row, so the ones pushed down stay inside it
              style={{ paddingBottom: drag && drop?.side === side && side !== drag.from ? drag.rowH : undefined }}
              className={`min-h-14 rounded-2xl ${
                layout[side].length
                  ? 'ring-1 ring-stone-200 dark:ring-stone-800'
                  : 'border-2 border-dashed border-stone-300 dark:border-stone-700'
              }`}
            >
              {layout[side].map((k, i) => {
                const on = !layout.hidden.includes(k)
                const dragging = drag?.key === k
                const { x, y } = offset(side, i)
                return (
                  <li
                    key={k}
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                    className={`relative flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-1.5 first:rounded-t-2xl last:rounded-b-2xl last:border-b-0 dark:border-stone-800 dark:bg-stone-900 ${
                      dragging
                        ? 'z-10 rounded-2xl shadow-lg ring-1 ring-stone-200 dark:ring-stone-700'
                        : drag
                          ? 'transition-transform duration-150'
                          : ''
                    }`}
                  >
                    <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={on} onChange={() => store.set(toggle(layout, k))} className="size-5 shrink-0" />
                      <span className={on ? '' : 'text-stone-500'}>{label[k]}</span>
                    </label>
                    <button
                      type="button"
                      data-move={k}
                      aria-label={`Move ${label[k]}`}
                      title="Drag to move"
                      onPointerDown={(e) => start(e, k, side, i)}
                      onPointerMove={(e) => drag && setDrag(moveBy(drag, e.clientX, e.clientY))}
                      onPointerUp={() => {
                        if (drag && drop && (drop.side !== drag.from || drop.index !== drag.index))
                          store.set(place(layout, drag.key, drop.side, drop.index))
                        setDrag(null)
                      }}
                      onPointerCancel={() => setDrag(null)}
                      // arrow keys do the same without a pointer: up and down within a column, left and right across
                      onKeyDown={(e) => {
                        const across = (e.key === 'ArrowLeft' && side === 'right') || (e.key === 'ArrowRight' && side === 'left')
                        const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1
                        if (across) {
                          store.set(place(layout, k, other(side), Math.min(i, layout[other(side)].length)))
                          setMoved(k)
                        } else if (to >= 0 && to < layout[side].length) store.set(place(layout, k, side, to))
                        else return
                        e.preventDefault()
                      }}
                      className={`-mr-2 shrink-0 touch-none rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 ${
                        dragging ? 'cursor-grabbing' : 'cursor-grab'
                      }`}
                    >
                      <Menu size={20} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
