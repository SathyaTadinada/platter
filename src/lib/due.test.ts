import { beforeEach, describe, expect, it } from 'vitest'
import { db, setSetting } from '../db/db'
import { dueOf } from './due'

describe('dueOf', () => {
  beforeEach(() => db.settings.clear())

  it('puts missing ones first and stale ones after as upkeep', async () => {
    const now = 1_000_000
    const at = new Map([
      [1, now - 10],
      [2, now - 500],
    ])
    expect(await dueOf([2, 1, 3, 3], at, 100, now)).toEqual([
      { id: 3, upkeep: false },
      { id: 2, upkeep: true },
    ])
  })

  it('catches up on everything fetched before a refresh', async () => {
    const now = 1_000_000
    await setSetting('refreshedAt', now - 50)
    expect(await dueOf([1], new Map([[1, now - 60]]), 100, now)).toEqual([{ id: 1, upkeep: false }])
  })
})
