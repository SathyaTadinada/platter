import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './ui'

// A small centered dialog for "are you sure?" moments. Without onConfirm it's just a
// notice with an OK button. busy keeps it open (and Cancel disabled) while the action runs.
export function ConfirmDialog({
  title,
  children,
  action = 'OK',
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  children?: ReactNode
  action?: string
  busy?: string | null
  onConfirm?: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) {
      d.showModal()
      // the dialog itself takes focus, as sheets do: a focused button would show its keyboard
      // ring, and Enter shouldn't be one press away from the action. Tab still reaches both.
      d.focus()
    }
  }, [])
  const cancel = () => !busy && onCancel()

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby={children ? 'confirm-body' : undefined}
      onCancel={(e) => {
        e.preventDefault() // Escape
        cancel()
      }}
      onClick={(e) => e.target === ref.current && cancel()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl focus:outline-none bg-white p-6 text-stone-900 shadow-2xl dark:bg-stone-900 dark:text-stone-100"
    >
      <h2 id="confirm-title" className="text-lg font-semibold">
        {title}
      </h2>
      {children && (
        <div id="confirm-body" className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {children}
        </div>
      )}
      <div className={`mt-6 grid gap-2 ${onConfirm ? 'grid-cols-2' : ''}`}>
        {onConfirm ? (
          <>
            <Button variant="secondary" onClick={cancel} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={Boolean(busy)} className="disabled:opacity-100">
              {busy ?? action}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onCancel}>
            {action}
          </Button>
        )}
      </div>
    </dialog>
  )
}
