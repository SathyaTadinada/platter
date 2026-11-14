import { beforeEach, describe, expect, it } from 'vitest'
import type { Sections } from '../../worker/profile'
import { db } from '../db/db'
import type { ProfileRow } from './cloud'
import {
  forgetSent,
  publishProfile,
  SENT,
  setPlayFields,
  type ProfileItem,
  type ProfileStats,
  type ProfileYear,
  type Publisher,
} from './profile'

// What the server would end up holding, so a pass can be checked the way a visitor would see it
function fakeServer() {
  const rows = new Map<string, ProfileRow>()
  const passes: { section: string; before: number }[] = []
  const api: Publisher = {
    publishProfile: async (sent) => {
      for (const r of sent) rows.set(`${r.kind}:${r.key}`, r)
      return { saved: sent.length }
    },
    sweepProfile: async (section, before) => {
      passes.push({ section, before })
      const kind = ({ collection: 'item', wantlist: 'want', stats: 'stats', year: 'year' } as Record<string, string>)[section]
      let gone = 0
      for (const [k, r] of rows) if (r.kind === kind && r.updatedAt < before) (rows.delete(k), gone++)
      return { gone }
    },
  }
  const of = (kind: string) =>
    [...rows.values()]
      .filter((r) => r.kind === kind)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => JSON.parse(r.value) as ProfileItem)
  return { api, passes, of, count: () => rows.size }
}

const ON: Sections = { collection: 'public', wantlist: 'off', stats: 'off', year: 'off' }

async function addRecord(instanceId: number, title: string, dateAdded: string, rating = 0) {
  await db.collection.put({
    instanceId,
    releaseId: instanceId * 10,
    masterId: 0,
    folderId: 1,
    title,
    artist: 'Fleetwood Mac',
    year: 1977,
    format: 'Vinyl, LP',
    formatNames: ['Vinyl'],
    formatTags: ['LP'],
    genres: [],
    styles: [],
    dateAdded,
    rating,
    fields: { 1: 'Shelf B', 2: 'Paid 30' },
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  setPlayFields({})
})

describe('publishing a profile', () => {
  it('sends the collection newest first, and only once it changes', async () => {
    const server = fakeServer()
    await addRecord(1, 'Rumours', '2026-01-01T00:00:00Z')
    await addRecord(2, 'Tusk', '2026-03-01T00:00:00Z')

    expect(await publishProfile(server.api, ON, { avatar: 'a.jpg' }, 1000)).toEqual(['collection', 'about'])
    expect(server.of('item').map((r) => r.title)).toEqual(['Tusk', 'Rumours'])

    // nothing changed, so nothing is sent again
    expect(await publishProfile(server.api, ON, { avatar: 'a.jpg' }, 2000)).toEqual([])
  })

  it('keeps the keys of the records already up when a newer one arrives', async () => {
    const server = fakeServer()
    await addRecord(1, 'Rumours', '2026-01-01T00:00:00Z')
    await publishProfile(server.api, ON, {}, 1000)
    const before = [...server.of('item')]

    await addRecord(2, 'Tusk', '2026-03-01T00:00:00Z')
    await publishProfile(server.api, ON, {}, 2000)
    expect(server.of('item').map((r) => r.title)).toEqual(['Tusk', 'Rumours'])
    expect(server.of('item').at(-1)).toEqual(before[0])
  })

  it('drops a record once it is gone', async () => {
    const server = fakeServer()
    await addRecord(1, 'Rumours', '2026-01-01T00:00:00Z')
    await addRecord(2, 'Tusk', '2026-03-01T00:00:00Z')
    await publishProfile(server.api, ON, {}, 1000)

    await db.collection.delete(2)
    await publishProfile(server.api, ON, {}, 2000)
    expect(server.of('item').map((r) => r.title)).toEqual(['Rumours'])
  })

  it('never sends their rating, what they paid, where it is kept, or their notes', async () => {
    const server = fakeServer()
    await addRecord(1, 'Rumours', '2026-01-01T00:00:00Z', 4)
    await publishProfile(server.api, ON, {}, 1000)
    const sent = JSON.stringify(server.of('item'))
    expect(sent).not.toContain('Shelf B')
    expect(sent).not.toContain('Paid 30')
    expect(sent).not.toContain('fields')
    expect(sent).not.toContain('rating')
  })

  it('sends a section once it goes on, and stops once it goes off', async () => {
    const server = fakeServer()
    await addRecord(1, 'Rumours', '2026-01-01T00:00:00Z')
    await db.wants.put({ releaseId: 5, masterId: 0, title: 'Wanted', artist: 'Someone', dateAdded: '2026-02-01T00:00:00Z' })
    await publishProfile(server.api, ON, {}, 1000)
    expect(server.of('want')).toEqual([])

    const both: Sections = { ...ON, wantlist: 'public' }
    await forgetSent(both)
    expect(await publishProfile(server.api, both, {}, 2000)).toEqual(['wantlist'])
    expect(server.of('want').map((r) => r.title)).toEqual(['Wanted'])

    // off again, then back on: it goes up from scratch, since the server deleted it
    await forgetSent(ON)
    expect(((await db.settings.get(SENT))?.value as Record<string, string>).wantlist).toBeUndefined()
    await forgetSent(both)
    expect(await publishProfile(server.api, both, {}, 3000)).toEqual(['wantlist'])
  })

  it('sends nothing at all while every section is off', async () => {
    const server = fakeServer()
    await addRecord(1, 'Rumours', '2026-01-01T00:00:00Z')
    const off: Sections = { collection: 'off', wantlist: 'off', stats: 'off', year: 'off' }
    expect(await publishProfile(server.api, off, { avatar: 'a.jpg' }, 1000)).toEqual([])
    expect(server.count()).toBe(0)
  })

  it('pages a big collection and sweeps once', async () => {
    const server = fakeServer()
    for (let i = 0; i < 450; i++) await addRecord(i + 1, `Album ${i}`, `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`)
    await publishProfile(server.api, ON, {}, 1000)
    expect(server.of('item')).toHaveLength(450)
    expect(server.passes.filter((p) => p.section === 'collection')).toEqual([{ section: 'collection', before: 1000 }])
  })
})

describe('the Stats and Your year sections', () => {
  const SHOWN: Sections = { collection: 'off', wantlist: 'off', stats: 'public', year: 'public' }
  const stats = (server: ReturnType<typeof fakeServer>) => server.of('stats')[0] as unknown as ProfileStats
  const years = (server: ReturnType<typeof fakeServer>) => server.of('year') as unknown as ProfileYear[]

  async function shelf() {
    await addRecord(1, 'Rumours', '2025-03-01T00:00:00Z')
    await addRecord(2, 'Tusk', '2026-02-01T00:00:00Z')
    await addRecord(3, 'Mirage', '2026-05-01T00:00:00Z')
    await db.collection.update(1, { genres: ['Rock'], year: 1977 })
    await db.collection.update(2, { genres: ['Rock'], year: 1979 })
    await db.collection.update(3, { genres: ['Pop'], year: 1982 })
    const at = (d: string) => Date.parse(d)
    await db.plays.bulkAdd([
      { instanceId: 2, releaseId: 20, at: at('2026-03-02T20:00:00Z'), before: {} },
      { instanceId: 2, releaseId: 20, at: at('2026-03-09T20:00:00Z'), before: {} },
      { instanceId: 1, releaseId: 10, at: at('2026-04-01T20:00:00Z'), before: {} },
    ])
  }

  it('waits for the play count fields before sending Stats', async () => {
    const server = fakeServer()
    await shelf()
    setPlayFields(null)
    expect(await publishProfile(server.api, SHOWN, {}, 1000)).toEqual(['year', 'about'])
    expect(server.of('stats')).toEqual([])
    setPlayFields({})
    expect(await publishProfile(server.api, SHOWN, {}, 2000)).toEqual(['stats'])
  })

  it('counts the collection and its plays, without prices', async () => {
    const server = fakeServer()
    await shelf()
    await publishProfile(server.api, SHOWN, {}, 1000)
    const s = stats(server)
    expect(s.records).toBe(3)
    expect(s.played).toBe(2)
    expect(s.mostPlayed.map((m) => [m.item.title, m.count])).toEqual([
      ['Tusk', 2],
      ['Rumours', 1],
    ])
    expect(s.genres).toEqual([
      { label: 'Rock', count: 2 },
      { label: 'Pop', count: 1 },
    ])
    expect(s.decades.map((d) => d.label)).toEqual(['1970s', '1980s'])
    expect(JSON.stringify(s)).not.toMatch(/price|paid|value/i)
  })

  it('sends a year for each one with something in it, newest record first', async () => {
    const server = fakeServer()
    await shelf()
    await publishProfile(server.api, SHOWN, {}, 1000)
    const [y2025, y2026] = years(server)
    expect([y2025.year, y2026.year]).toEqual([2025, 2026])
    expect(y2026.added).toBe(2)
    expect(y2026.newest.map((n) => n.title)).toEqual(['Mirage', 'Tusk'])
    expect(y2026.plays).toBe(3)
    expect(y2026.topRecords[0]).toMatchObject({ item: { title: 'Tusk' }, count: 2 })
    expect(y2026.first?.item.title).toBe('Tusk')
    expect(y2026.latest?.item.title).toBe('Mirage')
    expect(y2025.plays).toBe(0)
  })

  it('never puts what they spent on a year', async () => {
    const server = fakeServer()
    await shelf()
    await publishProfile(server.api, SHOWN, {}, 1000)
    for (const y of years(server)) expect(Object.keys(y)).not.toContain('spent')
    expect(JSON.stringify(years(server))).not.toMatch(/biggest|spent|Paid 30/)
  })

  it('sends Stats again when a play is logged, and not otherwise', async () => {
    const server = fakeServer()
    await shelf()
    await publishProfile(server.api, SHOWN, {}, 1000)
    expect(await publishProfile(server.api, SHOWN, {}, 2000)).toEqual([])
    await db.plays.add({ instanceId: 3, releaseId: 30, at: Date.parse('2026-06-01T20:00:00Z'), before: {} })
    expect(await publishProfile(server.api, SHOWN, {}, 3000)).toEqual(['stats', 'year'])
  })
})
