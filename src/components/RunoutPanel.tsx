import { Disc3, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getRelease } from '../api/discogs/endpoints'
import type { Identifier, SearchResult } from '../api/discogs/types'
import { useSignedIn } from '../hooks/session'
import { confidence, rankByRunout, runoutCandidates, type Ranked, type RunoutResult } from '../lib/runout'
import { ReadPhotoButton } from './ReadPhotoButton'
import { Card } from './ui'

const SIDE_NAMES = ['Side A', 'Side B', 'Side C', 'Side D']

// Fetches release details (for their identifiers) one at a time, within the rate limit
function useIdentifiers(ids: number[], enabled: boolean) {
  const { client } = useSignedIn()
  const [map, setMap] = useState<Map<number, Identifier[]>>(new Map())
  const [done, setDone] = useState(0) // attempted, including ones that failed

  useEffect(() => {
    if (!enabled) return
    let live = true
    ;(async () => {
      for (const id of ids) {
        if (!live) return
        try {
          const r = await getRelease(client, id)
          if (live) setMap((m) => new Map(m).set(id, r.identifiers ?? []))
        } catch {
          // leave it out; it shows as having no runout info
        }
        if (live) setDone((n) => n + 1)
      }
    })()
    return () => {
      live = false
    }
  }, [ids, enabled, client])

  return { map, done }
}

// Lets the user type (or photograph) the runout of each side and ranks the
// candidates by how well Discogs' Matrix / Runout entries match.
// The panel can be opened from outside (its button sitting in a toolbar), or show its own button
export function RunoutPanel({
  candidates,
  onRanked,
  open: openProp,
  onOpenChange,
}: {
  candidates: SearchResult[]
  onRanked: (r: Ranked<SearchResult>[] | null) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (o: boolean) => {
    setOpenState(o)
    onOpenChange?.(o)
  }
  const [sides, setSides] = useState(['', ''])
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const ids = useMemo(() => candidates.map((c) => c.id), [candidates])
  const { map: identifiers, done } = useIdentifiers(ids, open)
  const typed = sides.some((s) => s.trim().length >= 2)

  const ranked = useMemo(
    () => (open && typed ? rankByRunout(candidates, sides, (c) => identifiers.get(c.id)) : null),
    [open, typed, candidates, sides, identifiers],
  )
  useEffect(() => onRanked(ranked), [ranked, onRanked])

  const setSide = (i: number, v: string) => setSides((s) => s.map((x, j) => (j === i ? v : x)))
  const fillNext = (v: string) =>
    setSides((s) => {
      const i = s.findIndex((x) => !x.trim())
      return i < 0 ? s.map((x, j) => (j === s.length - 1 ? v : x)) : s.map((x, j) => (j === i ? v : x))
    })

  if (!open) return openProp === undefined ? <RunoutButton onClick={() => setOpen(true)} /> : null

  return (
    <Card className="mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Match by runout</p>
        <button
          type="button"
          aria-label="Close"
          onClick={() => {
            setOpen(false)
            onRanked(null)
          }}
          className="-mr-2 rounded-full p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={18} />
        </button>
      </div>
      {sides.map((v, i) => (
        <label key={i} className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">{SIDE_NAMES[i]}</span>
          <input
            value={v}
            onChange={(e) => setSide(i, e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={i === 0 ? 'e.g. PB 41447 A2' : undefined}
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-transparent px-3 font-mono text-base dark:border-stone-700"
          />
        </label>
      ))}
      {sides.length < 4 && (
        <button type="button" onClick={() => setSides([...sides, ''])} className="inline-flex items-center gap-1 text-sm font-medium">
          <Plus size={16} aria-hidden /> Another side
        </button>
      )}

      <ReadPhotoButton label="Read it from a photo" onText={(t) => setSuggestions(runoutCandidates(t))} />
      {suggestions && (
        <div className="space-y-1.5">
          <p className="text-xs text-stone-500">
            {suggestions.length
              ? 'Found in the photo. Tap one to use it:'
              : "Couldn't read any text. Try closer, with light across the grooves."}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => fillNext(s)}
                className="rounded-full bg-stone-100 px-3 py-1 font-mono text-sm dark:bg-stone-800"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {done < ids.length && (
        <p className="text-xs text-stone-500">
          Checking runouts on Discogs: {done} of {ids.length}
        </p>
      )}
    </Card>
  )
}

const tones = {
  strong: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
  likely: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  weak: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  none: 'bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
}
const labels = { strong: 'Strong match', likely: 'Likely match', weak: 'Weak match', none: 'No match' }

// Badge plus the identifier each side matched
export function RunoutMatch({ result }: { result: RunoutResult }) {
  if (result.kind === 'nodata') return <p className="mt-1.5 text-xs text-stone-500">No runout info on Discogs</p>
  const c = confidence(result.score)
  return (
    <div className="mt-1.5 space-y-1">
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[c]}`}>
        {labels[c]} · {Math.round(result.score * 100)}%
      </span>
      {c !== 'none' &&
        result.matches.map((m, i) => (
          <p key={i} className="truncate text-xs text-stone-500">
            <span className="font-mono">{m.identifier.value}</span>
            {m.identifier.description ? ` (${m.identifier.description})` : ''}
          </p>
        ))}
    </div>
  )
}

export function RunoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Type or photograph what's etched near the label to find your pressing"
      className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-stone-200 px-3 text-sm font-medium hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700"
    >
      <Disc3 size={16} aria-hidden />
      Match by runout
    </button>
  )
}
