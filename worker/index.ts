// Handles /api/*. Everything else is served from static assets.
// The Worker never talks to Discogs: it signs requests (including the sign-in
// steps) that the browser then sends itself, so Discogs sees the user's IP.

import { header, signParams } from './oauth'

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> }
type Fetcher = { fetch(req: Request): Promise<Response> }

interface Env {
  DISCOGS_CONSUMER_KEY: string
  DISCOGS_CONSUMER_SECRET: string
  SIGN_LIMITER: RateLimiter
  AUTH_LIMITER: RateLimiter
  ASSETS: Fetcher
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
const ALLOWED_ORIGINS = ['https://platter.tadinada.com', 'http://localhost:5173']
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
  if (!ALLOWED_ORIGINS.includes(req.headers.get('Origin') ?? '')) return new Response('Forbidden', { status: 403 })

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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (pathname.startsWith('/assets/')) {
      // A file that isn't there (an old build's chunk, or a new one mid-deploy) would
      // otherwise get the app's index.html, with the year-long cache header assets
      // get, and the browser would keep using that page as the script.
      const res = await env.ASSETS.fetch(req)
      if (!res.headers.get('Content-Type')?.startsWith('text/html')) return res
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
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
