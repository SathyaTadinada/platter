import type { Section, Sections } from '../../worker/profile'
import { db, type LibraryItem, type WantItem } from '../db/db'
import type { CloudApi, ProfileRow } from './cloud'

// Publishing a profile: the owner's devices send what each switched-on section shows, and nothing
// else. Release details are Discogs' catalog data, which can be kept; the owner's own notes,
// conditions, and what they paid never leave the device.
//
// A pass sends every row of a section with the same time on it, then sweeps the ones older than
// that, so a record they no longer have drops off. Passes are rare: each section carries a
// fingerprint of what was last sent, and an unchanged section isn't sent again.

export const SENT = 'profileSent'
type Sent = Partial<Record<Section | 'about', string>>

// What a visitor sees for one record. Covers are Discogs links, as they are everywhere else.
export type ProfileItem = {
  id: number
  title: string
  artist: string
  year?: number
  label?: string
  format?: string
  thumb?: string
  cover?: string
  rating?: number
}

export type ProfileAbout = { avatar?: string; records?: number }

const item = (r: LibraryItem): ProfileItem => ({
  id: r.releaseId,
  title: r.title,
  artist: r.artist,
  year: r.originalYear || r.year || undefined,
  label: r.label,
  format: r.format,
  thumb: r.thumb,
  cover: r.cover,
  rating: r.rating || undefined,
})

const want = (w: WantItem): ProfileItem => ({
  id: w.releaseId,
  title: w.title ?? 'Unknown release',
  artist: w.artist ?? '',
  year: w.year || undefined,
  format: w.format,
  thumb: w.thumb,
})

// The server pages through a section in key order, and a profile shows the newest first, so the key
// counts down from a date far in the future. It depends only on the record, so adding one doesn't
// move any of the others.
const UNTIL = 4_000_000_000_000 // some time in 2096
const keyOf = (added: string | undefined, id: number) =>
  `${String(UNTIL - (added ? Date.parse(added) || 0 : 0)).padStart(13, '0')}:${String(id).padStart(10, '0')}`

async function itemRows(): Promise<Omit<ProfileRow, 'updatedAt'>[]> {
  const all = await db.collection.toArray()
  return all.map((r) => ({ kind: 'item', key: keyOf(r.dateAdded, r.instanceId), value: JSON.stringify(item(r)) }))
}

async function wantRows(): Promise<Omit<ProfileRow, 'updatedAt'>[]> {
  const all = await db.wants.toArray()
  return all.map((w) => ({ kind: 'want', key: keyOf(w.dateAdded, w.releaseId), value: JSON.stringify(want(w)) }))
}

// Short and cheap: a section is only sent again when something in it changed
async function fingerprint(rows: { key: string; value: string }[]): Promise<string> {
  const text = rows
    .map((r) => `${r.key}\u0000${r.value}`)
    .sort()
    .join('\u0001')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const PAGE = 200 // the server takes this many rows at a time

export type Publisher = Pick<CloudApi, 'publishProfile' | 'sweepProfile'>

async function sendPass(api: Publisher, rows: Omit<ProfileRow, 'updatedAt'>[], section: Section, at: number) {
  for (let i = 0; i < rows.length; i += PAGE) {
    await api.publishProfile(rows.slice(i, i + PAGE).map((r) => ({ ...r, updatedAt: at })))
  }
  await api.sweepProfile(section, at)
}

// Sends what's changed in the sections that are on. Returns the sections it sent.
export async function publishProfile(
  api: Publisher,
  sections: Sections,
  about: ProfileAbout,
  at = Date.now(),
): Promise<(Section | 'about')[]> {
  const sent = ((await db.settings.get(SENT))?.value as Sent | undefined) ?? {}
  const next: Sent = { ...sent }
  const done: (Section | 'about')[] = []

  const pass = async (section: Section, build: () => Promise<Omit<ProfileRow, 'updatedAt'>[]>) => {
    if (sections[section] !== 'public') {
      delete next[section] // switched off, so the next time it goes on everything goes up again
      return
    }
    const rows = await build()
    const mark = await fingerprint(rows)
    if (mark === sent[section]) return
    await sendPass(api, rows, section, at)
    next[section] = mark
    done.push(section)
  }

  await pass('collection', itemRows)
  await pass('wantlist', wantRows)

  // their Discogs picture, while any section is on
  const anything = Object.values(sections).some((v) => v === 'public')
  const value = JSON.stringify(about)
  const mark = await fingerprint([{ key: 'about', value }])
  if (!anything) delete next.about
  else if (mark !== sent.about) {
    await api.publishProfile([{ kind: 'about', key: 'about', value, updatedAt: at }])
    next.about = mark
    done.push('about')
  }

  await db.settings.put({ key: SENT, value: next })
  return done
}

// After the sections change, so the next pass sends a section that has just gone back on
export async function forgetSent(sections: Sections) {
  const sent = ((await db.settings.get(SENT))?.value as Sent | undefined) ?? {}
  const next = Object.fromEntries(Object.entries(sent).filter(([k]) => k === 'about' || sections[k as Section] === 'public'))
  await db.settings.put({ key: SENT, value: next })
}
