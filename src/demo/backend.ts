// The demo account. Anything about "your" collection is answered from a sample
// collection kept in this browser; catalog lookups (search, releases, prices)
// go to Discogs for real, without signing in.
import demo from '../../tests/fixtures/collection-demo.json'
import type { CollectionField, CollectionItem, Release, WantItem } from '../api/discogs/types'
import { getSetting, setSetting } from '../db/db'

export const DEMO_USER = 'demo'
const API = 'https://api.discogs.com'
const STATE_KEY = 'demo.state'

type Folder = { id: number; name: string }
type State = { folders: Folder[]; items: CollectionItem[]; wants: WantItem[]; nextId: number }

const GRADES = [
  'Mint (M)',
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
]
const text = (id: number, name: string): CollectionField => ({
  id,
  name,
  type: 'textarea',
  position: id,
  public: false,
  lines: id === 3 ? 3 : 1,
})

const FIELDS: CollectionField[] = [
  { id: 1, name: 'Media Condition', type: 'dropdown', position: 1, public: false, options: GRADES },
  { id: 2, name: 'Sleeve Condition', type: 'dropdown', position: 2, public: false, options: ['Generic', 'No Cover', ...GRADES] },
  text(3, 'Notes'),
  text(4, 'Location'),
  text(5, 'Purchase Price'),
  text(6, 'Purchased From'),
  text(7, 'Purchase Date'),
  text(8, 'Play Count'),
  text(9, 'Last Played'),
]

function initialState(): State {
  const items = structuredClone((demo as unknown as { releases: CollectionItem[] }).releases)
  // purchase prices on two out of three records, so "paid vs now" has something to compare
  items.forEach((item, n) => {
    if (n % 3 === 2 || item.notes?.some((x) => x.field_id === 5)) return
    item.notes = [...(item.notes ?? []), { field_id: 5, value: usd(12 + ((item.id * 31) % 2400) / 100) }]
  })
  // and a listening history, matching what enterDemo puts in the local play log
  const plays = demoPlays(items)
  for (const item of items) {
    const mine = plays.filter((p) => p.instanceId === item.instance_id)
    if (!mine.length) continue
    const last = new Date(Math.max(...mine.map((p) => p.at)))
    const day = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
    item.notes = [...(item.notes ?? []), { field_id: 8, value: String(mine.length) }, { field_id: 9, value: day }]
  }
  return {
    folders: [
      { id: 1, name: 'Uncategorized' },
      { id: 2, name: 'Shelf' },
    ],
    items,
    // one wantlist entry, so wantlist matches can be tried (Genesis, Invisible Touch)
    wants: [
      {
        id: 10176645,
        basic_information: {
          id: 10176645,
          master_id: 29002,
          title: 'Invisible Touch',
          year: 1986,
          artists: [{ name: 'Genesis' }],
          labels: [],
          formats: [],
        },
      },
    ],
    nextId: 90000,
  }
}

let state: Promise<State> | null = null
const load = () => (state ??= getSetting<State>(STATE_KEY).then((s) => s ?? initialState()))
const save = async (s: State) => setSetting(STATE_KEY, s)

const json = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const notFound = () => json({ message: 'Not found' }, 404)

// What the collection page needs, built from a full release
function basicInfo(r: Release) {
  return {
    id: r.id,
    master_id: r.master_id ?? 0,
    title: r.title,
    year: r.year ?? 0,
    thumb: r.thumb,
    cover_image: r.images?.[0]?.uri ?? r.thumb,
    artists: r.artists,
    labels: r.labels,
    formats: r.formats,
    genres: r.genres,
    styles: r.styles,
  }
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// A made-up but stable estimate, so the sample collection has a value
// Made-up plays: most records a few times over the past year or so, some never
export function demoPlays(items: CollectionItem[], now = Date.now()) {
  const day = 24 * 60 * 60 * 1000
  // picked by release id, so the local log and the Discogs fields always agree
  return items.flatMap((item) => {
    if (item.id % 5 === 4) return []
    const count = 1 + ((item.id * 13) % 9)
    const shelved = item.id % 7 === 3 ? 380 : 0 // a few that haven't been on in over a year
    return Array.from({ length: count }, (_, j) => ({
      instanceId: item.instance_id,
      releaseId: item.id,
      at: now - (((item.id * 7 + j * 37) % 420) + 1 + shelved) * day - ((item.id + j) % 12) * 3_600_000,
      before: {},
    }))
  })
}

export const demoValue = (releaseIds: number[]) => releaseIds.reduce((n, id) => n + 6 + ((id * 7919) % 4500) / 100, 0)
export const currentDemoValue = async () => demoValue((await load()).items.map((i) => i.id))
export const currentDemoPlays = async () => demoPlays((await load()).items)

async function handle(realFetch: typeof fetch, url: URL, method: string, body: unknown): Promise<Response> {
  const path = url.pathname
  const s = await load()
  const mine = `/users/${DEMO_USER}`

  if (path === '/oauth/identity') return json({ id: 0, username: DEMO_USER })
  if (path === mine) return json({ username: DEMO_USER, uri: '', curr_abbr: 'USD' })
  if (path === `${mine}/collection/fields`) return json({ fields: FIELDS })
  if (path === `${mine}/collection/value`) {
    const median = demoValue(s.items.map((i) => i.id))
    return json({ minimum: usd(median * 0.55), median: usd(median), maximum: usd(median * 1.6) })
  }

  // crates
  if (path === `${mine}/collection/folders`) {
    if (method === 'POST') {
      const folder = { id: s.nextId++, name: String((body as { name?: string }).name ?? 'New crate') }
      s.folders.push(folder)
      await save(s)
      return json({ ...folder, count: 0 }, 201)
    }
    const count = (id: number) => s.items.filter((i) => i.folder_id === id).length
    return json({ folders: [{ id: 0, name: 'All', count: s.items.length }, ...s.folders.map((f) => ({ ...f, count: count(f.id) }))] })
  }
  let m = path.match(/^\/users\/demo\/collection\/folders\/(\d+)$/)
  if (m) {
    const id = Number(m[1])
    const folder = s.folders.find((f) => f.id === id)
    if (!folder) return notFound()
    if (method === 'DELETE') {
      if (s.items.some((i) => i.folder_id === id)) return json({ message: 'Folder must be empty' }, 409)
      s.folders = s.folders.filter((f) => f.id !== id)
      await save(s)
      return json(null, 204)
    }
    folder.name = String((body as { name?: string }).name ?? folder.name)
    await save(s)
    return json({ ...folder, count: s.items.filter((i) => i.folder_id === id).length })
  }

  // the collection itself
  if (path === `${mine}/collection/folders/0/releases`) {
    return json({ pagination: { page: 1, pages: 1, per_page: s.items.length, items: s.items.length, urls: {} }, releases: s.items })
  }
  m = path.match(/^\/users\/demo\/collection\/releases\/(\d+)$/)
  if (m) {
    const releases = s.items.filter((i) => i.id === Number(m![1]))
    return json({ pagination: { page: 1, pages: 1, per_page: 50, items: releases.length, urls: {} }, releases })
  }
  m = path.match(/^\/users\/demo\/collection\/folders\/(\d+)\/releases\/(\d+)$/)
  if (m && method === 'POST') {
    const releaseId = Number(m[2])
    const res = await realFetch(`${API}/releases/${releaseId}`)
    if (!res.ok) return json({ message: `Couldn't load release ${releaseId}` }, res.status)
    const item: CollectionItem = {
      id: releaseId,
      instance_id: s.nextId++,
      folder_id: Number(m[1]),
      date_added: new Date().toISOString(),
      rating: 0,
      basic_information: basicInfo((await res.json()) as Release),
      notes: [],
    }
    s.items.unshift(item)
    await save(s)
    return json({ instance_id: item.instance_id, resource_url: '' }, 201)
  }
  m = path.match(/^\/users\/demo\/collection\/folders\/\d+\/releases\/\d+\/instances\/(\d+)(?:\/fields\/(\d+))?$/)
  if (m) {
    const item = s.items.find((i) => i.instance_id === Number(m![1]))
    if (!item) return notFound()
    const b = (body ?? {}) as { rating?: number; folder_id?: number; value?: string }
    if (m[2]) {
      const fieldId = Number(m[2])
      item.notes = [
        ...(item.notes ?? []).filter((n) => n.field_id !== fieldId),
        ...(b.value ? [{ field_id: fieldId, value: b.value }] : []),
      ]
    } else if (method === 'DELETE') {
      s.items = s.items.filter((i) => i !== item)
    } else {
      if (b.rating !== undefined) item.rating = b.rating
      if (b.folder_id !== undefined) item.folder_id = b.folder_id
    }
    await save(s)
    return json(null, 204)
  }

  // wantlist
  if (path === `${mine}/wants`)
    return json({ pagination: { page: 1, pages: 1, per_page: 100, items: s.wants.length, urls: {} }, wants: s.wants })
  m = path.match(/^\/users\/demo\/wants\/(\d+)$/)
  if (m && method === 'DELETE') {
    s.wants = s.wants.filter((w) => w.id !== Number(m![1]))
    await save(s)
    return json(null, 204)
  }

  if (path.startsWith(mine)) return notFound()
  // anything else is a public catalog request: ask Discogs, signed out
  return realFetch(url.toString())
}

export function createDemoFetch(realFetch: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.origin !== API) return realFetch(input, init)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    return handle(realFetch, url, method, body)
  }
}

// for tests
export const resetDemo = () => {
  state = null
}
