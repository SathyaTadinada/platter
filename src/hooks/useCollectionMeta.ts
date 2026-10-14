import { getFields, getFolders } from '../api/discogs/endpoints'
import type { CollectionField, Folder } from '../api/discogs/types'
import { useSignedIn } from './session'
import { useAsync } from './useAsync'

type Meta = { folders: Folder[]; fields: CollectionField[] }

// Folders and custom fields change rarely; keep them for a few minutes so
// moving between screens doesn't refetch every time.
let cache: { at: number; user: string; meta: Meta } | null = null
const MAX_AGE = 5 * 60 * 1000

export const invalidateCollectionMeta = () => {
  cache = null
}

export function useCollectionMeta() {
  const { client, username } = useSignedIn()
  return useAsync(async () => {
    if (cache && cache.user === username && Date.now() - cache.at < MAX_AGE) return cache.meta
    const [{ folders }, { fields }] = await Promise.all([getFolders(client, username), getFields(client, username)])
    const meta = { folders: folders.filter((f) => f.id !== 0), fields: [...fields].sort((a, b) => a.position - b.position) }
    cache = { at: Date.now(), user: username, meta }
    return meta
  }, [client, username])
}
