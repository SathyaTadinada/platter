import { AudioLines, CircuitBoard, Disc3, Gem, MapPin, Pin, Plus, Speaker, X, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { handleFrom, LINK_NAMES, LINK_SERVICES, linkFor, validHandle, type LinkService } from '../../../worker/links'
import type { Who } from '../../../worker/profile'
import { BadgePill } from '../../components/BadgePill'
import { BrandIcon } from '../../components/BrandIcon'
import { Cover } from '../../components/Cover'
import { Menu } from '../../components/Menu'
import { Avatar } from '../../components/Profile'
import { Button, IconButton, Notice, Section, Switch } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { CloudError, type About, type Pinned, type ProfileHead, type SetupSlot } from '../../lib/cloud'
import { BIO_MAX, hasLink, SETUP_LABELS, SETUP_MAX, type ProfileAbout, type ProfileBrief } from '../../lib/profile'
import { timeAgo } from '../../lib/time'
import { peopleLink } from '../account/Connections'
import { WHO_LABELS } from '../account/ProfileArea'
import { theirPeople } from './People'
import { PinSheet } from './PinSheet'

const SLOT_ICONS: Record<SetupSlot, LucideIcon> = {
  turntable: Disc3,
  cartridge: Gem, // the stylus's diamond
  preamp: CircuitBoard,
  amp: AudioLines,
  speakers: Speaker,
}

const LOCATION_MAX = 40
const PRONOUNS_MAX = 20

const field =
  'w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-accent/60 focus:outline-none dark:bg-stone-900 dark:ring-stone-800'
const fieldLabel = 'mb-1 flex items-center gap-1.5 px-1 text-xs text-stone-500'
const card = 'rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800'
const cardTitle = 'mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase'
const pill =
  'inline-flex items-center gap-1.5 rounded-full bg-stone-900/5 px-3 py-1.5 text-sm font-medium hover:bg-stone-900/10 dark:bg-white/10 dark:hover:bg-white/15'

// badges shown before the rest fold into +N
const SHOWN = 3

export const discogsUser = (name: string) => `https://www.discogs.com/user/${encodeURIComponent(name)}`
const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

// A record on the profile (pinned, or the last one played), opening its page
function RecordLine({ item, note }: { item: ProfileBrief | Pinned; note: ReactNode }) {
  return (
    <Link
      href={`/release/${item.id}`}
      className="-mx-2 flex items-center gap-3 rounded-xl p-2 hover:bg-stone-50 dark:hover:bg-stone-800/50"
    >
      <Cover item={{ cover: item.thumb, thumb: item.thumb }} small className="size-12 shrink-0 rounded-lg" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-xs text-stone-500">{note}</span>
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-stone-500">{item.artist}</span>
      </span>
    </Link>
  )
}

// The top of a profile. On the left, the picture and beside it the name (with Follow, or Edit profile on
// your own), the counts, the bio, links elsewhere, and badges. On the right on wide screens (under it
// on phones), cards for a pinned record and the one last played, and their setup. Edit profile turns
// all of it into fields right where it is.
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
  const [editing, setEditing] = useState<About | null>(null)
  const [added, setAdded] = useState<LinkService | null>(null) // a link just added, to type into
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = (patch: Partial<About>) => editing && setEditing({ ...editing, ...patch })

  const edit = () => {
    setError(null)
    setAdded(null)
    setEditing({ ...cloud.about })
  }
  // focus leaves the fields before they go: Safari keeps its writing tools button next to a text box
  // that disappears while focused
  const stopEditing = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setEditing(null)
  }
  async function save() {
    if (!editing) return
    setError(null)
    const texts = [editing.bio, editing.location, editing.pronouns, ...Object.values(editing.setup)]
    if (texts.some((t) => t && hasLink(t))) return setError('Links can’t go in your bio or setup. Add them under Links instead.')
    const links: Record<string, string> = {}
    for (const [s, raw] of Object.entries(editing.links) as [LinkService, string][]) {
      const handle = handleFrom(s, raw ?? '')
      if (!handle) continue
      if (!validHandle(s, handle)) return setError(`That isn’t a ${LINK_NAMES[s]} username.`)
      links[s] = handle
    }
    setBusy(true)
    try {
      await cloud.setAbout({ ...editing, links })
      await onSaved?.()
      stopEditing()
    } catch (e) {
      setError(e instanceof CloudError && e.status === 400 ? 'That didn’t save. Check it and try again.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

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

  // in the same place as Follow on anyone else's; while editing, Cancel and Save take its place
  const action = follow ? (
    <Button variant={follow.state === 'none' ? 'primary' : 'secondary'} className="min-h-9 px-4 text-sm" onClick={follow.onClick}>
      {follow.state === 'accepted' ? 'Following' : follow.state === 'pending' ? 'Requested' : 'Follow'}
    </Button>
  ) : mine ? (
    editing ? (
      <div className="flex gap-2">
        <Button variant="secondary" className="min-h-9 flex-1 px-4 text-sm" disabled={busy} onClick={stopEditing}>
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

  // ---- the left: who they are ----

  const aboutThem = editing ? (
    <div className="max-w-xl space-y-3">
      <div>
        <textarea
          aria-label="Bio"
          placeholder="Add a bio"
          value={editing.bio}
          maxLength={BIO_MAX}
          rows={3}
          autoFocus
          onChange={(e) => change({ bio: e.target.value })}
          className={`${field} resize-none`}
        />
        <p className="mt-1 text-right text-xs text-stone-500 tabular-nums">
          {[...editing.bio].length}/{BIO_MAX}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabel}>Pronouns</span>
          <input
            value={editing.pronouns}
            maxLength={PRONOUNS_MAX}
            autoComplete="off"
            onChange={(e) => change({ pronouns: e.target.value })}
            className={field}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>
            <MapPin size={14} aria-hidden />
            Location
          </span>
          <input
            value={editing.location}
            maxLength={LOCATION_MAX}
            autoComplete="off"
            onChange={(e) => change({ location: e.target.value })}
            className={field}
          />
        </label>
      </div>
      <div>
        <span className={fieldLabel}>Links</span>
        <div className="space-y-2">
          {LINK_SERVICES.filter((s) => s in editing.links).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center text-stone-500" title={LINK_NAMES[s]}>
                <BrandIcon service={s} size={18} />
              </span>
              <input
                aria-label={`${LINK_NAMES[s]} username`}
                placeholder={s === 'mastodon' ? 'you@server' : `${LINK_NAMES[s]} username`}
                value={editing.links[s] ?? ''}
                autoFocus={s === added}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => change({ links: { ...editing.links, [s]: e.target.value } })}
                className={field}
              />
              <IconButton
                label={`Remove ${LINK_NAMES[s]}`}
                onClick={() => {
                  const { [s]: _, ...rest } = editing.links
                  change({ links: rest })
                }}
              >
                <X size={16} />
              </IconButton>
            </div>
          ))}
          {LINK_SERVICES.some((s) => !(s in editing.links)) && (
            <Menu
              label="Add a link"
              align="left"
              button={
                <>
                  <Plus size={16} aria-hidden />
                  Add a link
                </>
              }
              buttonClassName={pill}
              items={LINK_SERVICES.filter((s) => !(s in editing.links)).map((s) => ({
                label: LINK_NAMES[s],
                icon: <BrandIcon service={s} size={16} />,
                onSelect: () => {
                  setAdded(s)
                  change({ links: { ...editing.links, [s]: '' } })
                },
              }))}
            />
          )}
        </div>
      </div>
    </div>
  ) : (
    <>
      {head.bio && <p className="max-w-xl text-sm break-words whitespace-pre-line">{head.bio}</p>}
      {links.length > 0 && (
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
      )}
    </>
  )

  // ---- the right: records and setup ----

  const recordsCard = editing ? (
    <div className={card}>
      <h3 className={cardTitle}>Records</h3>
      <div className="space-y-3">
        {editing.pinned ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <RecordLine
                item={editing.pinned}
                note={
                  <>
                    <Pin size={12} aria-hidden />
                    Pinned
                  </>
                }
              />
            </div>
            <IconButton label="Unpin" onClick={() => change({ pinned: null })}>
              <X size={16} />
            </IconButton>
          </div>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className={pill}>
            <Pin size={16} aria-hidden />
            Pin a record
          </button>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Show what I last played</span>
          <Switch label="Show what I last played" checked={editing.playing} onChange={(on) => change({ playing: on })} />
        </div>
      </div>
    </div>
  ) : pinned || playing ? (
    <div className={`${card} space-y-1`}>
      {pinned && (
        <RecordLine
          item={pinned}
          note={
            <>
              <Pin size={12} aria-hidden />
              Pinned
            </>
          }
        />
      )}
      {playing && <RecordLine item={playing.item} note={`Last played ${timeAgo(playing.at)}`} />}
    </div>
  ) : null

  const setupCard = editing ? (
    <div className={card}>
      <h3 className={cardTitle}>Setup</h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {SETUP_LABELS.map(([slot, label]) => {
          const Icon = SLOT_ICONS[slot]
          return (
            <label key={slot} className="block min-w-0">
              <span className={fieldLabel}>
                <Icon size={14} aria-hidden />
                {label}
              </span>
              <input
                value={editing.setup[slot] ?? ''}
                maxLength={SETUP_MAX}
                autoComplete="off"
                onChange={(e) => change({ setup: { ...editing.setup, [slot]: e.target.value } })}
                className={field}
              />
            </label>
          )
        })}
      </div>
    </div>
  ) : setup.length > 0 ? (
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
  ) : null

  const side = recordsCard || setupCard

  return (
    <Section>
      <div className={side ? 'space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-10 lg:space-y-0' : ''}>
        {/* picture on the left; everything else in one column beside it (under it on phones), so editing
            only changes what's being edited and nothing above it moves. Any spare height goes to the last
            row, never between the name and the counts. */}
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
            {aboutThem}
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
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        </div>
        {side && (
          <div className="space-y-3">
            {recordsCard}
            {setupCard}
          </div>
        )}
      </div>
      {/* phones: the button last, full width */}
      {action && <div className="mt-4 md:hidden [&>*]:w-full">{action}</div>}
      {picking && editing && (
        <PinSheet
          onPick={(record) => {
            change({ pinned: record })
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Section>
  )
}
