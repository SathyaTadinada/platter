import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { defaultLayout, getLayout, move, setLayout, subscribeLayout, toggle, VALUE_SECTIONS } from '../lib/statsLayout'
import { Button } from './ui'

const label = Object.fromEntries(VALUE_SECTIONS) as Record<string, string>

// Turn the Value view's sections on and off, and move them up or down
export function ChartsSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const layout = useSyncExternalStore(subscribeLayout, getLayout)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="charts-title"
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col open:flex rounded-t-3xl bg-white p-0 text-stone-900 sm:m-auto sm:max-w-md sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h2 id="charts-title" className="text-lg font-bold">
          Choose charts
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mr-2 rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={20} />
        </button>
      </div>
      <ul className="min-h-0 flex-auto divide-y divide-stone-200 overflow-y-auto dark:divide-stone-800">
        {layout.order.map((k, i) => {
          const shown = !layout.hidden.includes(k)
          return (
            <li key={k} className="flex items-center gap-2 px-5 py-2">
              <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={shown} onChange={() => setLayout(toggle(layout, k))} className="size-5 accent-accent" />
                <span className={shown ? '' : 'text-stone-500'}>{label[k]}</span>
              </label>
              <button
                type="button"
                aria-label={`Move ${label[k]} up`}
                disabled={i === 0}
                onClick={() => setLayout(move(layout, k, -1))}
                className="rounded-full p-2 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"
              >
                <ArrowUp size={18} />
              </button>
              <button
                type="button"
                aria-label={`Move ${label[k]} down`}
                disabled={i === layout.order.length - 1}
                onClick={() => setLayout(move(layout, k, 1))}
                className="rounded-full p-2 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"
              >
                <ArrowDown size={18} />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2 border-t border-stone-200 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:border-stone-800">
        <Button variant="secondary" onClick={() => setLayout(defaultLayout())}>
          Reset
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </dialog>
  )
}
