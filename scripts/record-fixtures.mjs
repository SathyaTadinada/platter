// Records real API responses into tests/fixtures. Needs DISCOGS_TOKEN in .env.
// Usage: node --env-file=.env scripts/record-fixtures.mjs
import { writeFile } from 'node:fs/promises'

const token = process.env.DISCOGS_TOKEN
if (!token) throw new Error('DISCOGS_TOKEN missing')

const UA = 'Platter/0.1 +https://platter.tadinada.com'
const out = new URL('../tests/fixtures/', import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const identity = await get('https://api.discogs.com/oauth/identity')
const me = identity.username

// swap the real account for a fake one so personal details don't land in git
function scrub(data) {
  return JSON.parse(JSON.stringify(data).replaceAll(me, 'platter-test').replaceAll(String(identity.id), '1'))
}

async function get(url, auth = true) {
  const headers = { 'User-Agent': UA }
  if (auth) headers.Authorization = `Discogs token=${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await sleep(1100)
  return res.json()
}

async function save(name, data) {
  await writeFile(new URL(name + '.json', out), JSON.stringify(scrub(data), null, 2) + '\n')
  console.log('saved', name)
}

const api = 'https://api.discogs.com'
const u = `${api}/users/${me}`

await save('identity', identity)
const search = await get(`${api}/database/search?barcode=075678164125&type=release&per_page=5`)
await save('search-barcode', search)
// Discogs barcode search is fuzzy: a made-up code still returns unrelated releases
await save('search-fuzzy', await get(`${api}/database/search?barcode=000000000017&type=release&per_page=5`))
await save('search-catno', await get(`${api}/database/search?catno=PB%2041447&type=release&per_page=5`))
await save('search-title', await get(`${api}/database/search?artist=Rick%20Astley&release_title=Never%20Gonna%20Give%20You%20Up&type=release&per_page=5`))
await save('release-cd', await get(`${api}/releases/10176645`))
await save('release-vinyl', await get(`${api}/releases/249504`))
await save('master-versions', await get(`${api}/masters/29002/versions?per_page=5`))
await save('folders', await get(`${u}/collection/folders`))
await save('fields', await get(`${u}/collection/fields`))
await save('owned-none', await get(`${u}/collection/releases/10176645`))

// real page shape, but the items are rebuilt from public releases so the
// actual collection never ends up in the repo
const coll = await get(`${u}/collection/folders/0/releases?per_page=1`)
const template = coll.releases[0]
const picks = [
  { id: 249504, master_id: 96559, title: 'Never Gonna Give You Up', artist: 'Rick Astley' },
  { id: 1934367, master_id: 59501, title: 'Hotel California', artist: 'Eagles' },
  { id: 367084, master_id: 23934, title: 'Kind Of Blue', artist: 'Miles Davis' },
]
coll.releases = picks.map((p, i) => ({
  ...template,
  id: p.id,
  instance_id: 1000 + i,
  folder_id: 1,
  date_added: '2026-01-01T00:00:00-08:00',
  notes: [{ field_id: 1, value: 'Near Mint (NM or M-)' }],
  basic_information: {
    ...template.basic_information,
    id: p.id,
    master_id: p.master_id,
    title: p.title,
    artists: [{ ...template.basic_information.artists[0], name: p.artist }],
    resource_url: `${api}/releases/${p.id}`,
  },
}))
coll.pagination = { page: 1, pages: 1, per_page: 100, items: 3, urls: {} }
await save('collection-page', coll)
await save('wants', await get(`${u}/wants?per_page=100`))
await save('marketplace-stats', await get(`${api}/marketplace/stats/10176645`))

const mb = await get('https://musicbrainz.org/ws/2/release?query=barcode:075678164125&fmt=json&limit=3', false)
await save('musicbrainz-barcode', mb)
