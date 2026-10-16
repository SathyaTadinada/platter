import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
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
import { Sheet } from './Sheet'
import { Button, buttonClass, Spinner } from './ui'

// The accent shade that reads well on a light or dark card
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
    <Sheet
      title="Share"
      onClose={onClose}
      width="md"
      bodyClassName="p-5"
      footer={
        <div className="flex gap-2">
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
      }
    >
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
    </Sheet>
  )
}
