import { useLiveQuery } from 'dexie-react-hooks'
import { History, Music2, ScanBarcode, Tag, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { ReadPhotoButton } from '../components/ReadPhotoButton'
import { Button, List, Screen, Section } from '../components/ui'
import { db } from '../db/db'
import { digitsOnly, formatBarcodeInput } from '../lib/barcode'
import { catnoCandidates } from '../lib/catno'
import { clearSearches, RECENT_SEARCHES_KEY, type RecentSearch } from '../lib/recent'
import { Cover } from './Collection'
import { readChoice, writePref } from '../lib/prefs'

type Mode = 'barcode' | 'catno' | 'title'

const modes: { id: Mode; label: string; Icon: LucideIcon }[] = [
  { id: 'barcode', label: 'Barcode', Icon: ScanBarcode },
  { id: 'catno', label: 'Catalog #', Icon: Tag },
  { id: 'title', label: 'Artist & title', Icon: Music2 },
]
// the last tab picked comes back next time, like the scanner's mode
const MODE_KEY = 'platter.searchMode'
const savedMode = () => readChoice<Mode>(MODE_KEY, ['barcode', 'catno', 'title'], 'barcode')

const iconFor = Object.fromEntries(modes.map((m) => [m.id, m.Icon])) as Record<Mode, LucideIcon>

const input = 'min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900'

export function Search() {
  const params = new URLSearchParams(useSearch())
  const [, navigate] = useLocation()
  const [mode, setModeState] = useState<Mode>(() => {
    const asked = params.get('mode')
    return asked && modes.some((m) => m.id === asked) ? (asked as Mode) : savedMode()
  })
  function setMode(m: Mode) {
    setModeState(m)
    writePref(MODE_KEY, m)
  }
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
    <Screen title="Search" width="wide">
      <div className="lg:grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12">
        <div>
          <div role="tablist" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-stone-200 p-1 dark:bg-stone-800">
            {modes.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => setMode(id)}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium ${
                  mode === id ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                <Icon size={16} aria-hidden className="hidden sm:block" />
                {label}
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
                  placeholder="e.g. 5 012394 144777"
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
        </div>

        {/* a line between the two lists when both are there */}
        <div className="mt-8 lg:mt-0 [&>*+*]:border-t [&>*+*]:border-stone-200 [&>*+*]:pt-6 dark:[&>*+*]:border-stone-800">
          <RecentSearches />
          <RecentlyAdded />
        </div>
      </div>
    </Screen>
  )
}

function RecentSearches() {
  const recent = useLiveQuery(async () => ((await db.settings.get(RECENT_SEARCHES_KEY))?.value as RecentSearch[] | undefined) ?? [], [])
  if (!recent?.length) return null
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Recent searches</h2>
        <button type="button" onClick={clearSearches} className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300">
          Clear
        </button>
      </div>
      <List>
        {recent.map((r) => {
          const Icon = iconFor[r.kind] ?? History
          return (
            <li key={r.url}>
              <Link href={r.url} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                <Icon size={18} className="shrink-0 text-stone-500" aria-hidden />
                <span className={`min-w-0 truncate ${r.kind === 'title' ? '' : 'font-mono text-sm'}`}>
                  {r.kind === 'barcode' ? formatBarcodeInput(r.label) : r.label}
                </span>
              </Link>
            </li>
          )
        })}
      </List>
    </section>
  )
}

// Desktop only: a quick way back to what was just added
function RecentlyAdded() {
  const items = useLiveQuery(() => db.collection.orderBy('dateAdded').reverse().limit(5).toArray(), [])
  if (!items?.length) return null
  return (
    <div className="hidden lg:block">
      <Section title="Recently added">
        <List>
          {items.map((i) => (
            <li key={i.instanceId}>
              <Link
                href={`/collection/${i.instanceId}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/50"
              >
                <Cover item={i} small className="size-10 shrink-0 rounded-md" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{i.title}</span>
                  <span className="block truncate text-xs text-stone-500">{i.artist}</span>
                </span>
              </Link>
            </li>
          ))}
        </List>
      </Section>
    </div>
  )
}
