import { useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { Button, Screen } from '../components/ui'
import { ReadPhotoButton } from '../components/ReadPhotoButton'
import { digitsOnly, formatBarcodeInput } from '../lib/barcode'
import { catnoCandidates } from '../lib/catno'

type Mode = 'barcode' | 'catno' | 'title'

const modes: { id: Mode; label: string }[] = [
  { id: 'barcode', label: 'Barcode' },
  { id: 'catno', label: 'Catalog #' },
  { id: 'title', label: 'Artist & title' },
]

const input = 'min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900'

export function Search() {
  const params = new URLSearchParams(useSearch())
  const [, navigate] = useLocation()
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || 'barcode')
  const [barcode, setBarcode] = useState(params.get('barcode') ?? '')
  const [catno, setCatno] = useState(params.get('catno') ?? '')
  const [artist, setArtist] = useState(params.get('artist') ?? '')
  const [title, setTitle] = useState(params.get('title') ?? '')
  const [spine, setSpine] = useState<string[] | null>(null)

  const ready =
    mode === 'barcode' ? digitsOnly(barcode).length >= 8 : mode === 'catno' ? catno.trim().length > 0 : (artist + title).trim().length > 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    const q = new URLSearchParams()
    if (mode === 'barcode') q.set('barcode', digitsOnly(barcode))
    if (mode === 'catno') q.set('catno', catno.trim())
    if (mode === 'title') {
      if (artist.trim()) q.set('artist', artist.trim())
      if (title.trim()) q.set('title', title.trim())
    }
    navigate(`/results?${q}`)
  }

  return (
    <Screen title="Search">
      <div role="tablist" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-stone-200 p-1 dark:bg-stone-800">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`min-h-10 rounded-lg text-sm font-medium ${mode === m.id ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'barcode' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Barcode number</span>
            <input
              className={input}
              inputMode="numeric"
              autoComplete="off"
              value={barcode}
              onChange={(e) => setBarcode(formatBarcodeInput(e.target.value))}
              placeholder="e.g. 0 75678 16412 5"
            />
          </label>
        )}
        {mode === 'catno' && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Catalog number</span>
              <input
                className={input}
                autoCapitalize="characters"
                autoComplete="off"
                value={catno}
                onChange={(e) => setCatno(e.target.value)}
                placeholder="e.g. PB 41447"
              />
            </label>
            {/* spines are usually printed sideways, so try both ways round */}
            <ReadPhotoButton label="Read it from the spine" rotations={[90, 270, 0]} onText={(t) => setSpine(catnoCandidates(t))} />
            {spine && (
              <div className="space-y-1.5">
                <p className="text-xs text-stone-500">
                  {spine.length ? 'Found on the spine:' : "Couldn't find a catalog number. Try a closer, straighter photo."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {spine.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCatno(c)}
                      className="rounded-full bg-stone-200 px-3 py-1 font-mono text-sm dark:bg-stone-800"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {mode === 'title' && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Artist</span>
              <input className={input} autoComplete="off" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Title</span>
              <input className={input} autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </>
        )}
        <Button type="submit" className="w-full" disabled={!ready}>
          Search Discogs
        </Button>
      </form>
    </Screen>
  )
}
