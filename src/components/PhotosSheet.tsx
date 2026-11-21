import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { Release } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { chooseCover, resetCover } from '../lib/covers'
import { Sheet } from './Sheet'
import { Button } from './ui'
import { ZoomImage } from './ZoomImage'

const round = 'rounded-full bg-stone-100 p-2 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700'

// Every photo Discogs has for a release: a grid, and one at a time at full size once you tap it, to
// zoom into (labels and runouts are hard to read small). On your own copy, any of them can be its
// cover.
export function PhotosSheet({ release, own, onClose }: { release: Release; own?: LibraryItem; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null)
  const images = release.images ?? []
  const current = open !== null ? images[open] : undefined
  const step = (by: number) => setOpen((i) => (i === null ? i : (i + by + images.length) % images.length))
  const isCover = (uri: string) => own?.cover === uri

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
        if (open === null || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
        // the photo changes, and nothing behind it scrolls
        e.preventDefault()
        step(e.key === 'ArrowLeft' ? -1 : 1)
      }}
      footer={
        own?.originalCover && (
          <Button variant="secondary" className="w-full" onClick={() => resetCover(own)}>
            Use the original cover
          </Button>
        )
      }
      bodyClassName="p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      {current ? (
        <div>
          <div className="flex justify-center">
            {/* a new photo starts unzoomed */}
            <ZoomImage key={current.uri} src={current.uri} className="rounded-xl bg-stone-200 dark:bg-stone-800" onSwipe={step} />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            {images.length > 1 && (
              <button type="button" aria-label="Previous photo" onClick={() => step(-1)} className={round}>
                <ChevronLeft size={20} />
              </button>
            )}
            {own &&
              (isCover(current.uri) ? (
                <span className="inline-flex min-h-9 items-center gap-1.5 px-3 text-sm font-medium text-stone-500">
                  <Check size={16} aria-hidden />
                  Cover
                </span>
              ) : (
                <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => chooseCover(own, current.uri, current.uri150)}>
                  Use as cover
                </Button>
              ))}
            {images.length > 1 && (
              <button type="button" aria-label="Next photo" onClick={() => step(1)} className={round}>
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((img, i) => {
            const cover = isCover(img.uri)
            return (
              <li key={img.uri}>
                <button
                  type="button"
                  aria-label={`Photo ${i + 1} of ${images.length}${cover ? ', the cover' : ''}`}
                  onClick={(e) => {
                    // this button goes away, and focus with it; keep it in the sheet so the arrow keys work
                    e.currentTarget.closest('dialog')?.focus()
                    setOpen(i)
                  }}
                  className={`relative block w-full overflow-hidden rounded-lg ring-2 ${cover ? 'ring-accent' : 'ring-transparent'}`}
                >
                  <img src={img.uri} alt="" loading="lazy" className="aspect-square w-full bg-stone-200 object-cover dark:bg-stone-800" />
                  {cover && (
                    <span className="absolute top-1 right-1 rounded-full bg-accent p-0.5 text-accent-fg">
                      <Check size={14} strokeWidth={3} aria-hidden />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
