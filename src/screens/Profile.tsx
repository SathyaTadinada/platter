import { Ban, CalendarRange, ChartLine, Heart, LibraryBig, SquareCheckBig } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Cover } from '../components/Cover'
import { Menu } from '../components/Menu'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { Button, ExternalLink, IconButton, Notice, Screen, Section, Segmented, Spinner, useBack } from '../components/ui'
import { db } from '../db/db'
import { useSession } from '../hooks/session'
import { rememberTitle } from '../lib/nav'
import { enqueueFromProfile, waitingInBatch } from '../lib/queue'
import { CloudError, type ProfileHead } from '../lib/cloud'
import { useCloud } from '../hooks/cloud'
import type { ProfileAbout, ProfileItem, ProfileStats, ProfileYear } from '../lib/profile'
import type { Section as ProfileSection } from '../../worker/profile'
import { timeAgo } from '../lib/time'
import { Tick } from './collection/RecordTiles'
import { AddSheet } from './profile/AddSheet'
import { StatsView, YearView } from './profile/Summaries'

const LABELS: Record<ProfileSection, string> = { collection: 'Collection', wantlist: 'Wantlist', stats: 'Stats', year: 'Your year' }
// icons from sm up, as on Search, so four tabs still fit a phone
const icon = (Icon: typeof LibraryBig) => <Icon size={16} aria-hidden className="hidden sm:block" />
const ICONS: Record<ProfileSection, React.ReactNode> = {
  collection: icon(LibraryBig),
  wantlist: icon(Heart),
  stats: icon(ChartLine),
  year: icon(CalendarRange),
}

const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const memberSince = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

// Someone's profile, as anyone with the link sees it: only the sections they switched on, and only
// what their devices published.
export function Profile({ username }: { username: string }) {
  const back = useBack('/')
  const [head, setHead] = useState<ProfileHead | null>(null)
  const [missing, setMissing] = useState(false)
  const [section, setSection] = useState<ProfileSection | null>(null)
  // kept with the section they came from: right after switching tabs, the old section's rows are
  // still here, and a summary can't be drawn from a list of records
  const [loaded, setLoaded] = useState<{ section: ProfileSection; rows: { key: string; value: string }[] } | null>(null)
  const [more, setMore] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { session } = useSession()
  const { api, reader } = useCloud()
  const [unfollowing, setUnfollowing] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [, navigate] = useLocation()
  // records picked to add to your own collection, by their row; null when not picking
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [adding, setAdding] = useState<{ items: ProfileItem[]; owned: number; waiting: number } | null>(null)

  const fetchHead = useCallback(
    () =>
      reader
        .profile(username)
        .then((h) => {
          setHead(h)
          setSection((now) => (now && h.sections.includes(now) ? now : (h.sections[0] ?? null)))
        })
        .catch((e) => (e instanceof CloudError && e.status === 404 ? setMissing(true) : setError('Couldn’t load this profile.'))),
    [reader, username],
  )
  useEffect(() => {
    setHead(null)
    setPicked(null)
    setMissing(false)
    fetchHead()
  }, [fetchHead])

  const load = useCallback(
    async (after?: string) => {
      if (!section) return
      setLoading(true)
      setError(null)
      try {
        const page = await reader.profileRows(username, section, after)
        setLoaded((old) => ({ section, rows: after && old?.section === section ? [...old.rows, ...page.rows] : page.rows }))
        setMore(page.more ? page.rows.at(-1)!.key : null)
      } catch {
        setError('Couldn’t load the rest.')
      } finally {
        setLoading(false)
      }
    },
    [reader, username, section],
  )

  useEffect(() => {
    setLoaded(null)
    setMore(null)
    load()
  }, [load])

  if (missing) {
    return (
      <Screen title="Profile" back={back} width="narrow">
        <Section>
          <Notice>Nobody by that name is sharing a profile.</Notice>
        </Section>
      </Screen>
    )
  }
  if (!head) {
    return (
      <Screen title="Profile" back={back} width="full">
        <Spinner />
      </Screen>
    )
  }

  const about: ProfileAbout = head.about ? JSON.parse(head.about) : {}
  const rows = loaded && loaded.section === section ? loaded.rows : null
  const mine = session?.kind !== 'demo' && head.username === session?.username.toLowerCase()
  // someone else's records can be picked out and added to yours
  const pickable = !mine && section === 'collection' && !!rows?.length
  const picking = pickable && picked
  const chosen = picking ? picked.size : 0

  async function review() {
    if (!rows || !picked) return
    const items = rows.filter((r) => picked.has(r.key)).map((r) => JSON.parse(r.value) as ProfileItem)
    const ids = new Set(items.map((i) => i.id))
    const have = new Set((await db.collection.toArray()).map((c) => c.releaseId))
    const queued = (await waitingInBatch()).releases
    const waiting = [...ids].filter((id) => queued.has(id)).length
    const owned = [...ids].filter((id) => have.has(id) && !queued.has(id)).length
    // nothing to decide, so no sheet to ask it in
    if (!owned && !waiting) {
      await enqueueFromProfile(items, head!.username)
      rememberTitle(head!.username)
      navigate('/batch')
      return
    }
    setAdding({ items, owned, waiting })
  }

  const canFollow = Boolean(api) && session?.kind !== 'demo' && !mine && head.relation !== undefined
  const following = head.relation?.following ?? 'none'
  async function toggleFollow() {
    if (!api) return
    if (following === 'accepted') return setUnfollowing(true)
    if (following === 'pending') await api.unfollow(head!.username)
    else await api.follow(head!.username)
    await fetchHead()
  }

  const menu = canFollow && (
    <Menu
      label="More"
      items={[{ label: `Block ${head.username}`, icon: <Ban size={18} />, danger: true, onSelect: () => setBlocking(true) }]}
    />
  )

  const actions = picking ? (
    <>
      <button
        type="button"
        onClick={() => setPicked(new Set(chosen === rows!.length ? [] : rows!.map((r) => r.key)))}
        className="rounded-lg px-2 py-1.5 text-sm font-medium"
      >
        {chosen === rows!.length ? 'Select none' : 'Select all'}
      </button>
      <button type="button" onClick={() => setPicked(null)} className="rounded-lg px-2 py-1.5 text-sm font-semibold">
        Done
      </button>
    </>
  ) : (
    <>
      {pickable && (
        <IconButton label="Select records" onClick={() => setPicked(new Set())}>
          <SquareCheckBig size={20} />
        </IconButton>
      )}
      {menu}
    </>
  )

  return (
    <Screen title={picking ? (chosen ? `${chosen} selected` : 'Select records') : head.username} back={back} width="wide" actions={actions}>
      <Section>
        <div className="flex items-center gap-4">
          {about.avatar ? (
            <img src={about.avatar} alt="" className="size-16 shrink-0 rounded-full bg-stone-200 object-cover dark:bg-stone-800" />
          ) : (
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xl font-semibold uppercase dark:bg-stone-800"
              aria-hidden
            >
              {head.username.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm text-stone-500">
              Member since {memberSince(head.memberSince)}
              {head.badges.map((b) => ` · ${b}`)}
              {head.relation?.followsYou && ' · Follows you'}
              {head.publishedAt && ` · Updated ${timeAgo(head.publishedAt)}`}
            </p>
            <p className="mt-0.5 text-sm">
              <ExternalLink href={discogsUser(head.username)}>Discogs profile</ExternalLink>
            </p>
          </div>
        </div>
        {canFollow && (
          <Button
            variant={following === 'none' ? 'primary' : 'secondary'}
            className="mt-4 min-h-10 w-full sm:w-auto sm:px-6"
            onClick={toggleFollow}
          >
            {following === 'accepted' ? 'Following' : following === 'pending' ? 'Requested' : 'Follow'}
          </Button>
        )}
      </Section>
      {head.locked && (
        <Section>
          <Notice>Only followers can see this profile.</Notice>
        </Section>
      )}
      {unfollowing && (
        <ConfirmDialog
          title={`Unfollow ${head.username}?`}
          action="Unfollow"
          onConfirm={async () => {
            setUnfollowing(false)
            await api!.unfollow(head.username)
            await fetchHead()
          }}
          onCancel={() => setUnfollowing(false)}
        />
      )}
      {blocking && (
        <ConfirmDialog
          title={`Block ${head.username}?`}
          action="Block"
          onConfirm={async () => {
            setBlocking(false)
            await api!.block(head.username)
            back()
          }}
          onCancel={() => setBlocking(false)}
        >
          They’ll stop following you, and won’t be able to again.
        </ConfirmDialog>
      )}

      {head.sections.length > 1 && section && (
        <Section>
          <Segmented
            label="What to show"
            options={head.sections.map((s) => ({ value: s, label: LABELS[s], icon: ICONS[s] }))}
            value={section}
            onChange={setSection}
            card
          />
        </Section>
      )}

      {!head.locked && (
        <>
          {/* with tabs above, they already say which section this is */}
          <Section title={section && head.sections.length === 1 ? LABELS[section] : undefined}>
            {error && <Notice tone="error">{error}</Notice>}
            {!rows ? (
              loading && <Spinner />
            ) : !rows.length ? (
              <Notice>Nothing here yet.</Notice>
            ) : section === 'stats' ? (
              <StatsView stats={JSON.parse(rows[0].value) as ProfileStats} />
            ) : section === 'year' ? (
              <YearView years={rows.map((r) => JSON.parse(r.value) as ProfileYear)} />
            ) : (
              <>
                {/* the same tiles as the collection grid; each opens the release, which says if you have it */}
                <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {rows.map((row) => {
                    const r = JSON.parse(row.value) as ProfileItem
                    const on = Boolean(picking && picked.has(row.key))
                    const tile = (
                      <>
                        <div className="relative">
                          <Cover
                            item={r}
                            className={`aspect-square w-full rounded-xl shadow-sm ring-1 ring-black/5 transition group-active:scale-[0.98] ${on ? 'opacity-70 ring-4 ring-accent' : ''}`}
                          />
                          {picking && (
                            <span className="absolute top-2 right-2">
                              <Tick on={on} />
                            </span>
                          )}
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold">{r.title}</p>
                        <p className="truncate text-sm text-stone-500">{r.artist}</p>
                      </>
                    )
                    return (
                      <li key={row.key} className="min-w-0">
                        {picking ? (
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setPicked((old) => {
                                const next = new Set(old)
                                if (next.has(row.key)) next.delete(row.key)
                                else next.add(row.key)
                                return next
                              })
                            }
                            className="group block w-full text-left"
                          >
                            {tile}
                          </button>
                        ) : (
                          <Link href={`/release/${r.id}`} className="group block">
                            {tile}
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {more && (
                  <Button variant="secondary" className="mt-4 w-full" disabled={loading} onClick={() => load(more)}>
                    {loading ? 'Loading…' : 'Show more'}
                  </Button>
                )}
              </>
            )}
            <p className="mt-4">
              <DiscogsCredit url={`${discogsUser(head.username)}/collection`} />
            </p>
          </Section>
        </>
      )}
      {chosen > 0 && (
        <div className="sticky bottom-3 z-10 mt-4">
          <div className="mx-auto max-w-lg rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200 sm:w-fit sm:p-2 dark:bg-stone-900 dark:ring-stone-700">
            <Button className="w-full sm:min-h-10 sm:px-3.5 sm:text-sm" onClick={review}>
              Add to my collection
            </Button>
          </div>
        </div>
      )}
      {adding && (
        <AddSheet
          picked={adding.items}
          owned={adding.owned}
          waiting={adding.waiting}
          from={head.username}
          // Batch's Back button should name the profile, not the selection
          onAdded={() => rememberTitle(head.username)}
          onClose={() => setAdding(null)}
        />
      )}
    </Screen>
  )
}
