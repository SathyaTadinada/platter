import { afterEach, describe, expect, it } from 'vitest'
import { onTableChange } from './changes'
import { db } from './db'

describe('onTableChange', () => {
  let stop = () => {}
  afterEach(() => stop())

  it('names the table once the write is saved', async () => {
    const seen: string[] = []
    stop = onTableChange((t) => seen.push(t))
    await db.plays.add({ instanceId: 1, releaseId: 1, at: 1, before: {} })
    await db.wants.clear()
    expect(seen).toEqual(['plays', 'wants'])
  })

  it('says nothing about a write that was rolled back', async () => {
    const seen: string[] = []
    stop = onTableChange((t) => seen.push(t))
    await db
      .transaction('rw', db.plays, async () => {
        await db.plays.add({ instanceId: 2, releaseId: 2, at: 2, before: {} })
        throw new Error('no')
      })
      .catch(() => {})
    expect(seen).toEqual([])
  })

  it('stops when asked', async () => {
    const seen: string[] = []
    onTableChange((t) => seen.push(t))()
    await db.plays.add({ instanceId: 3, releaseId: 3, at: 3, before: {} })
    expect(seen).toEqual([])
  })
})
