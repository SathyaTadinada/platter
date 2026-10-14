import { db, type LibraryItem } from '../db/db'

// The cover shown for a copy: the user's pick if they made one, otherwise Discogs'
export async function applyCoverChoices(items: LibraryItem[]): Promise<LibraryItem[]> {
  const choices = new Map((await db.covers.toArray()).map((c) => [c.instanceId, c]))
  if (!choices.size) return items
  return items.map((i) => {
    const c = choices.get(i.instanceId)
    return c ? { ...i, cover: c.cover, thumb: c.thumb, originalCover: i.cover, originalThumb: i.thumb } : i
  })
}

export async function chooseCover(item: LibraryItem, cover: string, thumb: string) {
  await db.transaction('rw', db.covers, db.collection, async () => {
    await db.covers.put({ instanceId: item.instanceId, cover, thumb })
    await db.collection.update(item.instanceId, {
      cover,
      thumb,
      // remember Discogs' own cover the first time, for "Use original"
      originalCover: item.originalCover ?? item.cover,
      originalThumb: item.originalThumb ?? item.thumb,
    })
  })
}

export async function resetCover(item: LibraryItem) {
  await db.transaction('rw', db.covers, db.collection, async () => {
    await db.covers.delete(item.instanceId)
    await db.collection.update(item.instanceId, {
      cover: item.originalCover ?? item.cover,
      thumb: item.originalThumb ?? item.thumb,
      originalCover: undefined,
      originalThumb: undefined,
    })
  })
}
