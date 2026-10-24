import { beforeEach, describe, expect, it } from 'vitest'
import release from '../../tests/fixtures/release-vinyl.json'
import { json, routeFetch } from '../../tests/helpers'
import { db } from '../db/db'
import { createDemoFetch, resetDemo } from './backend'

const API = 'https://api.discogs.com'
const call = async (f: typeof fetch, method: string, path: string, body?: unknown) => {
  const res = await f(API + path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, data: res.status === 204 ? null : await res.json() }
}

let real: ReturnType<typeof routeFetch>
let f: typeof fetch

beforeEach(async () => {
  await db.settings.clear()
  resetDemo()
  real = routeFetch([
    ['/releases/249504', () => json(release)],
    ['/database/search', () => json({ pagination: {}, results: [] })],
  ])
  f = createDemoFetch(real.fn)
})

describe('demo backend', () => {
  it('starts with the sample collection', async () => {
    const { data } = await call(f, 'GET', '/users/demo/collection/folders/0/releases?per_page=100&page=1')
    expect(data.releases).toHaveLength(40)
    const folders = (await call(f, 'GET', '/users/demo/collection/folders')).data.folders
    expect(folders.map((x: { name: string }) => x.name)).toEqual(['All', 'Uncategorized', 'Shelf'])
  })

  it('dates the sample so the newest record went in two weeks ago', async () => {
    const { data } = await call(f, 'GET', '/users/demo/collection/folders/0/releases?per_page=100&page=1')
    const newest = Math.max(...data.releases.map((r: { date_added: string }) => Date.parse(r.date_added)))
    expect(Math.round((Date.now() - newest) / 86_400_000)).toBe(14)
  })

  it('lists fields in the same order as a real account', async () => {
    const { data } = await call(f, 'GET', '/users/demo/collection/fields')
    expect(data.fields.map((x: { name: string }) => x.name)).toEqual([
      'Media Condition',
      'Sleeve Condition',
      'Purchase Price',
      'Purchased From',
      'Purchase Date',
      'Location',
      'Play Count',
      'Last Played',
      'Notes',
      'Lent To',
    ])
  })

  it('has a collection value that follows the records', async () => {
    const before = (await call(f, 'GET', '/users/demo/collection/value')).data
    expect(before.median).toMatch(/^\$[\d,]+\.\d\d$/)
    await call(f, 'POST', '/users/demo/collection/folders/1/releases/249504')
    const after = (await call(f, 'GET', '/users/demo/collection/value')).data
    expect(after.median).not.toBe(before.median)
  })

  it('adds a record using real release details, then edits and removes it', async () => {
    const add = await call(f, 'POST', '/users/demo/collection/folders/1/releases/249504')
    expect(add.status).toBe(201)
    const id = add.data.instance_id
    await call(f, 'POST', `/users/demo/collection/folders/1/releases/249504/instances/${id}/fields/5`, { value: '$12.00' })
    await call(f, 'POST', `/users/demo/collection/folders/1/releases/249504/instances/${id}`, { rating: 4, folder_id: 2 })

    const owned = (await call(f, 'GET', '/users/demo/collection/releases/249504')).data.releases
    expect(owned[0]).toMatchObject({ rating: 4, folder_id: 2, notes: [{ field_id: 5, value: '$12.00' }] })
    expect(owned[0].basic_information.title).toBe('Never Gonna Give You Up')

    await call(f, 'DELETE', `/users/demo/collection/folders/2/releases/249504/instances/${id}`)
    expect((await call(f, 'GET', '/users/demo/collection/releases/249504')).data.releases).toHaveLength(0)
  })

  it('creates and renames crates, and only deletes empty ones', async () => {
    const made = (await call(f, 'POST', '/users/demo/collection/folders', { name: 'Jazz' })).data
    expect((await call(f, 'POST', `/users/demo/collection/folders/${made.id}`, { name: 'Jazz LPs' })).data.name).toBe('Jazz LPs')
    expect((await call(f, 'DELETE', '/users/demo/collection/folders/2')).status).toBe(409) // Shelf has records
    expect((await call(f, 'DELETE', `/users/demo/collection/folders/${made.id}`)).status).toBe(204)
  })

  it('keeps changes across reloads of the page', async () => {
    await call(f, 'POST', '/users/demo/collection/folders', { name: 'Kept' })
    resetDemo()
    const folders = (await call(createDemoFetch(real.fn), 'GET', '/users/demo/collection/folders')).data.folders
    expect(folders.some((x: { name: string }) => x.name === 'Kept')).toBe(true)
  })

  it('sends catalog requests to Discogs, signed out', async () => {
    await call(f, 'GET', '/database/search?barcode=123&type=release')
    expect(real.calls.at(-1)!.url).toContain('/database/search?barcode=123')
    expect(real.calls.at(-1)!.init).toBeUndefined()
  })

  it('removes wantlist entries', async () => {
    expect((await call(f, 'GET', '/users/demo/wants?per_page=100&page=1')).data.wants).toHaveLength(1)
    await call(f, 'DELETE', '/users/demo/wants/10176645')
    expect((await call(f, 'GET', '/users/demo/wants?per_page=100&page=1')).data.wants).toHaveLength(0)
  })
})
