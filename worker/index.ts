// Handles /api/*. Everything else is served from static assets.
// The Worker never talks to Discogs: it signs requests (including the sign-in steps) that the
// browser then sends itself, so Discogs sees the user's IP. Discogs turns away requests from
// Cloudflare's shared addresses. The one exception is confirming whose Discogs login a browser holds,
// which goes through a Browser Run browser (see confirm.ts).

import {
  accountById,
  discogsSignIn,
  link,
  listDevices,
  parseDiscogsId,
  removeDevice,
  removePassword,
  renameDevice,
  waysIn,
} from './account'
import { clearAbout, clearWaysIn, deleteMember, members, requireAdmin, setBadge, setHidden } from './admin'
import { createBadge, deleteBadge, editBadge, listBadges, moveBadge } from './badges'
import { browserRun, confirm, parseLogin } from './confirm'
import { block, feed, follow, lists as followLists, removeFollower, respond, unblock, unfollow, waiting as waitingFollows } from './follow'
import { header, signParams } from './oauth'
import {
  head as profileHead,
  item as profileItem,
  people as profilePeople,
  parseRows as parseProfileRows,
  publish as publishProfile,
  rows as profileRows,
  search as searchProfiles,
  settings as profileSettings,
  setWho,
  setDetails as setProfileDetails,
  setAbout as setProfileAbout,
  setSections,
  sweep as sweepProfile,
  unpublish as unpublishProfile,
} from './profile'
import {
  listPasskeys,
  parsePasskeyName,
  register,
  registerOptions,
  relyingParty,
  removePasskey,
  renamePasskey,
  signInOptions,
  signInWithPasskey,
} from './passkeys'
import {
  deviceAccount,
  forget,
  leave,
  nameDevice,
  nameExists,
  newPairing,
  parseDeviceName,
  parseDeviceKind,
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
  CONFIRM_LIMITER: RateLimiter
  ASSETS: Fetcher
  BROWSER?: unknown
  DB?: DB
  SYNC_KEY?: string
  SITE?: string
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
// The app's own pages, wherever this Worker serves them (its domain, a preview link), and the dev server
const LOCAL = ['http://localhost:5173', 'http://127.0.0.1:5173']
export const allowedOrigin = (req: Request) => {
  const origin = req.headers.get('Origin')
  return origin !== null && (origin === new URL(req.url).origin || LOCAL.includes(origin))
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

const SYNC_ACTIONS = [
  // getting in
  'exists',
  'signin',
  'join',
  'discogs',
  'passkey-signin-options',
  'passkey-signin',
  // a profile anyone with the link can read
  'profile',
  'profile-rows',
  'profile-search',
  'profile-item',
  'profile-people',
  // from a device that's in: sync
  'pull',
  'push',
  'off',
  // the account and its ways in
  'account',
  'link',
  'pair',
  'password',
  'password-remove',
  'leave',
  'forget',
  'devices',
  'device-rename',
  'device-remove',
  'passkey-options',
  'passkey-register',
  'passkeys',
  'passkey-rename',
  'passkey-remove',
  // your own profile
  'profile-settings',
  'profile-sections',
  'profile-who',
  'profile-details',
  'profile-about',
  'profile-publish',
  'profile-sweep',
  'profile-unpublish',
  // following
  'follow',
  'unfollow',
  'follow-respond',
  'follower-remove',
  'block',
  'unblock',
  'follows',
  'feed',
  // admin only
  'admin-members',
  'admin-badge',
  'admin-clear',
  'admin-clear-about',
  'admin-hide',
  'admin-badges',
  'admin-badge-create',
  'admin-badge-rename',
  'admin-badge-delete',
  'admin-badge-move',
  'admin-delete',
] as const
type SyncAction = (typeof SYNC_ACTIONS)[number]
const ENTRY = new Set<SyncAction>(['exists', 'signin', 'join', 'discogs', 'passkey-signin-options', 'passkey-signin'])
// read by anyone who has the link, so they take the per-IP limit rather than a device key
const PUBLIC = new Set<SyncAction>(['profile', 'profile-rows', 'profile-search', 'profile-item', 'profile-people'])

async function sync(req: Request, env: Env, action: SyncAction): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!allowedOrigin(req)) return new Response('Forbidden', { status: 403 })
  const db = env.DB
  if (!db) return Response.json({ error: "Sync isn't set up" }, { status: 503 })
  const ok = (body: unknown) => Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
  // for actions with nothing to send back
  const done = async (work: Promise<unknown>) => {
    await work
    return ok({ ok: true })
  }
  const rp = () => relyingParty(req.headers.get('Origin'), env.SITE)

  // Asks Discogs, through Browser Run, whose login this is. Browser time is scarce on the free plan,
  // so each address gets only a few a minute.
  const confirmed = async (login: unknown) => {
    const parsed = parseLogin(login)
    if (!env.BROWSER) throw new SyncError(503, "Can't check with Discogs right now")
    if (!(await allowed(env.CONFIRM_LIMITER, ipKey(req)))) throw new SyncError(429, 'Too many requests')
    return confirm(parsed, browserRun(env.BROWSER), env.DISCOGS_CONSUMER_KEY, env.DISCOGS_CONSUMER_SECRET)
  }

  try {
    let input: Record<string, unknown>
    try {
      input = await req.json()
    } catch {
      throw new SyncError(400, 'Bad JSON')
    }
    const about = { name: parseDeviceName(input.deviceName), kind: parseDeviceKind(input.deviceKind) }

    // Profiles are unlisted rather than private: anyone with the username can read the sections their
    // owner switched on, and nothing else.
    if (PUBLIC.has(action)) {
      if (!(await allowed(env.SYNC_LIMITER, ipKey(req)))) return tooMany()
      // signed in, the viewer is known: enough for a Followers profile, and for blocks
      const viewer = typeof input.device === 'string' ? await deviceAccount(db, input.device).catch(() => null) : null
      if (action === 'profile-search') return ok(await searchProfiles(db, input.q, viewer))
      if (action === 'profile-people') return ok(await profilePeople(db, input.username, input.list, viewer))
      if (action === 'profile-item') {
        const found = await profileItem(db, input.username, input.key, viewer)
        if (!found) throw new SyncError(404, 'Nothing to show')
        return ok(found)
      }
      if (action === 'profile') {
        const found = await profileHead(db, input.username, viewer)
        if (!found) throw new SyncError(404, 'No profile here')
        return ok(found)
      }
      return ok(await profileRows(db, input.username, input.section, input.after, viewer))
    }

    // Getting in: the per-IP limit for sign-in, and for passwords and passkeys a per-account one too,
    // so nobody can guess their way in however many addresses they use
    if (ENTRY.has(action)) {
      if (!(await allowed(env.AUTH_LIMITER, ipKey(req)))) return tooMany()
      switch (action) {
        case 'join':
          return ok(await usePairing(db, input.code, Date.now(), about))
        case 'exists':
          if (input.discogsId !== undefined) return ok(await waysIn(db, parseDiscogsId(input.discogsId)))
          return ok({ exists: await nameExists(db, parseName(input.name)) })
        case 'discogs': {
          const who = await confirmed(input.login)
          const r = await discogsSignIn(db, who, input.create === true, Date.now(), about)
          return ok({ ...r, name: who.username, discogsId: who.id })
        }
        case 'signin': {
          const name = parseName(input.name)
          const discogsId = input.discogsId === undefined ? undefined : parseDiscogsId(input.discogsId)
          if (!(await allowed(env.LOGIN_LIMITER, discogsId ? `discogs:${discogsId}` : `name:${name}`))) return tooMany()
          return ok(await signIn(db, { name, discogsId }, parseProof(input.proof), Date.now(), about))
        }
        case 'passkey-signin-options':
          return ok(await signInOptions(db, rp(), parseDiscogsId(input.discogsId)))
        case 'passkey-signin': {
          if (!(await allowed(env.LOGIN_LIMITER, `discogs:${parseDiscogsId(input.discogsId)}`))) return tooMany()
          return ok(await signInWithPasskey(db, rp(), input.id, input.response, Date.now(), about))
        }
      }
    }

    // everything else is from a device that's already in
    if (typeof input.device !== 'string' || !(await allowed(env.SYNC_LIMITER, `device:${(await sha256(input.device)).slice(0, 32)}`))) {
      return tooMany()
    }
    const account = await deviceAccount(db, input.device)
    const syncEnv = { DB: db, SYNC_KEY: env.SYNC_KEY }
    if (action.startsWith('admin-')) await requireAdmin(db, account)
    switch (action) {
      case 'pull': {
        const since = Number(input.since ?? 0)
        if (!Number.isInteger(since) || since < 0) throw new SyncError(400, 'Bad cursor')
        return ok(await pull(db, syncEnv, account, since))
      }
      case 'push':
        return ok(await push(db, syncEnv, account, parseRows(input.rows)))
      case 'off':
        return ok({ off: await setOff(db, account, input.off) })

      case 'account': {
        await nameDevice(db, input.device, about)
        const { id: _id, ...rest } = (await accountById(db, account))!
        return ok({ ...rest, requests: await waitingFollows(db, account) })
      }
      case 'link':
        return done(link(db, account, await confirmed(input.login)))
      case 'pair':
        return ok(await newPairing(db, account))
      case 'password':
        return done(setPassword(db, account, parseProof(input.proof)))
      case 'password-remove':
        return done(removePassword(db, account))
      case 'leave':
        return done(leave(db, input.device))
      case 'forget':
        return done(forget(db, account))
      case 'devices':
        return ok({ devices: await listDevices(db, account, await sha256(input.device)) })
      case 'device-rename':
        return done(renameDevice(db, account, input.id, input.name))
      case 'device-remove':
        return done(removeDevice(db, account, input.id))
      case 'passkey-options':
        return ok(await registerOptions(db, account, rp()))
      case 'passkey-register':
        return ok(await register(db, account, rp(), input.id, input.response, parsePasskeyName(input.name)))
      case 'passkeys':
        return ok({ passkeys: await listPasskeys(db, account) })
      case 'passkey-rename':
        return done(renamePasskey(db, account, input.id, input.name))
      case 'passkey-remove':
        return done(removePasskey(db, account, input.id))

      case 'profile-settings':
        return ok(await profileSettings(db, account))
      case 'profile-sections':
        return ok({ sections: await setSections(db, account, input.sections) })
      case 'profile-who':
        return ok({ who: await setWho(db, account, input.who) })
      case 'profile-details':
        return ok({ details: await setProfileDetails(db, account, input.details) })
      case 'profile-about':
        return ok(await setProfileAbout(db, account, input.about))
      case 'profile-publish':
        return ok(await publishProfile(db, account, parseProfileRows(input.rows)))
      case 'profile-sweep':
        return ok(await sweepProfile(db, account, input.section, input.before))
      case 'profile-unpublish':
        return ok(await unpublishProfile(db, account, input.section, input.keys))

      case 'follow':
        return ok(await follow(db, account, input.username))
      case 'unfollow':
        return done(unfollow(db, account, input.username))
      case 'follow-respond':
        return done(respond(db, account, input.username, input.approve === true))
      case 'follower-remove':
        return done(removeFollower(db, account, input.username))
      case 'block':
        return done(block(db, account, input.username))
      case 'unblock':
        return done(unblock(db, account, input.username))
      case 'follows':
        return ok(await followLists(db, account))
      case 'feed':
        return ok(await feed(db, account, input.after))

      case 'admin-members':
        return ok({ members: await members(db) })
      case 'admin-badge':
        return ok({ badges: await setBadge(db, input.member, input.badge, input.on === true) })
      case 'admin-clear':
        return done(clearWaysIn(db, input.member))
      case 'admin-clear-about':
        return done(clearAbout(db, input.member))
      case 'admin-hide':
        return ok({ hidden: await setHidden(db, input.member, input.on) })
      case 'admin-badges':
        return ok({ badges: await listBadges(db) })
      case 'admin-badge-create':
        return ok(await createBadge(db, input.label, input.color, input.icon))
      case 'admin-badge-rename':
        return done(editBadge(db, input.id, { label: input.label, color: input.color, icon: input.icon }))
      case 'admin-badge-delete':
        return done(deleteBadge(db, input.id))
      case 'admin-badge-move':
        return done(moveBadge(db, input.id, input.by))
      case 'admin-delete':
        return done(deleteMember(db, input.member))
    }
    throw new SyncError(404, 'Not found')
  } catch (e) {
    if (e instanceof SyncError) {
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
      if (e.status === 429) headers['Retry-After'] = '60'
      return Response.json({ error: e.message }, { status: e.status, headers })
    }
    throw e
  }
}

// Anything that isn't a file comes here (see wrangler.jsonc): app routes get the app's page, and a
// missing file, such as an old build's chunk, a plain 404 rather than the page. Files themselves are
// served without running the Worker, so they don't count against its daily requests.
async function page(req: Request, env: Env, pathname: string): Promise<Response> {
  // (a Discogs username can have a dot in it, so /u/ never counts as a file)
  const file = pathname.startsWith('/assets/') || (!pathname.startsWith('/u/') && /\.[a-z0-9]+$/i.test(pathname))
  if (file || (req.method !== 'GET' && req.method !== 'HEAD')) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const res = await env.ASSETS.fetch(new Request(new URL('/', req.url), req))
  // profiles are there for anyone with the link, not for search engines
  if (!pathname.startsWith('/u/')) return res
  const out = new Response(res.body, res)
  out.headers.set('X-Robots-Tag', 'noindex')
  return out
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
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
        return pathname.startsWith('/api/') ? new Response('Not found', { status: 404 }) : page(req, env, pathname)
    }
  },
}
