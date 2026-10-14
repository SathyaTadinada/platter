import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Heart, ScanBarcode } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { addWant, getOwnedInstances, getRelease, removeWant } from '../api/discogs/endpoints'
import { AddForm, type Added } from '../components/AddForm'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { Identifiers } from '../components/Identifiers'
import { MarketPrice } from '../components/MarketPrice'
import { RecordRow, statCard } from '../components/stats'
import { buttonClass, Notice, Screen, Section, Spinner, useBack } from '../components/ui'
import { db } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { discogsUrl } from '../lib/format'
import { joinArtists } from '../lib/library'
import { Cover } from './Collection'
import { Tracklist } from './Record'

// A Discogs release you looked up: everything the record page shows, plus adding it
export function Release({ id }: { id: string }) {
  const releaseId = Number(id)
  const { client, username } = useSignedIn()
  const back = useBack('/search')
  const release = useAsync(() => getRelease(client, releaseId), [client, releaseId])
  const [added, setAdded] = useState<Added | null>(null)
  const [wantBusy, setWantBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const r = release.data
  const own = useLiveQuery(async () => {
    const copies = await db.collection.where('releaseId').equals(releaseId).toArray()
    const pressings = r?.master_id
      ? (await db.collection.where('masterId').equals(r.master_id).toArray()).filter((p) => p.releaseId !== releaseId)
      : []
    const wanted = Boolean(await db.wants.get(releaseId))
    return { copies, pressings, wanted }
  }, [releaseId, r?.master_id])
  // the local index might be a few hours old; check this one live too
  const live = useAsync(() => getOwnedInstances(client, username, releaseId).catch(() => null), [releaseId])
  const copyCount = Math.max(own?.copies.length ?? 0, live.data?.releases.length ?? 0)

  async function toggleWant() {
    if (!r) return
    setWantBusy(true)
    setError(null)
    try {
      if (own?.wanted) {
        await removeWant(client, username, releaseId)
        await db.wants.delete(releaseId)
      } else {
        await addWant(client, username, releaseId)
        await db.wants.put({ releaseId, masterId: r.master_id ?? 0 })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWantBusy(false)
    }
  }

  if (release.loading && !r) return <Spinner />
  if (!r) {
    return (
      <Screen title="Release" back={back}>
        <Notice tone="error">{release.error?.message ?? "Couldn't load this release."}</Notice>
      </Screen>
    )
  }

  const item = { cover: r.images?.[0]?.uri, thumb: r.images?.[0]?.uri150 ?? r.thumb }
  const label = r.labels?.[0]
  const where = [r.country, r.released?.slice(0, 4) || r.year || null].filter(Boolean).join(' · ')
  const format = r.formats
    ?.map((f) =>
      [f.qty && Number(f.qty) > 1 ? `${f.qty}× ${f.name}` : f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', '),
    )
    .join(' + ')

  const tracklist = (
    <Section title="Tracklist">
      <Tracklist release={r} />
    </Section>
  )

  return (
    <Screen title={r.title} back={back} width="wide" backdrop={item.cover ?? item.thumb}>
      <div className="lg:grid lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-8 xl:grid-cols-[minmax(0,22rem)_1fr] xl:gap-10">
        <div className="space-y-6">
          <Cover item={item} className="mx-auto aspect-square w-full max-w-sm rounded-2xl shadow-xl ring-1 ring-black/10" />
          <div className="hidden lg:block">{tracklist}</div>
        </div>

        <div className="mt-6 min-w-0 lg:mt-0">
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">{r.title}</h2>
          <p className="text-lg text-stone-600 dark:text-stone-300">{joinArtists(r.artists)}</p>
          <div className="mt-2 space-y-0.5 text-sm text-stone-500">
            {label && <p>{[label.name, label.catno !== 'none' && label.catno].filter(Boolean).join(' · ')}</p>}
            {where && <p>{where}</p>}
            {format && <p>{format}</p>}
          </div>
          {(r.genres?.length || r.styles?.length) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...(r.genres ?? []), ...(r.styles ?? [])].map((g) => (
                <span key={g} className="rounded-full bg-stone-900/5 px-2.5 py-1 text-xs font-medium dark:bg-white/10">
                  {g}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {copyCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1.5 text-sm font-medium text-accent-700 dark:bg-accent-500/20 dark:text-accent-400">
                <Check size={16} aria-hidden />
                {copyCount > 1 ? `You own ${copyCount} copies` : 'You own this'}
              </span>
            )}
            <button
              type="button"
              disabled={wantBusy}
              onClick={toggleWant}
              aria-pressed={own?.wanted}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                own?.wanted
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                  : 'bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              <Heart size={16} className={own?.wanted ? 'fill-current' : ''} aria-hidden />
              {own?.wanted ? 'On your wantlist' : 'Add to wantlist'}
            </button>
          </div>
          {error && (
            <div className="mt-3">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          <div className="mt-6">
            {own?.copies.length || own?.pressings.length ? (
              <Section title="In your collection">
                <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
                  {[...own.copies, ...own.pressings].map((o) => (
                    <li key={o.instanceId}>
                      <RecordRow
                        item={o}
                        detail={
                          o.releaseId === releaseId
                            ? 'This pressing'
                            : [o.label, o.catno, o.year || null].filter(Boolean).join(' · ') || 'Another pressing'
                        }
                      />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title={copyCount ? 'Add another copy' : 'Add to your collection'}>
              {added ? (
                <div className="space-y-3">
                  <Notice tone="success">Added to {added.folder}.</Notice>
                  {added.problems.length > 0 && <Notice tone="warn">Some details didn't save: {added.problems.join('; ')}</Notice>}
                  {own?.wanted && (
                    <Notice tone="info">
                      This was on your wantlist.{' '}
                      <button type="button" disabled={wantBusy} onClick={toggleWant} className="font-semibold underline">
                        Remove it
                      </button>
                    </Notice>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/collection/${added.instanceId}`} className={buttonClass('secondary')}>
                      Open it
                    </Link>
                    <Link href="/scan" className={buttonClass('primary')}>
                      <ScanBarcode size={18} aria-hidden />
                      Scan next
                    </Link>
                  </div>
                </div>
              ) : (
                <AddForm release={r} onAdded={setAdded} />
              )}
            </Section>

            <Section title="Market">
              <MarketPrice releaseId={releaseId} />
            </Section>

            <Section title="Barcode and other identifiers">
              <Identifiers identifiers={r.identifiers ?? []} />
            </Section>

            <div className="lg:hidden">{tracklist}</div>

            <Section>
              <DiscogsCredit url={discogsUrl(r.uri)} />
            </Section>
          </div>
        </div>
      </div>
    </Screen>
  )
}
