// Handles /api/*. Everything else is served from static assets.
// For Discogs requests the Worker only signs: the browser sends them itself (sign-in steps
// included), so Discogs sees the user's IP. The one call it makes itself is asking Discogs whose
// sign-in it is, the first time a device turns on cloud sync (see sync.ts).

import { header, signParams } from './oauth'
import { askDiscogs, forget, loginHash, parseLogin, parseRows, pull, push, remember, SyncError, whoIs, type DB } from './sync'

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> }
type Fetcher = { fetch(req: Request): Promise<Response> }

interface Env {
  DISCOGS_CONSUMER_KEY: string
  DISCOGS_CONSUMER_SECRET: string
  SIGN_LIMITER: RateLimiter
  AUTH_LIMITER: RateLimiter
  SYNC_LIMITER: RateLimiter
  ASSETS: Fetcher
  DB?: DB
  SYNC_KEY?: string
  DEV_IDENTITY?: string // local testing only (.dev.vars): every sign-in belongs to this username
}

async function allowed(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true // not bound in local dev
  const { success } = await limiter.limit({ key })
  return success
}

const ipKey = (req: Request) => `ip:${req.headers.get('CF-Connecting-IP') ?? 'unknown'}`

// Limit per signed-in user rather than per IP, so people sharing a network
// don't slow each other down. The token is hashed so it isn't used as-is.
async function userKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return 'user:' + [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const tooMany = () => new Response('Too many requests', { status: 429, headers: { 'Retry-After': '60' } })

const API = 'https://api.discogs.com'
const ALLOWED_ORIGINS = ['https://platter.tadinada.com', 'http://localhost:5173', 'http://127.0.0.1:5173']
// preview builds (wrangler versions upload --preview-alias), which only this Cloudflare account can make
const PREVIEW = /^https:\/\/[a-z0-9-]+-platter\.tadinada\.workers\.dev$/
const allowedOrigin = (req: Request) => {
  const origin = req.headers.get('Origin') ?? ''
  return ALLOWED_ORIGINS.includes(origin) || PREVIEW.test(origin)
}
const MAX_BATCH = 60

type SignRequest = {
  token?: string
  tokenSecret?: string
  requests: { method: string; url: string; oauth?: Record<string, string> }[]
}

// Sign-in steps the browser does itself, so Discogs sees the user's IP
// rather than Cloudflare's shared one.
const REQUEST_TOKEN = `${API}/oauth/request_token`
const ACCESS_TOKEN = `${API}/oauth/access_token`
const EXTRA_OAUTH = new Set(['oauth_callback', 'oauth_verifier'])

function validRequest(r: SignRequest['requests'][number], signedIn: boolean): boolean {
  if (typeof r?.url !== 'string' || typeof r.method !== 'string' || !r.url.startsWith(API + '/')) return false
  const extra = Object.keys(r.oauth ?? {})
  if (!extra.every((k) => EXTRA_OAUTH.has(k) && typeof r.oauth![k] === 'string')) return false
  // without a token the only thing worth signing is the first sign-in step
  if (!signedIn) return r.url === REQUEST_TOKEN && r.method === 'GET' && extra.every((k) => k === 'oauth_callback')
  if (extra.includes('oauth_callback')) return false
  if (extra.includes('oauth_verifier')) return r.url === ACCESS_TOKEN && r.method === 'POST'
  return true
}

async function sign(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!allowedOrigin(req)) return new Response('Forbidden', { status: 403 })

  let input: SignRequest
  try {
    input = await req.json()
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }
  const { token, tokenSecret, requests } = input
  const signedIn = typeof token === 'string' && token.length > 0
  if ((token !== undefined && typeof token !== 'string') || (tokenSecret !== undefined && typeof tokenSecret !== 'string')) {
    return new Response('Bad request', { status: 400 })
  }
  if (!Array.isArray(requests) || !requests.length || requests.length > MAX_BATCH) return new Response('Bad request', { status: 400 })
  // only ever sign requests to the Discogs API
  if (!requests.every((r) => validRequest(r, signedIn))) return new Response('Bad request', { status: 400 })

  const limiter = signedIn ? env.SIGN_LIMITER : env.AUTH_LIMITER
  if (!(await allowed(limiter, signedIn ? await userKey(token!) : ipKey(req)))) return tooMany()

  const params = await Promise.all(
    requests.map((r) =>
      signParams({
        method: r.method,
        url: r.url,
        consumerKey: env.DISCOGS_CONSUMER_KEY,
        consumerSecret: env.DISCOGS_CONSUMER_SECRET,
        token,
        tokenSecret,
        oauth: r.oauth,
      }),
    ),
  )
  // headers for normal API calls; params for the sign-in steps, which have
  // to go in the query string (Discogs fails the CORS preflight on those)
  return Response.json({ headers: params.map(header), params }, { headers: { 'Cache-Control': 'no-store' } })
}

async function sync(req: Request, env: Env, action: 'pull' | 'push' | 'forget'): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!allowedOrigin(req)) return new Response('Forbidden', { status: 403 })
  const db = env.DB
  if (!db) return Response.json({ error: "Sync isn't set up" }, { status: 503 })
  const noStore = { 'Cache-Control': 'no-store' }
  try {
    let input: { login?: unknown; since?: unknown; rows?: unknown; check?: unknown }
    try {
      input = await req.json()
    } catch {
      throw new SyncError(400, 'Bad JSON')
    }
    const login = parseLogin(input.login)
    if (!(await allowed(env.SYNC_LIMITER, `sync:${(await loginHash(login)).slice(0, 32)}`))) return tooMany()
    const ask = async (l: typeof login) => {
      if (env.DEV_IDENTITY) return env.DEV_IDENTITY
      // checking with Discogs is the costly part, so it gets the stricter per-IP limit
      if (!(await allowed(env.AUTH_LIMITER, ipKey(req)))) throw new SyncError(429, 'Too many requests')
      return askDiscogs(l, { ...env, DB: db })
    }
    // A new device checking whether its account syncs leaves nothing behind unless it does.
    // Otherwise a confirmed sign-in is kept, so it isn't checked with Discogs on every call.
    const check = action === 'pull' && input.check === true
    const { username, hash } = await whoIs(db, login, ask, Date.now(), !check)
    const syncEnv = { ...env, DB: db }
    if (action === 'pull') {
      const since = Number(input.since ?? 0)
      if (!Number.isInteger(since) || since < 0) throw new SyncError(400, 'Bad cursor')
      const result = await pull(db, syncEnv, username, since)
      if (check && result.exists) await remember(db, hash, username)
      // a device that was syncing, finding the account deleted: it switches off, and its sign-in goes too
      if (!result.exists && since > 0) await db.prepare('DELETE FROM logins WHERE hash = ?1').bind(hash).run()
      return Response.json(result, { headers: noStore })
    }
    if (action === 'push') return Response.json(await push(db, syncEnv, username, parseRows(input.rows)), { headers: noStore })
    await forget(db, username)
    return Response.json({ ok: true }, { headers: noStore })
  } catch (e) {
    if (e instanceof SyncError) return Response.json({ error: e.message }, { status: e.status, headers: noStore })
    throw e
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (pathname.startsWith('/assets/')) {
      // A missing file (an old build's chunk) would otherwise get index.html with the
      // assets' year-long cache header, and the browser would keep it as the script
      const res = await env.ASSETS.fetch(req)
      if (!res.headers.get('Content-Type')?.startsWith('text/html')) return res
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    switch (pathname) {
      case '/api/sign':
        return sign(req, env)
      case '/api/sync/pull':
        return sync(req, env, 'pull')
      case '/api/sync/push':
        return sync(req, env, 'push')
      case '/api/sync/forget':
        return sync(req, env, 'forget')
      case '/api/health':
        return Response.json({
          ok: true,
          consumerKey: Boolean(env.DISCOGS_CONSUMER_KEY),
          consumerSecret: Boolean(env.DISCOGS_CONSUMER_SECRET),
        })
      default:
        return new Response('Not found', { status: 404 })
    }
  },
}
