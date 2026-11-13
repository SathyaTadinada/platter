import { Heart, LibraryBig } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Notice, Screen, Section, Segmented, Spinner } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import { CloudError, cloudEntry, type ProfileHead } from '../lib/cloud'
import type { ProfileAbout, ProfileItem } from '../lib/profile'
import type { Section as ProfileSection } from '../../worker/profile'
import { timeAgo } from '../lib/time'

const LABELS: Record<ProfileSection, string> = { collection: 'Collection', wantlist: 'Wantlist', stats: 'Stats', year: 'Your year' }
const ICONS: Record<string, React.ReactNode> = { collection: <LibraryBig size={16} />, wantlist: <Heart size={16} /> }

const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const memberSince = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

function Cover({ item }: { item: ProfileItem }) {
  const [broken, setBroken] = useState(false)
  const src = item.cover ?? item.thumb
  return src && !broken ? (
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="aspect-square w-full rounded-lg object-cover" />
  ) : (
    <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-stone-200 dark:bg-stone-800" aria-hidden>
      <LibraryBig size={24} className="text-stone-400" />
    </span>
  )
}

// Someone's profile, as anyone with the link sees it: only the sections they switched on, and only
// what their devices published.
export function Profile({ username }: { username: string }) {
  const { username: mine } = useCloud()
  const [head, setHead] = useState<ProfileHead | null>(null)
  const [missing, setMissing] = useState(false)
  const [section, setSection] = useState<ProfileSection | null>(null)
  const [items, setItems] = useState<ProfileItem[] | null>(null)
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
        const rows = page.rows.map((r) => JSON.parse(r.value) as ProfileItem)
        setItems((old) => (after ? [...(old ?? []), ...rows] : rows))
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
    setItems(null)
    setMore(null)
    load()
  }, [load])

  if (missing) {
    return (
      <Screen title="Profile" back="/" width="narrow">
        <Section>
          <Notice>Nothing shared here. Either the name is wrong, or they haven’t turned a profile on.</Notice>
        </Section>
      </Screen>
    )
  }
  if (!head) {
    return (
      <Screen title="Profile" back="/" width="full">
        <Spinner />
      </Screen>
    )
  }

  const about: ProfileAbout = head.about ? JSON.parse(head.about) : {}
  const isMine = head.username === mine.toLowerCase()

  return (
    <Screen title={head.username} back={isMine ? '/account' : '/'} width="wide">
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
            <h2 className="truncate text-xl font-semibold">{head.username}</h2>
            <p className="text-sm text-stone-500">
              Member since {memberSince(head.memberSince)}
              {head.badges.includes('early') && ' · Early supporter'}
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

      <Section title={section ? LABELS[section] : undefined}>
        {error && <Notice tone="error">{error}</Notice>}
        {!items && loading ? (
          <Spinner />
        ) : items && !items.length ? (
          <Notice>Nothing here yet.</Notice>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {items?.map((r, i) => (
                <li key={`${r.id}-${i}`} className="min-w-0">
                  <Cover item={r} />
                  <p className="mt-1.5 truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-sm text-stone-500">{r.artist}</p>
                </li>
              ))}
            </ul>
            {more && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => load(more)}
                  className="text-sm font-semibold text-accent disabled:opacity-40"
                >
                  {loading ? 'Loading…' : 'Show more'}
                </button>
              </div>
            )}
          </>
        )}
      </Section>
      <p className="mt-6 text-center text-sm text-stone-500">Data provided by Discogs.</p>
    </Screen>
  )
}
