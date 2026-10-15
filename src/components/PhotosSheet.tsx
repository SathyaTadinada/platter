import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Release } from '../api/discogs/types'

// Every photo Discogs has for a release, big enough to read labels and runouts
export function PhotosSheet({ release, onClose }: { release: Release; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  const images = release.images ?? []

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="photos-title"
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none flex-col rounded-t-3xl bg-white p-0 text-stone-900 open:flex sm:m-auto sm:max-w-2xl sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h2 id="photos-title" className="text-lg font-bold">
          Photos
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
      <ul className="min-h-0 flex-auto space-y-3 overflow-y-auto p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {images.map((img) => (
          <li key={img.uri}>
            <img
              src={img.uri}
              alt=""
              loading="lazy"
              width={img.width}
              height={img.height}
              className="h-auto w-full rounded-xl bg-stone-200 dark:bg-stone-800"
            />
          </li>
        ))}
      </ul>
    </dialog>
  )
}
