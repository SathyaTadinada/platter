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

  // in the same place as Follow on anyone else's; while editing, Cancel and Save take its place
  const action = follow ? (
    <Button variant={follow.state === 'none' ? 'primary' : 'secondary'} className="min-h-9 px-4 text-sm" onClick={follow.onClick}>
      {follow.state === 'accepted' ? 'Following' : follow.state === 'pending' ? 'Requested' : 'Follow'}
    </Button>
  ) : mine ? (
    editing ? (
      <div className="flex gap-2">
        <Button variant="secondary" className="min-h-9 flex-1 px-4 text-sm" disabled={busy} onClick={() => setEditing(null)}>
          Cancel
        </Button>
        <Button className="min-h-9 flex-1 px-4 text-sm" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    ) : (
      <Button variant="secondary" className="min-h-9 px-4 text-sm" onClick={edit}>
        Edit profile
      </Button>
    )
  ) : null

  const countRow = (
    <dl className="flex gap-6 max-md:justify-around">
      {counts.map((c) => {
        const text = (
          <>
            {/* label first for the list's sake, shown after the number */}
            <dt className="text-stone-500 max-md:text-sm">{c.n === 1 ? c.one : c.many}</dt>
            <dd className="font-semibold tabular-nums max-md:text-xl">{c.n.toLocaleString()}</dd>
          </>
        )
        const cls = 'flex flex-col-reverse items-center gap-x-1.5 md:flex-row-reverse md:items-baseline'
        // your own open the full lists on your account, someone else's who they show
        return c.list && (mine || !head.locked) ? (
          <Link
            key={c.one}
            href={mine ? peopleLink(c.list) : theirPeople(head.username, c.list)}
            className={`${cls} -mx-1.5 rounded-lg px-1.5 hover:bg-stone-100 dark:hover:bg-stone-800`}
          >
            {text}
          </Link>
        ) : (
          <div key={c.one} className={cls}>
            {text}
          </div>
        )
      })}
    </dl>
  )

  return (
    <Section>
      {/* picture on the left; everything else in one column beside it (under it on phones), so editing
          only changes what's being edited and nothing above it moves. Any spare height goes to the last
          row, never between the name and the counts. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 md:grid-rows-[auto_auto_1fr] md:gap-x-8">
        <div className="md:row-span-3">
          <Avatar src={about.avatar} name={head.username} size="size-16 text-xl md:size-28 md:text-3xl" />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 self-center md:self-start">
          <div className="min-w-0">
            <p className="truncate text-2xl font-bold tracking-tight">{head.username}</p>
            <p className="text-sm text-stone-500">{details.join(' · ')}</p>
          </div>
          <div className="max-md:hidden">{action}</div>
        </div>
        <div className="max-md:hidden">{countRow}</div>

        <div className="col-span-2 min-w-0 space-y-3 md:col-span-1 md:col-start-2">
          {editing ? (
            <div className="max-w-xl">
              <textarea
                aria-label="Bio"
                placeholder="Add a bio"
                value={editing.bio}
                maxLength={BIO_MAX}
                rows={3}
                autoFocus
                onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                className={`${field} resize-none`}
              />
              <p className="mt-1 text-right text-xs text-stone-500 tabular-nums">
                {bioLength}/{BIO_MAX}
              </p>
            </div>
          ) : (
            head.bio && <p className="max-w-xl text-sm break-words whitespace-pre-line">{head.bio}</p>
          )}

          {head.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
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

          {editing ? (
            // every slot, filled or not, so any of them can be added
            <div className="grid max-w-xl gap-x-3 gap-y-2.5 sm:grid-cols-2">
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
          ) : (
            // what they listen on, as a line of small pills, each named by its icon (and its label on hover)
            setup.length > 0 && (
              <ul aria-label="Setup" className="flex flex-wrap gap-1.5">
                {setup.map(([slot, label]) => {
                  const Icon = SLOT_ICONS[slot]
                  return (
                    <li
                      key={slot}
                      title={label}
                      className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-stone-900/5 px-2.5 py-1 text-sm dark:bg-white/10"
                    >
                      <Icon size={14} aria-hidden className="shrink-0 text-stone-500" />
                      <span className="sr-only">{label}: </span>
                      <span className="truncate">{head.setup[slot]}</span>
                    </li>
                  )
                })}
              </ul>
            )
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
      {/* phones: the counts and the button under it all, full width */}
      <div className="mt-4 space-y-3 md:hidden">
        {countRow}
        {action && <div className="[&>*]:w-full">{action}</div>}
      </div>
    </Section>
  )
}
