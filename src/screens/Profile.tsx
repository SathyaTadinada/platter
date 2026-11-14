import { CalendarRange, ChartLine, Heart, LibraryBig } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'wouter'
import { BADGES } from '../../worker/badges'
import { Cover } from '../components/Cover'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { Button, ExternalLink, Notice, Screen, Section, Segmented, Spinner, useBack } from '../components/ui'
import { CloudError, cloudEntry, type ProfileHead } from '../lib/cloud'
import type { ProfileAbout, ProfileItem, ProfileStats, ProfileYear } from '../lib/profile'
import type { Section as ProfileSection } from '../../worker/profile'
import { timeAgo } from '../lib/time'
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
const badgeLabel = (id: string) => BADGES.find((b) => b.id === id)?.label

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

  useEffect(() => {
    setHead(null)
    setMissing(false)
    cloudEntry()
      .profile(username)
      .then((h) => {
        setHead(h)
        setSection(h.sections[0] ?? null)
      })
      .catch((e) => (e instanceof CloudError && e.status === 404 ? setMissing(true) : setError('Couldn’t load this profile.')))
  }, [username])

  const load = useCallback(
    async (after?: string) => {
      if (!section) return
      setLoading(true)
      setError(null)
      try {
        const page = await cloudEntry().profileRows(username, section, after)
        setLoaded((old) => ({ section, rows: after && old?.section === section ? [...old.rows, ...page.rows] : page.rows }))
        setMore(page.more ? page.rows.at(-1)!.key : null)
      } catch {
        setError('Couldn’t load the rest.')
      } finally {
        setLoading(false)
      }
    },
    [username, section],
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

  return (
    <Screen title={head.username} back={back} width="wide">
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
              {head.badges
                .map(badgeLabel)
                .filter(Boolean)
                .map((b) => ` · ${b}`)}
              {head.publishedAt && ` · Updated ${timeAgo(head.publishedAt)}`}
            </p>
            <p className="mt-0.5 text-sm">
              <ExternalLink href={discogsUser(head.username)}>Discogs profile</ExternalLink>
            </p>
          </div>
        </div>
      </Section>

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
                return (
                  <li key={row.key} className="min-w-0">
                    <Link href={`/release/${r.id}`} className="group block">
                      <Cover
                        item={r}
                        className="aspect-square w-full rounded-xl shadow-sm ring-1 ring-black/5 transition group-active:scale-[0.98]"
                      />
                      <p className="mt-2 truncate text-sm font-semibold">{r.title}</p>
                      <p className="truncate text-sm text-stone-500">{r.artist}</p>
                    </Link>
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
    </Screen>
  )
}
