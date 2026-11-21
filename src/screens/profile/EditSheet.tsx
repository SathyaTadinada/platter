import { AudioLines, CircuitBoard, Disc3, Gem, MapPin, Pin, Plus, Speaker, X, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { handleFrom, LINK_NAMES, LINK_SERVICES, validHandle, type LinkService } from '../../../worker/links'
import { BrandIcon } from '../../components/BrandIcon'
import { Cover } from '../../components/Cover'
import { Menu } from '../../components/Menu'
import { Sheet } from '../../components/Sheet'
import { Button, IconButton, Notice, Switch } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { CloudError, type About, type Pinned, type SetupSlot } from '../../lib/cloud'
import { BIO_MAX, hasLink, SETUP_LABELS, SETUP_MAX, type ProfileBrief } from '../../lib/profile'
import { PinSheet } from './PinSheet'

export const SLOT_ICONS: Record<SetupSlot, LucideIcon> = {
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
// a line between each group, so records and setup (and about and links) read as separate
const divided = 'space-y-5 [&>*+*]:border-t [&>*+*]:border-stone-200 [&>*+*]:pt-5 dark:[&>*+*]:border-stone-800'
const groupTitle = 'mb-2 px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase'
const pill =
  'inline-flex items-center gap-1.5 rounded-full bg-stone-900/5 px-3 py-1.5 text-sm font-medium hover:bg-stone-900/10 dark:bg-white/10 dark:hover:bg-white/15'

// nothing here is a login, so password managers keep their buttons out of these fields. Bitwarden also
// takes any field labelled "username" for one whatever it's told, so the links say handle.
const noFill = {
  autoComplete: 'off',
  'data-bwignore': true,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const

// A record on the profile (pinned, or the last one played), opening its page
export function RecordLine({ item, note, link = true }: { item: ProfileBrief | Pinned; note: ReactNode; link?: boolean }) {
  const inside = (
    <>
      <Cover item={{ cover: item.thumb, thumb: item.thumb }} small className="size-12 shrink-0 rounded-lg" />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-xs whitespace-nowrap text-stone-500">{note}</span>
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-stone-500">{item.artist}</span>
      </span>
    </>
  )
  return link ? (
    <Link
      href={`/release/${item.id}`}
      className="-mx-2 flex items-center gap-3 rounded-xl p-2 hover:bg-stone-50 dark:hover:bg-stone-800/50"
    >
      {inside}
    </Link>
  ) : (
    <div className="flex items-center gap-3">{inside}</div>
  )
}

export const pinnedNote = (
  <>
    <Pin size={12} aria-hidden />
    Pinned
  </>
)

// Everything a profile says about its owner, in two columns on wider screens: about them and their
// links on the left, records and setup on the right. Closing it drops the changes.
export function EditSheet({ onSaved, onClose }: { onSaved: (published: Promise<void>) => void; onClose: () => void }) {
  const cloud = useCloud()
  const [editing, setEditing] = useState<About>(() => ({ ...cloud.about }))
  const [added, setAdded] = useState<LinkService | null>(null) // a link just added, to type into
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = (patch: Partial<About>) => setEditing({ ...editing, ...patch })
  const missing = LINK_SERVICES.filter((s) => !(s in editing.links))

  async function save() {
    setError(null)
    const texts = [editing.bio, editing.location, editing.pronouns, ...Object.values(editing.setup)]
    if (texts.some((t) => t && hasLink(t))) return setError('Links can’t go in your bio or setup. Add them under Links instead.')
    const links: Record<string, string> = {}
    for (const [s, raw] of Object.entries(editing.links) as [LinkService, string][]) {
      const handle = handleFrom(s, raw ?? '')
      if (!handle) continue
      if (!validHandle(s, handle)) return setError(`That ${LINK_NAMES[s]} username doesn’t look right.`)
      links[s] = handle
    }
    setBusy(true)
    try {
      const { published } = await cloud.setAbout({ ...editing, links })
      onSaved(published)
    } catch (e) {
      setError(e instanceof CloudError && e.status === 400 ? 'That didn’t save. Check it and try again.' : (e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Edit profile"
      width="3xl"
      bodyClassName="p-4 sm:p-5"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2 max-sm:[&>*]:flex-1">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      }
    >
      <div className={`${divided} sm:grid sm:grid-cols-2 sm:items-start sm:gap-8 sm:space-y-0 sm:[&>*+*]:border-t-0 sm:[&>*+*]:pt-0`}>
        <div className={divided}>
          <div className="space-y-3">
            <h3 className={groupTitle}>About</h3>
            <div>
              <textarea
                aria-label="Bio"
                placeholder="Add a bio"
                value={editing.bio}
                maxLength={BIO_MAX}
                rows={3}
                {...noFill}
                onChange={(e) => change({ bio: e.target.value })}
                className={`${field} resize-none`}
              />
              <p className="mt-1 px-1 text-right text-xs text-stone-500 tabular-nums">
                {[...editing.bio].length}/{BIO_MAX}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className={fieldLabel}>Pronouns</span>
                <input
                  value={editing.pronouns}
                  maxLength={PRONOUNS_MAX}
                  {...noFill}
                  onChange={(e) => change({ pronouns: e.target.value })}
                  className={field}
                />
              </label>
              <label className="block min-w-0">
                <span className={fieldLabel}>
                  <MapPin size={14} aria-hidden />
                  Location
                </span>
                <input
                  value={editing.location}
                  maxLength={LOCATION_MAX}
                  {...noFill}
                  onChange={(e) => change({ location: e.target.value })}
                  className={field}
                />
              </label>
            </div>
          </div>

          <div>
            <h3 className={groupTitle}>Links</h3>
            <div className="space-y-2">
              {LINK_SERVICES.filter((s) => s in editing.links).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center text-stone-500" title={LINK_NAMES[s]}>
                    <BrandIcon service={s} size={18} />
                  </span>
                  <input
                    aria-label={`${LINK_NAMES[s]} handle`}
                    placeholder={s === 'mastodon' ? '@you@server' : '@handle'}
                    value={editing.links[s] ?? ''}
                    autoFocus={s === added}
                    autoCapitalize="none"
                    spellCheck={false}
                    {...noFill}
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
              {missing.length > 0 && (
                <Menu
                  label="Add a link"
                  align="left"
                  short
                  button={
                    <>
                      <Plus size={16} aria-hidden />
                      Add a link
                    </>
                  }
                  buttonClassName={pill}
                  items={missing.map((s) => ({
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

        <div className={divided}>
          <div>
            <h3 className={groupTitle}>Records</h3>
            <div className="space-y-3">
              {editing.pinned ? (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 px-1">
                    <RecordLine item={editing.pinned} note={pinnedNote} link={false} />
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
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-sm">Show what I last played</span>
                <Switch label="Show what I last played" checked={editing.playing} onChange={(on) => change({ playing: on })} />
              </div>
            </div>
          </div>

          <div>
            <h3 className={groupTitle}>Setup</h3>
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
                      {...noFill}
                      onChange={(e) => change({ setup: { ...editing.setup, [slot]: e.target.value } })}
                      className={field}
                    />
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {picking && (
        <PinSheet
          onPick={(record) => {
            change({ pinned: record })
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Sheet>
  )
}
