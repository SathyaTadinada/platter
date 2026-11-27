import type { Auth } from '../../auth/types'
import { DISCOGS_MAX_AGE, readCache, readCatalog, writeCache } from '../../db/cache'

const API_BASE = 'https://api.discogs.com'

export class DiscogsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Also what a run of 429s looks like (see send), so it only blames the connection when the
// device says it's offline
export class OfflineError extends Error {
  constructor(online = typeof navigator === 'undefined' || navigator.onLine !== false) {
    super(online ? "Discogs isn't answering right now." : "You're offline.")
  }
}

type Sleep = (ms: number) => Promise<void>
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Sliding-window limiter. Discogs allows 60/min per IP and the browser can't
// read their rate-limit headers, so we stay a little under that. Background work (prices,
// album years) only gets part of the window, so whatever someone is doing never waits on it.
export class RateLimiter {
  private stamps: number[] = []
  private quietUntil = 0
  private slowUntil = 0

  constructor(
    private limit = 55,
    private windowMs = 60_000,
    private now = () => Date.now(),
    private sleep: Sleep = realSleep,
    private backgroundShare = 0.6,
  ) {}

  get perMinute(): number {
    return (this.limit * 60_000) / this.windowMs
  }

  // ms until the next request is allowed
  delay(background = false): number {
    const t = this.now()
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs)
    const room = background ? Math.ceil(this.limit * this.backgroundShare) : this.limit
    const wait = this.stamps.length < room ? 0 : this.windowMs - (t - this.stamps[this.stamps.length - room])
    return background ? Math.max(wait, this.quietUntil - t) : wait
  }

  async take(onWait?: (ms: number) => void, background = false): Promise<void> {
    for (let d = this.delay(background); d > 0; d = this.delay(background)) {
      onWait?.(d)
      await this.sleep(d)
    }
    this.stamps.push(this.now())
  }

  // Discogs turned a request down, so its count is over even if ours isn't (another tab or
  // device on the same connection, say). Background work stops for a minute and then goes slowly
  // for ten; what the user is waiting on retries sooner.
  backOff(): void {
    this.quietUntil = this.now() + this.windowMs
    this.slowUntil = this.now() + 10 * this.windowMs
  }

  get slowed(): boolean {
    return this.now() < this.slowUntil
  }
}

export type ClientStatus = {
  active: number // requests in flight or waiting
  waitUntil: number | null // set while waiting on the rate limit or a retry
}

type Query = Record<string, string | number | undefined>
// catalog: kept a month (see readCatalog); 'whole' when the photos and prices are needed too
type RequestOpts = { query?: Query; body?: unknown; cacheMaxAge?: number; catalog?: 'trimmed' | 'whole' }

export function buildUrl(path: string, query?: Query): string {
  const parts = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return API_BASE + path + (parts.length ? '?' + parts.join('&') : '')
}

const RETRY_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000]

// A GET with no headers of its own goes without the browser's CORS preflight, which Discogs counts
// against the rate limit like any other request, so it'd cost two. Discogs takes the sign-in in the
// query string as well. Returns null for a sign-in it can't move.
export function signedUrl(url: string, authorization: string | undefined): string | null {
  if (!authorization) return url
  const join = url.includes('?') ? '&' : '?'
  const token = /^Discogs token=(.+)$/.exec(authorization)
  if (token) return `${url}${join}token=${encodeURIComponent(token[1])}`
  if (!authorization.startsWith('OAuth ')) return null
  // the header's values are already encoded for a URL
  const params = [...authorization.matchAll(/([\w%.~-]+)="([^"]*)"/g)].map(([, k, v]) => `${k}=${v}`)
  return params.length ? url + join + params.join('&') : null
}

export class DiscogsClient {
  private listeners = new Set<() => void>()
  private _status: ClientStatus = { active: 0, waitUntil: null }
  // when each request waiting now will try again, so one finishing doesn't hide another's wait
  private waits = new Map<object, number>()
  // shared with the background client. Off once Discogs turns down an OAuth sign-in in the URL
  // that it takes in a header.
  private shared = { oauthInUrl: true }

  constructor(
    public auth: Auth,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private limiter = new RateLimiter(),
    private sleep: Sleep = realSleep,
    private now = () => Date.now(),
    // requests that never reach Discogs (the demo answers some itself) skip the limiter
    private local: (url: string) => boolean = () => false,
    private isBackground = false,
  ) {}

  get requestsPerMinute(): number {
    return this.limiter.perMinute
  }

  // Discogs turned something down in the last few minutes
  get slowed(): boolean {
    return this.limiter.slowed
  }

  // The same client for background work (prices, original years): it shares the rate limit,
  // leaving part of it free for everything else, and its waits stay out of the status bar,
  // since nobody is waiting on them
  private bg?: DiscogsClient
  get background(): DiscogsClient {
    if (!this.bg) {
      this.bg = new DiscogsClient(this.auth, this.fetchFn, this.limiter, this.sleep, this.now, this.local, true)
      this.bg.shared = this.shared
    }
    return this.bg
  }

  get status(): ClientStatus {
    return this._status
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private setStatus(patch: Partial<ClientStatus>) {
    this._status = { ...this._status, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  private setWait(request: object, ms: number | null) {
    if (ms === null) this.waits.delete(request)
    else this.waits.set(request, this.now() + ms)
    this.setStatus({ waitUntil: this.waits.size ? Math.max(...this.waits.values()) : null })
  }

  // Requests about to be made, signed ahead in one go (see oauthAuth). Best effort: anything not
  // signed here is signed when it's sent.
  async prepare(gets: { path: string; query?: Query }[]): Promise<void> {
    const reqs = gets.map((g) => ({ method: 'GET', url: buildUrl(g.path, g.query) })).filter((r) => !this.local(r.url))
    if (reqs.length) await this.auth.prepare(reqs).catch(() => {})
  }

  get<T>(path: string, query?: Query, cacheMaxAge?: number): Promise<T> {
    return this.request<T>('GET', path, { query, cacheMaxAge })
  }

  async request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    const url = buildUrl(path, opts.query)
    const catalog = method === 'GET' && opts.catalog
    const cached = method === 'GET' && (catalog || opts.cacheMaxAge)
    const cacheKey = `${catalog ? 'catalog' : 'discogs'}:${url}`
    if (catalog) {
      const hit = await readCatalog<T>(cacheKey, catalog === 'whole')
      if (hit !== undefined) return hit
    } else if (cached) {
      const hit = await readCache<T>(cacheKey, Math.min(opts.cacheMaxAge!, DISCOGS_MAX_AGE))
      if (hit !== undefined) return hit
    }

    this.setStatus({ active: this._status.active + 1 })
    try {
      const data = await this.send<T>(method, url, opts.body)
      if (cached) await writeCache(cacheKey, data)
      return data
    } finally {
      this.setStatus({ active: this._status.active - 1 })
    }
  }

  private async send<T>(method: string, url: string, body: unknown): Promise<T> {
    const me = {}
    try {
      for (let attempt = 0; ; attempt++) {
        if (!this.local(url)) await this.limiter.take((ms) => this.setWait(me, ms), this.isBackground)
        this.setWait(me, null)

        const headers: Record<string, string> = await this.auth.getAuthHeaders({ method, url })
        const { Authorization: authorization, ...rest } = headers
        const oauth = authorization?.startsWith('OAuth ') ?? false
        const inUrl = method === 'GET' && (!oauth || this.shared.oauthInUrl) ? signedUrl(url, authorization) : null
        const sendHeaders = inUrl === null ? headers : rest
        if (body !== undefined) sendHeaders['Content-Type'] = 'application/json'

        let res: Response
        try {
          res = await this.fetchFn(inUrl ?? url, {
            method,
            headers: sendHeaders,
            body: body === undefined ? undefined : JSON.stringify(body),
          })
        } catch {
          // Discogs sends 429s without CORS headers, so a busy rate limit looks like a
          // network error. If the device thinks it's online, wait and try again.
          if (navigator.onLine !== false && attempt < RETRY_DELAYS.length - 1) {
            this.limiter.backOff()
            const wait = RETRY_DELAYS[attempt]
            this.setWait(me, wait)
            await this.sleep(wait)
            continue
          }
          throw new OfflineError()
        }

        // an OAuth sign-in in the URL turned down goes back to the header, for this one and the rest
        if (res.status === 401 && oauth && inUrl !== null && this.shared.oauthInUrl) {
          this.shared.oauthInUrl = false
          continue
        }

        const retryable = res.status === 429 || res.status >= 500
        if (retryable && attempt < RETRY_DELAYS.length) {
          if (res.status === 429) this.limiter.backOff()
          const wait = RETRY_DELAYS[attempt]
          this.setWait(me, wait)
          await this.sleep(wait)
          continue
        }

        const text = await res.text()
        const data = text ? safeJson(text) : null
        if (!res.ok) {
          const msg = (data as { message?: string } | null)?.message ?? `Discogs returned ${res.status}`
          throw new DiscogsError(res.status, msg)
        }
        return data as T
      }
    } finally {
      this.setWait(me, null)
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
