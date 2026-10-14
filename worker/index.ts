// Handles /api/* and /auth/*. Everything else is served from static assets.
// The Worker never sees record data: it only runs the sign-in handshake and
// signs requests that the browser then sends to Discogs itself.

import { plaintextHeader, signHmac } from './oauth'

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> }

interface Env {
  DISCOGS_CONSUMER_KEY: string
  DISCOGS_CONSUMER_SECRET: string
  SIGN_LIMITER: RateLimiter
  AUTH_LIMITER: RateLimiter
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

const UA = 'Platter/0.1 +https://platter.tadinada.com'
const API = 'https://api.discogs.com'
const ALLOWED_ORIGINS = ['https://platter.tadinada.com', 'http://localhost:5173']
const MAX_BATCH = 60
const COOKIE = 'platter_rts'

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } })
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('Cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
}

async function startSignIn(req: Request, env: Env): Promise<Response> {
  const callback = new URL('/auth/callback', req.url).toString()
  const res = await fetch(`${API}/oauth/request_token`, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: plaintextHeader(env.DISCOGS_CONSUMER_KEY, env.DISCOGS_CONSUMER_SECRET, { oauth_callback: callback }),
    },
  })
  const body = new URLSearchParams(await res.text())
  const token = body.get('oauth_token')
  const secret = body.get('oauth_token_secret')
  if (!res.ok || !token || !secret) return redirect(`/#auth_error=request_token_${res.status}`)

  // request token secret is needed again on the callback; keep it in a short-lived cookie
  const cookie = `${COOKIE}=${encodeURIComponent(secret)}; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
  return redirect(`https://www.discogs.com/oauth/authorize?oauth_token=${encodeURIComponent(token)}`, { 'Set-Cookie': cookie })
}

async function finishSignIn(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const token = url.searchParams.get('oauth_token')
  const verifier = url.searchParams.get('oauth_verifier')
  const requestSecret = readCookie(req, COOKIE)
  const clear = { 'Set-Cookie': `${COOKIE}=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax` }
  if (!token || !verifier || !requestSecret) return redirect('/#auth_error=missing_params', clear)

  const res = await fetch(`${API}/oauth/access_token`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: plaintextHeader(
        env.DISCOGS_CONSUMER_KEY,
        env.DISCOGS_CONSUMER_SECRET,
        { oauth_token: token, oauth_verifier: verifier },
        requestSecret,
      ),
    },
  })
  const body = new URLSearchParams(await res.text())
  const access = body.get('oauth_token')
  const accessSecret = body.get('oauth_token_secret')
  if (!res.ok || !access || !accessSecret) return redirect(`/#auth_error=access_token_${res.status}`, clear)

  // hand tokens to the page in the fragment so they never hit a server log
  const frag = new URLSearchParams({ oauth_token: access, oauth_token_secret: accessSecret })
  return redirect(`/#${frag}`, clear)
}

type SignRequest = { token: string; tokenSecret: string; requests: { method: string; url: string }[] }

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
  if (typeof token !== 'string' || typeof tokenSecret !== 'string' || !Array.isArray(requests) || requests.length > MAX_BATCH) {
    return new Response('Bad request', { status: 400 })
  }
  if (!(await allowed(env.SIGN_LIMITER, await userKey(token)))) return tooMany()
  // only ever sign requests to the Discogs API
  if (!requests.every((r) => typeof r.url === 'string' && r.url.startsWith(API + '/') && typeof r.method === 'string')) {
    return new Response('Bad request', { status: 400 })
  }

  const headers = await Promise.all(
    requests.map((r) =>
      signHmac({
        method: r.method,
        url: r.url,
        consumerKey: env.DISCOGS_CONSUMER_KEY,
        consumerSecret: env.DISCOGS_CONSUMER_SECRET,
        token,
        tokenSecret,
      }),
    ),
  )
  return Response.json({ headers }, { headers: { 'Cache-Control': 'no-store' } })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
    switch (pathname) {
      case '/auth/start':
        return (await allowed(env.AUTH_LIMITER, ipKey(req))) ? startSignIn(req, env) : tooMany()
      case '/auth/callback':
        return finishSignIn(req, env)
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
