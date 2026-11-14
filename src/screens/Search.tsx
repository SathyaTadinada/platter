import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, History, Music2, ScanBarcode, Tag, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { ReadPhotoButton } from '../components/ReadPhotoButton'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { useSignedIn } from '../hooks/session'
import { Menu } from '../components/Menu'
import { Button, buttonClass, List, Screen, Section, Segmented } from '../components/ui'
import { db } from '../db/db'
import { digitsOnly, formatBarcodeInput } from '../lib/barcode'
import { catnoCandidates } from '../lib/catno'
import { replaceAddress } from '../lib/nav'
import { clearSearches, RECENT_SEARCHES_KEY, type RecentSearch } from '../lib/recent'
import { Cover } from '../components/Cover'
import { readChoice, writePref } from '../lib/prefs'
import { People } from './search/People'
import { useCloud } from '../hooks/cloud'

// Music (anything on Discogs: records, CDs, tapes, files) or the people sharing it
type Kind = 'music' | 'people'
const KIND_KEY = 'platter.searchKind'
const savedKind = () => readChoice<Kind>(KIND_KEY, ['music', 'people'], 'music')

type Mode = 'barcode' | 'catno' | 'title'

const modes: { id: Mode; label: string; Icon: LucideIcon }[] = [
  { id: 'barcode', label: 'Barcode', Icon: ScanBarcode },
  { id: 'catno', label: 'Catalog number', Icon: Tag },
  { id: 'title', label: 'Artist & title', Icon: Music2 },
]
// the last way picked comes back next time, like the scanner's mode
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
  // People is part of the Platter account, so it's only there for someone signed in to one
  const social = useCloud().enabled
  const [chosen, setKindState] = useState<Kind>(() => (params.get('who') ? 'people' : savedKind()))
  const kind: Kind = social ? chosen : 'music'
  function setKind(k: Kind) {
    setKindState(k)
    writePref(KIND_KEY, k)
  }
  const [barcode, setBarcode] = useState(formatBarcodeInput(params.get('barcode') ?? ''))
  const [catno, setCatno] = useState(params.get('catno') ?? '')
  const [artist, setArtist] = useState(params.get('artist') ?? '')
  const [title, setTitle] = useState(params.get('title') ?? '')
  const [spine, setSpine] = useState<string[] | null>(null)

  const ready =
    mode === 'barcode' ? digitsOnly(barcode).length >= 8 : mode === 'catno' ? catno.trim().length > 0 : (artist + title).trim().length > 0

  const q = new URLSearchParams()
  if (mode === 'barcode' && digitsOnly(barcode)) q.set('barcode', digitsOnly(barcode))
  if (mode === 'catno' && catno.trim()) q.set('catno', catno.trim())
  if (mode === 'title') {
    if (artist.trim()) q.set('artist', artist.trim())
    if (title.trim()) q.set('title', title.trim())
  }
  const query = q.toString()

  // the page's address follows the form, so coming back to it (Back from the results, the tab,
  // a reload) finds it as it was left, and clearing a field clears it there too
  useEffect(() => {
    if (kind === 'people') return replaceAddress('/search?who=1')
    replaceAddress(query ? `/search?mode=${mode}&${query}` : '/search')
  }, [kind, mode, query])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (ready) navigate(`/results?${query}`)
  }

  // like Scan's modes and Stats' views, in the header
  const kinds = social ? (
    <Segmented
      label="What to search"
      className="lg:max-w-[26rem]"
      value={kind}
      onChange={setKind}
      options={[
        { value: 'music', label: 'Music' },
        { value: 'people', label: 'People' },
      ]}
    />
  ) : undefined

  return (
    <Screen title="Search" width="wide" toolbar={kinds}>
      <div className="lg:grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-12">
        <div>
          {kind === 'people' && <People />}
          {kind === 'music' && (
            <>
              <SearchBy mode={mode} onChange={setMode} />

              <form onSubmit={submit} className="space-y-3">
                {mode === 'barcode' && (
                  <>
                    <div className="flex gap-2">
                      <input
                        id="barcode"
                        aria-label="Barcode number"
                        className={`${input} min-w-0 flex-1`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={barcode}
                        onChange={(e) => setBarcode(formatBarcodeInput(e.target.value))}
                        placeholder="e.g. 5 012394 144777"
                      />
                      {/* the scanner lives on the Scan tab; this opens it set to look a record up */}
                      <Link
                        href="/scan?mode=single"
                        aria-label="Scan the barcode"
                        title="Scan the barcode"
                        className={buttonClass('secondary', 'w-12 shrink-0 px-0')}
                      >
                        <ScanBarcode size={20} aria-hidden />
                      </Link>
                    </div>
                  </>
                )}
                {mode === 'catno' && (
                  <>
                    <div className="flex gap-2">
                      <input
                        id="catno"
                        aria-label="Catalog number"
                        className={`${input} min-w-0 flex-1`}
                        autoCapitalize="characters"
                        autoComplete="off"
                        value={catno}
                        onChange={(e) => setCatno(e.target.value)}
                        placeholder="e.g. PB 41447"
                      />
                      {/* spines are usually printed sideways, so try both ways round */}
                      <ReadPhotoButton
                        compact
                        label="Read it from a photo of the spine"
                        rotations={[90, 270, 0]}
                        onText={(t) => setSpine(catnoCandidates(t))}
                      />
                    </div>
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
            </>
          )}
        </div>

        {/* a line between the two lists when both are there */}
        {kind === 'music' && (
          <div className="mt-8 lg:mt-0 [&>*+*]:border-t [&>*+*]:border-stone-200 [&>*+*]:pt-6 dark:[&>*+*]:border-stone-800">
            <RecentSearches />
            <RecentlyAdded />
          </div>
        )}
      </div>
    </Screen>
  )
}

// How to search for music, as a menu rather than a second row of tabs. The field below changes
// with it, along with what's beside it: the scanner for a barcode, a photo of the spine for a
// catalog number.
function SearchBy({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { Icon, label } = modes.find((m) => m.id === mode)!
  return (
    <Menu
      label="Search by"
      align="left"
      className="mb-3"
      buttonClassName="inline-flex min-h-9 items-center gap-2 rounded-full bg-stone-200 py-1 pr-3 pl-3.5 text-sm font-medium hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700"
      button={
        <>
          <Icon size={16} aria-hidden />
          {label}
          <ChevronDown size={16} aria-hidden className="text-stone-500" />
        </>
      }
      items={modes.map((m) => ({
        label: m.label,
        icon: <m.Icon size={18} />,
        checked: m.id === mode,
        onSelect: () => onChange(m.id),
      }))}
    />
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
  const { username } = useSignedIn()
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
        <p className="mt-2 px-1">
          <DiscogsCredit url={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`} />
        </p>
      </Section>
    </div>
  )
}
