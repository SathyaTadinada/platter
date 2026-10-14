// Phase 0 check: can a plain browser do every Discogs call Platter needs?
// Throwaway. Delete once the results are in.

const API = 'https://api.discogs.com'

type Status = 'ok' | 'fail' | 'skip'
type Line = { name: string; status: Status; detail: string }
type Resp = { status: number; ms: number; data: any; headers: Headers }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const tokenEl = $<HTMLInputElement>('token')
const barcodeEl = $<HTMLInputElement>('barcode')
const runBtn = $<HTMLButtonElement>('run')
const copyBtn = $<HTMLButtonElement>('copy')
const resultsEl = $<HTMLOListElement>('results')
const coverEl = $<HTMLImageElement>('cover')

let token = ''
let lines: Line[] = []

// OAuth tokens arrive in the URL fragment after /auth/callback
type OAuth = { token: string; secret: string }
let oauth: OAuth | null = null
let lastAuthMode = ''

function readOAuth() {
  const frag = new URLSearchParams(location.hash.slice(1))
  const t = frag.get('oauth_token')
  const s = frag.get('oauth_token_secret')
  const err = frag.get('auth_error')
  if (t && s) sessionStorage.setItem('oauth', JSON.stringify({ token: t, secret: s }))
  if (t || err) history.replaceState(null, '', location.pathname)
  if (err) $('oauth-status').textContent = `Sign-in failed: ${err}`
  const saved = sessionStorage.getItem('oauth')
  oauth = saved ? (JSON.parse(saved) as OAuth) : null
  if (oauth) {
    $('oauth-status').textContent = 'Signed in with Discogs. Run checks will use OAuth (token field ignored).'
    $('signout').hidden = false
    $('signin').hidden = true
  }
}

// Ask the Worker to sign one or more requests
async function signRequests(reqs: { method: string; url: string }[]): Promise<string[]> {
  const r = await request('/api/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: oauth!.token, tokenSecret: oauth!.secret, requests: reqs }),
  })
  return r.data.headers as string[]
}

class HttpError extends Error {
  constructor(public resp: Resp) {
    super(`HTTP ${resp.status}: ${short(resp.data)}`)
  }
}

function short(v: unknown, max = 300): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s && s.length > max ? s.slice(0, max) + '…' : (s ?? '')
}

async function request(url: string, init: RequestInit = {}): Promise<Resp> {
  const t0 = performance.now()
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    // fetch only throws on network or CORS failure
    throw new Error(`Network/CORS error: ${(e as Error).message}`)
  }
  const text = await res.text()
  let data: any = text
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // not JSON, keep text
  }
  const resp = { status: res.status, ms: Math.round(performance.now() - t0), data, headers: res.headers }
  if (!res.ok) throw new HttpError(resp)
  return resp
}

type ReqBody = { json: unknown } | { form: Record<string, string> }

async function discogs(method: string, path: string, body?: ReqBody, signed?: string): Promise<Resp> {
  const auth = signed ?? (oauth ? (await signRequests([{ method, url: API + path }]))[0] : `Discogs token=${token}`)
  const headers: Record<string, string> = { Authorization: auth }
  let payload: BodyInit | undefined
  if (body && 'json' in body) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body.json)
  } else if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(body.form)
  }
  return request(API + path, { method, headers, body: payload })
}

function render() {
  resultsEl.replaceChildren(
    ...lines.map((l) => {
      const li = document.createElement('li')
      li.className = l.status
      const head = document.createElement('div')
      const tag = document.createElement('span')
      tag.className = 'tag'
      tag.textContent = l.status === 'ok' ? 'PASS ' : l.status === 'fail' ? 'FAIL ' : 'SKIP '
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = l.name
      head.append(tag, name)
      const detail = document.createElement('p')
      detail.className = 'detail'
      detail.textContent = l.detail
      li.append(head, detail)
      return li
    }),
  )
}

function log(name: string, status: Status, detail: string) {
  lines.push({ name, status, detail })
  render()
}

// Runs one check. Returns undefined on failure so later steps can skip.
async function step<T>(name: string, fn: () => Promise<{ value: T; detail: string }>): Promise<T | undefined> {
  try {
    const { value, detail } = await fn()
    log(name, 'ok', detail)
    return value
  } catch (e) {
    log(name, 'fail', (e as Error).message)
    return undefined
  }
}

const skip = (name: string, why: string) => log(name, 'skip', why)

async function run() {
  token = tokenEl.value.trim()
  const barcode = barcodeEl.value.replace(/\D/g, '')
  if (!token && !oauth) return
  lastAuthMode = oauth ? 'OAuth (HMAC-SHA1 via /api/sign)' : 'personal access token'
  lines = []
  coverEl.hidden = true
  runBtn.disabled = true
  copyBtn.hidden = true

  log(
    'Browser',
    'ok',
    `${navigator.userAgent}\nstandalone: ${matchMedia('(display-mode: standalone)').matches}\nauth: ${lastAuthMode}`,
  )

  // 1. Identity, using the browser's own User-Agent
  const identity = await step('GET /oauth/identity', async () => {
    const r = await discogs('GET', '/oauth/identity')
    const readable = [...r.headers.keys()].join(', ')
    const remaining = r.headers.get('X-Discogs-Ratelimit-Remaining')
    return {
      value: r.data as { username: string },
      detail:
        `${r.status} in ${r.ms}ms, username: ${r.data.username}\n` +
        `readable headers: ${readable}\n` +
        `X-Discogs-Ratelimit-Remaining readable: ${remaining !== null ? `yes (${remaining})` : 'no'}`,
    }
  })
  if (!identity) return finish()
  const user = encodeURIComponent(identity.username)

  // 2. Barcode search
  type Hit = { id: number; title: string; master_id?: number; thumb?: string; user_data?: { in_collection: boolean; in_wantlist: boolean } }
  const hit = await step('GET /database/search?barcode', async () => {
    const r = await discogs('GET', `/database/search?barcode=${barcode}&type=release&per_page=25`)
    const results = r.data.results as Hit[]
    if (!results.length) throw new Error('No results for that barcode. Try another.')
    // prefer something not already owned, to keep the test clean
    const pick = results.find((h) => !h.user_data?.in_collection) ?? results[0]
    return {
      value: pick,
      detail: `${r.status} in ${r.ms}ms, ${r.data.pagination.items} results\nusing ${pick.id}: ${pick.title}\nuser_data: ${short(pick.user_data)}`,
    }
  })
  if (!hit) return finish()
  if (hit.thumb) {
    coverEl.src = hit.thumb
    coverEl.hidden = false
  }

  // 3. Folders and fields, looked up by name
  const folder = await step('GET collection/folders', async () => {
    const r = await discogs('GET', `/users/${user}/collection/folders`)
    const folders = r.data.folders as { id: number; name: string }[]
    const f = folders.find((x) => x.name === 'Uncategorized') ?? folders.find((x) => x.id !== 0)
    if (!f) throw new Error('No folder to add to')
    return { value: f, detail: `${r.status} in ${r.ms}ms, ${folders.map((x) => x.name).join(', ')}\nusing "${f.name}" (${f.id})` }
  })
  type Field = { id: number; name: string; type: string; options?: string[] }
  const fields = await step('GET collection/fields', async () => {
    const r = await discogs('GET', `/users/${user}/collection/fields`)
    const list = r.data.fields as Field[]
    return { value: list, detail: `${r.status} in ${r.ms}ms, ${list.map((f) => `${f.name} (${f.type})`).join(', ')}` }
  })

  // 4. Ownership check
  const ownedBefore = await step('GET collection/releases/{id} (ownership)', async () => {
    const r = await discogs('GET', `/users/${user}/collection/releases/${hit.id}`)
    const ids = (r.data.releases as { instance_id: number }[]).map((x) => x.instance_id)
    return { value: ids, detail: `${r.status} in ${r.ms}ms, you own ${ids.length} copies of this release` }
  })

  // 5. Add, set fields, read back, remove
  let instanceId: number | undefined
  if (folder) {
    instanceId = await step('POST add to collection', async () => {
      const r = await discogs('POST', `/users/${user}/collection/folders/${folder.id}/releases/${hit.id}`)
      return { value: r.data.instance_id as number, detail: `${r.status} in ${r.ms}ms, instance_id ${r.data.instance_id}` }
    })
  } else {
    skip('POST add to collection', 'no folder')
  }

  const instancePath =
    folder && instanceId ? `/users/${user}/collection/folders/${folder.id}/releases/${hit.id}/instances/${instanceId}` : undefined
  const notes = fields?.find((f) => f.name === 'Notes')
  const media = fields?.find((f) => f.type === 'dropdown' && f.options?.length)
  const noteValue = `Platter test ${Date.now()}`

  // try JSON first, fall back to form encoding
  async function setField(field: Field, value: string) {
    try {
      const r = await discogs('POST', `${instancePath}/fields/${field.id}`, { json: { value } })
      return { value, detail: `${r.status} in ${r.ms}ms, JSON body accepted` }
    } catch (e) {
      const r = await discogs('POST', `${instancePath}/fields/${field.id}`, { form: { value } })
      return { value, detail: `JSON failed (${(e as Error).message})\nform body: ${r.status} in ${r.ms}ms` }
    }
  }

  if (instancePath && notes) {
    await step(`POST field "${notes.name}"`, () => setField(notes, noteValue))
  } else {
    skip('POST field (textarea)', instancePath ? 'no Notes field' : 'nothing added')
  }
  if (instancePath && media) {
    await step(`POST field "${media.name}"`, () => setField(media, media.options![1] ?? media.options![0]))
  } else {
    skip('POST field (dropdown)', instancePath ? 'no dropdown field' : 'nothing added')
  }

  if (instancePath) {
    await step('Read fields back', async () => {
      const r = await discogs('GET', `/users/${user}/collection/releases/${hit.id}`)
      const inst = (r.data.releases as { instance_id: number; notes?: { field_id: number; value: string }[] }[]).find(
        (x) => x.instance_id === instanceId,
      )
      if (!inst) throw new Error('Added instance not found')
      const saved = inst.notes?.find((n) => n.field_id === notes?.id)?.value
      if (notes && saved !== noteValue) throw new Error(`Notes mismatch: ${short(inst.notes)}`)
      return { value: true, detail: `${r.status} in ${r.ms}ms, notes: ${short(inst.notes)}` }
    })

    await step('DELETE instance', async () => {
      const r = await discogs('DELETE', instancePath)
      return { value: true, detail: `${r.status} in ${r.ms}ms` }
    })

    await step('Confirm removed', async () => {
      const r = await discogs('GET', `/users/${user}/collection/releases/${hit.id}`)
      const ids = (r.data.releases as { instance_id: number }[]).map((x) => x.instance_id)
      if (ids.includes(instanceId!)) throw new Error(`Instance ${instanceId} still there. Remove it on discogs.com.`)
      const before = ownedBefore?.length ?? '?'
      return { value: true, detail: `${r.status} in ${r.ms}ms, copies now ${ids.length} (before: ${before})` }
    })
  }

  // 6. Other read endpoints Platter uses
  await step('GET /releases/{id}', async () => {
    const r = await discogs('GET', `/releases/${hit.id}`)
    const ids = (r.data.identifiers ?? []) as { type: string; value: string }[]
    const matrix = ids.filter((i) => i.type === 'Matrix / Runout').length
    return { value: true, detail: `${r.status} in ${r.ms}ms, ${ids.length} identifiers, ${matrix} Matrix / Runout` }
  })
  if (hit.master_id) {
    await step('GET /masters/{id}/versions', async () => {
      const r = await discogs('GET', `/masters/${hit.master_id}/versions?per_page=5`)
      return { value: true, detail: `${r.status} in ${r.ms}ms, ${r.data.pagination.items} versions` }
    })
  }
  await step('GET wants', async () => {
    const r = await discogs('GET', `/users/${user}/wants?per_page=1`)
    return { value: true, detail: `${r.status} in ${r.ms}ms, ${r.data.pagination.items} in wantlist` }
  })
  await step('GET /marketplace/stats/{id}', async () => {
    const r = await discogs('GET', `/marketplace/stats/${hit.id}`)
    return { value: true, detail: `${r.status} in ${r.ms}ms, ${short(r.data)}` }
  })

  // 7. MusicBrainz + Cover Art Archive (no auth)
  const mbid = await step('MusicBrainz barcode search', async () => {
    const r = await request(`https://musicbrainz.org/ws/2/release?query=barcode:${barcode}&fmt=json&limit=1`)
    const rel = r.data.releases?.[0]
    return {
      value: rel?.id as string | undefined,
      detail: `${r.status} in ${r.ms}ms, ${r.data.count} results${rel ? `\n${rel['artist-credit']?.[0]?.name} - ${rel.title}` : ''}`,
    }
  })
  if (mbid) {
    await step('Cover Art Archive', async () => {
      try {
        const r = await request(`https://coverartarchive.org/release/${mbid}`)
        return { value: true, detail: `${r.status} in ${r.ms}ms, ${r.data.images?.length ?? 0} images` }
      } catch (e) {
        // 404 just means no art; CORS still worked if we got a status
        if (e instanceof HttpError && e.resp.status === 404) return { value: true, detail: '404, no art for this release (CORS ok)' }
        throw e
      }
    })
  }

  // 8. Batch signing: sign two requests in one call, send them later
  if (oauth) {
    await step('Batch sign, send after 5s', async () => {
      const paths = [`/users/${user}/collection/folders`, `/database/search?barcode=${barcode}&type=release&per_page=1`]
      const signed = await signRequests(paths.map((p) => ({ method: 'GET', url: API + p })))
      await new Promise((res) => setTimeout(res, 5000))
      const a = await discogs('GET', paths[0], undefined, signed[0])
      const b = await discogs('GET', paths[1], undefined, signed[1])
      return { value: true, detail: `${a.status}, ${b.status}` }
    })
  }

  // 9. Local storage
  await step('IndexedDB write/read', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('platter-spike', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = (mode: IDBTransactionMode) => db.transaction('kv', mode).objectStore('kv')
    await new Promise((res, rej) => {
      const r = tx('readwrite').put({ at: Date.now() }, 'test')
      r.onsuccess = res
      r.onerror = () => rej(r.error)
    })
    const got = await new Promise<any>((res, rej) => {
      const r = tx('readonly').get('test')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    db.close()
    indexedDB.deleteDatabase('platter-spike')
    return { value: true, detail: `read back: ${short(got)}` }
  })
  await step('navigator.storage.persist()', async () => {
    if (!navigator.storage?.persist) throw new Error('Not available')
    const granted = await navigator.storage.persist()
    const est = await navigator.storage.estimate()
    const mb = (n?: number) => (n ? `${Math.round(n / 1e6)}MB` : '?')
    return { value: true, detail: `granted: ${granted}, usage ${mb(est.usage)} of ${mb(est.quota)}` }
  })

  finish()
}

function finish() {
  runBtn.disabled = false
  copyBtn.hidden = false
}

copyBtn.addEventListener('click', async () => {
  const text = lines.map((l) => `[${l.status.toUpperCase()}] ${l.name}\n${l.detail}`).join('\n\n')
  let safe = token ? text.replaceAll(token, '<token>') : text
  if (oauth) safe = safe.replaceAll(oauth.token, '<oauth_token>').replaceAll(oauth.secret, '<oauth_secret>')
  await navigator.clipboard.writeText(safe)
  $('copied').hidden = false
})

runBtn.addEventListener('click', run)
$('signout').addEventListener('click', () => {
  sessionStorage.removeItem('oauth')
  location.reload()
})
readOAuth()
