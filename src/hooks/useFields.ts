import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type LibraryItem } from '../db/db'
import { fieldFor, matchFields, type FieldKey, type FieldMap } from '../lib/fields'
import { useCollectionMeta } from './useCollectionMeta'

// The user's custom fields lined up with Platter's, honoring manual mapping
export function useFieldMatches() {
  const meta = useCollectionMeta()
  const map = useLiveQuery(async () => ((await db.settings.get('fieldMap'))?.value as FieldMap | undefined) ?? {}, [])
  return useMemo(() => (meta.data && map ? matchFields(meta.data.fields, map) : null), [meta.data, map])
}

// Values already used in a field across the collection, most common first,
// e.g. the stores you buy from or the shelves you use
export function useFieldSuggestions(matches: ReturnType<typeof useFieldMatches>, keys: FieldKey[]) {
  const ids = useMemo(() => keys.map((k) => (matches ? fieldFor(matches, k)?.id : undefined)), [matches, keys])
  return (
    useLiveQuery(async () => {
      const items: LibraryItem[] = await db.collection.toArray()
      return ids.map((id) => {
        if (id === undefined) return []
        const counts = new Map<string, number>()
        for (const i of items) {
          const v = i.fields[id]?.trim()
          if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
        }
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([v]) => v)
          .slice(0, 30)
      })
    }, [ids.join(',')]) ?? keys.map(() => [])
  )
}
