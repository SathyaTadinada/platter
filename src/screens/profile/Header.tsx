import { useState } from 'react'
import { Link } from 'wouter'
import type { Who } from '../../../worker/profile'
import { BadgePill } from '../../components/BadgePill'
import { Avatar } from '../../components/Profile'
import { Button, Section } from '../../components/ui'
import type { ProfileHead } from '../../lib/cloud'
import type { ProfileAbout } from '../../lib/profile'
import { peopleLink } from '../account/Connections'
import { theirPeople } from './People'
import { WHO_LABELS } from '../account/ProfileArea'
import { SETUP_LABELS } from '../../lib/profile'

// badges shown before the rest fold into +N
const SHOWN = 3

export const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

// The top of a profile: picture and name, with when they joined and their badges under it, then the counts and,
// for someone else's, Follow. What else can be done (edit, copy the link, Discogs) is in the toolbar.
export function ProfileHeader({
  head,
  about,
  who,
  mine,
  follow,
}: {
  head: ProfileHead
  about: ProfileAbout
  who?: Who // yours, on your own profile
  mine?: boolean
  follow?: { state: 'none' | 'pending' | 'accepted'; onClick: () => void }
}) {
  const [showAll, setShowAll] = useState(false)
  // the record count comes with the collection, so it's there only when that is
  const counts: { n: number; one: string; many: string; list?: 'followers' | 'following' }[] = [
    ...(about.records !== undefined ? [{ n: about.records, one: 'record', many: 'records' }] : []),
    { n: head.followers, one: 'follower', many: 'followers', list: 'followers' },
    { n: head.following, one: 'following', many: 'following', list: 'following' },
  ]
  const details = [`Joined ${joined(head.memberSince)}`, who && WHO_LABELS[who], head.relation?.followsYou && 'Follows you'].filter(Boolean)

  const setup = SETUP_LABELS.filter(([slot]) => head.setup?.[slot])

  return (
    <>
      <Section>
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Avatar src={about.avatar} name={head.username} size="size-20 text-2xl" />
            <div className="min-w-0">
              <p className="truncate text-2xl font-bold tracking-tight">{head.username}</p>
              <p className="mt-1 text-sm text-stone-500">{details.join(' · ')}</p>
              {head.bio && <p className="mt-2 max-w-prose text-sm break-words whitespace-pre-line">{head.bio}</p>}
              {head.badges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(showAll ? head.badges : head.badges.slice(0, SHOWN)).map((b) => (
                    <BadgePill key={b.label} badge={b} />
                  ))}
                  {!showAll && head.badges.length > SHOWN && (
                    <button
                      type="button"
                      onClick={() => setShowAll(true)}
                      aria-label={`Show ${head.badges.length - SHOWN} more ${head.badges.length - SHOWN === 1 ? 'badge' : 'badges'}`}
                      className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                    >
                      +{head.badges.length - SHOWN}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <dl className={`grid text-center md:w-64 ${counts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {counts.map((c) => {
                const text = (
                  <>
                    {/* label first for the list's sake, shown under the number */}
                    <dt className="text-sm text-stone-500">{c.n === 1 ? c.one : c.many}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{c.n.toLocaleString()}</dd>
                  </>
                )
                // your own open the full lists on your account, someone else's who they show
                return c.list && (mine || !head.locked) ? (
                  <Link
                    key={c.one}
                    href={mine ? peopleLink(c.list) : theirPeople(head.username, c.list)}
                    className="flex flex-col-reverse rounded-xl py-1 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    {text}
                  </Link>
                ) : (
                  <div key={c.one} className="flex flex-col-reverse py-1">
                    {text}
                  </div>
                )
              })}
            </dl>
            {follow && (
              <Button
                variant={follow.state === 'none' ? 'primary' : 'secondary'}
                className="min-h-10 text-sm md:min-w-32"
                onClick={follow.onClick}
              >
                {follow.state === 'accepted' ? 'Following' : follow.state === 'pending' ? 'Requested' : 'Follow'}
              </Button>
            )}
          </div>
        </div>
      </Section>
      {/* what they listen on, when they've said; nothing at all otherwise */}
      {setup.length > 0 && (
        <Section title="Setup">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:grid-cols-3 lg:grid-cols-5 dark:bg-stone-900 dark:ring-stone-800">
            {setup.map(([slot, label]) => (
              <div key={slot} className="min-w-0">
                <dt className="text-xs text-stone-500">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium break-words">{head.setup[slot]}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </>
  )
}
