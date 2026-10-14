import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { deleteFolder, renameFolder } from '../api/discogs/endpoints'
import type { Folder } from '../api/discogs/types'
import { NewCrateDialog } from '../components/CrateSelect'
import { Button, IconButton, Notice, Screen, Spinner } from '../components/ui'
import { useSignedIn } from '../hooks/session'
import { invalidateCollectionMeta, useCollectionMeta } from '../hooks/useCollectionMeta'

const UNCATEGORIZED = 1 // Discogs' built-in folder; it can't be renamed or deleted

export function Crates() {
  const { client, username } = useSignedIn()
  const meta = useCollectionMeta()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Folder | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      invalidateCollectionMeta()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const folders = meta.data?.folders ?? []

  return (
    <Screen
      title="Crates"
      back="/settings"
      actions={
        <IconButton label="New crate" onClick={() => setCreating(true)}>
          <Plus size={22} />
        </IconButton>
      }
    >
      {meta.loading && !meta.data && <Spinner />}
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
        {folders.map((f) => (
          <li key={f.id} className="flex min-h-14 items-center gap-2 px-4 py-2">
            {editing === f.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (name.trim()) run(() => renameFolder(client, username, f.id, name.trim())).then(() => setEditing(null))
                }}
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Crate name"
                  className="min-h-10 min-w-0 flex-1 rounded-lg border border-stone-300 bg-transparent px-3 dark:border-stone-700"
                />
                <Button type="submit" className="min-h-10">
                  Save
                </Button>
                <Button variant="ghost" className="min-h-10" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <Link href={`/?folder=${f.id}`} className="min-w-0 flex-1">
                  <span className="block truncate">{f.name}</span>
                  <span className="text-sm text-stone-500">
                    {f.count} record{f.count === 1 ? '' : 's'}
                  </span>
                </Link>
                {f.id !== UNCATEGORIZED && (
                  <>
                    <IconButton
                      label={`Rename ${f.name}`}
                      onClick={() => {
                        setEditing(f.id)
                        setName(f.name)
                      }}
                    >
                      <Pencil size={18} />
                    </IconButton>
                    <IconButton
                      label={`Delete ${f.name}`}
                      onClick={() => setConfirmDelete(f)}
                      className="hover:bg-red-50! hover:text-red-600! dark:hover:bg-red-950/40!"
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {confirmDelete && (
        <div className="mt-4 space-y-3 rounded-2xl bg-red-50 p-4 dark:bg-red-950/40">
          {confirmDelete.count > 0 ? (
            <>
              <p className="text-sm">
                {confirmDelete.name} has {confirmDelete.count} record{confirmDelete.count === 1 ? '' : 's'}. Move them to another crate first; Discogs
                only deletes empty ones.
              </p>
              <Button variant="secondary" className="w-full" onClick={() => setConfirmDelete(null)}>
                OK
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm">Delete {confirmDelete.name}?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => run(() => deleteFolder(client, username, confirmDelete.id)).then(() => setConfirmDelete(null))}>
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {creating && <NewCrateDialog onClose={() => setCreating(false)} onCreated={() => setCreating(false)} />}
    </Screen>
  )
}
