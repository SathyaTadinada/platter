import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Menu, Minus, Plus } from 'lucide-react'
import { useSyncExternalStore, type ReactNode } from 'react'
import { defaultLayout, getLayout, move, setLayout, subscribeLayout, toggle, VALUE_SECTIONS, type SectionKey } from '../lib/statsLayout'

const label = Object.fromEntries(VALUE_SECTIONS) as Record<SectionKey, string>

const wide = window.matchMedia('(min-width: 1024px)')
const subscribeWide = (f: () => void) => {
  wide.addEventListener('change', f)
  return () => wide.removeEventListener('change', f)
}

// The Value view's charts. The first card (the estimated value) stays put; the rest
// follow the saved order. On wide screens they alternate between two columns, so the
// order reads left to right, the same as the grid in edit mode.
export function ChartBoard({ first, sections, editing }: { first: ReactNode; sections: Record<SectionKey, ReactNode>; editing: boolean }) {
  const layout = useSyncExternalStore(subscribeLayout, getLayout)
  const twoColumns = useSyncExternalStore(subscribeWide, () => wide.matches)
  const visible = layout.order.filter((k) => !layout.hidden.includes(k))
  const hidden = layout.order.filter((k) => layout.hidden.includes(k))

  if (editing) return <Editor first={first} sections={sections} visible={visible} hidden={hidden} />

  const cards = [<div key="first">{first}</div>, ...visible.filter((k) => sections[k]).map((k) => <div key={k}>{sections[k]}</div>)]
  if (!twoColumns) return <>{cards}</>
  return (
    <div className="grid grid-cols-2 items-start gap-x-8">
      <div>{cards.filter((_, i) => i % 2 === 0)}</div>
      <div>{cards.filter((_, i) => i % 2 === 1)}</div>
    </div>
  )
}

function Editor({
  first,
  sections,
  visible,
  hidden,
}: {
  first: ReactNode
  sections: Record<SectionKey, ReactNode>
  visible: SectionKey[]
  hidden: SectionKey[]
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const name = (id: string | number) => label[id as SectionKey] ?? String(id)
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over ${name(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Moved ${name(active.id)}.` : `Put ${name(active.id)} back.`),
    onDragCancel: ({ active }) => `Put ${name(active.id)} back.`,
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const layout = getLayout()
    setLayout(move(layout, active.id as SectionKey, layout.order.indexOf(over.id as SectionKey)))
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements }}>
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          <div className="grid gap-4 md:grid-cols-2 lg:gap-x-8">
            <Frame title="Estimated value">{first}</Frame>
            {visible.map((k) => (
              <Tile key={k} id={k}>
                {sections[k] || <p className="text-sm text-stone-500">Nothing to show yet.</p>}
              </Tile>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {hidden.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setLayout(toggle(getLayout(), k))}
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-200 py-1.5 pr-3.5 pl-2.5 text-sm font-medium hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            <Plus size={16} aria-hidden /> {label[k]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLayout(defaultLayout())}
          className="ml-auto px-1 py-1.5 text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700 dark:hover:text-stone-300"
        >
          Reset
        </button>
      </div>
    </>
  )
}

function Tile({ id, children }: { id: SectionKey; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'relative z-10' : 'relative'}
    >
      <Frame
        title={label[id]}
        lifted={isDragging}
        before={
          <button
            type="button"
            aria-label={`Hide ${label[id]}`}
            onClick={() => setLayout(toggle(getLayout(), id))}
            className="-ml-1 grid size-7 place-items-center rounded-full bg-stone-200 text-stone-700 hover:bg-red-100 hover:text-red-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-red-950 dark:hover:text-red-300"
          >
            <Minus size={16} />
          </button>
        }
        after={
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Move ${label[id]}`}
            {...attributes}
            {...listeners}
            className={`-mr-1 touch-none rounded-full p-1.5 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            <Menu size={20} />
          </button>
        }
      >
        {children}
      </Frame>
    </div>
  )
}

// A shrunk, non-interactive preview of a chart under a small title bar
function Frame({
  title,
  before,
  after,
  lifted,
  children,
}: {
  title: string
  before?: ReactNode
  after?: ReactNode
  lifted?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-stone-100 ring-1 transition-shadow dark:bg-stone-900 ${
        lifted ? 'shadow-xl ring-stone-300 dark:ring-stone-600' : 'ring-stone-200 dark:ring-stone-800'
      }`}
    >
      <div className="flex min-h-12 items-center gap-2 px-3">
        {before}
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {after}
      </div>
      <div className="relative h-36" inert>
        {/* the section's own heading is already in the bar above */}
        <div className="pointer-events-none origin-top-left scale-[0.7] px-3 select-none [width:142.86%] [&_section]:mb-0 [&_section>h2]:hidden">
          {children}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-stone-100 dark:from-stone-900" />
      </div>
    </div>
  )
}
