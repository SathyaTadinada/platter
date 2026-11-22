import { beforeEach, describe, expect, it } from 'vitest'
import { catalogOnly, pruneCache, readCatalog } from './cache'
import { db } from './db'

const HOUR = 60 * 60 * 1000
const release = { id: 1, tracklist: [{ title: 'A' }], images: [{ uri: 'a' }, { uri: 'b' }], thumb: 't', lowest_price: 5, num_for_sale: 2 }

describe('pruneCache', () => {
  beforeEach(() => db.cache.clear())

  it('drops Discogs data after six hours but keeps other lookups for a month', async () => {
    const now = 1_000 * 24 * HOUR
    await db.cache.bulkPut([
      { key: 'discogs:old', data: 1, fetchedAt: now - 7 * HOUR },
      { key: 'discogs:new', data: 1, fetchedAt: now - HOUR },
      { key: 'apple:1', data: 1, fetchedAt: now - 7 * HOUR },
      { key: 'apple:2', data: 1, fetchedAt: now - 31 * 24 * HOUR },
    ])
    await pruneCache(now)
    expect((await db.cache.toArray()).map((e) => e.key).sort()).toEqual(['apple:1', 'discogs:new'])
  })

  it('keeps catalog data for a month, without its photos and prices after six hours', async () => {
    const now = 1_000 * 24 * HOUR
    await db.cache.bulkPut([
      { key: 'catalog:new', data: release, fetchedAt: now - HOUR },
      { key: 'catalog:day', data: release, fetchedAt: now - 24 * HOUR },
      { key: 'catalog:old', data: release, fetchedAt: now - 31 * 24 * HOUR },
    ])
    await pruneCache(now)
    expect((await db.cache.get('catalog:new'))?.data).toEqual(release)
    expect((await db.cache.get('catalog:day'))?.data).toEqual({ id: 1, tracklist: [{ title: 'A' }], imageCount: 2 })
    expect(await db.cache.get('catalog:old')).toBeUndefined()
  })
})

describe('readCatalog', () => {
  beforeEach(() => db.cache.clear())

  it('gives the photos only within six hours', async () => {
    const now = 1_000 * 24 * HOUR
    await db.cache.put({ key: 'catalog:r', data: release, fetchedAt: now - 7 * HOUR })
    expect(await readCatalog('catalog:r', false, now)).toEqual(catalogOnly(release))
    expect(await readCatalog('catalog:r', true, now)).toBeUndefined()
    expect(await readCatalog('catalog:r', true, now - 2 * HOUR)).toEqual(release)
  })
})
