// Handles /api/*. Everything else is served from static assets.
// The Worker never talks to Discogs: it signs requests (including the sign-in steps) that the
// browser then sends itself, so Discogs sees the user's IP. Discogs turns away requests from
// Cloudflare's shared addresses, which is also why cloud sync has accounts of its own (see sync.ts).

import { header, signParams } from './oauth'
import {
  deviceAccount,
  forget,
  leave,
  nameExists,
  newPairing,
  parseName,
  parseProof,
  parseRows,
  pull,
  push,
  setOff,
  setPassword,
  sha256,
  signIn,
  SyncError,
  usePairing,
  type DB,
} from './sync'

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> }
type Fetcher = { fetch(req: Request): Promise<Response> }

interface Env {
  DISCOGS_CONSUMER_KEY: string
  DISCOGS_CONSUMER_SECRET: string
  SIGN_LIMITER: RateLimiter
  AUTH_LIMITER: RateLimiter
  SYNC_LIMITER: RateLimiter
  LOGIN_LIMITER: RateLimiter
  ASSETS: Fetcher
  DB?: DB
  SYNC_KEY?: string
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

const SYNC_ACTIONS = ['exists', 'signin', 'join', 'pull', 'push', 'pair', 'password', 'off', 'leave', 'forget'] as const
type SyncAction = (typeof SYNC_ACTIONS)[number]

async function sync(req: Request, env: Env, action: SyncAction): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!allowedOrigin(req)) return new Response('Forbidden', { status: 403 })
  const db = env.DB
  if (!db) return Response.json({ error: "Sync isn't set up" }, { status: 503 })
  const ok = (body: unknown) => Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
  try {
    let input: Record<string, unknown>
    try {
      input = await req.json()
    } catch {
      throw new SyncError(400, 'Bad JSON')
    }

    // Getting in: the per-IP limit for sign-in, and for passwords a per-name one too, so nobody can
    // guess their way into an account however many addresses they use
    if (action === 'exists' || action === 'signin' || action === 'join') {
      if (!(await allowed(env.AUTH_LIMITER, ipKey(req)))) return tooMany()
      if (action === 'join') return ok(await usePairing(db, input.code))
      const name = parseName(input.name)
      if (action === 'exists') return ok({ exists: await nameExists(db, name) })
      if (!(await allowed(env.LOGIN_LIMITER, `name:${name}`))) return tooMany()
      return ok(await signIn(db, name, parseProof(input.proof), input.fresh === true))
    }

    // everything else is from a device that's already in
    if (typeof input.device !== 'string' || !(await allowed(env.SYNC_LIMITER, `device:${(await sha256(input.device)).slice(0, 32)}`))) {
      return tooMany()
    }
    const account = await deviceAccount(db, input.device)
    const syncEnv = { DB: db, SYNC_KEY: env.SYNC_KEY }
    switch (action) {
      case 'pull': {
        const since = Number(input.since ?? 0)
        if (!Number.isInteger(since) || since < 0) throw new SyncError(400, 'Bad cursor')
        return ok(await pull(db, syncEnv, account, since))
      }
      case 'push':
        return ok(await push(db, syncEnv, account, parseRows(input.rows)))
      case 'pair':
        return ok(await newPairing(db, account))
      case 'password':
        await setPassword(db, account, parseProof(input.proof))
        return ok({ ok: true })
      case 'off':
        return ok({ off: await setOff(db, account, input.off) })
      case 'leave':
        await leave(db, input.device)
        return ok({ ok: true })
      case 'forget':
        await forget(db, account)
        return ok({ ok: true })
    }
  } catch (e) {
    if (e instanceof SyncError) return Response.json({ error: e.message }, { status: e.status, headers: { 'Cache-Control': 'no-store' } })
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
    const syncAction = pathname.startsWith('/api/sync/') ? (pathname.slice(10) as SyncAction) : null
    if (syncAction && SYNC_ACTIONS.includes(syncAction)) return sync(req, env, syncAction)
    switch (pathname) {
      case '/api/sign':
        return sign(req, env)
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
