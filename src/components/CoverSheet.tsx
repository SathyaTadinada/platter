import { Check } from 'lucide-react'
import type { Release } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { chooseCover, resetCover } from '../lib/covers'
import { Sheet } from './Sheet'
import { Button } from './ui'

// Pick which of the release's Discogs photos to show as its cover
export function CoverSheet({ item, release, onClose }: { item: LibraryItem; release?: Release; onClose: () => void }) {
  const images = release?.images ?? []

  return (
    <Sheet
      title="Cover"
      onClose={onClose}
      bodyClassName="p-4"
      footer={
        item.originalCover && (
          <Button variant="secondary" className="w-full" onClick={() => resetCover(item).then(onClose)}>
            Use the original cover
          </Button>
        )
      }
    >
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
                  className={`relative block w-full overflow-hidden rounded-lg ring-2 ${current ? 'ring-accent' : 'ring-transparent'}`}
                >
                  <img src={img.uri} alt="" loading="lazy" className="aspect-square w-full bg-stone-200 object-cover dark:bg-stone-800" />
                  {current && (
                    <span className="absolute top-1 right-1 rounded-full bg-accent p-0.5 text-accent-fg">
                      <Check size={14} strokeWidth={3} aria-hidden />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-stone-500">
          {release ? 'Discogs has no other photos of this release.' : 'Loading photos…'}
        </p>
      )}
    </Sheet>
  )
}
