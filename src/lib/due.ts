import { getSetting } from '../db/db'

// What background work asks Discogs for again. Anything missing, or fetched before the last
// Refresh from Discogs, is catching up and goes first, quickly. Anything that has only gone stale
// is upkeep, done slowly (see backgroundGapMs).
export type Due = { id: number; upkeep: boolean }

export async function dueOf(ids: number[], fetchedAt: Map<number, number>, keepFor: number, now = Date.now()): Promise<Due[]> {
  const refreshed = (await getSetting<number>('refreshedAt')) ?? 0
  const due = [...new Set(ids)].flatMap((id) => {
    const at = fetchedAt.get(id)
    if (at === undefined || at < refreshed) return [{ id, upkeep: false }]
    return now - at >= keepFor ? [{ id, upkeep: true }] : []
  })
  return due.sort((a, b) => Number(a.upkeep) - Number(b.upkeep))
}
