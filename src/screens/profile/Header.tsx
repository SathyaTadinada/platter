import { MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { LINK_NAMES, LINK_SERVICES, linkFor } from '../../../worker/links'
import type { Who } from '../../../worker/profile'
import { BadgePill } from '../../components/BadgePill'
import { BrandIcon } from '../../components/BrandIcon'
import { Avatar } from '../../components/Profile'
import { Button, Section } from '../../components/ui'
import type { ProfileHead } from '../../lib/cloud'
import { SETUP_LABELS, type ProfileAbout } from '../../lib/profile'
import { timeAgo } from '../../lib/time'
import { peopleLink } from '../account/Connections'
import { WHO_LABELS } from '../account/ProfileArea'
import { EditSheet, pinnedNote, RecordLine, SLOT_ICONS } from './EditSheet'
import { theirPeople } from './People'

const card = 'rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800'
const cardTitle = 'mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase'

// badges shown before the rest fold into +N
const SHOWN = 3

export const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

// The top of a profile. On the left, the picture and beside it the name (with Follow, or Edit profile on
// your own), the counts, the bio, links elsewhere, badges, and a pinned record and the one last played.
// Their setup sits on the right on wide screens (under it all on phones). Edit profile opens a sheet.
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
  const [editing, setEditing] = useState(false)

  // the record count comes with the collection, so it's there only when that is
  const counts: { n: number; one: string; many: string; list?: 'followers' | 'following' }[] = [
    ...(about.records !== undefined ? [{ n: about.records, one: 'record', many: 'records' }] : []),
    { n: head.followers, one: 'follower', many: 'followers', list: 'followers' },
    { n: head.following, one: 'following', many: 'following', list: 'following' },
  ]
  const details = [`Joined ${joined(head.memberSince)}`, who && WHO_LABELS[who], head.relation?.followsYou && 'Follows you'].filter(Boolean)
  const setup = SETUP_LABELS.filter(([slot]) => head.setup?.[slot])
  const links = LINK_SERVICES.filter((s) => head.links?.[s])
  const pinned = head.pinned
  const playing = about.playing

  // in the same place as Follow on anyone else's
  const action = follow ? (
    <Button variant={follow.state === 'none' ? 'primary' : 'secondary'} className="min-h-9 px-4 text-sm" onClick={follow.onClick}>
      {follow.state === 'accepted' ? 'Following' : follow.state === 'pending' ? 'Requested' : 'Follow'}
    </Button>
  ) : mine ? (
    <Button variant="secondary" className="min-h-9 px-4 text-sm" onClick={() => setEditing(true)}>
      Edit profile
    </Button>
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

  const linkRow = links.length > 0 && (
    <ul className="-ml-1.5 flex flex-wrap gap-0.5">
      {links.map((s) => (
        <li key={s}>
          <a
            href={linkFor(s, head.links[s]!)}
            target="_blank"
            rel="noopener noreferrer"
            title={`${LINK_NAMES[s]} · ${head.links[s]}`}
            aria-label={`${LINK_NAMES[s]}: ${head.links[s]}`}
            className="flex size-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <BrandIcon service={s} size={17} />
          </a>
        </li>
      ))}
    </ul>
  )

  const records = (pinned || playing) && (
    <>
      {pinned && <RecordLine item={pinned} note={pinnedNote} />}
      {playing && <RecordLine item={playing.item} note={`Last played ${timeAgo(playing.at)}`} />}
    </>
  )

  const setupCard = setup.length > 0 && (
    <div className={card}>
      <h3 className={cardTitle}>Setup</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {setup.map(([slot, label]) => {
          const Icon = SLOT_ICONS[slot]
          return (
            <div key={slot} className="flex min-w-0 items-start gap-2.5">
              <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-stone-500" />
              <div className="min-w-0">
                <dt className="text-xs text-stone-500">{label}</dt>
                <dd className="text-sm font-medium break-words">{head.setup[slot]}</dd>
              </div>
            </div>
          )
        })}
      </dl>
    </div>
  )

  // the setup is the taller of the two, so it takes the right and the records stay with the rest on
  // the left. Without a setup the records take the right instead.
  const side = setupCard || (records && <div className={`${card} space-y-1`}>{records}</div>)
  const recordsHere = setupCard && records

  return (
    <Section>
      <div className={side ? 'space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-10 lg:space-y-0' : ''}>
        {/* picture on the left and everything else in one column beside it (under it on phones). Any spare
            height goes to the last row, never between the name and the counts. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 md:grid-rows-[auto_auto_1fr] md:gap-x-8">
          <div className="md:row-span-3">
            <Avatar src={about.avatar} name={head.username} size="size-16 text-xl md:size-28 md:text-3xl" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 self-center md:self-start">
            <div className="min-w-0">
              <p className="truncate text-2xl font-bold tracking-tight">
                {head.username}
                {head.pronouns && <span className="ml-2 text-base font-normal tracking-normal text-stone-500">{head.pronouns}</span>}
              </p>
              <p className="flex flex-wrap items-center gap-x-1 text-sm text-stone-500">
                {head.location && (
                  <>
                    <MapPin size={13} aria-hidden />
                    <span>{head.location}</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span>{details.join(' · ')}</span>
              </p>
            </div>
            <div className="max-md:hidden">{action}</div>
          </div>
          <div className="max-md:hidden">{countRow}</div>

          <div className="col-span-2 min-w-0 space-y-3 md:col-span-1 md:col-start-2">
            {/* phones: the counts right under the name, in the same order as wide screens */}
            <div className="md:hidden">{countRow}</div>
            {head.bio && <p className="max-w-xl text-sm break-words whitespace-pre-line">{head.bio}</p>}
            {linkRow}
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
            {recordsHere && <div className="grid max-w-xl gap-x-6 sm:grid-cols-2">{records}</div>}
          </div>
        </div>
        {side}
      </div>
      {/* phones: the button last, full width */}
      {action && <div className="mt-4 md:hidden [&>*]:w-full">{action}</div>}
      {editing && (
        <EditSheet
          onClose={() => setEditing(false)}
          onSaved={(published) => {
            setEditing(false)
            onSaved?.()
            // the record last played goes up with the rest of the profile, a moment later
            published.then(() => onSaved?.())
          }}
        />
      )}
    </Section>
  )
}
