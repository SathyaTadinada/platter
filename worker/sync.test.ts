// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDB } from '../tests/d1'
import { discogsSignIn } from './account'
import {
  deviceAccount,
  forget,
  leave,
  newPairing,
  parseRows,
  pull,
  push,
  seal,
  setOff,
  setPassword,
  sha256,
  signIn,
  SyncError,
  unseal,
  usePairing,
  type InRow,
  type SyncEnv,
} from './sync'

const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)))
const setup = () => {
  const db = testDB()
  const env: SyncEnv = { DB: db, SYNC_KEY: key }
  return { db, env }
}
const row = (kind: string, k: string, value: unknown, updatedAt: number, extra: Partial<InRow> = {}): InRow => ({
  kind,
  key: k,
  value: value === null ? null : JSON.stringify(value),
  updatedAt,
  ...extra,
})
const proof = (p: string) => p.padEnd(64, '0')
const PW = proof('a1')
const OTHER = proof('b2')

let nextId = 1
// an account with one device in it, ready to sync, made the way they're made now: from a Discogs
// login the server confirmed
async function account(db: ReturnType<typeof testDB>, name = 'tadinada', discogsId = nextId++) {
  const { device } = await discogsSignIn(db, { id: discogsId, username: name }, true)
  return { device: device!, id: await deviceAccount(db, device!) }
}

// one made before the server could confirm Discogs logins: a name and a password
async function oldAccount(db: ReturnType<typeof testDB>, name: string, pw: string) {
  const id = `old-${name}-${pw.slice(0, 2)}`
  await db
    .prepare('INSERT INTO accounts (id, name, proof, created_at) VALUES (?1, ?2, ?3, 0)')
    .bind(id, name, await sha256(pw))
    .run()
  return id
}

describe('getting in', () => {
  it('lets a password into the account it was set on', async () => {
    const { db } = setup()
    const { id } = await account(db, 'tadinada', 42)
    await setPassword(db, id, PW)
    const { device } = await signIn(db, { discogsId: 42, name: 'tadinada' }, PW)
    expect(await deviceAccount(db, device)).toBe(id)
  })

  it('turns away a wrong password, and never makes an account from one', async () => {
    const { db } = setup()
    const { id } = await account(db, 'tadinada', 42)
    await setPassword(db, id, PW)
    await expect(signIn(db, { discogsId: 42, name: 'tadinada' }, OTHER)).rejects.toMatchObject({ status: 401 })
    await expect(signIn(db, { discogsId: 7, name: 'someone' }, PW)).rejects.toMatchObject({ status: 401 })
  })

  it("keeps letting the password into an account that hasn't met its Discogs user yet", async () => {
    const { db } = setup()
    const squatter = await oldAccount(db, 'tadinada', OTHER)
    const mine = await oldAccount(db, 'tadinada', PW)
    expect(await deviceAccount(db, (await signIn(db, { discogsId: 42, name: 'tadinada' }, PW)).device)).toBe(mine)
    expect(await deviceAccount(db, (await signIn(db, { name: 'tadinada' }, OTHER)).device)).toBe(squatter)
  })

  it('lets any signed-in device change the password', async () => {
    const { db } = setup()
    const { id } = await account(db, 'tadinada', 42)
    await setPassword(db, id, PW)
    await setPassword(db, id, OTHER)
    await expect(signIn(db, { discogsId: 42, name: 'tadinada' }, PW)).rejects.toMatchObject({ status: 401 })
    expect(await deviceAccount(db, (await signIn(db, { discogsId: 42, name: 'tadinada' }, OTHER)).device)).toBe(id)
  })

  it('forgets a device that leaves', async () => {
    const { db } = setup()
    const { device } = await account(db)
    await leave(db, device)
    await expect(deviceAccount(db, device)).rejects.toMatchObject({ status: 401 })
  })
})

describe('pairing codes', () => {
  it('lets another device in once, then never again', async () => {
    const { db } = setup()
    const { id } = await account(db)
    const { code } = await newPairing(db, id, 1000)
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/)
    const joined = await usePairing(db, code.toLowerCase().replace('-', ' '), 2000)
    expect(joined.name).toBe('tadinada')
    expect(await deviceAccount(db, joined.device)).toBe(id)
    await expect(usePairing(db, code, 3000)).rejects.toMatchObject({ status: 401 })
  })

  it('runs out after 10 minutes', async () => {
    const { db } = setup()
    const { id } = await account(db)
    const { code } = await newPairing(db, id, 0)
    await expect(usePairing(db, code, 10 * 60 * 1000 + 1)).rejects.toBeInstanceOf(SyncError)
  })

  it('keeps one code per account at a time', async () => {
    const { db } = setup()
    const { id } = await account(db)
    const first = await newPairing(db, id, 0)
    await newPairing(db, id, 1)
    await expect(usePairing(db, first.code, 2)).rejects.toBeInstanceOf(SyncError)
  })
})

describe('push and pull', () => {
  it('gives a new device everything, then only what changed', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    await push(db, env, id, [row('play', 'a', { at: 1 }, 10), row('setting', 'stylus', { lifespan: 1000 }, 10)])
    const first = await pull(db, env, id, 0)
    expect(first.rows.map((r) => r.key)).toEqual(['a', 'stylus'])
    await push(db, env, id, [row('play', 'b', { at: 2 }, 20)])
    const next = await pull(db, env, id, first.seq)
    expect(next.rows.map((r) => r.key)).toEqual(['b'])
    expect((await pull(db, env, id, next.seq)).rows).toEqual([])
  })

  it('keeps the newest edit', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    await push(db, env, id, [row('pref', 'platter.accent', 'blue', 20)])
    expect((await push(db, env, id, [row('pref', 'platter.accent', 'rose', 10)])).seqs).toEqual([0])
    expect((await pull(db, env, id, 0)).rows[0].value).toBe('"blue"')
    await push(db, env, id, [row('pref', 'platter.accent', 'teal', 30)])
    expect((await pull(db, env, id, 0)).rows[0].value).toBe('"teal"')
  })

  it('passes deletes on', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    const { seq } = await push(db, env, id, [row('play', 'a', { at: 1 }, 10)])
    await push(db, env, id, [row('play', 'a', null, 20)])
    expect((await pull(db, env, id, seq)).rows).toMatchObject([{ key: 'a', deleted: true, value: null }])
  })

  it('keeps accounts apart', async () => {
    const { db, env } = setup()
    const me = await account(db, 'me')
    const you = await account(db, 'you')
    await push(db, env, me.id, [row('play', 'a', {}, 1)])
    expect((await pull(db, env, you.id, 0)).rows).toEqual([])
  })

  it('lets only one device claim a batch record', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    const [created] = (await push(db, env, id, [row('batch', 'x', { status: 'ready' }, 1)])).seqs
    const phone = await push(db, env, id, [row('batch', 'x', { status: 'adding', by: 'phone' }, 2, { ifSeq: created })])
    const laptop = await push(db, env, id, [row('batch', 'x', { status: 'adding', by: 'laptop' }, 3, { ifSeq: created })])
    expect(phone.seqs[0]).toBeGreaterThan(0)
    expect(laptop.seqs).toEqual([0])
    expect(JSON.parse((await pull(db, env, id, 0)).rows[0].value!).by).toBe('phone')
  })

  it("won't create a claimed record twice", async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    expect((await push(db, env, id, [row('batch', 'x', {}, 1, { ifSeq: 0 })])).seqs[0]).toBeGreaterThan(0)
    expect((await push(db, env, id, [row('batch', 'x', {}, 2, { ifSeq: 0 })])).seqs).toEqual([0])
  })

  it('pages through a big pull', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    for (let i = 0; i < 6; i++)
      await push(
        db,
        env,
        id,
        Array.from({ length: 200 }, (_, j) => row('year', `${i}-${j}`, { year: 1970 }, 1)),
      )
    const page1 = await pull(db, env, id, 0)
    expect(page1.rows).toHaveLength(1000)
    expect(page1.more).toBe(true)
    const page2 = await pull(db, env, id, page1.seq)
    expect(page2.rows).toHaveLength(200)
    expect(page2.more).toBe(false)
  })

  it('encrypts the ListenBrainz token on the server', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    const lb = { token: 'lb-secret', user: 'me', enabled: true }
    await push(db, env, id, [row('setting', 'listenbrainz', lb, 1)])
    const stored = await db.prepare("SELECT value FROM rows WHERE kind = 'setting'").first<{ value: string }>()
    expect(stored!.value).not.toContain('lb-secret')
    expect(JSON.parse((await pull(db, env, id, 0)).rows[0].value!)).toEqual(lb)
    expect(await unseal(env, await seal(env, 'x'))).toBe('x')
  })

  it('forgets everything for an account', async () => {
    const { db, env } = setup()
    const { id, device } = await account(db)
    await push(db, env, id, [row('play', 'a', {}, 1)])
    await forget(db, id)
    await expect(deviceAccount(db, device)).rejects.toMatchObject({ status: 401 })
    expect(await db.prepare('SELECT count(*) AS n FROM rows').first<{ n: number }>()).toEqual({ n: 0 })
  })

  it('turns away rows it does not know', () => {
    expect(() => parseRows([{ kind: 'session', key: 'current', value: '{}', updatedAt: 1 }])).toThrow(SyncError)
    expect(() => parseRows(Array.from({ length: 201 }, () => row('play', 'a', {}, 1)))).toThrow(SyncError)
    expect(parseRows([row('play', 'a', null, 1)])[0].deleted).toBe(true)
  })
})

describe('what syncs', () => {
  it('deletes a switched-off category from the server and stops taking it', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    await push(db, env, id, [
      row('play', 'a', {}, 1),
      row('setting', 'listenbrainz', { token: 'x' }, 1),
      row('setting', 'stylus', {}, 1),
      row('setting', 'batchShared', {}, 1),
      row('batch', 'b', {}, 1),
    ])
    expect(await setOff(db, id, ['listenbrainz', 'batch', 'nonsense'])).toEqual(['listenbrainz', 'batch'])
    const left = await pull(db, env, id, 0)
    expect(left.rows.map((r) => `${r.kind}:${r.key}`).sort()).toEqual(['play:a', 'setting:stylus'])
    expect(left.off).toEqual(['listenbrainz', 'batch'])
    const again = await push(db, env, id, [row('batch', 'c', {}, 2), row('play', 'd', {}, 2)])
    expect(again.seqs[0]).toBe(0)
    expect(again.seqs[1]).toBeGreaterThan(0)
  })

  it('takes a category again once it is back on', async () => {
    const { db, env } = setup()
    const { id } = await account(db)
    await setOff(db, id, ['plays'])
    await setOff(db, id, [])
    expect((await push(db, env, id, [row('play', 'a', {}, 1)])).seqs[0]).toBeGreaterThan(0)
  })
})
