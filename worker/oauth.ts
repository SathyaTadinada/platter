// OAuth 1.0a helpers. Pure functions, no Worker globals besides crypto.

export function pct(s: string): string {
  // RFC 3986 encoding, stricter than encodeURIComponent
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

export function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function baseString(method: string, url: string, params: [string, string][]): string {
  const u = new URL(url)
  const all: [string, string][] = [...params, ...u.searchParams.entries()]
  const normalized = all
    .map(([k, v]) => [pct(k), pct(v)])
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = `${u.protocol}//${u.host}${u.pathname}`
  return [method.toUpperCase(), pct(base), pct(normalized)].join('&')
}

export async function hmacSha1(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
  return btoa(String.fromCharCode(...sig))
}

export function header(params: Record<string, string>): string {
  return (
    'OAuth ' +
    Object.entries(params)
      .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
      .join(', ')
  )
}

type SignInput = {
  method: string
  url: string
  consumerKey: string
  consumerSecret: string
  token?: string // absent when asking for a request token
  tokenSecret?: string
  oauth?: Record<string, string> // extra oauth_* params, e.g. oauth_callback, oauth_verifier
  extra?: [string, string][] // form body params, if any
  timestamp?: string
  nonce?: string
}

// All oauth_* params for a request, signed with HMAC-SHA1. They can go in
// an Authorization header or in the query string.
export async function signParams(i: SignInput): Promise<Record<string, string>> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: i.consumerKey,
    oauth_nonce: i.nonce ?? nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: i.timestamp ?? String(Math.floor(Date.now() / 1000)),
    ...(i.token ? { oauth_token: i.token } : {}),
    oauth_version: '1.0',
    ...i.oauth,
  }
  const base = baseString(i.method, i.url, [...Object.entries(oauth), ...(i.extra ?? [])])
  oauth.oauth_signature = await hmacSha1(`${pct(i.consumerSecret)}&${pct(i.tokenSecret ?? '')}`, base)
  return oauth
}

// Returns a full Authorization header value signed with HMAC-SHA1.
export async function signHmac(i: SignInput): Promise<string> {
  return header(await signParams(i))
}
