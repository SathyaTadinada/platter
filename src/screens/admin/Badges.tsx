import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BADGE_COLORS, BADGE_ICONS, type BadgeLook } from '../../../worker/badges'
import { BADGE_ICON, BadgePill, BADGE_SWATCH } from '../../components/BadgePill'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Menu } from '../../components/Menu'
import { Sheet } from '../../components/Sheet'
import { Button, IconButton, List, Notice } from '../../components/ui'
import { CloudError, type Badge, type Member } from '../../lib/cloud'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`
const field = 'min-h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-transparent px-3 dark:border-stone-700'

const COLOR_NAMES: Record<BadgeLook['color'], string> = {
  gray: 'Gray',
  amber: 'Amber',
  blue: 'Blue',
  green: 'Green',
  purple: 'Purple',
  red: 'Red',
}

// A member's badges: each comes off with its ×, and + gives one they don't have, or makes a new one
export function BadgeCell({
  m,
  badges,
  onToggle,
  onNew,
}: {
  m: Member
  badges: Badge[]
  onToggle: (badge: string, on: boolean) => void
  onNew: () => void
}) {
  const theirs = m.badges.map((id) => badges.find((b) => b.id === id)).filter((b): b is Badge => Boolean(b))
  const others = badges.filter((b) => !m.badges.includes(b.id))
  return (
    <span className="flex flex-wrap items-center gap-1">
      {theirs.map((b) => (
        <BadgePill key={b.id} badge={b}>
          <button
            type="button"
            aria-label={`Take ${b.label} off ${m.name}`}
            title="Take off"
            onClick={() => onToggle(b.id, false)}
            className="rounded-full p-0.5 opacity-70 hover:opacity-100"
          >
            <X size={12} aria-hidden />
          </button>
        </BadgePill>
      ))}
      <Menu
        label={`Give ${m.name} a badge`}
        align="left"
        buttonClassName="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        button={<Plus size={14} />}
        items={[
          ...others.map((b) => {
            const Icon = BADGE_ICON[b.icon]
            return { label: b.label, icon: <Icon size={18} />, onSelect: () => onToggle(b.id, true) }
          }),
          { label: 'New badge…', icon: <Plus size={18} />, onSelect: onNew },
        ]}
      />
    </span>
  )
}

function explain(e: unknown) {
  if (e instanceof CloudError && e.status === 409) return 'There’s already a badge with that name.'
  return 'Something went wrong. Try again in a minute.'
}

// A badge's name and look, with how it'll show on a profile as it's picked
function BadgeForm({
  start,
  action,
  onSave,
  onCancel,
}: {
  start: BadgeLook
  action: string
  onSave: (look: BadgeLook) => Promise<boolean>
  onCancel: () => void
}) {
  const [look, setLook] = useState(start)
  const name = look.label.trim()
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (name) await onSave({ ...look, label: name })
      }}
    >
      <div className="flex items-center gap-3">
        <input
          value={look.label}
          onChange={(e) => setLook({ ...look, label: e.target.value })}
          aria-label="Badge name"
          placeholder="Name"
          maxLength={30}
          autoFocus
          className={`${field} flex-1`}
        />
        <BadgePill badge={{ ...look, label: name || 'Preview' }} />
      </div>
      <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
        {BADGE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={look.color === c}
            aria-label={COLOR_NAMES[c]}
            title={COLOR_NAMES[c]}
            onClick={() => setLook({ ...look, color: c })}
            className={`size-7 rounded-full ${BADGE_SWATCH[c]} ${
              look.color === c ? 'ring-2 ring-stone-900 ring-offset-2 ring-offset-white dark:ring-stone-100 dark:ring-offset-stone-900' : ''
            }`}
          />
        ))}
      </div>
      <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1">
        {BADGE_ICONS.map((i) => {
          const Icon = BADGE_ICON[i]
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={look.icon === i}
              aria-label={i}
              onClick={() => setLook({ ...look, icon: i })}
              className={`flex size-9 items-center justify-center rounded-lg ${
                look.icon === i
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              <Icon size={18} aria-hidden />
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="min-h-10 flex-1 sm:flex-none" disabled={!name}>
          {action}
        </Button>
        <Button variant="ghost" className="min-h-10 flex-1 sm:flex-none" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Every badge there is: change one, delete it, or make a new one
export function BadgesSheet({
  badges,
  startNew,
  onCreate,
  onEdit,
  onDelete,
  onClose,
}: {
  badges: Badge[]
  startNew: boolean
  onCreate: (look: BadgeLook) => Promise<unknown>
  onEdit: (id: string, look: BadgeLook) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  onClose: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // after the sheet has opened and taken focus, so the new name's field can have it
  useEffect(() => {
    if (startNew) setAdding(true)
  }, [startNew])
  const [deleting, setDeleting] = useState<Badge | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
      return true
    } catch (e) {
      setError(explain(e))
      return false
    }
  }

  if (deleting) {
    return (
      <ConfirmDialog
        title={`Delete ${deleting.label}?`}
        action="Delete"
        onConfirm={() => {
          const id = deleting.id
          setDeleting(null)
          run(() => onDelete(id))
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting.members ? `It comes off ${plural(deleting.members, 'member')}.` : undefined}
      </ConfirmDialog>
    )
  }

  return (
    <Sheet title="Badges" bodyClassName="p-4" width="md" onClose={onClose}>
      <div className="space-y-4 py-2">
        {error && <Notice tone="error">{error}</Notice>}
        <List>
          {badges.map((b) =>
            editing === b.id ? (
              <li key={b.id} className="px-4 py-3">
                <BadgeForm
                  start={b}
                  action="Save"
                  onSave={async (look) => {
                    const ok = await run(() => onEdit(b.id, look))
                    if (ok) setEditing(null)
                    return ok
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={b.id} className="flex min-h-13 items-center gap-3 py-2 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <BadgePill badge={b} />
                  <p className="mt-1 text-sm text-stone-500">{b.members ? plural(b.members, 'member') : 'Nobody yet'}</p>
                </div>
                <IconButton label={`Edit ${b.label}`} onClick={() => setEditing(b.id)}>
                  <Pencil size={18} />
                </IconButton>
                <IconButton label={`Delete ${b.label}`} danger onClick={() => setDeleting(b)}>
                  <Trash2 size={18} />
                </IconButton>
              </li>
            ),
          )}
          {adding ? (
            <li className="px-4 py-3">
              <BadgeForm
                start={{ label: '', color: 'gray', icon: 'award' }}
                action="Add"
                onSave={async (look) => {
                  const ok = await run(() => onCreate(look))
                  if (ok) setAdding(false)
                  return ok
                }}
                onCancel={() => setAdding(false)}
              />
            </li>
          ) : (
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
              >
                <Plus size={20} className="shrink-0 text-stone-500" aria-hidden />
                New badge
              </button>
            </li>
          )}
        </List>
      </div>
    </Sheet>
  )
}
