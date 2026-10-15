import { useEffect, useRef, useState } from 'react'
import { createFolder } from '../api/discogs/endpoints'
import type { Folder } from '../api/discogs/types'
import { useSignedIn } from '../hooks/session'
import { invalidateCollectionMeta } from '../hooks/useCollectionMeta'
import { Button, Notice } from './ui'

const NEW = '__new'

// A crate picker with "New crate…" at the end
export function CrateSelect({
  value,
  folders,
  onChange,
  onCreated,
  onClear,
  className = '',
  placeholder,
  disabled,
  ariaLabel = 'Crate',
}: {
  value: number | undefined
  folders: Folder[]
  onChange: (id: number) => void
  onCreated?: () => void
  onClear?: () => void // picking the placeholder option
  className?: string
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const [creating, setCreating] = useState(false)
  return (
    <>
      <select
        aria-label={ariaLabel}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => (e.target.value === NEW ? setCreating(true) : e.target.value ? onChange(Number(e.target.value)) : onClear?.())}
        className={className}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
        <option value={NEW}>New crate…</option>
      </select>
      {creating && (
        <NewCrateDialog
          onClose={() => setCreating(false)}
          onCreated={(f) => {
            setCreating(false)
            onCreated?.()
            onChange(f.id)
          }}
        />
      )}
    </>
  )
}

export function NewCrateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (f: Folder) => void }) {
  const { client, username } = useSignedIn()
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const f = await createFolder(client, username, name.trim())
      invalidateCollectionMeta()
      onCreated(f)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="new-crate"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-0 text-stone-900 dark:bg-stone-900 dark:text-stone-100"
    >
      <form onSubmit={create} className="space-y-3 p-5">
        <h2 id="new-crate" className="text-lg font-bold">
          New crate
        </h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Crate name"
          className="min-h-11 w-full rounded-xl border border-stone-300 bg-transparent px-3 text-base dark:border-stone-700"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
