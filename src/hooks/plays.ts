import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'
import { toast } from '../components/Toaster'
import { db, type LibraryItem } from '../db/db'
import { listening, logPlay, playFields, scheduleScrobbles, undoPlay, type Play } from '../lib/plays'
import { useSignedIn } from './session'
import { useFieldMatches } from './useFields'

export function usePlayFields() {
  const matches = useFieldMatches()
  return useMemo(() => playFields(matches), [matches])
}

// Logging a play from anywhere: writes the fields, shows a toast with Undo,
// and queues the scrobble if ListenBrainz is on
export function useLogPlay() {
  const { client, username } = useSignedIn()
  const ids = usePlayFields()
  const [busy, setBusy] = useState(false)

  const log = useCallback(
    async (item: LibraryItem): Promise<Play | null> => {
      setBusy(true)
      try {
        const play = await logPlay(client, username, item, ids)
        scheduleScrobbles(client)
        toast(`Logged a play of ${item.title}`, {
          tone: 'success',
          action: {
            label: 'Undo',
            onClick: () =>
              undoPlay(client, username, play, ids).catch((e) => toast(`Couldn't undo: ${(e as Error).message}`, { tone: 'error' })),
          },
        })
        return play
      } catch (e) {
        toast(`Couldn't log the play: ${(e as Error).message}`, { tone: 'error' })
        return null
      } finally {
        setBusy(false)
      }
    },
    [client, username, ids],
  )
  return { log, busy, ids }
}

export function useListening() {
  const ids = usePlayFields()
  return useLiveQuery(async () => {
    const [items, plays] = await Promise.all([db.collection.toArray(), db.plays.toArray()])
    return { rows: listening(items, plays, ids), plays }
  }, [ids.count, ids.last])
}
