// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { testDB } from '../tests/d1'
import { accountById, discogsSignIn } from './account'
import { members, setBadge } from './admin'
import { createBadge, deleteBadge, isBadge, listBadges, renameBadge } from './badges'
import { head, setSections } from './profile'
import { deviceAccount } from './sync'

async function account(db: ReturnType<typeof testDB>, username = 'tadinada', id = 42) {
  const { device } = await discogsSignIn(db, { id, username }, true, 1000)
  return deviceAccount(db, device!, 1000)
}

describe('badges', () => {
  it('starts with Early supporter', async () => {
    const db = testDB()
    expect(await listBadges(db)).toEqual([{ id: 'early', label: 'Early supporter', members: 0 }])
  })

  it('makes new ones, with a name nobody else has', async () => {
    const db = testDB()
    const tester = await createBadge(db, '  Tester ')
    expect(tester.label).toBe('Tester')
    expect(await isBadge(db, tester.id)).toBe(true)
    await expect(createBadge(db, 'early SUPPORTER')).rejects.toMatchObject({ status: 409 })
    await expect(createBadge(db, '   ')).rejects.toMatchObject({ status: 400 })
    await expect(createBadge(db, 'x'.repeat(31))).rejects.toMatchObject({ status: 400 })
  })

  it('can only give one that exists', async () => {
    const db = testDB()
    const id = await account(db)
    await expect(setBadge(db, id, 'made-up', true)).rejects.toMatchObject({ status: 400 })
    const tester = await createBadge(db, 'Tester')
    expect(await setBadge(db, id, tester.id, true)).toEqual([tester.id])
  })

  it('renames everywhere at once, profiles included', async () => {
    const db = testDB()
    const id = await account(db)
    await setSections(db, id, { collection: 'public' })
    await setBadge(db, id, 'early', true)
    expect((await head(db, 'tadinada'))?.badges).toEqual(['Early supporter'])
    await renameBadge(db, 'early', 'Founding member')
    expect((await head(db, 'tadinada'))?.badges).toEqual(['Founding member'])
    await createBadge(db, 'Tester')
    await expect(renameBadge(db, 'early', 'tester')).rejects.toMatchObject({ status: 409 })
    await expect(renameBadge(db, 'nope', 'Whatever')).rejects.toMatchObject({ status: 404 })
  })

  it('takes a deleted badge off everyone who had it, and only that one', async () => {
    const db = testDB()
    const me = await account(db)
    const you = await account(db, 'someone', 7)
    const tester = await createBadge(db, 'Tester')
    await setBadge(db, me, 'early', true)
    await setBadge(db, me, tester.id, true)
    await setBadge(db, you, tester.id, true)
    expect((await listBadges(db)).find((b) => b.id === tester.id)?.members).toBe(2)

    await deleteBadge(db, tester.id)
    expect((await accountById(db, me))?.badges).toEqual(['early'])
    expect((await accountById(db, you))?.badges).toEqual([])
    expect((await listBadges(db)).map((b) => b.label)).toEqual(['Early supporter'])
    expect((await members(db)).map((m) => m.badges)).toEqual([['early'], []])
  })
})
