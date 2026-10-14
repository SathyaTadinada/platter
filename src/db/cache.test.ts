import { beforeEach, describe, expect, it } from 'vitest'
import { pruneCache } from './cache'
import { db } from './db'

const HOUR = 60 * 60 * 1000

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
    await pruneCache(undefined, now)
    expect((await db.cache.toArray()).map((e) => e.key).sort()).toEqual(['apple:1', 'discogs:new'])
  })
})
