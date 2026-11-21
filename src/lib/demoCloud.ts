import type { Section, Sections, Who } from '../../worker/profile'
import { db } from '../db/db'
import { CloudError, type About, type CloudApi, type DeviceInfo, type PasskeyInfo, type ProfileReader } from './cloud'
import { lastPlayed, localProfile } from './profile'

const DEMO_USER = 'demo'
// what the sample profile says about itself
export const DEMO_ABOUT: About = {
  bio: 'Mostly jazz and 70s soul, with a soft spot for whatever the shop is playing when I walk in.',
  setup: {
    turntable: 'Technics SL-1200MK2',
    cartridge: 'Audio-Technica VM540ML',
    preamp: 'Schiit Mani 2',
    amp: 'Yamaha A-S501',
    speakers: 'KEF LS50',
  },
  links: { instagram: 'platter.demo', lastfm: 'platterdemo', bandcamp: 'platterdemo' },
  location: 'Somewhere with good shops',
  pronouns: '',
  pinned: null, // the first record in the sample collection, once it's loaded
  playing: true,
}
const PAGE = 100 // as the server pages a profile
// as worker/profile has them, which is server code
const SECTIONS: Section[] = ['collection', 'wantlist', 'stats', 'year']
const KINDS: Record<Section, string> = { collection: 'item', wantlist: 'want', stats: 'stats', year: 'year' }
import { deviceKind, deviceName } from './deviceName'

// The account page in the demo: a couple of devices and a passkey, kept in memory, with nothing sent
export function demoCloudApi(): CloudApi {
  const now = Date.now()
  let devices: DeviceInfo[] = [
    { id: 'this', name: deviceName(), kind: deviceKind(), createdAt: now - 40 * 86_400_000, lastSeenAt: now, current: true },
    {
      id: 'phone',
      name: 'Safari on iPhone',
      kind: 'phone',
      createdAt: now - 90 * 86_400_000,
      lastSeenAt: now - 3 * 3_600_000,
      current: false,
    },
  ]
  let passkeys: PasskeyInfo[] = [
    { id: 'demo', name: 'Safari on iPhone', createdAt: now - 90 * 86_400_000, lastUsedAt: now - 30 * 86_400_000 },
  ]
  let password = false
  let sections: Sections = { collection: 'public', wantlist: 'off', stats: 'off', year: 'off' }
  let who: Who = 'public'
  let details: string[] = []
  const pause = () => new Promise<void>((r) => setTimeout(r, 300))
  const nothing = async () => {
    await pause()
    return {}
  }
  return {
    pull: async () => ({ rows: [], seq: 0, more: false, off: [] }),
    push: async () => ({ seq: 0, seqs: [] }),
    pair: async () => ({ code: 'ABC-DEF', expiresAt: Date.now() + 600_000 }),
    password: async () => {
      await pause()
      password = true
      return {}
    },
    setOff: async (off) => ({ off }),
    leave: nothing,
    forget: nothing,
    account: async () => ({ name: 'demo', discogsId: 1, password, passkeys: passkeys.length, admin: false, badges: [], requests: 0 }),
    link: nothing,
    devices: async () => ({ devices }),
    renameDevice: async (id, name) => {
      devices = devices.map((d) => (d.id === id ? { ...d, name } : d))
      return {}
    },
    removeDevice: async (id) => {
      await pause()
      devices = devices.filter((d) => d.id !== id)
      return {}
    },
    passkeyOptions: async () => {
      throw new Error('Not in the demo')
    },
    registerPasskey: async () => {
      throw new Error('Not in the demo')
    },
    passkeys: async () => ({ passkeys }),
    renamePasskey: async (id, name) => {
      passkeys = passkeys.map((p) => (p.id === id ? { ...p, name } : p))
      return {}
    },
    removePasskey: async (id) => {
      await pause()
      passkeys = passkeys.filter((p) => p.id !== id)
      return {}
    },
    profileSettings: async () => ({
      sections,
      publishedAt: now - 3_600_000,
      who,
      hidden: false,
      details,
      ...DEMO_ABOUT,
    }),
    setAbout: async (about) => {
      await pause()
      return about
    },
    setDetails: async (next) => {
      await pause()
      details = next
      return { details }
    },
    setSections: async (next) => {
      await pause()
      sections = { ...sections, ...next }
      return { sections }
    },
    setWho: async (next) => {
      await pause()
      who = next
      return { who }
    },
    publishProfile: async (rows) => ({ saved: rows.length }),
    sweepProfile: async () => ({ gone: 0 }),
    unpublishProfile: async (_section, keys) => ({ gone: keys.length }),
    // the demo has nobody to follow, and its profile reads go nowhere
    profile: async () => {
      throw new Error('Not in the demo')
    },
    profileRows: async () => ({ rows: [], more: false }),
    profileItem: async () => {
      throw new Error('Not in the demo')
    },
    searchProfiles: async () => ({ found: [] }),
    profilePeople: async () => ({ people: [], more: 0 }),
    follow: async () => ({ status: 'accepted' }),
    unfollow: nothing,
    respondFollow: nothing,
    removeFollower: nothing,
    block: nothing,
    unblock: nothing,
    follows: async () => ({ followers: [], following: [], requests: [], blocked: [] }),
    feed: async () => ({ items: [], more: false }),
    members: async () => ({ members: [] }),
    setBadge: async () => ({ badges: [] }),
    clearWaysIn: nothing,
    hideProfile: async (_member, on) => ({ hidden: on }),
    clearAbout: nothing,
    badges: async () => ({ badges: [] }),
    createBadge: async (label, color, icon) => ({ id: label, label, color, icon, members: 0 }),
    editBadge: nothing,
    deleteBadge: nothing,
    moveBadge: nothing,
    deleteMember: nothing,
  }
}

// The demo's own profile, made on the spot from the sample collection with the demo's current
// settings, so View profile shows what a profile looks like. Anyone else's comes from the server.
export function demoReader(
  server: ProfileReader,
  current: () => { sections: Sections; who: Who; details: string[]; about: About },
): ProfileReader {
  const mine = (username: string) => username.trim().toLowerCase() === DEMO_USER
  const rows = async () => {
    const { sections, details } = current()
    // the demo's code is only loaded for the demo, and is already in by now
    const { DEMO_FIELDS } = await import('../demo/backend')
    const names = Object.fromEntries(DEMO_FIELDS.map((f) => [f.id, f.name]))
    return localProfile(sections, details.length ? { details, names } : undefined)
  }
  const missing = () => new CloudError(404, 'No profile here')
  return {
    profile: async (username) => {
      if (!mine(username)) return server.profile(username)
      const { sections, who } = current()
      if (who === 'private') throw missing()
      const on = SECTIONS.filter((s) => sections[s] === 'public')
      return {
        username: DEMO_USER,
        locked: false,
        badges: [],
        memberSince: Date.now() - 60 * 24 * 60 * 60_000,
        publishedAt: Date.now(),
        sections: on,
        about: JSON.stringify({
          ...(on.includes('collection') ? { records: await db.collection.count() } : {}),
          ...(current().about.playing ? { playing: await lastPlayed() } : {}),
        }),
        followers: 0,
        following: 0,
        ...current().about,
      }
    },
    profileRows: async (username, section, after) => {
      if (!mine(username)) return server.profileRows(username, section, after)
      if (current().who === 'private' || current().sections[section] !== 'public') throw missing()
      const all = (await rows())
        .filter((r) => r.kind === KINDS[section] && (!after || r.key > after))
        .sort((a, b) => (a.key < b.key ? -1 : 1))
      return { rows: all.slice(0, PAGE).map((r) => ({ ...r, updatedAt: Date.now() })), more: all.length > PAGE }
    },
    profileItem: async (username, key) => {
      if (!mine(username)) return server.profileItem(username, key)
      const found = (await rows()).find((r) => r.kind === 'item' && r.key === key)
      if (!found) throw missing()
      return { key, value: found.value }
    },
    searchProfiles: (q) => server.searchProfiles(q),
    profilePeople: async (username, list) => (mine(username) ? { people: [], more: 0 } : server.profilePeople(username, list)),
  }
}
