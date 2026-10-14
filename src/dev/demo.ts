// Dev-only: `?demo` signs in a fake account and answers API calls from the
// recorded fixtures, for trying the UI without a Discogs login.
import collection from '../../tests/fixtures/collection-page.json'
import fields from '../../tests/fixtures/fields.json'
import folders from '../../tests/fixtures/folders.json'
import identity from '../../tests/fixtures/identity.json'
import mb from '../../tests/fixtures/musicbrainz-barcode.json'
import owned from '../../tests/fixtures/owned-none.json'
import searchBarcode from '../../tests/fixtures/search-barcode.json'
import searchCatno from '../../tests/fixtures/search-catno.json'
import searchFuzzy from '../../tests/fixtures/search-fuzzy.json'
import searchTitle from '../../tests/fixtures/search-title.json'
import wants from '../../tests/fixtures/wants.json'
import { db } from '../db/db'

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
  if (method === 'POST' && /\/releases\/\d+$/.test(url)) return json({ instance_id: Date.now(), resource_url: url }, 201)
  if (method === 'POST' || method === 'DELETE') return json(null, 204)
  if (url.includes('/collection/folders/0/releases')) return json(collection)
  if (url.endsWith('/collection/folders')) return json(folders)
  if (url.endsWith('/collection/fields')) return json(fields)
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
