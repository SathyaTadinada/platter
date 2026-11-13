// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Authenticator } from '../tests/authenticator'
import { testDB } from '../tests/d1'
import { accountById, discogsSignIn, link, listDevices, removeDevice, removePassword, renameDevice, waysIn } from './account'
import { clearWaysIn, deleteMember, members, requireAdmin, setBadge } from './admin'
import { Busy, confirm, IDENTITY, type Browse } from './confirm'
import {
  listPasskeys,
  register,
  registerOptions,
  relyingParty,
  removePasskey,
  renamePasskey,
  signInOptions,
  signInWithPasskey,
  CHALLENGE_TTL,
} from './passkeys'
import { deviceAccount, forget, nameDevice, setPassword, sha256, signIn } from './sync'

const ME = { id: 42, username: 'Tadinada' }
const YOU = { id: 7, username: 'someone' }

async function account(db: ReturnType<typeof testDB>, who = ME) {
  const { device } = await discogsSignIn(db, who, true, 1000, { name: 'Safari on iPhone', kind: 'phone' })
  return { device: device!, id: await deviceAccount(db, device!, 1000) }
}

// What Discogs answers through the browser, and what the browser was asked
function discogs(status: number, body: unknown) {
  const asked: { url: string; headers: Record<string, string> }[] = []
  const browse: Browse = async (url, headers) => {
    asked.push({ url, headers })
    return { status, body: typeof body === 'string' ? body : JSON.stringify(body) }
  }
  return { browse, asked }
}

describe('confirming a Discogs login', () => {
  it('reads who a personal token belongs to', async () => {
    const { browse, asked } = discogs(200, { id: 42, username: 'Tadinada', resource_url: '…' })
    expect(await confirm({ token: 'abc' }, browse, 'key', 'secret')).toEqual(ME)
    expect(asked).toEqual([{ url: IDENTITY, headers: { Authorization: 'Discogs token=abc' } }])
  })

  it('signs an OAuth login with the app key', async () => {
    const { browse, asked } = discogs(200, ME)
    await confirm({ token: 'tok', tokenSecret: 'sec' }, browse, 'key', 'secret')
    const auth = asked[0].headers.Authorization
    expect(auth).toMatch(/^OAuth /)
    expect(auth).toContain('oauth_token="tok"')
    expect(auth).toContain('oauth_consumer_key="key"')
    expect(auth).not.toContain('sec')
  })

  it('says so when Discogs turns the login down', async () => {
    const { browse } = discogs(401, { message: 'You must authenticate to access this resource.' })
    await expect(confirm({ token: 'bad' }, browse, 'k', 's')).rejects.toMatchObject({ status: 401 })
  })

  it("says it can't check now when the browsers are busy or the day's time is used up", async () => {
    const busy: Browse = async () => {
      throw new Busy()
    }
    await expect(confirm({ token: 'abc' }, busy, 'k', 's')).rejects.toMatchObject({ status: 503 })
    await expect(confirm({ token: 'abc' }, discogs(429, {}).browse, 'k', 's')).rejects.toMatchObject({ status: 503 })
    await expect(confirm({ token: 'abc' }, discogs(200, '<html>').browse, 'k', 's')).rejects.toMatchObject({ status: 503 })
  })
})

describe('the Platter account', () => {
  it("doesn't make an account unless asked", async () => {
    const db = testDB()
    expect(await discogsSignIn(db, ME, false)).toEqual({ device: null, created: false })
    expect(await waysIn(db, ME.id)).toEqual({ exists: false, password: false, passkeys: false })
  })

  it('makes one per Discogs user, and lets the same login back in', async () => {
    const db = testDB()
    const first = await account(db)
    const again = await discogsSignIn(db, ME, true)
    expect(again.created).toBe(false)
    expect(await deviceAccount(db, again.device!)).toBe(first.id)
    expect((await accountById(db, first.id))?.name).toBe('tadinada')
  })

  it("never lets one Discogs user into another's account", async () => {
    const db = testDB()
    const mine = await account(db)
    expect((await discogsSignIn(db, YOU, false)).device).toBeNull()
    const yours = await account(db, YOU)
    expect(yours.id).not.toBe(mine.id)
  })

  it('follows a Discogs rename', async () => {
    const db = testDB()
    const { id } = await account(db)
    await discogsSignIn(db, { id: 42, username: 'NewName' }, false)
    expect((await accountById(db, id))?.name).toBe('newname')
  })

  it('says which ways in an account has', async () => {
    const db = testDB()
    const { id } = await account(db)
    await setPassword(db, id, 'a'.repeat(64))
    expect(await waysIn(db, ME.id)).toEqual({ exists: true, password: true, passkeys: false })
  })

  it('ties an older account to its Discogs user once, and only to a free one', async () => {
    const db = testDB()
    await db
      .prepare("INSERT INTO accounts (id, name, proof, created_at) VALUES ('old', 'tadinada', ?1, 0)")
      .bind(await sha256('p'.repeat(64)))
      .run()
    await link(db, 'old', ME)
    expect((await accountById(db, 'old'))?.discogsId).toBe(42)
    await expect(link(db, 'old', YOU)).rejects.toMatchObject({ status: 409 })
    // now found by Discogs login, and the password goes by Discogs ID
    expect(await deviceAccount(db, (await discogsSignIn(db, ME, false)).device!)).toBe('old')
    expect(await deviceAccount(db, (await signIn(db, { discogsId: 42, name: 'tadinada' }, 'p'.repeat(64))).device)).toBe('old')

    await db.prepare("INSERT INTO accounts (id, name, proof, created_at) VALUES ('old2', 'tadinada', 'x', 0)").run()
    await expect(link(db, 'old2', ME)).rejects.toMatchObject({ status: 409 })
  })

  it('only drops the password once Discogs can get them back in', async () => {
    const db = testDB()
    await db.prepare("INSERT INTO accounts (id, name, proof, created_at) VALUES ('old', 'tadinada', 'x', 0)").run()
    await expect(removePassword(db, 'old')).rejects.toMatchObject({ status: 409 })
    const { id } = await account(db)
    await setPassword(db, id, 'a'.repeat(64))
    await removePassword(db, id)
    expect((await accountById(db, id))?.password).toBe(false)
  })
})

describe('devices', () => {
  it('lists them with this one marked, and signs another out', async () => {
    const db = testDB()
    const phone = await account(db)
    const laptop = await discogsSignIn(db, ME, false, 2000, { name: 'Chrome on Mac', kind: 'computer' })
    const list = await listDevices(db, phone.id, await sha256(laptop.device!))
    expect(list.map((d) => [d.name, d.current])).toEqual([
      ['Chrome on Mac', true],
      ['Safari on iPhone', false],
    ])
    await removeDevice(db, phone.id, list[1].id)
    await expect(deviceAccount(db, phone.device)).rejects.toMatchObject({ status: 401 })
  })

  it('names a device that got in before names were kept, once', async () => {
    const db = testDB()
    const { id } = await account(db)
    const old = await discogsSignIn(db, ME, false, 2000)
    await nameDevice(db, old.device!, { name: 'Safari on Mac', kind: 'computer' })
    await nameDevice(db, old.device!, { name: 'Chrome on Mac', kind: 'phone' })
    const list = await listDevices(db, id, '')
    expect(list.map((d) => d.name)).toContain('Safari on Mac')
    expect(list.map((d) => d.name)).not.toContain('Chrome on Mac')
    expect(list.find((d) => d.name === 'Safari on Mac')?.kind).toBe('computer')
  })

  it('renames one, and leaves its kind alone', async () => {
    const db = testDB()
    const { id, device } = await account(db)
    const [mine] = await listDevices(db, id, await sha256(device))
    await renameDevice(db, id, mine.id, '  Kitchen iPad  ')
    const [renamed] = await listDevices(db, id, await sha256(device))
    expect(renamed.name).toBe('Kitchen iPad')
    expect(renamed.kind).toBe('phone')
    await expect(renameDevice(db, id, mine.id, '   ')).rejects.toMatchObject({ status: 400 })
  })

  it("can't rename or sign out someone else's device", async () => {
    const db = testDB()
    const mine = await account(db)
    const yours = await account(db, YOU)
    const [theirs] = await listDevices(db, yours.id, '')
    await renameDevice(db, mine.id, theirs.id, 'Mine now')
    expect((await listDevices(db, yours.id, ''))[0].name).toBe('Safari on iPhone')
  })

  it("can't sign out someone else's device", async () => {
    const db = testDB()
    const mine = await account(db)
    const yours = await account(db, YOU)
    const [theirs] = await listDevices(db, yours.id, '')
    await removeDevice(db, mine.id, theirs.id)
    expect(await deviceAccount(db, yours.device)).toBe(yours.id)
  })
})

describe('passkeys', () => {
  const rp = relyingParty('https://platter.tadinada.com')

  async function withPasskey(db: ReturnType<typeof testDB>, who = ME) {
    const acc = await account(db, who)
    const key = new Authenticator(rp.origin)
    const { id, options } = await registerOptions(db, acc.id, rp, 1000)
    await register(db, acc.id, rp, id, key.register(options), 'iPhone', 1000)
    return { ...acc, key }
  }

  it('only work on the real site and localhost', () => {
    expect(relyingParty('http://localhost:5173').id).toBe('localhost')
    expect(() => relyingParty('https://x-platter.tadinada.workers.dev')).toThrow()
    expect(() => relyingParty('http://127.0.0.1:5173')).toThrow()
  })

  it('adds one, then signs a new device in with it', async () => {
    const db = testDB()
    const { id, key } = await withPasskey(db)
    expect((await listPasskeys(db, id)).map((p) => p.name)).toEqual(['iPhone'])
    expect(await waysIn(db, ME.id)).toMatchObject({ passkeys: true })

    const ch = await signInOptions(db, rp, ME.id, 2000)
    expect(ch.options.allowCredentials?.map((c) => c.id)).toEqual([key.id])
    const r = await signInWithPasskey(db, rp, ch.id, key.signIn(ch.options), 2000, { name: 'Firefox on Linux', kind: 'computer' })
    expect(r.name).toBe('tadinada')
    expect(await deviceAccount(db, r.device)).toBe(id)
  })

  it("won't sign in to one account with another's passkey", async () => {
    const db = testDB()
    const { key: yours } = await withPasskey(db, YOU)
    await withPasskey(db)
    const ch = await signInOptions(db, rp, ME.id)
    await expect(signInWithPasskey(db, rp, ch.id, yours.signIn(ch.options))).rejects.toMatchObject({ status: 401 })
  })

  it('takes each challenge once, and not after 5 minutes', async () => {
    const db = testDB()
    const { key } = await withPasskey(db)
    const ch = await signInOptions(db, rp, ME.id, 0)
    await expect(signInWithPasskey(db, rp, ch.id, key.signIn(ch.options), CHALLENGE_TTL + 1)).rejects.toMatchObject({ status: 401 })
    const again = await signInOptions(db, rp, ME.id, 0)
    const response = key.signIn(again.options)
    await signInWithPasskey(db, rp, again.id, response, 1)
    await expect(signInWithPasskey(db, rp, again.id, response, 2)).rejects.toMatchObject({ status: 401 })
  })

  it('turns away a response made for another site or a forged signature', async () => {
    const db = testDB()
    const { key } = await withPasskey(db)
    const local = relyingParty('http://localhost:5173')
    const ch = await signInOptions(db, rp, ME.id)
    await expect(signInWithPasskey(db, local, ch.id, key.signIn(ch.options))).rejects.toMatchObject({ status: 401 })

    const ch2 = await signInOptions(db, rp, ME.id)
    const forged = key.signIn(ch2.options)
    forged.response.signature = forged.response.signature.slice(0, -4) + 'AAAA'
    await expect(signInWithPasskey(db, rp, ch2.id, forged)).rejects.toMatchObject({ status: 401 })
  })

  it('renames and removes them, and goes with the account', async () => {
    const db = testDB()
    const { id, key } = await withPasskey(db)
    await renamePasskey(db, id, key.id, '  Work laptop ')
    expect((await listPasskeys(db, id))[0].name).toBe('Work laptop')
    await removePasskey(db, id, key.id)
    expect(await listPasskeys(db, id)).toEqual([])

    const other = await withPasskey(db, YOU)
    await forget(db, other.id)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM passkeys').first()).toEqual({ n: 0 })
  })
})

describe('admin', () => {
  async function admin(db: ReturnType<typeof testDB>) {
    const acc = await account(db)
    await db.prepare('UPDATE accounts SET admin = 1 WHERE id = ?1').bind(acc.id).run()
    return acc
  }

  it('is refused for everyone else', async () => {
    const db = testDB()
    const { id } = await account(db, YOU)
    await expect(requireAdmin(db, id)).rejects.toMatchObject({ status: 403 })
  })

  it('lists members, gives badges, clears ways in, and deletes', async () => {
    const db = testDB()
    const me = await admin(db)
    await requireAdmin(db, me.id)
    const you = await account(db, YOU)
    await setPassword(db, you.id, 'b'.repeat(64))

    expect((await members(db)).map((m) => [m.name, m.admin, m.devices, m.password])).toEqual([
      ['tadinada', true, 1, false],
      ['someone', false, 1, true],
    ])
    expect(await setBadge(db, you.id, 'early', true)).toEqual(['early'])
    expect(await setBadge(db, you.id, 'early', true)).toEqual(['early'])
    expect(await setBadge(db, you.id, 'early', false)).toEqual([])

    await clearWaysIn(db, you.id)
    await expect(deviceAccount(db, you.device)).rejects.toMatchObject({ status: 401 })
    expect(await waysIn(db, YOU.id)).toEqual({ exists: true, password: false, passkeys: false })
    // Discogs still gets them back in
    expect(await deviceAccount(db, (await discogsSignIn(db, YOU, false)).device!)).toBe(you.id)

    await deleteMember(db, you.id)
    expect(await waysIn(db, YOU.id)).toMatchObject({ exists: false })
  })
})
