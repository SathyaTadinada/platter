import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarRange,
  ChartLine,
  Globe,
  Heart,
  LibraryBig,
  ListChecks,
  Link as LinkIcon,
  Lock,
  Pencil,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'wouter'
import type { Section as ProfileSection, Who } from '../../../worker/profile'
import { Avatar, useProfile } from '../../components/Profile'
import { toast } from '../../components/Toaster'
import { ExpandRow, howMany, IconButton, IconLink, List, Notice, Row, Section, Spinner, Switch, ToggleChip } from '../../components/ui'
import { db } from '../../db/db'
import { useCloud } from '../../hooks/cloud'
import { useSession } from '../../hooks/session'
import { useCollectionMeta } from '../../hooks/useCollectionMeta'
import type { Follows } from '../../lib/cloud'
import { EditSheet } from '../profile/EditSheet'
import { peopleLink, type FollowList } from './Connections'

// What a profile can show. Stats leaves out prices, and Your year what was spent.
const SHOWS: { id: ProfileSection; label: string; Icon: LucideIcon }[] = [
  { id: 'collection', label: 'Collection', Icon: LibraryBig },
  { id: 'wantlist', label: 'Wantlist', Icon: Heart },
  { id: 'stats', label: 'Stats', Icon: ChartLine },
  { id: 'year', label: 'Your year', Icon: CalendarRange },
]

export const WHO_LABELS: Record<Who, string> = { private: 'Private', followers: 'Followers', unlisted: 'Link only', public: 'Public' }

const WHO: { id: Who; Icon: LucideIcon; detail: string }[] = [
  { id: 'private', Icon: Lock, detail: 'No profile' },
  { id: 'followers', Icon: Users, detail: 'People you approve' },
  { id: 'unlisted', Icon: LinkIcon, detail: 'Anyone with the link' },
  { id: 'public', Icon: Globe, detail: 'Found in Search' },
]

const card = 'rounded-2xl bg-white dark:bg-stone-900'
const plain = 'ring-1 ring-stone-200 dark:ring-stone-800'
const chosen = 'ring-2 ring-accent'
const hover = 'hover:bg-stone-50 dark:hover:bg-stone-800/60'

const profileLink = (username: string) => `/u/${encodeURIComponent(username)}`

// Whether your profile can be opened at all: not Private, and not hidden
export function useProfileOpen() {
  const cloud = useCloud()
  return { open: cloud.who !== 'private' && !cloud.hidden }
}

// For the page's toolbar: your profile, and its link
export function ProfileActions() {
  const cloud = useCloud()
  const { session } = useSession()
  const { open } = useProfileOpen()
  const [editing, setEditing] = useState(false)
  if (!cloud.enabled || !open) return null
  return (
    <>
      <IconButton label="Edit profile" onClick={() => setEditing(true)}>
        <Pencil size={20} />
      </IconButton>
      {editing && <EditSheet onClose={() => setEditing(false)} />}
      <IconLink label="View profile" href={profileLink(cloud.username)}>
        <UserRound size={20} />
      </IconLink>
      {/* the demo's profile is only here, so its link would open nothing for anyone else */}
      {session?.kind !== 'demo' && (
        <IconButton
          label="Copy link"
          onClick={async () => {
            await navigator.clipboard.writeText(`${location.origin}${profileLink(cloud.username)}`)
            toast('Link copied', { tone: 'success' })
          }}
        >
          <LinkIcon size={20} />
        </IconButton>
      )}
    </>
  )
}

// The profile part of the Platter account: who you are on it, who can see it, what's on it, and the
// people around it
export function ProfileArea({ onError }: { onError: (e: unknown) => void }) {
  const cloud = useCloud()
  const discogs = useProfile()
  const records = useLiveQuery(() => db.collection.count(), [])
  const [follows, setFollows] = useState<Follows | null>(null)

  const reload = useCallback(async () => {
    if (cloud.api) setFollows(await cloud.api.follows())
  }, [cloud.api])
  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  const attempt = async (task: () => Promise<unknown>) => {
    try {
      await task()
    } catch (e) {
      onError(e)
    }
  }

  // drawn once its settings have come back, so it never shows Public or off by mistake
  if (!cloud.sections) return <Spinner />

  const status = cloud.hidden ? 'Hidden' : WHO_LABELS[cloud.who]
  const open = cloud.who !== 'private'
  const extras: { list: FollowList; label: string }[] = [
    ...(follows?.requests.length ? [{ list: 'requests' as const, label: `${follows.requests.length} waiting` }] : []),
    ...(follows?.blocked.length ? [{ list: 'blocked' as const, label: `${follows.blocked.length} blocked` }] : []),
  ]
  const counts: { n?: number; one: string; many: string; list?: FollowList }[] = [
    { n: open && cloud.sections.collection === 'public' ? records : undefined, one: 'record', many: 'records' },
    { n: follows?.followers.length, one: 'follower', many: 'followers', list: 'followers' },
    { n: follows?.following.length, one: 'following', many: 'following', list: 'following' },
  ]

  return (
    <>
      {cloud.hidden && <Notice tone="warn">Your profile has been hidden.</Notice>}
      <Section>
        <div className={`${card} ${plain} flex flex-col gap-5 p-5 sm:flex-row sm:items-center`}>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Avatar src={discogs?.avatar_url} name={cloud.username} size="size-16" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{cloud.username}</p>
              <p className="text-sm text-stone-500">
                {status}
                {extras.map((x) => (
                  <span key={x.list}>
                    {' · '}
                    <Link href={peopleLink(x.list)} className="underline underline-offset-2 hover:text-stone-900 dark:hover:text-stone-100">
                      {x.label}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-3 text-center sm:w-80">
            {counts.map((c) => {
              const text = (
                <>
                  <dt className="text-sm text-stone-500">{c.n === 1 ? c.one : c.many}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{c.n === undefined ? '–' : c.n.toLocaleString()}</dd>
                </>
              )
              return c.list ? (
                <Link key={c.one} href={peopleLink(c.list)} className={`flex flex-col-reverse rounded-xl py-1 ${hover}`}>
                  {text}
                </Link>
              ) : (
                <div key={c.one} className="flex flex-col-reverse py-1">
                  {text}
                </div>
              )
            })}
          </dl>
        </div>
      </Section>

      <Section title="Visibility">
        <div role="radiogroup" aria-label="Visibility" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WHO.map(({ id, Icon, detail }) => {
            const on = cloud.who === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => !on && attempt(() => cloud.setWho(id))}
                className={`${card} ${on ? chosen : `${plain} ${hover}`} flex items-center gap-3 p-3 text-left`}
              >
                <Icon size={20} aria-hidden className={`shrink-0 ${on ? 'text-accent' : 'text-stone-500'}`} />
                <span className="min-w-0">
                  <span className="block font-medium">{WHO_LABELS[id]}</span>
                  <span className="block text-xs text-stone-500">{detail}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Section>
    </>
  )
}

// What the profile shows, a switch a section, with what goes with each record under Collection.
// Nothing while it's Private, since there's no profile to put anything on.
export function ProfileShows({ onError }: { onError: (e: unknown) => void }) {
  const cloud = useCloud()
  if (!cloud.enabled || !cloud.sections || cloud.who === 'private') return null
  const set = async (id: ProfileSection, next: boolean) => {
    try {
      await cloud.setSections({ [id]: next ? 'public' : 'off' })
    } catch (e) {
      onError(e)
    }
  }
  return (
    <Section title="On your profile">
      <List>
        {SHOWS.map(({ id, label, Icon }) => {
          const on = cloud.sections?.[id] === 'public'
          return (
            <Row
              key={id}
              icon={<Icon size={20} />}
              label={label}
              trailing={<Switch label={label} checked={on} onChange={(next) => set(id, next)} />}
            />
          )
        })}
      </List>
      {/* what else goes with each record, while the collection is on the profile, set apart the way
          Synced data is under Sync */}
      {cloud.sections.collection === 'public' && (
        <List>
          <CopyChoices onError={onError} />
        </List>
      )}
    </Section>
  )
}

// Details about each copy anyone can see with your records: your rating, and the fields from your
// Discogs collection one by one. None to start with.
function CopyChoices({ onError }: { onError: (e: unknown) => void }) {
  const cloud = useCloud()
  const meta = useCollectionMeta()
  const options = [{ id: 'rating', name: 'Rating' }, ...(meta.data?.fields ?? []).map((f) => ({ id: String(f.id), name: f.name }))]
  const toggle = async (id: string) => {
    const on = cloud.details.includes(id)
    try {
      await cloud.setDetails(on ? cloud.details.filter((d) => d !== id) : [...cloud.details, id])
    } catch (e) {
      onError(e)
    }
  }
  const on = options.filter((o) => cloud.details.includes(o.id)).map((o) => o.name)
  return (
    <ExpandRow
      icon={<ListChecks size={20} />}
      label="Your copy"
      value={
        meta.data
          ? howMany(
              on,
              options.map((o) => o.name),
            )
          : undefined
      }
    >
      <div className="flex flex-wrap gap-2 p-4">
        {options.map((o) => {
          const on = cloud.details.includes(o.id)
          return (
            <ToggleChip key={o.id} on={on} onClick={() => toggle(o.id)}>
              {o.name}
            </ToggleChip>
          )
        })}
      </div>
    </ExpandRow>
  )
}
