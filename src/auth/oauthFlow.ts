// "Log in with Discogs", done from the browser so Discogs sees the user's IP.
// The Worker only signs each step (it holds the app secret). The signature goes
// in the query string because Discogs fails CORS preflights on these two URLs.

const API = 'https://api.discogs.com'
const REQUEST_TOKEN = `${API}/oauth/request_token`
const ACCESS_TOKEN = `${API}/oauth/access_token`
const PENDING_KEY = 'platter.oauthPending'
const PENDING_MAX_AGE = 15 * 60 * 1000

export class SignInError extends Error {}

const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${pct(k)}=${pct(v)}`)
    .join('&')

type SignBody = { token?: string; tokenSecret?: string; requests: { method: string; url: string; oauth: Record<string, string> }[] }

async function signStep(body: SignBody, fetchFn: typeof fetch): Promise<Record<string, string>> {
  const res = await fetchFn('/api/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.status === 429) throw new SignInError('Too many sign-in attempts from this network. Wait a minute and try again.')
  if (!res.ok) throw new SignInError(`Couldn't start sign-in (${res.status}).`)
  return ((await res.json()) as { params: Record<string, string>[] }).params[0]
}

async function discogsStep(url: string, method: string, fetchFn: typeof fetch) {
  let res: Response
  try {
    res = await fetchFn(url, { method, headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined })
  } catch {
    throw new SignInError("Can't reach Discogs. Check your connection.")
  }
  if (res.status === 429) throw new SignInError('Discogs is busy right now. Wait a minute and try again.')
  if (!res.ok) throw new SignInError(`Discogs didn't accept the sign-in (${res.status}). Try again.`)
  return new URLSearchParams(await res.text())
}

// Step 1: get a request token, remember its secret, send the user to Discogs
export async function startOAuth(fetchFn: typeof fetch = fetch, go = (url: string) => location.assign(url)) {
  const params = await signStep(
    { requests: [{ method: 'GET', url: REQUEST_TOKEN, oauth: { oauth_callback: `${location.origin}/auth/callback` } }] },
    fetchFn,
  )
  const body = await discogsStep(`${REQUEST_TOKEN}?${query(params)}`, 'GET', fetchFn)
  const token = body.get('oauth_token')
  const secret = body.get('oauth_token_secret')
  if (!token || !secret) throw new SignInError('Discogs sent back an unexpected answer. Try again.')
  // localStorage rather than sessionStorage: some browsers come back in a new tab
  localStorage.setItem(PENDING_KEY, JSON.stringify({ token, secret, at: Date.now() }))
  go(`https://www.discogs.com/oauth/authorize?oauth_token=${pct(token)}`)
}

// Step 2: Discogs sends the user back to /auth/callback; trade the verifier for an access token
export async function finishOAuth(search: string, fetchFn: typeof fetch = fetch): Promise<{ token: string; secret: string }> {
  const p = new URLSearchParams(search)
  const token = p.get('oauth_token')
  const verifier = p.get('oauth_verifier')
  const saved = localStorage.getItem(PENDING_KEY)
  localStorage.removeItem(PENDING_KEY)
  if (p.has('denied')) throw new SignInError('Sign-in was cancelled on Discogs.')
  const pending = saved ? (JSON.parse(saved) as { token: string; secret: string; at: number }) : null
  if (!token || !verifier || !pending || pending.token !== token || Date.now() - pending.at > PENDING_MAX_AGE) {
    throw new SignInError('Sign-in expired or was started in another browser. Try again.')
  }
  const params = await signStep(
    {
      token: pending.token,
      tokenSecret: pending.secret,
      requests: [{ method: 'POST', url: ACCESS_TOKEN, oauth: { oauth_verifier: verifier } }],
    },
    fetchFn,
  )
  const body = await discogsStep(`${ACCESS_TOKEN}?${query(params)}`, 'POST', fetchFn)
  const access = body.get('oauth_token')
  const accessSecret = body.get('oauth_token_secret')
  if (!access || !accessSecret) throw new SignInError('Discogs sent back an unexpected answer. Try again.')
  return { token: access, secret: accessSecret }
}
