import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Sections, Who } from '../../worker/profile'
import { getFields, getProfile } from '../api/discogs/endpoints'
import { onTableChange } from '../db/changes'
import { db, getSetting } from '../db/db'
import type { About, CloudApi } from '../lib/cloud'
import { matchFields, type FieldKey, type FieldMap } from '../lib/fields'
import { forgetSent, lastPlayed, publishAbout, publishProfile, type CopyChoice, type ProfileAbout } from '../lib/profile'
import { useSession } from './session'

const EMPTY_ABOUT: About = { bio: '', setup: {}, links: {}, location: '', pronouns: '', pinned: null, playing: false }
// Discogs extras (the picture, field names) aren't worth holding the profile up for
const DISCOGS_WAIT = 4000
// They rarely change, so they're asked for again only after an hour (a minute after one fails)
const EXTRAS_FOR = 60 * 60_000

// What the profile is built from. A change to it goes up SOON after. Album years and record lengths
// fill in by themselves, a few a minute for hours on a big collection, so they go up at most LATER.
const SHOWN = new Set(['collection', 'wants', 'plays'])
const BACKGROUND = new Set(['masters', 'lengths'])
const SOON = 3000
const LATER = 60_000

// what p gives, or undefined if it fails or takes longer than ms
const within = <T>(ms: number, p: Promise<T>) => Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(r, ms))])

// Asks for something from Discogs at most once an hour (or a minute after a failure), never twice at
// once, and gives the last good answer while it can't get a new one
function extra<T>(get: () => Promise<T>) {
  let value: T | undefined
  let at = 0
  let ok = false
  let asking: Promise<void> | null = null
  return async () => {
    if (!asking && Date.now() - at >= (ok ? EXTRAS_FOR : LATER)) {
      at = Date.now()
      asking = get()
        .then(
          (v) => void ((value = v), (ok = true)),
          () => void (ok = false),
        )
        .finally(() => (asking = null))
    }
    if (asking) await within(DISCOGS_WAIT, asking)
    return value
  }
}

// The profile's settings, and publishing what it shows: a few seconds after anything it's built from
// changes on this device (or comes in from another one), and straight away when a setting changes.
export function useProfileSharing(api: CloudApi | null) {
  const { session, client } = useSession()
  const [sections, setSectionsState] = useState<Sections | null>(null)
  const [details, setDetailsState] = useState<string[]>([])
  const [about, setAboutState] = useState<About>(EMPTY_ABOUT)
  const [who, setWhoState] = useState<Who>('private')
  const [hidden, setHidden] = useState(false)
  // the same as the state, for share() to read without waiting on a render
  const shared = useRef<Sections>({})
  const open = useRef(false) // there's a profile: it isn't Private
  const chosen = useRef<string[]>([])
  const playing = useRef(false) // the record last played goes up with the picture

  const username = client && session && session.kind !== 'demo' ? session.username : null
  const picture = useMemo(
    () => (client && username ? extra(() => getProfile(client, username).then((p) => p.avatar_url)) : null),
    [client, username],
  )
  const fieldList = useMemo(
    () => (client && username ? extra(() => getFields(client, username).then((r) => r.fields)) : null),
    [client, username],
  )

  const showing = () => open.current || Object.values(shared.current).some((v) => v === 'public')
  // false when part of it has to wait for the next try
  const publish = useCallback(async () => {
    if (!api || !showing()) return true
    // how many records they have is part of their collection, so it only goes with that section
    const about: ProfileAbout = shared.current.collection === 'public' ? { records: await db.collection.count() } : {}
    if (playing.current) {
      const last = await lastPlayed()
      if (last) about.playing = last
    }
    // without it the profile keeps the one from last time
    const avatar = await picture?.()
    if (avatar) about.avatar = avatar
    // the names of the fields whose values go up with each record, when some do. Without them the
    // records wait for the next try, rather than going without the details they had.
    let choice: CopyChoice | undefined
    if (chosen.current.length && shared.current.collection === 'public') {
      const fieldIds = chosen.current.filter((d) => d !== 'rating')
      let names: Record<number, string> = {}
      let roles: Record<number, FieldKey> = {}
      if (fieldIds.length) {
        const fields = await fieldList?.()
        if (!fields) {
          await publishAbout(api, shared.current, about, Date.now(), open.current)
          return false
        }
        names = Object.fromEntries([...fields].sort((a, b) => a.position - b.position).map((f) => [f.id, f.name]))
        // what each field is for, as Collection fields matched them, so others can match it to theirs
        const matches = matchFields(fields, (await getSetting<FieldMap>('fieldMap')) ?? {})
        roles = Object.fromEntries(matches.filter((m) => m.field).map((m) => [m.field!.id, m.spec.key]))
      }
      choice = { details: chosen.current, names, roles }
    }
    await publishProfile(api, shared.current, about, Date.now(), choice, open.current)
    return true
  }, [api, picture, fieldList])

  // One pass at a time: two switches flipped in a row shouldn't send everything twice at once. A pass
  // covers everything changed before it starts. One that fails is tried again in a minute.
  const sharing = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const due = useRef(Infinity)
  const later = useRef<(wait: number) => void>(() => {})
  const share = useCallback(() => {
    clearTimeout(timer.current)
    due.current = Infinity
    const next = sharing.current.then(publish).then((done) => void (done || later.current(LATER)))
    sharing.current = next.catch(() => later.current(LATER))
    return next
  }, [publish])
  later.current = (wait: number) => {
    const at = Date.now() + wait
    if (at >= due.current) return
    due.current = at
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void share().catch(() => {}), wait)
  }
  useEffect(() => {
    if (!api) return
    const stop = onTableChange((table) => {
      if (SHOWN.has(table)) later.current(SOON)
      else if (BACKGROUND.has(table)) later.current(LATER)
    })
    return () => {
      stop()
      clearTimeout(timer.current)
      due.current = Infinity
    }
  }, [api])

  useEffect(() => {
    if (!api) {
      setSectionsState(null)
      shared.current = {}
      return
    }
    // tried again until it loads (it may start offline), since the profile screens wait on it
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const load = () => {
      clearTimeout(timer)
      api
        .profileSettings()
        .then(({ sections: saved, who: found, hidden: down, details: picked = [], ...rest }) => {
          if (stopped) return
          const loaded = { ...EMPTY_ABOUT, ...rest }
          playing.current = loaded.playing
          setAboutState(loaded)
          shared.current = saved
          open.current = found !== 'private'
          chosen.current = picked
          setDetailsState(picked)
          setSectionsState(saved)
          setWhoState(found)
          setHidden(down)
          window.removeEventListener('online', load)
          // what's changed since it was last open
          later.current(SOON)
        })
        .catch(() => {
          if (!stopped) timer = setTimeout(load, 30_000)
        })
    }
    load()
    window.addEventListener('online', load)
    return () => {
      stopped = true
      clearTimeout(timer)
      window.removeEventListener('online', load)
    }
  }, [api])

  return {
    sections,
    setSections: async (next: Sections) => {
      if (!api) return
      const { sections: saved } = await api.setSections(next)
      shared.current = saved
      setSectionsState(saved)
      await forgetSent(saved)
      await share()
    },
    who,
    hidden,
    setWho: async (next: Who) => {
      if (!api) return
      const { who: saved } = await api.setWho(next)
      setWhoState(saved)
      // opening it sends the picture that goes with it
      const opening = !open.current && saved !== 'private'
      open.current = saved !== 'private'
      if (opening) await share()
    },
    details,
    setDetails: async (next: string[]) => {
      if (!api) return
      const { details: saved } = await api.setDetails(next)
      chosen.current = saved
      setDetailsState(saved)
      await share()
    },
    about,
    setAbout: async (next: About): Promise<{ published: Promise<void> }> => {
      if (!api) return { published: Promise.resolve() }
      const saved = await api.setAbout(next)
      setAboutState(saved)
      // showing or hiding the record last played goes up straight away, without holding up the save
      if (saved.playing === playing.current) return { published: Promise.resolve() }
      playing.current = saved.playing
      return { published: share().catch(() => {}) }
    },
  }
}
