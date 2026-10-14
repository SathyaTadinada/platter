import { Check, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Release } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { chooseCover, resetCover } from '../lib/covers'
import { Button } from './ui'

// Pick which of the release's Discogs photos to show as its cover
export function CoverSheet({ item, release, onClose }: { item: LibraryItem; release?: Release; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  const images = release?.images ?? []

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="cover-title"
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col rounded-t-3xl bg-white p-0 text-stone-900 open:flex sm:m-auto sm:max-w-lg sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h2 id="cover-title" className="text-lg font-bold">
          Cover
        </h2>
        <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800">
          <X size={20} />
        </button>
      </div>
      <div className="min-h-0 flex-auto overflow-y-auto p-4">
        {images.length ? (
          <ul className="grid grid-cols-3 gap-2">
            {images.map((img) => {
              const current = img.uri === item.cover
              return (
                <li key={img.uri}>
                  <button
                    type="button"
                    aria-pressed={current}
                    onClick={() => chooseCover(item, img.uri, img.uri150).then(onClose)}
                    className={`relative block w-full overflow-hidden rounded-lg ring-2 ${current ? 'ring-accent-500' : 'ring-transparent'}`}
                  >
                    <img src={img.uri150} alt="" loading="lazy" className="aspect-square w-full bg-stone-200 object-cover dark:bg-stone-800" />
                    {current && (
                      <span className="absolute top-1 right-1 rounded-full bg-accent-500 p-0.5 text-stone-950">
                        <Check size={14} strokeWidth={3} aria-hidden />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-stone-500">{release ? 'Discogs has no other photos of this release.' : 'Loading photos…'}</p>
        )}
      </div>
      {item.originalCover && (
        <div className="border-t border-stone-200 p-4 dark:border-stone-800">
          <Button variant="secondary" className="w-full" onClick={() => resetCover(item).then(onClose)}>
            Use the original cover
          </Button>
        </div>
      )}
    </dialog>
  )
}
