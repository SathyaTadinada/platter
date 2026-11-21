import { AudioLines, CircuitBoard, Disc3, Gem, Speaker, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import type { Who } from '../../../worker/profile'
import { BadgePill } from '../../components/BadgePill'
import { Avatar } from '../../components/Profile'
import { Button, Notice, Section } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { CloudError, type ProfileHead, type Setup, type SetupSlot } from '../../lib/cloud'
import type { ProfileAbout } from '../../lib/profile'
import { peopleLink } from '../account/Connections'
import { theirPeople } from './People'
import { WHO_LABELS } from '../account/ProfileArea'
import { BIO_MAX, hasLink, SETUP_LABELS, SETUP_MAX } from '../../lib/profile'

const SLOT_ICONS: Record<SetupSlot, LucideIcon> = {
  turntable: Disc3,
  cartridge: Gem, // the stylus's diamond
  preamp: CircuitBoard,
  amp: AudioLines,
  speakers: Speaker,
}

const field =
  'w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-accent/60 focus:outline-none dark:bg-stone-900 dark:ring-stone-800'

// badges shown before the rest fold into +N
const SHOWN = 3

export const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

// The top of a profile: picture and name, with when they joined, a bio, and their badges under it, then
// the counts and, for someone else's, Follow. On your own, Edit profile instead, which turns the bio and
// setup into fields right where they are. What else can be done is in the toolbar.
export function ProfileHeader({
  head,
  about,
  who,
  mine,
  follow,
  onSaved,
}: {
  head: ProfileHead
  about: ProfileAbout
  who?: Who // yours, on your own profile
  mine?: boolean
  follow?: { state: 'none' | 'pending' | 'accepted'; onClick: () => void }
  onSaved?: () => Promise<unknown> | void // after editing, to read the profile again
}) {
  const [showAll, setShowAll] = useState(false)
  const cloud = useCloud()
  const [editing, setEditing] = useState<{ bio: string; setup: Setup } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const edit = () => {
    setError(null)
    setEditing({ bio: head.bio ?? '', setup: head.setup ?? {} })
  }
  async function save() {
    if (!editing) return
    setError(null)
    if ([editing.bio, ...Object.values(editing.setup)].some((t) => t && hasLink(t))) return setError('Links can’t go on a profile.')
    setBusy(true)
    try {
      await cloud.setAbout(editing.bio, editing.setup)
      await onSaved?.()
      setEditing(null)
    } catch (e) {
      setError(e instanceof CloudError && e.status === 400 ? 'That didn’t save. Check it for links and try again.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const bioLength = [...(editing?.bio ?? '')].length
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
              {editing ? (
                <div className="mt-2 max-w-prose">
                  <textarea
                    aria-label="Bio"
                    placeholder="Add a bio"
                    value={editing.bio}
                    maxLength={BIO_MAX}
                    rows={2}
                    autoFocus
                    onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                    className={`${field} resize-none`}
                  />
                  {/* only once it's getting close, so it doesn't nag */}
                  {bioLength > BIO_MAX - 30 && (
                    <p className="mt-1 text-right text-xs text-stone-500 tabular-nums">
                      {bioLength}/{BIO_MAX}
                    </p>
                  )}
                </div>
              ) : (
                head.bio && <p className="mt-2 max-w-prose text-sm break-words whitespace-pre-line">{head.bio}</p>
              )}
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
            {/* in the same place as Follow on anyone else's */}
            {mine &&
              (editing ? (
                <div className="grid grid-cols-2 gap-2 md:flex">
                  <Button variant="secondary" className="min-h-10 text-sm md:min-w-24" disabled={busy} onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button className="min-h-10 text-sm md:min-w-24" disabled={busy} onClick={save}>
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" className="min-h-10 text-sm md:min-w-32" onClick={edit}>
                  Edit profile
                </Button>
              ))}
          </div>
        </div>
      </Section>
      {editing ? (
        <Section title="Setup">
          {/* every slot, filled or not, so any of them can be added */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SETUP_LABELS.map(([slot, label]) => {
              const Icon = SLOT_ICONS[slot]
              return (
                <label key={slot} className="block">
                  <span className="mb-1 flex items-center gap-1.5 px-1 text-xs text-stone-500">
                    <Icon size={14} aria-hidden />
                    {label}
                  </span>
                  <input
                    value={editing.setup[slot] ?? ''}
                    maxLength={SETUP_MAX}
                    autoComplete="off"
                    onChange={(e) => setEditing({ ...editing, setup: { ...editing.setup, [slot]: e.target.value } })}
                    className={field}
                  />
                </label>
              )
            })}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
        </Section>
      ) : (
        // what they listen on, when they've said; the card is only as wide as what's in it, so a setup
        // of two doesn't leave a long empty stretch
        setup.length > 0 && (
          <Section title="Setup">
            <dl className="flex w-fit max-w-full flex-wrap gap-x-8 gap-y-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              {setup.map(([slot, label]) => {
                const Icon = SLOT_ICONS[slot]
                return (
                  <div key={slot} className="flex min-w-0 items-center gap-2.5">
                    <Icon size={18} aria-hidden className="shrink-0 text-stone-500" />
                    <div className="min-w-0">
                      <dt className="text-xs text-stone-500">{label}</dt>
                      <dd className="text-sm font-medium break-words">{head.setup[slot]}</dd>
                    </div>
                  </div>
                )
              })}
            </dl>
          </Section>
        )
      )}
    </>
  )
}
