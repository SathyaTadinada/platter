import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { Release } from '../api/discogs/types'
import { Sheet } from './Sheet'

// Every photo Discogs has for a release: a grid like the cover picker, and one at a time
// at full size once you tap it (labels and runouts are hard to read small)
export function PhotosSheet({ release, onClose }: { release: Release; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null)
  const images = release.images ?? []
  const current = open !== null ? images[open] : undefined
  const step = (by: number) => setOpen((i) => (i === null ? i : (i + by + images.length) % images.length))

  return (
    <Sheet
      title={current ? `${open! + 1} of ${images.length}` : 'Photos'}
      before={
        current && (
          <button
            type="button"
            aria-label="All photos"
            onClick={() => setOpen(null)}
            className="-ml-2 rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronLeft size={20} />
          </button>
        )
      }
      onClose={onClose}
      onKeyDown={(e) => {
        if (open === null) return
        if (e.key === 'ArrowLeft') step(-1)
        if (e.key === 'ArrowRight') step(1)
      }}
      bodyClassName="p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
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
              <button
                type="button"
                onClick={(e) => {
                  // this button goes away, and focus with it; keep it in the sheet so the arrow keys work
                  e.currentTarget.closest('dialog')?.focus()
                  setOpen(i)
                }}
                className="block w-full overflow-hidden rounded-lg"
              >
                <img
                  src={img.uri}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full bg-stone-200 object-cover dark:bg-stone-800"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
