// Finds out for certain whose Discogs login a browser holds. The Worker can't reach Discogs itself
// (Discogs turns away Cloudflare's shared addresses), but a Browser Run browser can, so the
// identity call goes through one. Only used when an account is made or a new device joins one.
// Nothing about the login is stored or logged.

import puppeteer from '@cloudflare/puppeteer'
import { header, signParams } from './oauth'
import { SyncError } from './sync'

export const IDENTITY = 'https://api.discogs.com/oauth/identity'

// A personal token has no secret; an OAuth login has both
export type Login = { token: string; tokenSecret?: string }
export type Identity = { id: number; username: string }

// Opens a URL with these headers and gives back what came back. The real one drives Browser Run;
// tests pass their own.
export type Browse = (url: string, headers: Record<string, string>) => Promise<{ status: number; body: string }>

export class Busy extends Error {}

export function parseLogin(x: unknown): Login {
  const l = x as Login | null
  const ok =
    l &&
    typeof l.token === 'string' &&
    l.token.length > 0 &&
    l.token.length <= 200 &&
    (l.tokenSecret === undefined || (typeof l.tokenSecret === 'string' && l.tokenSecret.length <= 200))
  if (!ok) throw new SyncError(400, 'Bad login')
  return { token: l.token, tokenSecret: l.tokenSecret }
}

export async function authorization(login: Login, consumerKey: string, consumerSecret: string): Promise<string> {
  if (login.tokenSecret === undefined) return `Discogs token=${login.token}`
  return header(
    await signParams({ method: 'GET', url: IDENTITY, consumerKey, consumerSecret, token: login.token, tokenSecret: login.tokenSecret }),
  )
}

export async function confirm(login: Login, browse: Browse, consumerKey: string, consumerSecret: string): Promise<Identity> {
  let res: { status: number; body: string }
  try {
    res = await browse(IDENTITY, { Authorization: await authorization(login, consumerKey, consumerSecret) })
  } catch (e) {
    if (e instanceof Busy) throw new SyncError(503, "Can't check with Discogs right now")
    throw e
  }
  if (res.status === 401 || res.status === 403) throw new SyncError(401, 'Discogs turned down the login')
  if (res.status === 429 || res.status >= 500) throw new SyncError(503, "Can't check with Discogs right now")
  let who: Partial<Identity>
  try {
    who = JSON.parse(res.body)
  } catch {
    throw new SyncError(503, "Can't check with Discogs right now")
  }
  if (res.status !== 200 || !Number.isInteger(who.id) || typeof who.username !== 'string') {
    throw new SyncError(503, "Can't check with Discogs right now")
  }
  return { id: who.id!, username: who.username }
}

type Endpoint = Parameters<typeof puppeteer.launch>[0]
const WAIT_AT_MOST = 25_000

async function launch(binding: Endpoint) {
  try {
    return await puppeteer.launch(binding)
  } catch {
    // The free plan starts one browser every 20 seconds. If that's all that's in the way, wait for
    // it once; anything else (all in use, the day's time used up) means not now.
    const limits = (await puppeteer.limits(binding).catch(() => null)) as { timeUntilNextAllowedBrowserAcquisition?: number } | null
    const wait = limits?.timeUntilNextAllowedBrowserAcquisition
    if (typeof wait !== 'number' || wait > WAIT_AT_MOST) throw new Busy()
    await new Promise((r) => setTimeout(r, wait + 500))
    return puppeteer.launch(binding).catch(() => {
      throw new Busy()
    })
  }
}

// One browser per check, closed straight after, so no browser time is spent waiting around
export function browserRun(binding: unknown): Browse {
  return async (url, headers) => {
    const browser = await launch(binding as Endpoint)
    try {
      const page = await browser.newPage()
      await page.setExtraHTTPHeaders(headers)
      const res = await page.goto(url, { timeout: 15_000 })
      if (!res) throw new Busy()
      return { status: res.status(), body: await res.text() }
    } catch (e) {
      // Discogs didn't answer in time, or the browser went away
      throw e instanceof Busy ? e : new Busy()
    } finally {
      await browser.close().catch(() => {})
    }
  }
}
