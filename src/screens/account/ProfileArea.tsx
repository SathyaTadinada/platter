import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarRange,
  Check,
  ChartLine,
  Globe,
  Heart,
  LibraryBig,
  Link as LinkIcon,
  Lock,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'wouter'
import type { Section as ProfileSection, Who } from '../../../worker/profile'
import { Avatar, useProfile } from '../../components/Profile'
import { toast } from '../../components/Toaster'
import { IconButton, IconLink, Notice, Section, Spinner, Switch } from '../../components/ui'
import { db } from '../../db/db'
import { useCloud } from '../../hooks/cloud'
import { useCollectionMeta } from '../../hooks/useCollectionMeta'
import type { Follows } from '../../lib/cloud'
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
  { id: 'private', Icon: Lock, detail: 'Only you' },
  { id: 'followers', Icon: Users, detail: 'People you approve' },
  { id: 'unlisted', Icon: LinkIcon, detail: 'Anyone with the link' },
  { id: 'public', Icon: Globe, detail: 'Found in Search' },
]

const card = 'rounded-2xl bg-white dark:bg-stone-900'
const plain = 'ring-1 ring-stone-200 dark:ring-stone-800'
const chosen = 'ring-2 ring-accent'
const hover = 'hover:bg-stone-50 dark:hover:bg-stone-800/60'

const profileLink = (username: string) => `/u/${encodeURIComponent(username)}`

// Whether your profile can be opened at all: something on it, and not Private or hidden
export function useProfileOpen() {
  const cloud = useCloud()
  const shared = Object.values(cloud.sections ?? {}).some((v) => v === 'public')
  return { shared, open: shared && cloud.who !== 'private' && !cloud.hidden }
}

// For the page's toolbar: your profile, and its link
export function ProfileActions() {
  const cloud = useCloud()
  const { open } = useProfileOpen()
  if (!cloud.enabled || !open) return null
  return (
    <>
      <IconLink label="View profile" href={profileLink(cloud.username)}>
        <UserRound size={20} />
      </IconLink>
      <IconButton
        label="Copy link"
        onClick={async () => {
          await navigator.clipboard.writeText(`${location.origin}${profileLink(cloud.username)}`)
          toast('Link copied', { tone: 'success' })
        }}
      >
        <LinkIcon size={20} />
      </IconButton>
    </>
  )
}

// The profile part of the Platter account: who you are on it, who can see it, what's on it, and the
// people around it
export function ProfileArea({ onError }: { onError: (e: unknown) => void }) {
  const cloud = useCloud()
  const discogs = useProfile()
  const records = useLiveQuery(() => db.collection.count(), [])
  const { shared } = useProfileOpen()
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

  const status = cloud.hidden ? 'Hidden' : shared ? WHO_LABELS[cloud.who] : 'Off'
  const extras: { list: FollowList; label: string }[] = [
    ...(follows?.requests.length ? [{ list: 'requests' as const, label: `${follows.requests.length} waiting` }] : []),
    ...(follows?.blocked.length ? [{ list: 'blocked' as const, label: `${follows.blocked.length} blocked` }] : []),
  ]
  const counts: { n?: number; one: string; many: string; list?: FollowList }[] = [
    { n: cloud.sections.collection === 'public' ? records : undefined, one: 'record', many: 'records' },
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
      <Section title="On your profile">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SHOWS.map(({ id, label, Icon }) => {
            const on = cloud.sections?.[id] === 'public'
            return (
              // icon and switch over the name where tiles are narrow, all on one line where there's room
              <div key={id} className={`${card} ${plain} grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 p-3 lg:py-2.5`}>
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl lg:size-8 ${
                    on ? 'bg-accent text-accent-fg' : 'bg-stone-100 text-stone-500 dark:bg-stone-800'
                  }`}
                >
                  <Icon size={18} aria-hidden />
                </span>
                <span className="col-span-3 row-start-2 truncate font-medium lg:col-span-1 lg:col-start-2 lg:row-start-1">{label}</span>
                <span className="col-start-3 row-start-1 justify-self-end">
                  <Switch
                    label={label}
                    checked={on}
                    onChange={(next) => attempt(() => cloud.setSections({ [id]: next ? 'public' : 'off' }))}
                  />
                </span>
              </div>
            )
          })}
        </div>
      </Section>
      {/* what else goes with each record, while the collection is on the profile */}
      {cloud.sections.collection === 'public' && <CopyChoices onError={onError} />}
    </>
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
  return (
    <Section title="Your copy">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = cloud.details.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${
                on
                  ? 'bg-stone-900 text-white dark:bg-accent dark:text-accent-fg'
                  : 'bg-white ring-1 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:ring-stone-800 dark:hover:bg-stone-800'
              }`}
            >
              {on && <Check size={14} aria-hidden />}
              {o.name}
            </button>
          )
        })}
      </div>
    </Section>
  )
}
