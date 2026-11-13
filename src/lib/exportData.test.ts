import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { exportLocalData, importLocalData } from './exportData'

const play = (id: number, instanceId: number, at: number, uid?: string) => ({ id, instanceId, releaseId: instanceId, at, before: {}, uid })

describe('restoring a backup', () => {
  beforeEach(async () => {
    await Promise.all([db.plays.clear(), db.queue.clear(), db.settings.clear()])
  })

  it("adds the plays it's missing without touching ones here that share a number", async () => {
    await db.plays.bulkAdd([play(1, 10, 1000, 'here-1'), play(2, 11, 2000, 'shared')])
    const backup = {
      app: 'platter',
      version: 1,
      exportedAt: '',
      tables: { plays: [play(1, 20, 3000, 'theirs-1'), play(2, 11, 2000, 'shared'), play(3, 21, 4000)] },
    }
    expect(await importLocalData(backup)).toBe(2)
    const plays = await db.plays.toArray()
    expect(plays.map((p) => p.instanceId).sort()).toEqual([10, 11, 20, 21])
    // restoring again changes nothing
    expect(await importLocalData(backup)).toBe(0)
    expect(await db.plays.count()).toBe(4)
  })

  it('matches older backups without sync IDs by record and time', async () => {
    await db.plays.add(play(1, 10, 1000))
    const old = { app: 'platter', version: 1, exportedAt: '', tables: { plays: [play(5, 10, 1000), play(6, 10, 1000)] } }
    expect(await importLocalData(old)).toBe(0)
    expect(await db.plays.count()).toBe(1)
  })

  it('round-trips through an export', async () => {
    await db.plays.add(play(1, 10, 1000))
    await db.settings.put({ key: 'stylus', value: { hours: 3 } })
    const file = await exportLocalData()
    await Promise.all([db.plays.clear(), db.settings.clear()])
    await importLocalData(file)
    expect(await db.plays.count()).toBe(1)
    expect((await db.settings.get('stylus'))?.value).toEqual({ hours: 3 })
  })
})
