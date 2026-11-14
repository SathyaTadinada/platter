import { Award, CalendarDays, ExternalLink as ExternalIcon, Globe, Link as LinkIcon, Lock, UserCheck, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'wouter'
import type { Who } from '../../../worker/profile'
import { toast } from '../../components/Toaster'
import { Button, buttonClass, Section } from '../../components/ui'
import type { ProfileHead } from '../../lib/cloud'
import type { ProfileAbout } from '../../lib/profile'

export const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

const WHO: Record<Who, { label: string; icon: ReactNode }> = {
  private: { label: 'Private', icon: <Lock size={14} /> },
  followers: { label: 'Followers', icon: <Users size={14} /> },
  unlisted: { label: 'Link only', icon: <LinkIcon size={14} /> },
  public: { label: 'Public', icon: <Globe size={14} /> },
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
      <span aria-hidden className="text-stone-500 dark:text-stone-400">
        {icon}
      </span>
      {children}
    </span>
  )
}

const small = 'min-h-10 text-sm'

// The top of a profile: picture and counts side by side, then badges, then what can be done
// about it. Your own has your settings where someone else's has Follow.
export function ProfileHeader({
  head,
  about,
  mine,
  who,
  follow,
}: {
  head: ProfileHead
  about: ProfileAbout
  mine: boolean
  who?: Who // yours, on your own profile
  follow?: { state: 'none' | 'pending' | 'accepted'; onClick: () => void }
}) {
  // the record count comes with the collection, so it's there only when that is
  const counts: { n: number; one: string; many: string }[] = [
    ...(about.records !== undefined ? [{ n: about.records, one: 'record', many: 'records' }] : []),
    { n: head.followers, one: 'follower', many: 'followers' },
    { n: head.following, one: 'following', many: 'following' },
  ]

  const buttons: ReactNode[] = mine
    ? [
        <Link key="edit" href="/account/profile" className={buttonClass('secondary', small)}>
          Edit profile
        </Link>,
        <Button
          key="copy"
          variant="secondary"
          className={small}
          onClick={async () => {
            await navigator.clipboard.writeText(`${location.origin}/u/${head.username}`)
            toast('Link copied', { tone: 'success' })
          }}
        >
          <LinkIcon size={16} aria-hidden />
          Copy link
        </Button>,
      ]
    : [
        ...(follow
          ? [
              <Button key="follow" variant={follow.state === 'none' ? 'primary' : 'secondary'} className={small} onClick={follow.onClick}>
                {follow.state === 'accepted' ? 'Following' : follow.state === 'pending' ? 'Requested' : 'Follow'}
              </Button>,
            ]
          : []),
        <a key="discogs" href={discogsUser(head.username)} target="_blank" rel="noopener" className={buttonClass('secondary', small)}>
          Discogs
          <ExternalIcon size={16} aria-hidden />
        </a>,
      ]

  return (
    <Section>
      <div className="flex items-center gap-5 sm:gap-8">
        {about.avatar ? (
          <img src={about.avatar} alt="" className="size-20 shrink-0 rounded-full bg-stone-200 object-cover dark:bg-stone-800" />
        ) : (
          <span
            className="flex size-20 shrink-0 items-center justify-center rounded-full bg-stone-200 text-2xl font-semibold uppercase dark:bg-stone-800"
            aria-hidden
          >
            {head.username.charAt(0)}
          </span>
        )}
        <dl className={`grid flex-1 text-center sm:max-w-sm ${counts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {counts.map((c) => {
            const text = (
              <>
                {/* label first for the list's sake, shown under the number */}
                <dt className="text-sm text-stone-500">{c.n === 1 ? c.one : c.many}</dt>
                <dd className="text-xl font-semibold tabular-nums">{c.n.toLocaleString()}</dd>
              </>
            )
            // your own followers and following open the lists, which are only yours to see
            return mine && c.one !== 'record' ? (
              <Link
                key={c.one}
                href="/account/profile"
                className="flex flex-col-reverse rounded-lg py-1 hover:bg-stone-100 dark:hover:bg-stone-800"
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
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {head.badges.map((b) => (
          <Chip key={b} icon={<Award size={14} />}>
            {b}
          </Chip>
        ))}
        {head.relation?.followsYou && <Chip icon={<UserCheck size={14} />}>Follows you</Chip>}
        {mine && who && <Chip icon={WHO[who].icon}>{WHO[who].label}</Chip>}
        <Chip icon={<CalendarDays size={14} />}>Joined {joined(head.memberSince)}</Chip>
      </div>
      <div className={`mt-4 grid gap-2 sm:flex ${buttons.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} [&>*]:sm:min-w-40`}>{buttons}</div>
    </Section>
  )
}
