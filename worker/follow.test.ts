// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDB } from '../tests/d1'
import { discogsSignIn } from './account'
import { block, feed, follow, lists, removeFollower, respond, unblock, unfollow } from './follow'
import { head, publish, rows, search, setSections, setWho, type ProfileRow, type Who } from './profile'
import { deviceAccount, forget } from './sync'

type DBT = ReturnType<typeof testDB>

let nextId = 1
async function person(db: DBT, username: string, who: Who = 'public') {
  const { device } = await discogsSignIn(db, { id: nextId++, username }, true, 1000)
  const id = await deviceAccount(db, device!, 1000)
  await setSections(db, id, { collection: 'public' })
  await setWho(db, id, who)
  return id
}

// a record whose key counts down by date added, as the app makes them
const item = (title: string, added: string): ProfileRow => ({
  kind: 'item',
  key: `${String(4_000_000_000_000 - Date.parse(added)).padStart(13, '0')}:${title}`,
  value: JSON.stringify({ title }),
  updatedAt: 1,
})

describe('following', () => {
  it('is instant for a Public profile, and a request for a Followers one', async () => {
    const db = testDB()
    const me = await person(db, 'me')
    await person(db, 'open', 'public')
    await person(db, 'closed', 'followers')
    expect(await follow(db, me, 'open')).toEqual({ status: 'accepted' })
    expect(await follow(db, me, 'closed')).toEqual({ status: 'pending' })
    expect((await lists(db, me)).following.map((p) => p.username)).toEqual(['closed', 'open'])
  })

  it('shows a Followers profile only as a name and picture until the request is approved', async () => {
    const db = testDB()
    const me = await person(db, 'me')
    const them = await person(db, 'closed', 'followers')
    await publish(db, them, [
      item('Rumours', '2026-01-01'),
      { kind: 'about', key: 'about', value: '{"avatar":"a.jpg","records":12}', updatedAt: 1 },
    ])

    for (const viewer of [null, me]) {
      const h = await head(db, 'closed', viewer)
      expect(h).toMatchObject({ locked: true, sections: [], publishedAt: null })
      expect(JSON.parse(h!.about!)).toEqual({ avatar: 'a.jpg' })
      await expect(rows(db, 'closed', 'collection', undefined, viewer)).rejects.toMatchObject({ status: 404 })
    }

    await follow(db, me, 'closed')
    expect((await lists(db, them)).requests.map((p) => p.username)).toEqual(['me'])
    expect((await head(db, 'closed', me))?.relation).toEqual({ following: 'pending', followsYou: false, blocked: false })
    // a request isn't a follower yet
    expect(await head(db, 'closed', me)).toMatchObject({ followers: 0, following: 0 })
    await respond(db, them, 'me', true)
    expect(await head(db, 'closed', me)).toMatchObject({ locked: false, sections: ['collection'], followers: 1, following: 0 })
    expect((await rows(db, 'closed', 'collection', undefined, me)).rows).toHaveLength(1)
    // still locked to anyone else
    expect((await head(db, 'closed', null))?.locked).toBe(true)
  })

  it('shows the owner their own Followers profile in full', async () => {
    const db = testDB()
    const them = await person(db, 'closed', 'followers')
    expect((await head(db, 'closed', them))?.locked).toBe(false)
  })

  it('declines, takes back, and removes', async () => {
    const db = testDB()
    const me = await person(db, 'me')
    const them = await person(db, 'closed', 'followers')
    await follow(db, me, 'closed')
    await respond(db, them, 'me', false)
    expect((await lists(db, them)).requests).toEqual([])
    await expect(respond(db, them, 'me', true)).rejects.toMatchObject({ status: 404 })

    await follow(db, me, 'closed')
    await unfollow(db, me, 'closed')
    expect((await lists(db, them)).requests).toEqual([])

    await follow(db, me, 'closed')
    await respond(db, them, 'me', true)
    await removeFollower(db, them, 'me')
    expect((await lists(db, them)).followers).toEqual([])
  })

  it('lets everyone waiting in once the profile is no longer Followers', async () => {
    const db = testDB()
    const me = await person(db, 'me')
    const them = await person(db, 'closed', 'followers')
    await follow(db, me, 'closed')
    await setWho(db, them, 'public')
    expect((await lists(db, them)).followers.map((p) => p.username)).toEqual(['me'])
  })

  it("can't follow a private profile, yourself, or with an account not tied to Discogs", async () => {
    const db = testDB()
    const me = await person(db, 'me')
    await person(db, 'hermit', 'private')
    await expect(follow(db, me, 'hermit')).rejects.toMatchObject({ status: 404 })
    await expect(follow(db, me, 'me')).rejects.toMatchObject({ status: 404 })
    await db.prepare("INSERT INTO accounts (id, name, proof, created_at) VALUES ('old', 'old', 'x', 0)").run()
    await expect(follow(db, 'old', 'me')).rejects.toMatchObject({ status: 403 })
  })
})

describe('blocking', () => {
  it('ends following both ways and keeps them from following again', async () => {
    const db = testDB()
    const me = await person(db, 'me')
    const them = await person(db, 'them')
    await follow(db, me, 'them')
    await follow(db, them, 'me')
    await block(db, me, 'them')
    expect((await lists(db, me)).followers).toEqual([])
    expect((await lists(db, me)).following).toEqual([])
    expect((await lists(db, me)).blocked.map((p) => p.username)).toEqual(['them'])
    // to them, it's as if there's no profile at all
    await expect(follow(db, them, 'me')).rejects.toMatchObject({ status: 404 })
    expect(await head(db, 'me', them)).toBeNull()
    expect((await search(db, 'me', them)).found).toEqual([])
    // signed out, a Public profile is still there for them: nobody is checked there
    expect(await head(db, 'me', null)).not.toBeNull()

    await unblock(db, me, 'them')
    expect(await follow(db, them, 'me')).toEqual({ status: 'accepted' })
  })
})

describe('search with followers', () => {
  it('finds Followers profiles so people can ask, showing only their picture', async () => {
    const db = testDB()
    const them = await person(db, 'closed', 'followers')
    await person(db, 'linked', 'unlisted')
    await publish(db, them, [{ kind: 'about', key: 'about', value: '{"avatar":"a.jpg","records":12}', updatedAt: 1 }])
    const found = (await search(db, 'ed')).found
    expect(found.map((f) => f.username)).toEqual(['closed'])
    expect(JSON.parse(found[0].about!)).toEqual({ avatar: 'a.jpg' })
    expect(found[0].publishedAt).toBeNull()
  })
})

describe('the Following page', () => {
  it('gives what everyone you follow added, newest first, and nothing you can’t see', async () => {
    const db = testDB()
    const me = await person(db, 'me')
    const a = await person(db, 'alice')
    const b = await person(db, 'bob', 'followers')
    const c = await person(db, 'carol')
    const d = await person(db, 'dave')
    await publish(db, a, [item('Rumours', '2026-01-01'), item('Tusk', '2026-03-01')])
    await publish(db, b, [item('Blue', '2026-02-01')])
    await publish(db, c, [item('Hidden away', '2026-04-01')])
    await publish(db, d, [item('Not followed', '2026-05-01')])
    await follow(db, me, 'alice')
    await follow(db, me, 'bob') // waiting, so not yet
    await follow(db, me, 'carol')
    await setWho(db, c, 'private')

    const names = async () => (await feed(db, me, undefined)).items.map((i) => `${i.username}:${JSON.parse(i.value).title}`)
    expect(await names()).toEqual(['alice:Tusk', 'alice:Rumours'])
    await respond(db, b, 'me', true)
    expect(await names()).toEqual(['alice:Tusk', 'bob:Blue', 'alice:Rumours'])
    await setSections(db, a, { collection: 'off' })
    expect(await names()).toEqual(['bob:Blue'])
  })

  it('goes, follows and all, when an account is deleted', async () => {
    const db = testDB()
    const me = await person(db, 'me')
    const them = await person(db, 'them')
    await follow(db, me, 'them')
    await block(db, them, 'me')
    await forget(db, them)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM follows').first()).toEqual({ n: 0 })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM blocks').first()).toEqual({ n: 0 })
  })
})
