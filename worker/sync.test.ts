// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDB } from '../tests/d1'
import { askDiscogs, forget, parseRows, pull, push, seal, SyncError, unseal, whoIs, type InRow, type Login, type SyncEnv } from './sync'

const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)))
const setup = () => {
  const db = testDB()
  const env: SyncEnv = { DB: db, SYNC_KEY: key, DISCOGS_CONSUMER_KEY: 'ck', DISCOGS_CONSUMER_SECRET: 'cs' }
  return { db, env }
}
const row = (kind: string, k: string, value: unknown, updatedAt: number, extra: Partial<InRow> = {}): InRow => ({
  kind,
  key: k,
  value: value === null ? null : JSON.stringify(value),
  updatedAt,
  ...extra,
})
const login: Login = { kind: 'token', token: 'abc' }

describe('who is asking', () => {
  it('checks with Discogs once, then remembers', async () => {
    const { db } = setup()
    let asked = 0
    const ask = async () => (asked++, 'someone')
    expect((await whoIs(db, login, ask, 1000)).username).toBe('someone')
    expect((await whoIs(db, login, ask, 2000)).username).toBe('someone')
    expect(asked).toBe(1)
  })

  it('checks again after 30 days, and forgets a sign-in Discogs turns down', async () => {
    const { db } = setup()
    await whoIs(db, login, async () => 'someone', 0)
    await expect(whoIs(db, login, async () => null, 31 * 86_400_000)).rejects.toMatchObject({ status: 401 })
    let asked = 0
    await whoIs(db, login, async () => (asked++, 'someone'), 31 * 86_400_000)
    expect(asked).toBe(1)
  })

  it("doesn't keep a sign-in that was only checked, if asked not to", async () => {
    const { db } = setup()
    await whoIs(db, login, async () => 'someone', 0, false)
    expect(await db.prepare('SELECT * FROM logins').first()).toBeNull()
  })

  it('treats a different token as a different sign-in', async () => {
    const { db } = setup()
    await whoIs(db, login, async () => 'someone')
    let asked = 0
    await whoIs(db, { kind: 'token', token: 'other' }, async () => (asked++, 'someone'))
    expect(asked).toBe(1)
  })

  it('asks Discogs with the token, or a signed request for OAuth', async () => {
    const { env } = setup()
    const seen: string[] = []
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>).Authorization)
      return Response.json({ id: 1, username: 'someone' })
    }) as unknown as typeof fetch
    expect(await askDiscogs({ kind: 'token', token: 'abc' }, env, fetchFn)).toBe('someone')
    expect(await askDiscogs({ kind: 'oauth', token: 't', secret: 's' }, env, fetchFn)).toBe('someone')
    expect(seen[0]).toBe('Discogs token=abc')
    expect(seen[1]).toMatch(/^OAuth .*oauth_consumer_key="ck".*oauth_token="t"/)
  })

  it("says Discogs turned it down, or that Discogs couldn't be asked", async () => {
    const { env } = setup()
    const answer = (status: number) => (async () => new Response('', { status })) as unknown as typeof fetch
    const noWait = async () => {}
    expect(await askDiscogs(login, env, answer(401), noWait)).toBeNull()
    await expect(askDiscogs(login, env, answer(429), noWait)).rejects.toBeInstanceOf(SyncError)
  })

  it('tries a busy Discogs once more', async () => {
    const { env } = setup()
    let calls = 0
    const busyOnce = (async () =>
      calls++ ? Response.json({ username: 'someone' }) : new Response('', { status: 429 })) as unknown as typeof fetch
    expect(await askDiscogs(login, env, busyOnce, async () => {})).toBe('someone')
    expect(calls).toBe(2)
  })
})

describe('push and pull', () => {
  it('gives a new device everything, then only what changed', async () => {
    const { db, env } = setup()
    expect(await pull(db, env, 'me', 0)).toMatchObject({ exists: false, rows: [] })
    await push(db, env, 'me', [row('play', 'a', { at: 1 }, 10), row('setting', 'stylus', { lifespan: 1000 }, 10)])
    const first = await pull(db, env, 'me', 0)
    expect(first.exists).toBe(true)
    expect(first.rows.map((r) => r.key)).toEqual(['a', 'stylus'])
    await push(db, env, 'me', [row('play', 'b', { at: 2 }, 20)])
    const next = await pull(db, env, 'me', first.seq)
    expect(next.rows.map((r) => r.key)).toEqual(['b'])
    expect((await pull(db, env, 'me', next.seq)).rows).toEqual([])
  })

  it('keeps the newest edit', async () => {
    const { db, env } = setup()
    await push(db, env, 'me', [row('pref', 'platter.accent', 'blue', 20)])
    const { seqs } = await push(db, env, 'me', [row('pref', 'platter.accent', 'rose', 10)])
    expect(seqs).toEqual([0])
    expect((await pull(db, env, 'me', 0)).rows[0].value).toBe('"blue"')
    await push(db, env, 'me', [row('pref', 'platter.accent', 'teal', 30)])
    expect((await pull(db, env, 'me', 0)).rows[0].value).toBe('"teal"')
  })

  it('passes deletes on', async () => {
    const { db, env } = setup()
    const { seq } = await push(db, env, 'me', [row('play', 'a', { at: 1 }, 10)])
    await push(db, env, 'me', [row('play', 'a', null, 20)])
    const after = await pull(db, env, 'me', seq)
    expect(after.rows).toMatchObject([{ key: 'a', deleted: true, value: null }])
  })

  it('keeps accounts apart', async () => {
    const { db, env } = setup()
    await push(db, env, 'me', [row('play', 'a', {}, 1)])
    expect((await pull(db, env, 'you', 0)).exists).toBe(false)
  })

  it('lets only one device claim a batch record', async () => {
    const { db, env } = setup()
    const [created] = (await push(db, env, 'me', [row('batch', 'x', { status: 'ready' }, 1)])).seqs
    const phone = await push(db, env, 'me', [row('batch', 'x', { status: 'adding', by: 'phone' }, 2, { ifSeq: created })])
    const laptop = await push(db, env, 'me', [row('batch', 'x', { status: 'adding', by: 'laptop' }, 3, { ifSeq: created })])
    expect(phone.seqs[0]).toBeGreaterThan(0)
    expect(laptop.seqs).toEqual([0])
    expect(JSON.parse((await pull(db, env, 'me', 0)).rows[0].value!).by).toBe('phone')
  })

  it("won't create a claimed record twice", async () => {
    const { db, env } = setup()
    expect((await push(db, env, 'me', [row('batch', 'x', {}, 1, { ifSeq: 0 })])).seqs[0]).toBeGreaterThan(0)
    expect((await push(db, env, 'me', [row('batch', 'x', {}, 2, { ifSeq: 0 })])).seqs).toEqual([0])
  })

  it('pages through a big pull', async () => {
    const { db, env } = setup()
    for (let i = 0; i < 6; i++)
      await push(
        db,
        env,
        'me',
        Array.from({ length: 200 }, (_, j) => row('year', `${i}-${j}`, { year: 1970 }, 1)),
      )
    const page1 = await pull(db, env, 'me', 0)
    expect(page1.rows).toHaveLength(1000)
    expect(page1.more).toBe(true)
    const page2 = await pull(db, env, 'me', page1.seq)
    expect(page2.rows).toHaveLength(200)
    expect(page2.more).toBe(false)
  })

  it('encrypts the ListenBrainz token on the server', async () => {
    const { db, env } = setup()
    const lb = { token: 'lb-secret', user: 'me', enabled: true }
    await push(db, env, 'me', [row('setting', 'listenbrainz', lb, 1)])
    const stored = await db.prepare("SELECT value FROM rows WHERE kind = 'setting'").first<{ value: string }>()
    expect(stored!.value).not.toContain('lb-secret')
    expect(JSON.parse((await pull(db, env, 'me', 0)).rows[0].value!)).toEqual(lb)
    expect(await unseal(env, await seal(env, 'x'))).toBe('x')
  })

  it('forgets everything for an account', async () => {
    const { db, env } = setup()
    await whoIs(db, login, async () => 'me')
    await push(db, env, 'me', [row('play', 'a', {}, 1)])
    await forget(db, 'me')
    expect((await pull(db, env, 'me', 0)).exists).toBe(false)
    let asked = 0
    await whoIs(db, login, async () => (asked++, 'me'))
    expect(asked).toBe(1)
  })

  it('turns away rows it does not know', () => {
    expect(() => parseRows([{ kind: 'session', key: 'current', value: '{}', updatedAt: 1 }])).toThrow(SyncError)
    expect(() => parseRows(Array.from({ length: 201 }, () => row('play', 'a', {}, 1)))).toThrow(SyncError)
    expect(parseRows([row('play', 'a', null, 1)])[0].deleted).toBe(true)
  })
})
