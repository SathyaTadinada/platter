// Dev-only: `?demo` signs in a fake account and answers API calls from the
// recorded fixtures, for trying the UI without a Discogs login.
import collection from '../../tests/fixtures/collection-demo.json'
import fields from '../../tests/fixtures/fields.json'
import identity from '../../tests/fixtures/identity.json'
import mb from '../../tests/fixtures/musicbrainz-barcode.json'
import owned from '../../tests/fixtures/owned-none.json'
import release from '../../tests/fixtures/release-vinyl.json'
import searchBarcode from '../../tests/fixtures/search-barcode.json'
import searchCatno from '../../tests/fixtures/search-catno.json'
import searchFuzzy from '../../tests/fixtures/search-fuzzy.json'
import searchTitle from '../../tests/fixtures/search-title.json'
import wants from '../../tests/fixtures/wants.json'
import { db } from '../db/db'

const demoFolders = {
  folders: [
    { id: 0, name: 'All', count: collection.releases.length },
    { id: 1, name: 'Uncategorized', count: collection.releases.filter((r) => r.folder_id === 1).length },
    { id: 2, name: 'Shelf', count: collection.releases.filter((r) => r.folder_id === 2).length },
  ],
}
const demoFields = { fields: [...fields.fields, { id: 4, name: 'Location', type: 'textarea', position: 4, public: false, lines: 1 }] }

const json = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

function route(url: string, method: string): Response {
  if (url.includes('musicbrainz.org')) return json(mb)
  if (url.includes('/oauth/identity')) return json(identity)
  if (url.includes('/database/search')) {
    if (/barcode=0?075678164125/.test(url)) return json(searchBarcode)
    if (url.includes('barcode=')) return json(searchFuzzy)
    if (url.includes('catno=')) return json(searchCatno)
    return json(searchTitle)
  }
  // only one release is recorded; others report no data rather than borrowing its tracklist
  if (method === 'GET' && /api\.discogs\.com\/releases\/\d+$/.test(url)) return url.endsWith(`/${release.id}`) ? json(release) : json({ message: 'Not in demo data' }, 404)
  if (method === 'POST' && /\/releases\/\d+$/.test(url)) return json({ instance_id: Date.now(), resource_url: url }, 201)
  if (method === 'POST' || method === 'DELETE') return json(null, 204)
  if (url.includes('/collection/folders/0/releases')) return json(collection)
  if (url.endsWith('/collection/folders')) return json(demoFolders)
  if (url.endsWith('/collection/fields')) return json(demoFields)
  if (url.includes('/collection/releases/')) return json(owned)
  if (url.includes('/wants')) return json(wants)
  return json({ message: 'Not in demo data' }, 404)
}

export async function enableDemo() {
  sessionStorage.setItem('demo', '1')
  await db.session.put({ id: 'current', kind: 'token', token: 'demo', username: 'platter-test', userId: 1 })
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.includes('api.discogs.com') && !url.includes('musicbrainz.org')) return real(input, init)
    await new Promise((r) => setTimeout(r, 300))
    return route(url, (init?.method ?? 'GET').toUpperCase())
  }
}
