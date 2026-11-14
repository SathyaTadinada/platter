// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDB } from '../tests/d1'
import { discogsSignIn } from './account'
import { head, parseRows, publish, rows, search, setSections, settings, setWho, sweep, unpublish, type ProfileRow } from './profile'
import { members, setHidden } from './admin'
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
  await publish(db, acc.id, [record(1, 'Rumours'), record(2, 'Kind of Blue')])
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
    expect(await head(db, 'tadinada')).toMatchObject({ badges: ['Early supporter'], memberSince: 1000 })
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
    await publish(db, id, many.slice(0, 100))
    await publish(db, id, many.slice(100))
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
    expect(await publish(db, id, [row('want', '9', { title: 'Wanted' })])).toEqual({ saved: 0 })
    await setSections(db, id, { wantlist: 'public' })
    expect(await publish(db, id, [row('want', '9', { title: 'Wanted' })])).toEqual({ saved: 1 })
    expect((await head(db, 'tadinada'))?.sections).toEqual(['collection', 'wantlist'])
  })

  it('keeps the newest version of a record and drops ones the owner no longer has', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await publish(db, id, [record(1, 'Rumours (2011 reissue)', 2000)])
    await publish(db, id, [record(1, 'Stale', 500)])
    const after = await rows(db, 'tadinada', 'collection', undefined)
    expect(JSON.parse(after.rows[0].value).title).toBe('Rumours (2011 reissue)')

    // a later pass that leaves out record 2: it isn't theirs any more
    await publish(db, id, [record(1, 'Rumours (2011 reissue)', 3000)])
    expect(await sweep(db, id, 'collection', 3000)).toEqual({ gone: 1 })
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows.map((r) => r.key)).toEqual(['1'])
  })

  it('takes down rows by key, in that section only, many at a time', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await setSections(db, id, { wantlist: 'public' })
    await publish(db, id, [row('want', '1', { title: 'Wanted' })])
    await publish(
      db,
      id,
      Array.from({ length: 150 }, (_, i) => record(100 + i, `Album ${i}`)),
    )
    const keys = Array.from({ length: 150 }, (_, i) => String(100 + i))
    expect(await unpublish(db, id, 'collection', ['1', ...keys])).toEqual({ gone: 151 })
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows.map((r) => r.key)).toEqual(['2'])
    expect((await rows(db, 'tadinada', 'wantlist', undefined)).rows.map((r) => r.key)).toEqual(['1'])
    await expect(unpublish(db, id, 'collection', [42])).rejects.toThrow('Bad keys')
  })

  it('sweeps only the section it is given', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await setSections(db, id, { wantlist: 'public' })
    await publish(db, id, [row('want', '9', { title: 'Wanted' }, 1000), row('about', 'about', { avatar: 'a.jpg' }, 1000)])
    await publish(db, id, [record(1, 'Rumours', 2000)])
    await sweep(db, id, 'collection', 2000)
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows.map((r) => r.key)).toEqual(['1'])
    expect((await rows(db, 'tadinada', 'wantlist', undefined)).rows.map((r) => r.key)).toEqual(['9'])
    expect(JSON.parse((await head(db, 'tadinada'))!.about!).avatar).toBe('a.jpg')
  })

  it("sends their Discogs picture while anything is shared, and not once it isn't", async () => {
    const db = testDB()
    const { id } = await account(db)
    expect(await publish(db, id, [row('about', 'about', { avatar: 'a.jpg' })])).toEqual({ saved: 0 })
    await setSections(db, id, { collection: 'public' })
    expect(await publish(db, id, [row('about', 'about', { avatar: 'a.jpg' })])).toEqual({ saved: 1 })
  })

  it('notes when it last heard from the owner', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await publish(db, id, [record(3, 'Blue')], 5000)
    expect((await settings(db, id)).publishedAt).toBe(5000)
    expect((await head(db, 'tadinada'))?.publishedAt).toBe(5000)
  })

  it('turns away rows it does not know', () => {
    expect(() => parseRows([{ kind: 'secret', key: '1', value: '{}', updatedAt: 1 }])).toThrow()
    expect(() => parseRows([{ kind: 'item', key: '', value: '{}', updatedAt: 1 }])).toThrow()
    expect(() => parseRows([{ kind: 'item', key: '1', value: 'x'.repeat(25_000), updatedAt: 1 }])).toThrow()
    expect(parseRows([{ kind: 'item', key: '1', value: '{}', updatedAt: 1 }])).toHaveLength(1)
  })
})

describe('finding someone', () => {
  const names = async (db: ReturnType<typeof testDB>, q?: string) => (await search(db, q)).found.map((f) => f.username)

  it('finds them by part of their name, best match first', async () => {
    const db = testDB()
    await shared(db)
    await shared(db, { id: 8, username: 'tad' })
    await shared(db, { id: 9, username: 'mrtadpole' })
    expect(await names(db, 'tad')).toEqual(['tad', 'tadinada', 'mrtadpole'])
    expect(await names(db, 'TAD')).toEqual(['tad', 'tadinada', 'mrtadpole'])
    expect(await names(db, 'nobody')).toEqual([])
  })

  it('waits for more than a letter, and gives nothing for an empty search', async () => {
    const db = testDB()
    await shared(db)
    expect(await names(db)).toEqual([])
    expect(await names(db, '')).toEqual([])
    expect(await names(db, 't')).toEqual([])
    expect(await names(db, 'ta')).toEqual(['tadinada'])
  })

  it('leaves out an unlisted profile, which still works by link', async () => {
    const db = testDB()
    const { id } = await shared(db)
    expect((await settings(db, id)).who).toBe('public')
    await setWho(db, id, 'unlisted')
    expect(await names(db, 'tad')).toEqual([])
    expect(await head(db, 'tadinada')).toMatchObject({ username: 'tadinada' })
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows).toHaveLength(2)
  })

  it('leaves out profiles with nothing shared and accounts not tied to Discogs', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await db.prepare("INSERT INTO accounts (id, name, proof, discogs_id, created_at) VALUES ('old', 'tadpole', 'x', NULL, 0)").run()
    await setSections(db, 'old', { collection: 'public' })
    expect(await names(db, 'tad')).toEqual(['tadinada'])
    await setSections(db, id, { collection: 'off' })
    expect(await names(db, 'tad')).toEqual([])
  })

  it('carries their picture and record count', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await publish(db, id, [row('about', 'about', { avatar: 'a.jpg', records: 43 })])
    const [found] = (await search(db, 'tadinada')).found
    expect(JSON.parse(found.about!)).toEqual({ avatar: 'a.jpg', records: 43 })
  })

  it('takes a name with wildcards in it literally', async () => {
    const db = testDB()
    await shared(db)
    expect(await names(db, '%%')).toEqual([])
    expect(await names(db, 'tad_nada')).toEqual([])
  })
})

describe('who a profile is for', () => {
  it('closes the link while it is private, and opens it again after', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await setWho(db, id, 'private')
    expect(await head(db, 'tadinada')).toBeNull()
    await expect(rows(db, 'tadinada', 'collection', undefined)).rejects.toMatchObject({ status: 404 })
    expect((await search(db, 'tad')).found).toEqual([])

    await setWho(db, id, 'public')
    expect(await head(db, 'tadinada')).toMatchObject({ username: 'tadinada' })
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows).toHaveLength(2)
  })

  it('keeps what was published while it was private', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await setWho(db, id, 'private')
    await publish(db, id, [record(9, 'Added while private', 4000)])
    await setWho(db, id, 'unlisted')
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows).toHaveLength(3)
  })

  it('turns away anything that is not one of the three', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await expect(setWho(db, id, 'everyone')).rejects.toMatchObject({ status: 400 })
    await expect(setWho(db, id, true)).rejects.toMatchObject({ status: 400 })
  })
})

describe('hidden by an admin', () => {
  it('takes the profile off links and search, whoever its owner says it is for', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await setHidden(db, id, true)
    expect(await head(db, 'tadinada')).toBeNull()
    await expect(rows(db, 'tadinada', 'collection', undefined)).rejects.toMatchObject({ status: 404 })
    expect((await search(db, 'tad')).found).toEqual([])
    // the owner can't bring it back by changing who it's for
    await setWho(db, id, 'public')
    expect(await head(db, 'tadinada')).toBeNull()
    expect((await settings(db, id)).hidden).toBe(true)

    await setHidden(db, id, false)
    expect(await head(db, 'tadinada')).toMatchObject({ username: 'tadinada' })
    expect((await rows(db, 'tadinada', 'collection', undefined)).rows).toHaveLength(2)
  })

  it('shows in the member list with what it was for', async () => {
    const db = testDB()
    const { id } = await shared(db)
    await account(db, YOU)
    await setWho(db, id, 'unlisted')
    await setHidden(db, id, true)
    expect((await members(db)).map((m) => [m.name, m.profile, m.hidden])).toEqual([
      ['tadinada', 'unlisted', true],
      ['someone', 'none', false],
    ])
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
    await publish(db, yours.id, [record(5, 'Yours only')])
    await push(db, { DB: db }, mine.id, [{ kind: 'play', key: 'p1', value: '{"secret":true}', updatedAt: 1, deleted: false }])

    const seen = (await rows(db, 'tadinada', 'collection', undefined)).rows
    expect(seen.map((r) => r.key)).toEqual(['1', '2'])
    expect(JSON.stringify(seen)).not.toContain('secret')
    expect((await rows(db, 'someone', 'collection', undefined)).rows.map((r) => r.key)).toEqual(['1', '2', '5'])
  })
})
