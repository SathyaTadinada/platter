import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, getSetting, setSetting } from '../db/db'
import { quiet } from '../db/capture'
import { capture, claimBatch, CLOUD, joinIfSynced, pushAll, syncNow, takeNeedCandidates, turnOn, type CloudApi, type Row } from './cloud'
import { readPref, writePref } from './prefs'

// The server's rules (newest edit wins, claims, seq numbers) in memory; worker/sync.test.ts covers the real one
function fakeCloud() {
  let seq = 0
  let exists = false
  const rows = new Map<string, Row & { seq: number }>()
  const api: CloudApi = {
    async pull(since) {
      if (!exists) return { exists: false, rows: [], seq: 0, more: false }
      const out = [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq)
      return { exists: true, rows: out.map((r) => ({ ...r })), seq: Math.max(since, seq), more: false }
    },
    async push(input) {
      exists = true
      const seqs = input.map((r) => {
        const k = `${r.kind}:${r.key}`
        const cur = rows.get(k)
        seq++
        if (r.ifSeq !== undefined ? (cur?.seq ?? 0) !== r.ifSeq : cur && !(r.updatedAt > cur.updatedAt)) return 0
        rows.set(k, { ...r, deleted: r.value === null, seq })
        return seq
      })
      return { seq, seqs }
    },
    async forget() {
      rows.clear()
      exists = false
    },
  }
  return { api, rows }
}

// another browser: an empty database, with sync noting changes again
async function newDevice() {
  capture(false)
  await db.delete()
  await db.open()
  localStorage.clear()
  capture(true)
}

const wait = () => new Promise((r) => setTimeout(r, 20))

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
  capture(true)
})
afterEach(() => capture(false))

describe('noting changes', () => {
  it('notes synced rows once they are saved, and gives plays a uid', async () => {
    const id = await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await setSetting('stylus', { lifespan: 1000 })
    await setSetting('collectionSyncedAt', 5) // per device
    await wait()
    const uid = (await db.plays.get(id))!.uid!
    expect(uid).toBeTruthy()
    expect((await db.outbox.toArray()).map((e) => `${e.kind}:${e.key}`).sort()).toEqual([`play:${uid}`, 'setting:stylus'])
  })

  it("doesn't note what came from the server", async () => {
    await db.transaction('rw', db.covers, async (tx) => {
      quiet.add(tx.idbtrans)
      await db.covers.put({ instanceId: 1, cover: 'c', thumb: 't' })
    })
    await wait()
    expect(await db.outbox.count()).toBe(0)
  })

  it('notes deletes by uid', async () => {
    const id = await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await wait()
    await db.outbox.clear()
    const uid = (await db.plays.get(id))!.uid
    await db.plays.delete(id)
    await wait()
    expect(await db.outbox.toArray()).toMatchObject([{ kind: 'play', key: uid }])
  })

  it('notes preferences that follow the account, not per-device ones', async () => {
    writePref('platter.accent', 'teal')
    writePref('platter.sort', 'artist')
    await wait()
    expect((await db.outbox.toArray()).map((e) => e.key)).toEqual(['platter.accent'])
  })
})

describe('between devices', () => {
  it('brings plays, settings, covers, and preferences to another device', async () => {
    const { api } = fakeCloud()
    await turnOn(api)
    await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await setSetting('stylus', { lifespan: 900 })
    await db.covers.put({ instanceId: 1, cover: 'c.jpg', thumb: 't.jpg' })
    await db.valueHistory.put({ date: '2026-11-01', median: 100, min: 50, max: 200 } as never)
    writePref('platter.accent', 'teal')
    await wait()
    await syncNow(api)

    await newDevice()
    await turnOn(api)
    expect(await db.plays.count()).toBe(1)
    expect(await getSetting('stylus')).toEqual({ lifespan: 900 })
    expect((await db.covers.get(1))?.cover).toBe('c.jpg')
    expect(await db.valueHistory.count()).toBe(1)
    expect(readPref('platter.accent')).toBe('teal')
    // nothing to send back
    expect(await db.outbox.count()).toBe(0)
  })

  it('passes an undo on', async () => {
    const { api } = fakeCloud()
    await turnOn(api)
    const id = await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await wait()
    await syncNow(api)
    await newDevice()
    await turnOn(api)
    expect(await db.plays.count()).toBe(1)
    const local = (await db.plays.toArray())[0]
    await db.plays.delete(local.id!)
    await wait()
    await syncNow(api)

    // back on the first device
    await newDevice()
    await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {}, uid: local.uid, id })
    await setSetting(CLOUD.cursor, 0)
    await db.outbox.clear()
    await syncNow(api)
    expect(await db.plays.count()).toBe(0)
  })

  it('keeps both devices history when the second one turns sync on', async () => {
    const { api } = fakeCloud()
    await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await turnOn(api)
    await newDevice()
    await db.plays.add({ instanceId: 3, releaseId: 4, at: 200, before: {} })
    writePref('platter.accent', 'rose')
    await turnOn(api)
    expect((await db.plays.toArray()).map((p) => p.instanceId).sort()).toEqual([1, 3])
  })

  it('lets a change not yet sent beat an older one from the server', async () => {
    const { api } = fakeCloud()
    await turnOn(api)
    await setSetting('stylus', { lifespan: 500 })
    await wait()
    await syncNow(api)
    await newDevice()
    await turnOn(api)
    await setSetting('stylus', { lifespan: 700 }) // newer, waiting to go
    await wait()
    await setSetting(CLOUD.cursor, 0)
    await syncNow(api)
    expect(await getSetting('stylus')).toEqual({ lifespan: 700 })
  })

  it('switches itself off when the synced data is deleted from another device', async () => {
    const { api } = fakeCloud()
    await turnOn(api)
    await setSetting('stylus', {})
    await wait()
    await syncNow(api)
    await api.forget()
    expect(await syncNow(api)).toBe('gone')
    expect(await getSetting(CLOUD.enabled)).toBe(false)
  })

  it('joins in on a new device if the account already syncs, and only asks once', async () => {
    const { api } = fakeCloud()
    let peeks = 0
    const counting: CloudApi = { ...api, pull: (since, check) => (check && peeks++, api.pull(since, check)) }
    expect(await joinIfSynced(counting)).toBe(false)
    expect(await joinIfSynced(counting)).toBe(false)
    expect(peeks).toBe(1)

    await setSetting('stylus', { lifespan: 1 })
    await newDevice()
    await setSetting('stylus', { lifespan: 2 })
    await turnOn(api)
    await newDevice()
    expect(await joinIfSynced(api)).toBe(true)
    expect(await getSetting(CLOUD.enabled)).toBe(true)
    expect(await getSetting('stylus')).toEqual({ lifespan: 2 })
  })
})

describe('turning on', () => {
  it('stays off if the first round fails', async () => {
    const { CloudError } = await import('./cloud')
    const failing: CloudApi = {
      pull: async () => {
        throw new CloudError(503, 'busy')
      },
      push: async () => ({ seq: 0, seqs: [] }),
      forget: async () => ({}),
    }
    await expect(turnOn(failing)).rejects.toThrow()
    expect(await getSetting(CLOUD.enabled)).toBe(false)
  })
})

describe('batch across devices', () => {
  const result = (id: number) => ({ id, title: `R${id}`, type: 'release' }) as never

  it("sends the batch without Discogs' search results, and the other device looks them up", async () => {
    const { api, rows } = fakeCloud()
    await turnOn(api)
    await db.queue.add({ createdAt: 1, source: 'scan', status: 'choose', barcode: '123', candidates: [result(1), result(2)] })
    await wait()
    await pushAll(api)
    const sent = JSON.parse([...rows.values()].find((r) => r.kind === 'batch')!.value!)
    expect(sent.candidates).toBeUndefined()
    expect(sent.barcode).toBe('123')

    await newDevice()
    takeNeedCandidates()
    await turnOn(api)
    const [item] = await db.queue.toArray()
    expect(item.status).toBe('choose')
    expect(takeNeedCandidates()).toEqual([item.id])
  })

  it('lets only one device start adding a record', async () => {
    const { api } = fakeCloud()
    await turnOn(api)
    await db.queue.add({ createdAt: 1, source: 'scan', status: 'ready', barcode: '123' })
    await wait()
    await syncNow(api)
    const phone = (await db.queue.toArray())[0]

    await newDevice()
    await turnOn(api)
    const laptop = (await db.queue.toArray())[0]
    expect(laptop.seq).toBe(phone.seq)

    expect(await claimBatch(api, phone, 'phone', 10)).toBe(true)
    expect(await claimBatch(api, laptop, 'laptop', 11)).toBe(false)
  })

  it("adds anyway if Platter's server can't be reached", async () => {
    const down: CloudApi = {
      pull: async () => ({ exists: true, rows: [], seq: 0, more: false }),
      push: async () => {
        throw new (await import('./cloud')).CloudError(0, 'down')
      },
      forget: async () => ({}),
    }
    const id = await db.queue.add({ createdAt: 1, source: 'scan', status: 'ready', barcode: '1' })
    expect(await claimBatch(down, (await db.queue.get(id))!, 'phone', 1)).toBe(true)
  })
})

describe('upgrading', () => {
  it('gives plays and batch records already saved a uid', async () => {
    const { default: Dexie } = await import('dexie')
    const { PlatterDB } = await import('../db/db')
    const old = new Dexie('platter-upgrade')
    old.version(9).stores({ plays: '++id, instanceId, at', queue: '++id, status, createdAt' })
    await old.table('plays').add({ instanceId: 1, releaseId: 2, at: 1, before: {} })
    await old.table('queue').add({ createdAt: 1, source: 'scan', status: 'pending' })
    old.close()
    const upgraded = new PlatterDB('platter-upgrade')
    expect((await upgraded.plays.toArray())[0].uid).toBeTruthy()
    expect((await upgraded.queue.toArray())[0].uid).toBeTruthy()
    await upgraded.delete()
  })
})
