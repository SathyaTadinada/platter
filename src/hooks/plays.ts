import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '../components/Toaster'
import { db, getSetting, type LibraryItem } from '../db/db'
import { latch, listening, logPlay, playFields, scheduleScrobbles, trimPlays, undoPlay, type Play, type PlayFields } from '../lib/plays'
import { useSignedIn } from './session'
import { useFieldMatches, useFieldState } from './useFields'

// The Play Count and Last Played field ids, or null while they load
export function usePlayFields() {
  const matches = useFieldMatches()
  return useMemo(() => playFields(matches), [matches])
}

// Keeps the plays logged here from outnumbering the play count on Discogs (see trimPlays)
export function useTrimPlays() {
  const ids = usePlayFields()
  const items = useLiveQuery(() => db.collection.toArray(), [])
  useEffect(() => {
    if (!items || !ids) return
    getSetting<number>('collectionSyncedAt')
      .then((at) => trimPlays(items, ids, at ?? 0))
      .catch(() => {})
  }, [items, ids])
}

// Logging a play from anywhere: writes the fields, shows a toast with Undo,
// and queues the scrobble if ListenBrainz is on. A play logged before the
// fields have loaded waits for them.
export function useLogPlay() {
  const { client, username } = useSignedIn()
  const { matches, error } = useFieldState()
  const ids = useMemo(() => playFields(matches), [matches])
  const [fields] = useState(() => latch<PlayFields | Error>())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (ids) fields.set(ids)
    else if (error) fields.set(error)
    else fields.clear()
  }, [ids, error, fields])

  const log = useCallback(
    async (item: LibraryItem): Promise<Play | null> => {
      setBusy(true)
      try {
        const known = await fields.get()
        if (known instanceof Error) throw known
        const play = await logPlay(client, username, item, known)
        scheduleScrobbles(client)
        toast(`Logged a play of ${item.title}`, {
          tone: 'success',
          action: {
            label: 'Undo',
            onClick: () =>
              undoPlay(client, username, play, known).catch((e) => toast(`Couldn't undo: ${(e as Error).message}`, { tone: 'error' })),
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
    [client, username, fields],
  )
  return { log, busy }
}

export function useListening() {
  const ids = usePlayFields()
  return useLiveQuery(async () => {
    const [items, plays] = await Promise.all([db.collection.toArray(), db.plays.toArray()])
    return { rows: listening(items, plays, ids ?? {}), plays }
  }, [ids?.count, ids?.last])
}
