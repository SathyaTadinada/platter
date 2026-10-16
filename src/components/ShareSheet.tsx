import { useLiveQuery } from 'dexie-react-hooks'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { useListening } from '../hooks/plays'
import { useCurrency } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { recordCollectionValue } from '../lib/pricing'
import { CARD, cardFacts, drawCard, type CardTheme } from '../lib/shareCard'
import { Toggle } from './stats'
import { formatMoney } from '../lib/value'
import { toast } from './Toaster'
import { Button, buttonClass, Spinner } from './ui'

// The accent shade that reads well on the card, whatever theme the app is in right now
function cardAccent(theme: CardTheme) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(theme === 'dark' ? '--color-accent-400' : '--color-accent-700')
  return v.trim() || '#b45309'
}

const appIsDark = () => {
  const root = document.documentElement.classList
  return root.contains('dark') || (!root.contains('light') && matchMedia('(prefers-color-scheme: dark)').matches)
}

// A picture of the collection's numbers to save or send
export function ShareSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { client, username } = useSignedIn()
  const currency = useCurrency()
  const items = useLiveQuery(() => db.collection.toArray(), [])
  const listening = useListening()
  const value = useAsync(
    () => (currency ? recordCollectionValue(client, username, currency) : Promise.resolve(undefined)),
    [client, username, currency],
  )
  const [image, setImage] = useState<{ url: string; file: File } | null>(null)
  const [theme, setTheme] = useState<CardTheme>(appIsDark() ? 'dark' : 'light')

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  const ready = items && listening && currency && !value.loading
  useEffect(() => {
    if (!ready) return
    const total = value.data && formatMoney(value.data.snap.median, currency, { whole: true })
    const canvas = document.createElement('canvas')
    drawCard(canvas, cardFacts(username, items, listening.rows, total), cardAccent(theme), location.host, theme)
    let url = ''
    canvas.toBlob((blob) => {
      if (!blob) return
      url = URL.createObjectURL(blob)
      setImage({ url, file: new File([blob], `${username}-records.png`, { type: 'image/png' }) })
    }, 'image/png')
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [ready, items, listening, value.data, currency, username, theme])

  const canShare = Boolean(image && navigator.canShare?.({ files: [image.file] }))

  async function share() {
    if (!image) return
    try {
      await navigator.share({ files: [image.file] })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast("Couldn't share that", { tone: 'error' })
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="share-title"
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none flex-col rounded-t-3xl bg-white p-0 text-stone-900 open:flex sm:m-auto sm:max-w-md sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h2 id="share-title" className="text-lg font-bold">
          Share
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
      <div className="min-h-0 flex-auto overflow-y-auto p-5">
        <div className="flex justify-center">
          <Toggle
            options={[
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]}
            value={theme}
            onChange={setTheme}
          />
        </div>
        <div
          className="mx-auto w-full max-w-72 overflow-hidden rounded-2xl ring-1 ring-stone-200 dark:ring-stone-700"
          style={{ aspectRatio: `${CARD.width} / ${CARD.height}` }}
        >
          {image ? (
            <img src={image.url} alt="Your collection's numbers" className="size-full" />
          ) : (
            <div className="grid size-full place-items-center">
              <Spinner />
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 border-t border-stone-200 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:border-stone-800">
        {canShare && (
          <Button className="flex-1" onClick={share} disabled={!image}>
            Share
          </Button>
        )}
        <a
          href={image?.url}
          download={image?.file.name}
          aria-disabled={!image}
          className={buttonClass(canShare ? 'secondary' : 'primary', `flex-1 ${image ? '' : 'pointer-events-none opacity-40'}`)}
        >
          Save image
        </a>
      </div>
    </dialog>
  )
}
