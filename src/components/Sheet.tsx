import { X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

const widths = { md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl' }
// "page" is the app's own background, so cards inside stand out from it
const backgrounds = { plain: 'bg-white dark:bg-stone-900', page: 'bg-stone-50 dark:bg-stone-950' }

// Opens a dialog as a modal and puts focus back on whatever opened it once it's gone.
// Dialogs here close by unmounting, which skips the browser's own focus restore.
export function useModal(ref: RefObject<HTMLDialogElement | null>, focusSelf = true) {
  const opener = useRef<Element | null>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) {
      opener.current ??= document.activeElement
      d.showModal()
      // otherwise the browser focuses the first control, which opens selects on some phones
      if (focusSelf) d.focus()
    }
    return () => {
      // still in the page means a dev-mode remount, not a close
      if (d?.isConnected) return
      const to = opener.current
      const lost = !document.activeElement || document.activeElement === document.body
      if (lost && to instanceof HTMLElement && to.isConnected) to.focus()
    }
  }, [])
}

// A modal that slides up from the bottom on phones and sits in the middle on bigger
// screens: title bar with a close button, a scrolling body, and an optional footer.
export function Sheet({
  title,
  before,
  onClose,
  footer,
  width = 'lg',
  background = 'plain',
  bodyClassName = '',
  onKeyDown,
  children,
}: {
  title: ReactNode
  before?: ReactNode // e.g. a back arrow left of the title
  onClose: () => void
  footer?: ReactNode
  width?: keyof typeof widths
  background?: keyof typeof backgrounds
  bodyClassName?: string
  onKeyDown?: (e: KeyboardEvent<HTMLDialogElement>) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useModal(ref)

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      onKeyDown={onKeyDown}
      aria-labelledby={titleId}
      className={`m-0 mt-auto max-h-[90dvh] w-full max-w-none flex-col rounded-t-3xl p-0 text-stone-900 open:flex focus:outline-none sm:m-auto sm:rounded-3xl dark:text-stone-100 ${backgrounds[background]} ${widths[width]}`}
    >
      <div className="flex items-center gap-1 border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        {before}
        <h2 id={titleId} className="min-w-0 flex-1 text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="relative -mr-2 shrink-0 rounded-full p-2 after:absolute after:-inset-1 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={20} />
        </button>
      </div>
      <div className={`min-h-0 flex-auto overflow-y-auto ${bodyClassName}`}>{children}</div>
      {footer && (
        <div className="border-t border-stone-200 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:border-stone-800">
          {footer}
        </div>
      )}
    </dialog>
  )
}
