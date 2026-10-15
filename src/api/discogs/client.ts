import type { Auth } from '../../auth/types'
import { DISCOGS_MAX_AGE, readCache, writeCache } from '../../db/cache'

export const API_BASE = 'https://api.discogs.com'

export class DiscogsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export class OfflineError extends Error {
  constructor() {
    super("Can't reach Discogs. Check your connection.")
  }
}

type Sleep = (ms: number) => Promise<void>
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Sliding-window limiter. Discogs allows 60/min per IP and the browser can't
// read their rate-limit headers, so we stay a little under that.
export class RateLimiter {
  private stamps: number[] = []

  constructor(
    private limit = 55,
    private windowMs = 60_000,
    private now = () => Date.now(),
    private sleep: Sleep = realSleep,
  ) {}

  get perMinute(): number {
    return (this.limit * 60_000) / this.windowMs
  }

  // ms until the next request is allowed
  delay(): number {
    const t = this.now()
    this.stamps = this.stamps.filter((s) => t - s < this.windowMs)
    if (this.stamps.length < this.limit) return 0
    return this.windowMs - (t - this.stamps[0])
  }

  async take(onWait?: (ms: number) => void): Promise<void> {
    for (let d = this.delay(); d > 0; d = this.delay()) {
      onWait?.(d)
      await this.sleep(d)
    }
    this.stamps.push(this.now())
  }

  // after a 429 the server window is full, so treat ours as full too
  fill(): void {
    const t = this.now()
    this.stamps = Array(this.limit).fill(t)
  }
}

export type ClientStatus = {
  active: number // requests in flight or waiting
  waitUntil: number | null // set while waiting on the rate limit or a retry
}

type Query = Record<string, string | number | undefined>
type RequestOpts = { query?: Query; body?: unknown; cacheMaxAge?: number }

export function buildUrl(path: string, query?: Query): string {
  const parts = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return API_BASE + path + (parts.length ? '?' + parts.join('&') : '')
}

const RETRY_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000]

export class DiscogsClient {
  private listeners = new Set<() => void>()
  private _status: ClientStatus = { active: 0, waitUntil: null }

  constructor(
    public auth: Auth,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private limiter = new RateLimiter(),
    private sleep: Sleep = realSleep,
    private now = () => Date.now(),
    // requests that never reach Discogs (the demo answers some itself) skip the limiter
    private local: (url: string) => boolean = () => false,
  ) {}

  get requestsPerMinute(): number {
    return this.limiter.perMinute
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

  get<T>(path: string, query?: Query, cacheMaxAge?: number): Promise<T> {
    return this.request<T>('GET', path, { query, cacheMaxAge })
  }

  async request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    const url = buildUrl(path, opts.query)
    const cacheKey = `discogs:${url}`
    if (method === 'GET' && opts.cacheMaxAge) {
      const hit = await readCache<T>(cacheKey, Math.min(opts.cacheMaxAge, DISCOGS_MAX_AGE))
      if (hit !== undefined) return hit
    }

    this.setStatus({ active: this._status.active + 1 })
    try {
      const data = await this.send<T>(method, url, opts.body)
      if (method === 'GET' && opts.cacheMaxAge) await writeCache(cacheKey, data)
      return data
    } finally {
      this.setStatus({ active: this._status.active - 1 })
    }
  }

  private async send<T>(method: string, url: string, body: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (!this.local(url)) await this.limiter.take((ms) => this.setStatus({ waitUntil: this.now() + ms }))
      this.setStatus({ waitUntil: null })

      const headers: Record<string, string> = await this.auth.getAuthHeaders({ method, url })
      if (body !== undefined) headers['Content-Type'] = 'application/json'

      let res: Response
      try {
        res = await this.fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      } catch {
        // Discogs sends 429s without CORS headers, so a busy rate limit looks like a
        // network error. If the device thinks it's online, wait and try again.
        if (navigator.onLine !== false && attempt < RETRY_DELAYS.length - 1) {
          const wait = RETRY_DELAYS[attempt]
          this.setStatus({ waitUntil: this.now() + wait })
          await this.sleep(wait)
          continue
        }
        throw new OfflineError()
      }

      const retryable = res.status === 429 || res.status >= 500
      if (retryable && attempt < RETRY_DELAYS.length) {
        if (res.status === 429) this.limiter.fill()
        const wait = RETRY_DELAYS[attempt]
        this.setStatus({ waitUntil: this.now() + wait })
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
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
