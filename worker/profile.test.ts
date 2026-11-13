// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDB } from '../tests/d1'
import { discogsSignIn } from './account'
import { head, parseRows, publish, rows, setSections, settings, type ProfileRow } from './profile'
import { deviceAccount, forget, push } from './sync'

const ME = { id: 42, username: 'Tadinada' }
const YOU = { id: 7, username: 'someone' }

async function account(db: ReturnType<typeof testDB>, who = ME) {
  const { device } = await discogsSignIn(db, who, true, 1000)
  return { device: device!, id: await deviceAccount(db, device!, 1000) }
}

const row = (kind: ProfileRow['kind'], key: string, value: unknown, updatedAt = 1000): ProfileRow => ({
  kind,
  key,
  value: JSON.stringify(value),
  updatedAt,
})
const record = (id: number, title: string, updatedAt = 1000) => row('item', String(id), { title, artist: 'Someone' }, updatedAt)

async function shared(db: ReturnType<typeof testDB>, who = ME) {
  const acc = await account(db, who)
  await setSections(db, acc.id, { collection: 'public' })
  await publish(db, acc.id, [record(1, 'Rumours'), record(2, 'Kind of Blue')], [])
  return acc
}

describe('what a profile shows', () => {
  it('shows nothing until a section is switched on', async () => {
    const db = testDB()
    const { id } = await account(db)
    expect(await head(db, 'tadinada')).toBeNull()
    expect((await settings(db, id)).sections).toEqual({ collection: 'off', wantlist: 'off', stats: 'off', year: 'off' })

    await setSections(db, id, { collection: 'public' })
    expect(await head(db, 'tadinada')).toMatchObject({ username: 'tadinada', sections: ['collection'] })
  })

  it('is found by username whichever way it is typed', async () => {
    const db = testDB()
    await shared(db)
    expect(await head(db, '  TADINADA ')).toMatchObject({ username: 'tadinada' })
    expect(await head(db, 'nobody')).toBeNull()
  })

  it("isn't served for an account the server hasn't tied to its Discogs user", async () => {
    const db = testDB()
    await db.prepare("INSERT INTO accounts (id, name, proof, created_at) VALUES ('old', 'tadinada', 'x', 0)").run()
    await setSections(db, 'old', { collection: 'public' })
    expect(await head(db, 'tadinada')).toBeNull()
    await expect(rows(db, 'tadinada', 'collection', undefined)).rejects.toMatchObject({ status: 404 })
  })

  it('carries the badges and when they joined', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await db.prepare('UPDATE accounts SET badges = \'["early"]\' WHERE id = ?1').bind(id).run()
    expect(await head(db, 'tadinada')).toMatchObject({ badges: ['early'], memberSince: 1000 })
  })
})

describe('reading a section', () => {
  it('gives the rows of a section that is on', async () => {
    const db = testDB()
    await shared(db)
    const { rows: list, more } = await rows(db, 'tadinada', 'collection', undefined)
    expect(list.map((r) => JSON.parse(r.value).title)).toEqual(['Rumours', 'Kind of Blue'])
    expect(more).toBe(false)
  })

  it('turns away a section that is off, and a section that is not one', async () => {
    const db = testDB()
    await shared(db)
    await expect(rows(db, 'tadinada', 'wantlist', undefined)).rejects.toMatchObject({ status: 404 })
    await expect(rows(db, 'tadinada', 'everything', undefined)).rejects.toMatchObject({ status: 400 })
  })

  it('pages through a long collection', async () => {
    const db = testDB()
    const { id } = await shared(db)
    // keys sort as text, so pad them the way the app will
    const many = Array.from({ length: 120 }, (_, i) => record(i, `Album ${i}`)).map((r) => ({ ...r, key: r.key.padStart(8, '0') }))
    await publish(db, id, many.slice(0, 100), [])
    await publish(db, id, many.slice(100), [])
    const first = await rows(db, 'tadinada', 'collection', undefined)
    expect(first.rows).toHaveLength(100)
    expect(first.more).toBe(true)
    const next = await rows(db, 'tadinada', 'collection', first.rows.at(-1)!.key)
    expect(next.more).toBe(false)
    expect(next.rows.length).toBeGreaterThan(0)
    const keys = new Set([...first.rows, ...next.rows].map((r) => r.key))
    expect(keys.size).toBe(first.rows.length + next.rows.length)
  })
})

describe('publishing', () => {
  it('keeps out rows for a section that is off', async () => {
    const db = testDB()
    const { id } = await shared(db)
    expect(await publish(db, id, [row('want', '9', { title: 'Wanted' })], [])).toEqual({ saved: 0 })
    await setSections(db, id, { wantlist: 'public' })
    expect(await publish(db, id, [row('want', '9', { title: 'Wanted' })], [])).toEqual({ saved: 1 })
    expect((await head(db, 'tadinada'))?.sections).toEqual(['collection', 'wantlist'])
  })

  it('keeps the newest version of a record and drops ones the owner no longer has', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await publish(db, id, [record(1, 'Rumours (2011 reissue)', 2000)], [])
    await publish(db, id, [record(1, 'Stale', 500)], [])
    const after = await rows(db, 'tadinada', 'collection', undefined)
    expect(JSON.parse(after.rows[0].value).title).toBe('Rumours (2011 reissue)')

    await publish(db, id, [], [{ kind: 'item', key: '2' }])
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows.map((r) => r.key)).toEqual(['1'])
  })

  it('notes when it last heard from the owner', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await publish(db, id, [record(3, 'Blue')], [], 5000)
    expect((await settings(db, id)).publishedAt).toBe(5000)
    expect((await head(db, 'tadinada'))?.publishedAt).toBe(5000)
  })

  it('turns away rows it does not know', () => {
    expect(() => parseRows([{ kind: 'secret', key: '1', value: '{}', updatedAt: 1 }])).toThrow()
    expect(() => parseRows([{ kind: 'item', key: '', value: '{}', updatedAt: 1 }])).toThrow()
    expect(() => parseRows([{ kind: 'item', key: '1', value: 'x'.repeat(5000), updatedAt: 1 }])).toThrow()
    expect(parseRows([{ kind: 'item', key: '1', value: '{}', updatedAt: 1 }])).toHaveLength(1)
  })
})

describe('switching off and deleting', () => {
  it('deletes a section’s rows from the server when it goes off', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await setSections(db, id, { collection: 'off' })
    expect(await head(db, 'tadinada')).toBeNull()
    await setSections(db, id, { collection: 'public' })
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows).toEqual([])
  })

  it('goes with the account', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await forget(db, id)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM profile_rows').first()).toEqual({ n: 0 })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM profiles').first()).toEqual({ n: 0 })
  })

  it('keeps profiles apart, and never mixes in what someone synced', async () => {
    const db = testDB()
    const mine = await shared(db)
    const yours = await shared(db, YOU)
    await publish(db, yours.id, [record(5, 'Yours only')], [])
    await push(db, { DB: db }, mine.id, [{ kind: 'play', key: 'p1', value: '{"secret":true}', updatedAt: 1, deleted: false }])

    const seen = (await rows(db, 'tadinada', 'collection', undefined)).rows
    expect(seen.map((r) => r.key)).toEqual(['1', '2'])
    expect(JSON.stringify(seen)).not.toContain('secret')
    expect((await rows(db, 'someone', 'collection', undefined)).rows.map((r) => r.key)).toEqual(['1', '2', '5'])
  })
})
