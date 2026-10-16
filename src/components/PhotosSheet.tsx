import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Release } from '../api/discogs/types'

// Every photo Discogs has for a release: a grid like the cover picker, and one at a time
// at full size once you tap it (labels and runouts are hard to read small)
export function PhotosSheet({ release, onClose }: { release: Release; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  const images = release.images ?? []
  const current = open !== null ? images[open] : undefined
  const step = (by: number) => setOpen((i) => (i === null ? i : (i + by + images.length) % images.length))

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      onKeyDown={(e) => {
        if (open === null) return
        if (e.key === 'ArrowLeft') step(-1)
        if (e.key === 'ArrowRight') step(1)
      }}
      aria-labelledby="photos-title"
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none flex-col rounded-t-3xl bg-white p-0 text-stone-900 open:flex sm:m-auto sm:max-w-lg sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-center gap-1 border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        {current && (
          <button
            type="button"
            aria-label="All photos"
            onClick={() => setOpen(null)}
            className="-ml-2 rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <h2 id="photos-title" className="flex-1 text-lg font-bold">
          {current ? `${open! + 1} of ${images.length}` : 'Photos'}
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

      <div className="min-h-0 flex-auto overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {current ? (
          <div className="relative">
            <img src={current.uri} alt="" className="mx-auto max-h-[65dvh] w-auto rounded-xl bg-stone-200 dark:bg-stone-800" />
            {images.length > 1 && (
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => step(-1)}
                  className="rounded-full bg-stone-100 p-2 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => step(1)}
                  className="rounded-full bg-stone-100 p-2 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <li key={img.uri}>
                <button type="button" onClick={() => setOpen(i)} className="block w-full overflow-hidden rounded-lg">
                  <img
                    src={img.uri150 || img.uri}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full bg-stone-200 object-cover dark:bg-stone-800"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}
