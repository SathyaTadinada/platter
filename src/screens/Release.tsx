import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Heart, Plus } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { addWant, getOwnedInstances, getRelease, removeWant } from '../api/discogs/endpoints'
import { AddForm, type Added } from '../components/AddForm'
import { MarketPrice } from '../components/MarketPrice'
import { RecordLayout, YourCopies } from '../components/RecordLayout'
import { ShareButton } from '../components/ShareButton'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { IconButton, Notice, Screen, Section, Spinner, useBack } from '../components/ui'
import { db } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { cleanLabel, discogsUrl, sentences } from '../lib/format'
import { joinArtists, wantFromRelease } from '../lib/library'
import { TheirCopy, useTheirCopy } from './release/TheirCopy'

// A Discogs release you looked up: everything the record page shows, plus adding it
export function Release({ id }: { id: string }) {
  const releaseId = Number(id)
  const { client, username } = useSignedIn()
  const back = useBack('/search')
  const release = useAsync(() => getRelease(client, releaseId), [client, releaseId])
  const [wantBusy, setWantBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const their = useTheirCopy(Number(id))
  const [, navigate] = useLocation()
  const search = new URLSearchParams(useSearch())
  const fromScan = search.has('scan')
  // looking through someone's records isn't the same as adding them, so from a profile the form is
  // a tap away in a sheet, the same as adding several of theirs
  const fromProfile = search.has('from')
  const [adding, setAdding] = useState(false)

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
        toast(`Took ${r.title} off your wantlist`, {
          action: {
            label: 'Undo',
            onClick: () =>
              addWant(client, username, releaseId)
                .then(() => db.wants.put(wantFromRelease(r)))
                .catch((e) => toast((e as Error).message, { tone: 'error' })),
          },
        })
      } else {
        await addWant(client, username, releaseId)
        await db.wants.put(wantFromRelease(r))
        toast('Added to your wantlist', { tone: 'success' })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWantBusy(false)
    }
  }

  if (release.loading && !r) {
    return (
      <Screen title="" back={back} width="full">
        <Spinner />
      </Screen>
    )
  }
  if (!r) {
    return (
      <Screen title="Release" back={back}>
        <Notice tone="error">{release.error?.message ?? "Couldn't load this release."}</Notice>
      </Screen>
    )
  }

  const item = { cover: r.images?.[0]?.uri, thumb: r.images?.[0]?.uri150 ?? r.thumb }
  const label = r.labels?.[0]
  const digital = (r.formats ?? []).length > 0 && r.formats.every((f) => f.name === 'File')
  const where = [r.country, r.released?.slice(0, 4) || r.year || null].filter(Boolean).join(' · ')
  const format = r.formats
    ?.map((f) =>
      [f.qty && Number(f.qty) > 1 ? `${f.qty}× ${f.name}` : f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', '),
    )
    .join(' + ')

  // once it's yours, this becomes your record's own page, in place
  function added(a: Added) {
    toast(a.problems.length ? `Added to ${a.folder}. Some details didn't save: ${sentences(a.problems)}` : `Added to ${a.folder}`, {
      tone: a.problems.length ? 'error' : 'success',
      // straight back to the camera, for someone going through a stack of records
      action: fromScan ? { label: 'Scan next', onClick: () => navigate('/scan') } : undefined,
    })
    navigate(`/collection/${a.instanceId}`, { replace: true })
  }

  return (
    <Screen
      title={r.title}
      back={back}
      width="wide"
      backdrop={item.cover ?? item.thumb}
      actions={
        <>
          <IconButton
            label={own?.wanted ? 'Remove from wantlist' : 'Add to wantlist'}
            aria-pressed={own?.wanted}
            disabled={wantBusy}
            onClick={toggleWant}
          >
            <Heart size={20} className={own?.wanted ? 'fill-current text-red-500' : ''} />
          </IconButton>
          <ShareButton url={discogsUrl(r.uri)} title={`${joinArtists(r.artists)} – ${r.title}`} />
        </>
      }
    >
      <RecordLayout
        releaseId={releaseId}
        release={r}
        cover={item}
        title={r.title}
        artist={joinArtists(r.artists)}
        details={[label && [cleanLabel(label.name), label.catno !== 'none' && label.catno].filter(Boolean).join(' · '), where, format]}
        tags={[...(r.genres ?? []), ...(r.styles ?? [])].map((g) => ({ label: g }))}
        extra={
          (copyCount > 0 || fromProfile) && (
            <div className="flex flex-wrap items-center gap-2">
              {copyCount > 0 && (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1.5 text-sm font-medium text-accent-700 dark:bg-accent/20 dark:text-accent">
                  <Check size={16} aria-hidden />
                  {copyCount > 1 ? `You own ${copyCount} copies` : 'You own this'}
                </p>
              )}
              {/* there when wanted, beside the record, rather than a form in the way of their copy */}
              {fromProfile && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-stone-900/5 px-3 py-1.5 text-sm font-medium hover:bg-stone-900/10 dark:bg-white/10 dark:hover:bg-white/15"
                >
                  <Plus size={16} aria-hidden />
                  {copyCount ? 'Add another copy' : 'Add to my collection'}
                </button>
              )}
            </div>
          )
        }
        error={error}
        url={discogsUrl(r.uri)}
      >
        {/* opened from someone's profile, their copy first */}
        {their && <TheirCopy owner={their.owner} copy={their.copy} />}
        <YourCopies
          title="In your collection"
          items={[...(own?.copies ?? []), ...(own?.pressings ?? [])]}
          releaseId={releaseId}
          same="This pressing"
        />
        {!fromProfile && (
          <Section title={copyCount ? 'Add another copy' : 'Add to your collection'}>
            <AddForm release={r} onAdded={added} />
          </Section>
        )}
        {adding && (
          <Sheet
            title={copyCount ? 'Add another copy' : 'Add to my collection'}
            width="md"
            bodyClassName="p-4"
            onClose={() => setAdding(false)}
          >
            <AddForm release={r} onAdded={added} their={their ?? undefined} sheet />
          </Sheet>
        )}
        <Section title="Market">
          {digital ? (
            <p className="px-1 text-sm text-stone-500">Digital releases can't be sold on Discogs.</p>
          ) : (
            <MarketPrice releaseId={releaseId} />
          )}
        </Section>
      </RecordLayout>
    </Screen>
  )
}
