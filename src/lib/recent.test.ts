import { beforeEach, describe, expect, it } from 'vitest'
import { db, getSetting } from '../db/db'
import { rememberSearch, RECENT_SEARCHES_KEY, type RecentSearch } from './recent'

beforeEach(() => db.settings.clear())

describe('rememberSearch', () => {
  it('keeps the newest first without repeats, up to eight', async () => {
    for (let i = 0; i < 10; i++) await rememberSearch({ kind: 'catno', label: `C${i}`, url: `/results?catno=C${i}` }, i)
    await rememberSearch({ kind: 'catno', label: 'C5', url: '/results?catno=C5' }, 99)
    const list = (await getSetting<RecentSearch[]>(RECENT_SEARCHES_KEY))!
    expect(list.map((r) => r.label)).toEqual(['C5', 'C9', 'C8', 'C7', 'C6', 'C4', 'C3', 'C2'])
  })
})
