import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { categoryOf, type Category } from '../../worker/categories'
import { db, getSetting, setSetting } from '../db/db'
import { quiet } from '../db/capture'
import {
  capture,
  claimBatch,
  CLOUD,
  cloudApi,
  CloudError,
  deviceFor,
  joinWithCode,
  leave,
  setWhatSyncs,
  signIn,
  signInWithDiscogs,
  signOutOfSync,
  syncNow,
  takeNeedCandidates,
  type Row,
} from './cloud'
import { readPref, writePref } from './prefs'

// The server's rules in memory, behind fetch: accounts by name and password proof, device keys,
// pairing codes, newest edit wins, claims, switched-off categories. worker/sync.test.ts covers the real one.
function fakeServer() {
  type Account = { id: string; name: string; proof: string; seq: number; off: Category[]; rows: Map<string, Row & { seq: number }> }
  const accounts: Account[] = []
  const devices = new Map<string, Account>()
  const pairings = new Map<string, Account>()
  let n = 0
  const newDevice = (a: Account) => {
    const token = `device-${++n}`
    devices.set(token, a)
    return token
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  const fetchFn = (async (url: string, init: RequestInit) => {
    const action = url.split('/').pop()
    const b = JSON.parse(String(init.body))
    if (action === 'exists') return json({ exists: accounts.some((a) => a.name === b.name.toLowerCase()) })
    if (action === 'signin') {
      const name = b.name.toLowerCase()
      let a = accounts.find((x) => x.name === name && x.proof === b.proof)
      if (!a) {
        if (!b.fresh && accounts.some((x) => x.name === name)) return json({ error: 'Wrong password' }, 401)
        a = { id: `acc-${++n}`, name, proof: b.proof, seq: 0, off: [], rows: new Map() }
        accounts.push(a)
      }
      return json({ device: newDevice(a) })
    }
    // the real server asks Discogs; here a token names its user
    if (action === 'discogs') {
      const name = b.login.token.replace('tok-', '')
      let a = accounts.find((x) => x.name === name)
      if (!a && b.create) {
        a = { id: `acc-${++n}`, name, proof: '', seq: 0, off: [], rows: new Map() }
        accounts.push(a)
      }
      return json({ device: a ? newDevice(a) : null, created: Boolean(a && b.create), name, discogsId: 1 })
    }
    if (action === 'join') {
      const a = pairings.get(b.code.replace('-', ''))
      if (!a) return json({ error: 'nope' }, 401)
      pairings.delete(b.code.replace('-', ''))
      return json({ device: newDevice(a), name: a.name })
    }
    const a = devices.get(b.device)
    if (!a || !accounts.includes(a)) return json({ error: 'Not signed in' }, 401)
    switch (action) {
      case 'pull': {
        const rows = [...a.rows.values()].filter((r) => r.seq > b.since).sort((x, y) => x.seq - y.seq)
        return json({ rows, seq: Math.max(b.since, a.seq), more: false, off: a.off })
      }
      case 'push': {
        const seqs = (b.rows as Row[]).map((r) => {
          if (a.off.includes(categoryOf(r.kind, r.key))) return 0
          const k = `${r.kind}:${r.key}`
          const cur = a.rows.get(k)
          a.seq++
          if (r.ifSeq !== undefined ? (cur?.seq ?? 0) !== r.ifSeq : cur && !(r.updatedAt > cur.updatedAt)) return 0
          a.rows.set(k, { ...r, deleted: r.value === null, seq: a.seq })
          return a.seq
        })
        return json({ seq: a.seq, seqs })
      }
      case 'pair': {
        const code = `ABC${++n}`.slice(0, 6).padEnd(6, 'X')
        pairings.set(code, a)
        return json({ code: `${code.slice(0, 3)}-${code.slice(3)}`, expiresAt: 0 })
      }
      case 'password':
        a.proof = b.proof
        return json({ ok: true })
      case 'off':
        a.off = b.off
        for (const [k, r] of a.rows) if (a.off.includes(categoryOf(r.kind, r.key))) a.rows.delete(k)
        return json({ off: a.off })
      case 'leave':
        devices.delete(b.device)
        return json({ ok: true })
      case 'forget':
        accounts.splice(accounts.indexOf(a), 1)
        return json({ ok: true })
    }
    return json({ error: 'unknown' }, 404)
  }) as unknown as typeof fetch
  return { fetchFn, accounts }
}

let server: ReturnType<typeof fakeServer>
const api = () => cloudApi(deviceFor('tadinada')!.device, server.fetchFn)
const wait = () => new Promise((r) => setTimeout(r, 20))
const PASSWORD = 'correct horse'

// another browser: an empty database and no preferences, so no device key
async function newDevice() {
  capture(false)
  await db.delete()
  await db.open()
  localStorage.clear()
  capture(true)
}

beforeEach(async () => {
  server = fakeServer()
  vi.stubGlobal('fetch', server.fetchFn)
  await db.delete()
  await db.open()
  localStorage.clear()
  capture(true)
})
afterEach(() => {
  capture(false)
  vi.unstubAllGlobals()
})

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

describe('getting in', () => {
  it('starts an account with the first password, and lets the next device in with it', async () => {
    await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await setSetting('stylus', { lifespan: 900 })
    await db.covers.put({ instanceId: 1, cover: 'c.jpg', thumb: 't.jpg' })
    await db.valueHistory.put({ date: '2026-11-01', median: 100, min: 50, max: 200 } as never)
    writePref('platter.accent', 'teal')
    await signIn('Tadinada', PASSWORD)
    expect(deviceFor('tadinada')).toBeTruthy()
    expect(server.accounts).toHaveLength(1)

    await newDevice()
    await signIn('tadinada', PASSWORD)
    expect(await db.plays.count()).toBe(1)
    expect(await getSetting('stylus')).toEqual({ lifespan: 900 })
    expect((await db.covers.get(1))?.cover).toBe('c.jpg')
    expect(await db.valueHistory.count()).toBe(1)
    expect(readPref('platter.accent')).toBe('teal')
    expect(await db.outbox.count()).toBe(0)
  })

  it('turns away a wrong password', async () => {
    await signIn('tadinada', PASSWORD)
    await newDevice()
    await expect(signIn('tadinada', 'not it at all')).rejects.toMatchObject({ status: 401 })
    expect(deviceFor('tadinada')).toBeNull()
  })

  it('joins the account with a Discogs login, and only makes one when asked', async () => {
    await setSetting('stylus', { lifespan: 5 })
    expect(await signInWithDiscogs('Tadinada', { token: 'tok-tadinada' }, false)).toBe(false)
    expect(deviceFor('tadinada')).toBeNull()
    expect(await signInWithDiscogs('Tadinada', { token: 'tok-tadinada' }, true)).toBe(true)
    expect(server.accounts).toHaveLength(1)

    await newDevice()
    expect(await signInWithDiscogs('tadinada', { token: 'tok-tadinada' }, false)).toBe(true)
    expect(await getSetting('stylus')).toEqual({ lifespan: 5 })
  })

  it("doesn't join again by itself after another device signs this one out", async () => {
    await signIn('tadinada', PASSWORD)
    const mine = api()
    server.fetchFn('/api/sync/leave', { body: JSON.stringify({ device: deviceFor('tadinada')!.device }) })
    expect(await syncNow(mine)).toBe('gone')
    expect(deviceFor('tadinada')).toBeNull()
    expect(await getSetting(CLOUD.left)).toBe(true)
  })

  it("doesn't join again by itself after sync is turned off here", async () => {
    await signIn('tadinada', PASSWORD)
    await leave(api())
    expect(await getSetting(CLOUD.left)).toBe(true)
    await signIn('tadinada', PASSWORD)
    expect(await getSetting(CLOUD.left)).toBeUndefined()
    await signOutOfSync(api())
    expect(await getSetting(CLOUD.left)).toBeUndefined()
  })

  it('lets a device in with a pairing code, but only for the same Discogs account', async () => {
    await setSetting('stylus', { lifespan: 1 })
    await signIn('tadinada', PASSWORD)
    const { code } = await api().pair()
    const { code: second } = await api().pair()

    await newDevice()
    await expect(joinWithCode('someone-else', code)).rejects.toMatchObject({ status: 403 })
    expect(deviceFor('someone-else')).toBeNull()
    await joinWithCode('tadinada', second)
    expect(await getSetting('stylus')).toEqual({ lifespan: 1 })
  })

  it('stays in after signing out of Discogs, and picks up again when signed back in', async () => {
    await signIn('tadinada', PASSWORD)
    await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await wait()
    await syncNow(api())
    // signing out wipes the database but not the device key
    capture(false)
    await db.delete()
    await db.open()
    capture(true)
    expect(deviceFor('tadinada')).toBeTruthy()
    expect(deviceFor('someone-else')).toBeNull()
    await syncNow(api())
    expect(await db.plays.count()).toBe(1)
  })
})

describe('between devices', () => {
  it('passes an undo on', async () => {
    await signIn('tadinada', PASSWORD)
    const id = await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await wait()
    await syncNow(api())
    const uid = (await db.plays.get(id))!.uid

    await newDevice()
    await signIn('tadinada', PASSWORD)
    const local = (await db.plays.toArray())[0]
    expect(local.uid).toBe(uid)
    await db.plays.delete(local.id!)
    await wait()
    await syncNow(api())

    await newDevice()
    await signIn('tadinada', PASSWORD)
    expect(await db.plays.count()).toBe(0)
  })

  it('lets a change not yet sent beat an older one from the server', async () => {
    await signIn('tadinada', PASSWORD)
    await setSetting('stylus', { lifespan: 500 })
    await wait()
    await syncNow(api())
    await newDevice()
    await signIn('tadinada', PASSWORD)
    await setSetting('stylus', { lifespan: 700 }) // newer, waiting to go
    await wait()
    await setSetting(CLOUD.cursor, 0)
    await syncNow(api())
    expect(await getSetting('stylus')).toEqual({ lifespan: 700 })
  })

  it('stops here when the account is deleted from another device', async () => {
    await signIn('tadinada', PASSWORD)
    const mine = api()
    // the other device deletes it; only the server changes
    server.accounts.splice(0, 1)
    expect(await syncNow(mine)).toBe('gone')
    expect(deviceFor('tadinada')).toBeNull()
  })

  it('leaves without touching the account', async () => {
    await signIn('tadinada', PASSWORD)
    await leave(api())
    expect(deviceFor('tadinada')).toBeNull()
    expect(server.accounts).toHaveLength(1)
  })
})

describe('signing out', () => {
  it('sends what was waiting, then takes the device out of sync', async () => {
    await signIn('tadinada', PASSWORD)
    await setSetting('stylus', { lifespan: 321 })
    await wait()
    expect(await db.outbox.count()).toBe(1)
    await signOutOfSync(api())
    expect(deviceFor('tadinada')).toBeNull()
    expect([...server.accounts[0].rows.values()].some((r) => r.key === 'stylus' && r.value?.includes('321'))).toBe(true)
  })

  it("stays in sync if what's waiting can't be sent", async () => {
    await signIn('tadinada', PASSWORD)
    await setSetting('stylus', { lifespan: 1 })
    await wait()
    const down = cloudApi(deviceFor('tadinada')!.device, (async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch)
    await expect(signOutOfSync(down)).rejects.toBeInstanceOf(CloudError)
    expect(deviceFor('tadinada')).toBeTruthy()
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('what syncs', () => {
  it('stops sending a switched-off category, and sends it all again once back on', async () => {
    await signIn('tadinada', PASSWORD)
    await setWhatSyncs(api(), ['plays'])
    await db.plays.add({ instanceId: 1, releaseId: 2, at: 100, before: {} })
    await setSetting('stylus', {})
    await wait()
    expect((await db.outbox.toArray()).map((e) => e.kind)).toEqual(['setting'])
    await syncNow(api())

    await setWhatSyncs(api(), [])
    await syncNow(api())
    expect([...server.accounts[0].rows.values()].some((r) => r.kind === 'play')).toBe(true)
  })

  it('follows a switch flipped on another device', async () => {
    await signIn('tadinada', PASSWORD)
    server.accounts[0].off = ['covers']
    await syncNow(api())
    expect(await getSetting(CLOUD.off)).toEqual(['covers'])
    await db.covers.put({ instanceId: 1, cover: 'c', thumb: 't' })
    await wait()
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('batch across devices', () => {
  const result = (id: number) => ({ id, title: `R${id}`, type: 'release' }) as never

  it("sends the batch without Discogs' search results, and the other device looks them up", async () => {
    await signIn('tadinada', PASSWORD)
    await db.queue.add({ createdAt: 1, source: 'scan', status: 'choose', barcode: '123', candidates: [result(1), result(2)] })
    await wait()
    await syncNow(api())
    const sent = JSON.parse([...server.accounts[0].rows.values()].find((r) => r.kind === 'batch')!.value!)
    expect(sent.candidates).toBeUndefined()
    expect(sent.barcode).toBe('123')

    await newDevice()
    takeNeedCandidates()
    await signIn('tadinada', PASSWORD)
    const [item] = await db.queue.toArray()
    expect(item.status).toBe('choose')
    expect(takeNeedCandidates()).toEqual([item.id])
  })

  it('lets only one device start adding a record', async () => {
    await signIn('tadinada', PASSWORD)
    await db.queue.add({ createdAt: 1, source: 'scan', status: 'ready', barcode: '123' })
    await wait()
    await syncNow(api())
    const phone = (await db.queue.toArray())[0]
    const phoneApi = api()

    await newDevice()
    await signIn('tadinada', PASSWORD)
    const laptop = (await db.queue.toArray())[0]
    expect(laptop.seq).toBe(phone.seq)

    expect(await claimBatch(phoneApi, phone, 'phone', 10)).toBe(true)
    expect(await claimBatch(api(), laptop, 'laptop', 11)).toBe(false)
  })

  it("adds anyway if Platter's server can't be reached", async () => {
    const down = cloudApi('x', (async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch)
    const id = await db.queue.add({ createdAt: 1, source: 'scan', status: 'ready', barcode: '1' })
    expect(await claimBatch(down, (await db.queue.get(id))!, 'phone', 1)).toBe(true)
    expect(new CloudError(0, 'x').status).toBe(0)
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
