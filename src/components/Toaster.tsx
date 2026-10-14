import { CircleCheck, TriangleAlert, X } from 'lucide-react'
import { useSyncExternalStore } from 'react'

type Toast = {
  id: number
  message: string
  tone: 'info' | 'error' | 'success'
  action?: { label: string; onClick: () => void }
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

// Shows a short message at the bottom of the screen. The same message isn't
// stacked twice; showing it again just restarts its timer.
export function toast(message: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}) {
  const tone = opts.tone ?? 'info'
  toasts = toasts.filter((t) => t.message !== message)
  const t: Toast = { id: nextId++, message, tone, action: opts.action }
  toasts = [...toasts.slice(-2), t]
  emit()
  setTimeout(() => dismiss(t.id), tone === 'error' ? 10_000 : 5_000)
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts)
  if (!list.length) return null
  return (
    <div className="pointer-events-none flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-stone-900 py-2.5 pr-2 pl-4 text-sm text-stone-100 shadow-lg ring-1 ring-white/10 dark:bg-stone-800"
        >
          {t.tone === 'error' ? (
            <TriangleAlert size={18} className="shrink-0 text-amber-400" aria-hidden />
          ) : t.tone === 'success' ? (
            <CircleCheck size={18} className="shrink-0 text-emerald-400" aria-hidden />
          ) : null}
          <p className="min-w-0 flex-1">{t.message}</p>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick()
                dismiss(t.id)
              }}
              className="shrink-0 rounded-lg px-2 py-1 font-semibold text-accent-400"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="shrink-0 rounded-lg p-1 text-stone-400">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
