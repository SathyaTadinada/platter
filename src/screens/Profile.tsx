import { Ban, ExternalLink, Link as LinkIcon, Search, Settings, SquareCheckBig, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Cover } from '../components/Cover'
import { Menu } from '../components/Menu'
import { SortPill } from '../components/SortPill'
import { toast } from '../components/Toaster'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { Button, IconButton, IconLink, Notice, Screen, Section, Segmented, Spinner, useBack } from '../components/ui'
import { db } from '../db/db'
import { useSession } from '../hooks/session'
import { rememberTitle } from '../lib/nav'
import { enqueueFromProfile, waitingInBatch } from '../lib/queue'
import { CloudError, type ProfileHead } from '../lib/cloud'
import { useCloud } from '../hooks/cloud'
import type { SortKey } from '../lib/library'
import {
  arrangeShelf,
  instanceOf,
  recordFrom,
  SHELF_SORTS,
  type ProfileAbout,
  type ProfileItem,
  type ProfileStats,
  type ProfileYear,
} from '../lib/profile'
import type { Section as ProfileSection } from '../../worker/profile'
import { Tick } from './collection/RecordTiles'
import { AddSheet } from './profile/AddSheet'
import { discogsUser, ProfileHeader } from './profile/Header'
import { StatsView, YearView } from './profile/Summaries'

const LABELS: Record<ProfileSection, string> = { collection: 'Collection', wantlist: 'Wantlist', stats: 'Stats', year: 'Your year' }
// search and sort only show once a list is longer than a screen or so
const SHORT_LIST = 24

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
  const { api, reader, who } = useCloud()
  const [unfollowing, setUnfollowing] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [, navigate] = useLocation()
  // records picked to add to your own collection, by their row; null when not picking
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [adding, setAdding] = useState<{ items: ProfileItem[]; owned: number; waiting: number } | null>(null)
  const [text, setText] = useState('')
  const [sort, setSort] = useState<SortKey>('added')
  const [reversed, setReversed] = useState(false)

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

  useEffect(() => {
    setText('')
    setSort('added')
    setReversed(false)
  }, [username, section])

  const rows = loaded && loaded.section === section ? loaded.rows : null
  const records = useMemo(
    () =>
      rows && (section === 'collection' || section === 'wantlist')
        ? rows.map((r) => ({ key: r.key, item: JSON.parse(r.value) as ProfileItem }))
        : null,
    [rows, section],
  )
  const searching = text.trim() !== ''
  // searching or sorting needs every record, not just the pages loaded so far
  const wantAll = searching || sort !== 'added' || reversed
  const shown = useMemo(() => records && arrangeShelf(records, text, sort, reversed), [records, text, sort, reversed])
  const fetchingRest = Boolean(wantAll && records && more && !error)
  useEffect(() => {
    if (fetchingRest && !loading) load(more!)
  }, [fetchingRest, loading, load, more])

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
      <Screen title="Profile" back={back} width={error ? 'narrow' : 'full'}>
        {error ? (
          <Section>
            <Notice tone="error">{error}</Notice>
            <Button variant="secondary" onClick={() => (setError(null), fetchHead())}>
              Try again
            </Button>
          </Section>
        ) : (
          <Spinner />
        )}
      </Screen>
    )
  }

  const about: ProfileAbout = head.about ? JSON.parse(head.about) : {}
  const mine = head.username === session?.username.toLowerCase()
  const demo = session?.kind === 'demo'
  // someone else's records can be picked out and added to yours
  const pickable = !!session && !mine && section === 'collection' && !!rows?.length
  const picking = pickable && picked
  const chosen = picking ? picked.size : 0
  // Select all picks what the search shows
  const allOn = Boolean(picking && shown?.length && shown.every((r) => picked.has(r.key)))

  async function review() {
    if (!rows || !picked) return
    const items = rows.filter((r) => picked.has(r.key)).map((r) => JSON.parse(r.value) as ProfileItem)
    const ids = new Set(items.map((i) => i.id))
    const have = new Set((await db.collection.toArray()).map((c) => c.releaseId))
    const queued = (await waitingInBatch()).releases
    const waiting = [...ids].filter((id) => queued.has(id)).length
    const owned = [...ids].filter((id) => have.has(id) && !queued.has(id)).length
    // nothing to decide, so no sheet to ask it in
    if (!owned && !waiting && !items.some((i) => i.copy)) {
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
        onClick={() =>
          setPicked((old) => {
            const next = new Set(old)
            for (const r of shown ?? []) {
              if (allOn) next.delete(r.key)
              else next.add(r.key)
            }
            return next
          })
        }
        className="rounded-lg px-2 py-1.5 text-sm font-medium"
      >
        {allOn ? 'Select none' : 'Select all'}
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
      {mine ? (
        <>
          {/* who sees it and what's on it; what it says about you is under Edit profile */}
          <IconLink label="Profile settings" href="/account">
            <Settings size={20} />
          </IconLink>
          {/* the demo's profile is only here, so its link would open nothing for anyone else */}
          {!demo && (
            <IconButton
              label="Copy link"
              onClick={async () => {
                await navigator.clipboard.writeText(location.href)
                toast('Link copied', { tone: 'success' })
              }}
            >
              <LinkIcon size={20} />
            </IconButton>
          )}
        </>
      ) : (
        <IconLink label="Discogs profile" href={discogsUser(head.username)} external>
          <ExternalLink size={20} />
        </IconLink>
      )}
      {menu}
    </>
  )

  return (
    <Screen
      title={picking ? (chosen ? `${chosen} selected` : 'Select records') : 'Profile'}
      // someone opening a shared link without Platter has nowhere to go back to
      back={session ? back : undefined}
      width="wide"
      actions={actions}
    >
      <ProfileHeader
        head={head}
        about={about}
        who={mine ? who : undefined}
        mine={mine}
        follow={canFollow ? { state: following, onClick: toggleFollow } : undefined}
        onSaved={fetchHead}
      />
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
          They’ll stop following you and can’t follow you again.
        </ConfirmDialog>
      )}

      {head.sections.length > 1 && section && (
        <Section>
          <Segmented
            label="What to show"
            options={head.sections.map((s) => ({ value: s, label: LABELS[s] }))}
            value={section}
            onChange={setSection}
          />
        </Section>
      )}

      {!head.locked && section && (
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
                {(rows.length > SHORT_LIST || more) && (
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="relative block sm:w-80">
                      <span className="sr-only">
                        Search {head.username}’s {LABELS[section].toLowerCase()}
                      </span>
                      <Search
                        size={18}
                        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500"
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Search artist, title, label…"
                        autoComplete="off"
                        className="min-h-11 w-full rounded-xl border border-stone-300 bg-white pr-9 pl-10 text-base dark:border-stone-700 dark:bg-stone-900 [&::-webkit-search-cancel-button]:hidden"
                      />
                      {text && (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => setText('')}
                          className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-stone-500"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <SortPill sorts={SHELF_SORTS} sort={sort} reversed={reversed} onChange={(s, r) => (setSort(s), setReversed(r))} />
                      <span className="ml-auto text-sm text-stone-500 tabular-nums sm:ml-2">
                        {fetchingRest ? (
                          <span
                            role="status"
                            aria-label="Loading"
                            className="block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                          />
                        ) : (
                          !more && (searching ? `${shown!.length} of ${rows.length}` : rows.length)
                        )}
                      </span>
                    </div>
                  </div>
                )}
                {!shown!.length && !fetchingRest && (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <p className="text-lg font-semibold">No matches</p>
                    <Button variant="secondary" onClick={() => setText('')}>
                      Clear search
                    </Button>
                  </div>
                )}
                {/* the same tiles as the collection grid; each opens the release, which says if you have it, or
                    with their copy on it when they show one */}
                <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {shown!.map(({ key, item: r }) => {
                    const on = Boolean(picking && picked.has(key))
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
                      <li key={key} className="min-w-0">
                        {picking ? (
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setPicked((old) => {
                                const next = new Set(old)
                                if (next.has(key)) next.delete(key)
                                else next.add(key)
                                return next
                              })
                            }
                            className="group block w-full text-left"
                          >
                            {tile}
                          </button>
                        ) : (
                          // your own records open as yours, not as someone's copy
                          <Link
                            href={mine && section === 'collection' ? `/collection/${instanceOf(key)}` : recordFrom(r, head.username, key)}
                            className="group block"
                          >
                            {tile}
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {more && !fetchingRest && (
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
