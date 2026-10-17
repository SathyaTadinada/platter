import { beforeEach, describe, expect, it } from 'vitest'
import demo from '../../tests/fixtures/collection-demo.json'
import type { CollectionPage } from '../api/discogs/types'
import { db } from '../db/db'
import { applyCoverChoices, chooseCover, resetCover } from './covers'
import { toLibraryItem } from './library'

const item = toLibraryItem((demo as unknown as CollectionPage).releases[0])

beforeEach(async () => {
  await db.covers.clear()
  await db.collection.clear()
  await db.collection.put(item)
})

describe('covers', () => {
  it('swaps the cover and can put the original back', async () => {
    await chooseCover(item, 'https://i.discogs.com/back.jpg', 'https://i.discogs.com/back-150.jpg')
    const changed = (await db.collection.get(item.instanceId))!
    expect(changed).toMatchObject({ cover: 'https://i.discogs.com/back.jpg', originalCover: item.cover })

    await resetCover(changed)
    const back = (await db.collection.get(item.instanceId))!
    expect(back.cover).toBe(item.cover)
    expect(back.originalCover).toBeUndefined()
    expect(await db.covers.count()).toBe(0)
  })

  it('counts picking the original again as going back to it', async () => {
    await chooseCover(item, 'https://i.discogs.com/back.jpg', 'https://i.discogs.com/back-150.jpg')
    const changed = (await db.collection.get(item.instanceId))!
    await chooseCover(changed, item.cover!, item.thumb!)
    const back = (await db.collection.get(item.instanceId))!
    expect(back.cover).toBe(item.cover)
    expect(back.originalCover).toBeUndefined()
    expect(await db.covers.count()).toBe(0)
  })

  it("ignores a saved pick that is Discogs' own cover", async () => {
    await db.covers.put({ instanceId: item.instanceId, cover: item.cover!, thumb: item.thumb! })
    const [synced] = await applyCoverChoices([item])
    expect(synced.originalCover).toBeUndefined()
  })

  it('keeps the choice when the collection is synced again', async () => {
    await chooseCover(item, 'https://i.discogs.com/back.jpg', 'https://i.discogs.com/back-150.jpg')
    const [fresh] = await applyCoverChoices([item])
    expect(fresh).toMatchObject({ cover: 'https://i.discogs.com/back.jpg', originalCover: item.cover })
  })
})
