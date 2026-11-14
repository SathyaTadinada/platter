import { Award } from 'lucide-react'
import type { Who } from '../../../worker/profile'
import { Avatar } from '../../components/Profile'
import { Button, Section } from '../../components/ui'
import type { ProfileHead } from '../../lib/cloud'
import type { ProfileAbout } from '../../lib/profile'
import { WHO_LABELS } from '../account/ProfileArea'

export const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

// The top of a profile: picture and name, with any badges beside the name, then the counts and,
// for someone else's, Follow. What else can be done (edit, copy the link, Discogs) is in the toolbar.
export function ProfileHeader({
  head,
  about,
  who,
  follow,
}: {
  head: ProfileHead
  about: ProfileAbout
  who?: Who // yours, on your own profile
  follow?: { state: 'none' | 'pending' | 'accepted'; onClick: () => void }
}) {
  // the record count comes with the collection, so it's there only when that is
  const counts: { n: number; one: string; many: string }[] = [
    ...(about.records !== undefined ? [{ n: about.records, one: 'record', many: 'records' }] : []),
    { n: head.followers, one: 'follower', many: 'followers' },
    { n: head.following, one: 'following', many: 'following' },
  ]
  const details = [`Joined ${joined(head.memberSince)}`, who && WHO_LABELS[who], head.relation?.followsYou && 'Follows you'].filter(Boolean)

  return (
    <Section>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar src={about.avatar} name={head.username} size="size-20 text-2xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-2xl font-bold tracking-tight">{head.username}</p>
              {head.badges.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/70 dark:text-amber-200"
                >
                  <Award size={12} aria-hidden />
                  {b}
                </span>
              ))}
            </div>
            <p className="mt-1 text-sm text-stone-500">{details.join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
          <dl className={`grid text-center md:w-64 ${counts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {counts.map((c) => (
              <div key={c.one} className="flex flex-col-reverse">
                {/* label first for the list's sake, shown under the number */}
                <dt className="text-sm text-stone-500">{c.n === 1 ? c.one : c.many}</dt>
                <dd className="text-xl font-semibold tabular-nums">{c.n.toLocaleString()}</dd>
              </div>
            ))}
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
  )
}
