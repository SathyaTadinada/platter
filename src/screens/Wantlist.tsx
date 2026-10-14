import { useLiveQuery } from 'dexie-react-hooks'
import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addWant, removeWant } from '../api/discogs/endpoints'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { toast } from '../components/Toaster'
import { Notice, Screen, Spinner, useBack } from '../components/ui'
import { db, type WantItem } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { syncWants } from '../lib/sync'

// What you're looking for. Each one opens its release page, where it can be added
// to the collection; the heart takes it off the list.
export function Wantlist() {
  const { client, username } = useSignedIn()
  const back = useBack('/')
  const [error, setError] = useState<string | null>(null)
  const wants = useLiveQuery(() => db.wants.toArray(), [])
  const owned = useLiveQuery(async () => {
    const items = await db.collection.toArray()
    return { releases: new Set(items.map((i) => i.releaseId)), masters: new Set(items.map((i) => i.masterId).filter(Boolean)) }
  }, [])

  // wants synced before this page existed have no title yet
  const missing = wants?.some((w) => !w.title)
  useEffect(() => {
    if (missing) syncWants(client, username).catch((e) => setError((e as Error).message))
  }, [missing, client, username])

  async function remove(w: WantItem) {
    try {
      await removeWant(client, username, w.releaseId)
      await db.wants.delete(w.releaseId)
      toast(`Took ${w.title ?? 'it'} off your wantlist`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await addWant(client, username, w.releaseId)
            await db.wants.put(w)
          },
        },
      })
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    }
  }

  const sorted = [...(wants ?? [])].sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''))
  const note = (w: WantItem) =>
    owned?.releases.has(w.releaseId) ? 'You own this one' : owned?.masters.has(w.masterId) ? 'You own another pressing' : undefined

  return (
    // the empty state centers on the whole page, like the other empty states
    <Screen title="Wantlist" back={back} width={wants && !wants.length ? 'full' : 'narrow'}>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!wants ? (
        <Spinner />
      ) : !wants.length ? (
        <div className="py-12 text-center">
          <Heart size={40} className="mx-auto text-stone-400" aria-hidden />
          <p className="mt-3 font-semibold">Nothing on your wantlist</p>
          <p className="mt-1 text-sm text-stone-500">Search for a record and tap Add to wantlist.</p>
        </div>
      ) : (
        <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
          {sorted.map((w) => (
            <li key={w.releaseId} className="flex items-center">
              <div className="min-w-0 flex-1">
                <RecordRow
                  item={{
                    instanceId: 0,
                    cover: undefined,
                    thumb: w.thumb,
                    title: w.title ?? `Release ${w.releaseId}`,
                    artist: w.artist ?? '',
                  }}
                  href={`/release/${w.releaseId}`}
                  detail={[w.artist, w.format?.split(',')[0], w.year].filter(Boolean).join(' · ')}
                >
                  {note(w) && <span className="text-xs font-medium text-accent-ink">{note(w)}</span>}
                </RecordRow>
              </div>
              <button
                type="button"
                onClick={() => remove(w)}
                aria-label={`Take ${w.title ?? 'this'} off your wantlist`}
                title="Take off your wantlist"
                className="mr-2 shrink-0 rounded-full p-2.5 text-rose-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <Heart size={20} className="fill-current" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {wants && wants.length > 0 && (
        <p className="mt-4">
          <DiscogsCredit url={`https://www.discogs.com/wantlist?user=${encodeURIComponent(username)}`} />
        </p>
      )}
    </Screen>
  )
}
