import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { db } from '../../db/db'

// Where a record on a profile opens. Someone else's open the release, which says whether you have
// it too. On your own profile they open your copy, or the release when you have more than one,
// since it lists them.
const RecordHref = createContext((releaseId: number) => `/release/${releaseId}`)

export const useRecordHref = () => useContext(RecordHref)

export function OwnRecords({ children }: { children: ReactNode }) {
  const copies = useLiveQuery(async () => {
    const byRelease = new Map<number, number[]>()
    await db.collection.each((c) => byRelease.set(c.releaseId, [...(byRelease.get(c.releaseId) ?? []), c.instanceId]))
    return byRelease
  }, [])
  const href = useCallback(
    (releaseId: number) => {
      const mine = copies?.get(releaseId)
      return mine?.length === 1 ? `/collection/${mine[0]}` : `/release/${releaseId}`
    },
    [copies],
  )
  return <RecordHref value={href}>{children}</RecordHref>
}
