import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarRange,
  ChartLine,
  Globe,
  Heart,
  LibraryBig,
  Link as LinkIcon,
  Lock,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, Redirect } from 'wouter'
import type { Section as ProfileSection, Who } from '../../worker/profile'
import { Avatar, useProfile } from '../components/Profile'
import { toast } from '../components/Toaster'
import { Button, buttonClass, Notice, Screen, Section, Spinner, Switch } from '../components/ui'
import { db } from '../db/db'
import { useCloud } from '../hooks/cloud'
import type { Follows } from '../lib/cloud'
import { FollowSheet, type FollowList } from './account/FollowSheet'
import { explain } from './account/shared'

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

// The profile and the people around it, one tap in from the account, so someone who only wants sync
// never has to look at any of it
export function ProfileSettings() {
  const cloud = useCloud()
  const discogs = useProfile()
  const records = useLiveQuery(() => db.collection.count(), [])
  const [follows, setFollows] = useState<Follows | null>(null)
  const [people, setPeople] = useState<FollowList | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (cloud.api) setFollows(await cloud.api.follows())
  }, [cloud.api])
  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  if (!cloud.enabled) return <Redirect to="/account" replace />

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(explain(e, "This device isn't signed in anymore."))
    }
  }
  const shared = Object.values(cloud.sections ?? {}).some((v) => v === 'public')
  // a private or hidden profile's link goes nowhere, so there's nothing to view or copy
  const reachable = shared && cloud.who !== 'private' && !cloud.hidden
  const status = cloud.hidden ? 'Hidden' : shared ? WHO_LABELS[cloud.who] : 'Off'

  const counts = [
    { n: cloud.sections?.collection === 'public' ? records : undefined, one: 'record', many: 'records' },
    { n: follows?.followers.length, one: 'follower', many: 'followers' },
    { n: follows?.following.length, one: 'following', many: 'following' },
  ]
  const tiles: { list: FollowList; label: string; Icon: LucideIcon; count: number; waiting?: boolean }[] = follows
    ? [
        { list: 'followers', label: 'Followers', Icon: Users, count: follows.followers.length },
        { list: 'following', label: 'Following', Icon: UserCheck, count: follows.following.length },
        ...(follows.requests.length || cloud.who === 'followers'
          ? [{ list: 'requests' as const, label: 'Requests', Icon: UserPlus, count: follows.requests.length, waiting: true }]
          : []),
        ...(follows.blocked.length ? [{ list: 'blocked' as const, label: 'Blocked', Icon: UserX, count: follows.blocked.length }] : []),
      ]
    : []

  return (
    <Screen title="Profile" back="/account" width={cloud.sections ? 'wide' : 'full'}>
      {/* drawn once its settings have come back, so it never shows Public or off by mistake */}
      {!cloud.sections ? (
        <Spinner />
      ) : (
        <>
          {error && <Notice tone="error">{error}</Notice>}
          {cloud.hidden && <Notice tone="warn">Your profile has been hidden.</Notice>}
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
            <div>
              <Section>
                <div className={`${card} ${plain} p-5`}>
                  <div className="flex items-center gap-4">
                    <Avatar src={discogs?.avatar_url} name={cloud.username} size="size-16 text-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold">{cloud.username}</p>
                      <p className="text-sm text-stone-500">{status}</p>
                    </div>
                  </div>
                  <dl className="mt-5 grid grid-cols-3 text-center">
                    {counts.map((c) => (
                      <div key={c.one} className="flex flex-col-reverse">
                        <dt className="text-sm text-stone-500">{c.n === 1 ? c.one : c.many}</dt>
                        <dd className="text-xl font-semibold tabular-nums">{c.n === undefined ? '–' : c.n.toLocaleString()}</dd>
                      </div>
                    ))}
                  </dl>
                  {reachable && (
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <Link href={`/u/${encodeURIComponent(cloud.username)}`} className={buttonClass('secondary', 'min-h-10 text-sm')}>
                        View profile
                      </Link>
                      <Button
                        variant="secondary"
                        className="min-h-10 text-sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(`${location.origin}/u/${cloud.username}`)
                          toast('Link copied', { tone: 'success' })
                        }}
                      >
                        <LinkIcon size={16} aria-hidden />
                        Copy link
                      </Button>
                    </div>
                  )}
                </div>
              </Section>
              <Section title="Who can see it">
                <div role="radiogroup" aria-label="Who can see it" className="grid grid-cols-2 gap-2">
                  {WHO.map(({ id, Icon, detail }) => {
                    const on = cloud.who === id
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => !on && attempt(() => cloud.setWho(id))}
                        className={`${card} ${on ? chosen : `${plain} ${hover}`} flex flex-col items-start gap-2 p-4 text-left`}
                      >
                        <Icon size={20} aria-hidden className={on ? 'text-accent' : 'text-stone-500'} />
                        <span>
                          <span className="block font-medium">{WHO_LABELS[id]}</span>
                          <span className="block text-sm text-stone-500">{detail}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Section>
            </div>

            <div>
              <Section title="What it shows">
                <div className="grid grid-cols-2 gap-2">
                  {SHOWS.map(({ id, label, Icon }) => {
                    const on = cloud.sections?.[id] === 'public'
                    return (
                      <div key={id} className={`${card} ${plain} flex flex-col gap-3 p-4`}>
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`flex size-10 items-center justify-center rounded-xl ${
                              on ? 'bg-accent text-accent-fg' : 'bg-stone-100 text-stone-500 dark:bg-stone-800'
                            }`}
                          >
                            <Icon size={20} aria-hidden />
                          </span>
                          <Switch
                            label={label}
                            checked={on}
                            onChange={(next) => attempt(() => cloud.setSections({ [id]: next ? 'public' : 'off' }))}
                          />
                        </div>
                        <span className="font-medium">{label}</span>
                      </div>
                    )
                  })}
                </div>
              </Section>
              {follows && (
                <Section title="People">
                  <div className="grid grid-cols-2 gap-2">
                    {tiles.map(({ list, label, Icon, count, waiting }) => (
                      <button
                        key={list}
                        type="button"
                        onClick={() => setPeople(list)}
                        className={`${card} ${waiting && count ? chosen : plain} ${hover} flex items-center gap-3 p-4 text-left`}
                      >
                        <Icon size={20} aria-hidden className={waiting && count ? 'text-accent' : 'text-stone-500'} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xl font-semibold tabular-nums">{count}</span>
                          <span className="block text-sm text-stone-500">{label}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </div>
        </>
      )}
      {people && follows && (
        <FollowSheet
          list={people}
          people={follows[people]}
          onAct={(what, username) =>
            attempt(async () => {
              const a = cloud.api!
              if (what === 'remove') await a.removeFollower(username)
              else if (what === 'unfollow') await a.unfollow(username)
              else if (what === 'approve' || what === 'decline') await a.respondFollow(username, what === 'approve')
              else await a.unblock(username)
              await reload()
            })
          }
          onClose={() => setPeople(null)}
        />
      )}
    </Screen>
  )
}
