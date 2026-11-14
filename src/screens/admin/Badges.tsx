import { Award, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Menu } from '../../components/Menu'
import { Sheet } from '../../components/Sheet'
import { Button, IconButton, List, Notice } from '../../components/ui'
import { CloudError, type Badge, type Member } from '../../lib/cloud'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`
const field = 'min-h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-transparent px-3 sm:w-auto sm:flex-1 dark:border-stone-700'

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
  const label = (id: string) => badges.find((b) => b.id === id)?.label
  const theirs = m.badges.filter(label)
  const others = badges.filter((b) => !m.badges.includes(b.id))
  return (
    <span className="flex flex-wrap items-center gap-1">
      {theirs.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-0.5 rounded-md bg-stone-100 py-0.5 pr-0.5 pl-1.5 text-xs font-medium whitespace-nowrap text-stone-700 dark:bg-stone-800 dark:text-stone-300"
        >
          {label(id)}
          <button
            type="button"
            aria-label={`Take ${label(id)} off ${m.name}`}
            title="Take off"
            onClick={() => onToggle(id, false)}
            className="rounded p-0.5 text-stone-500 hover:bg-stone-200 hover:text-red-600 dark:hover:bg-stone-700 dark:hover:text-red-400"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <Menu
        label={`Give ${m.name} a badge`}
        align="left"
        buttonClassName="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        button={<Plus size={14} />}
        items={[
          ...others.map((b) => ({ label: b.label, icon: <Award size={18} />, onSelect: () => onToggle(b.id, true) })),
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

// Every badge there is: rename, delete, or make a new one
export function BadgesSheet({
  badges,
  startNew,
  onCreate,
  onRename,
  onDelete,
  onClose,
}: {
  badges: Badge[]
  startNew: boolean
  onCreate: (label: string) => Promise<unknown>
  onRename: (id: string, label: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  onClose: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  // after the sheet has opened and taken focus, so the new name's field can have it
  useEffect(() => {
    if (startNew) setAdding(true)
  }, [startNew])
  const [fresh, setFresh] = useState('')
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
              <li key={b.id} className="px-4 py-2">
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (name.trim() && (await run(() => onRename(b.id, name.trim())))) setEditing(null)
                  }}
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Badge name"
                    maxLength={30}
                    autoFocus
                    className={field}
                  />
                  <Button type="submit" className="min-h-10 flex-1 sm:flex-none" disabled={!name.trim()}>
                    Save
                  </Button>
                  <Button variant="ghost" className="min-h-10 flex-1 sm:flex-none" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </form>
              </li>
            ) : (
              <li key={b.id} className="flex min-h-13 items-center gap-3 py-2 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{b.label}</p>
                  <p className="text-sm text-stone-500">{b.members ? plural(b.members, 'member') : 'Nobody yet'}</p>
                </div>
                <IconButton
                  label={`Rename ${b.label}`}
                  onClick={() => {
                    setName(b.label)
                    setEditing(b.id)
                  }}
                >
                  <Pencil size={18} />
                </IconButton>
                <IconButton label={`Delete ${b.label}`} danger onClick={() => setDeleting(b)}>
                  <Trash2 size={18} />
                </IconButton>
              </li>
            ),
          )}
          {adding ? (
            <li className="px-4 py-2">
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (fresh.trim() && (await run(() => onCreate(fresh.trim())))) {
                    setFresh('')
                    setAdding(false)
                  }
                }}
              >
                <input
                  value={fresh}
                  onChange={(e) => setFresh(e.target.value)}
                  aria-label="New badge name"
                  placeholder="Name"
                  maxLength={30}
                  autoFocus
                  className={field}
                />
                <Button type="submit" className="min-h-10 flex-1 sm:flex-none" disabled={!fresh.trim()}>
                  Add
                </Button>
                <Button variant="ghost" className="min-h-10 flex-1 sm:flex-none" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </form>
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
