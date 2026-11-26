import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sections, Who } from '../../worker/profile'
import { getFields, getProfile } from '../api/discogs/endpoints'
import { db, getSetting } from '../db/db'
import type { About, CloudApi } from '../lib/cloud'
import { matchFields, type FieldKey, type FieldMap } from '../lib/fields'
import { forgetSent, lastPlayed, publishAbout, publishProfile, type CopyChoice, type ProfileAbout } from '../lib/profile'
import { useSession } from './session'

const EMPTY_ABOUT: About = { bio: '', setup: {}, links: {}, location: '', pronouns: '', pinned: null, playing: false }
// Discogs extras (the picture, field names) aren't worth holding the profile up for
const DISCOGS_WAIT = 4000
const SHARE_EVERY = 10 * 60_000
// records added one at a time (a batch, a CSV) settle before everything goes again
const SETTLE = 5000
// the small row goes about this soon after what's in it changes
const SUMMARY_WAIT = 1000

// what p gives, or undefined if it fails or takes longer than ms
const within = <T>(ms: number, p: Promise<T>) => Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(r, ms))])

// The profile's settings, and publishing what it shows. Two rules: the small row (picture, record count,
// record last played) goes whenever what's in it changes, and everything goes when a setting changes,
// when records are added or removed, and at most every SHARE_EVERY after a sync.
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

  const sharing = useRef<Promise<void>>(Promise.resolve())
  const avatar = useRef<string | undefined>(undefined) // from the last full pass
  const lastShared = useRef(0) // when the last full pass started
  const showing = () => open.current || Object.values(shared.current).some((v) => v === 'public')
  const aboutNow = useCallback(async () => {
    // how many records they have is part of their collection, so it only goes with that section
    const about: ProfileAbout = shared.current.collection === 'public' ? { records: await db.collection.count() } : {}
    if (playing.current) {
      const last = await lastPlayed()
      if (last) about.playing = last
    }
    if (avatar.current) about.avatar = avatar.current
    return about
  }, [])
  const shareNow = useCallback(async () => {
    if (!api || !showing()) return
    const about = await aboutNow()
    const discogs = client && session && session.kind !== 'demo' ? { client, username: session.username } : null
    // The client keeps retrying a request Discogs turns down, so the picture isn't waited on for long.
    // Without it the profile goes up with the one from last time, and the next pass picks the new one up.
    if (discogs) {
      const picture = await within(
        DISCOGS_WAIT,
        getProfile(discogs.client, discogs.username).then((p) => p.avatar_url),
      )
      if (picture) about.avatar = avatar.current = picture
    }
    // the names of the fields whose values go up with each record, when some do. Without them this
    // pass waits for the next, rather than sending records without the details they had.
    let choice: CopyChoice | undefined
    if (chosen.current.length && shared.current.collection === 'public') {
      const fieldIds = chosen.current.filter((d) => d !== 'rating')
      let names: Record<number, string> = {}
      let roles: Record<number, FieldKey> = {}
      if (fieldIds.length) {
        const fields =
          discogs &&
          (await within(
            DISCOGS_WAIT,
            getFields(discogs.client, discogs.username).then((r) => r.fields),
          ))
        // the small row still goes now, and the next sync tries the rest again
        if (!fields) {
          lastShared.current = 0
          await publishAbout(api, shared.current, about, Date.now(), open.current)
          return
        }
        names = Object.fromEntries([...fields].sort((a, b) => a.position - b.position).map((f) => [f.id, f.name]))
        // what each field is for, as Collection fields matched them, so others can match it to theirs
        const matches = matchFields(fields, (await getSetting<FieldMap>('fieldMap')) ?? {})
        roles = Object.fromEntries(matches.filter((m) => m.field).map((m) => [m.field!.id, m.spec.key]))
      }
      choice = { details: chosen.current, names, roles }
    }
    await publishProfile(api, shared.current, about, Date.now(), choice, open.current)
  }, [api, client, session, aboutNow])
  const shareAbout = useCallback(async () => {
    if (!api || !showing()) return
    await publishAbout(api, shared.current, await aboutNow(), Date.now(), open.current)
  }, [api, aboutNow])
  // One pass at a time: two switches flipped in a row shouldn't send everything twice at once
  const queue = useCallback((pass: () => Promise<void>) => {
    const next = sharing.current.then(pass)
    sharing.current = next.catch(() => {})
    return next
  }, [])
  // After a sync (now false) it waits SHARE_EVERY since the last one, so a busy session doesn't
  // rework the whole collection every half minute
  const share = useCallback(
    (now = true) => {
      if (!now && Date.now() - lastShared.current < SHARE_EVERY) return Promise.resolve()
      lastShared.current = Date.now()
      return queue(shareNow)
    },
    [queue, shareNow],
  )

  // What the small row is made of, from here or synced in from another device. The picture only
  // changes on a full pass, which sends it.
  const summary = useLiveQuery(async () => JSON.stringify([await db.collection.count(), await lastPlayed()]))
  const sentSummary = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (summary === undefined || !api) return
    // the first look is what the pass on opening sends
    if (sentSummary.current === undefined) sentSummary.current = summary
    if (sentSummary.current === summary) return
    const t = setTimeout(() => {
      sentSummary.current = summary
      queue(shareAbout).catch(() => {})
    }, SUMMARY_WAIT)
    return () => clearTimeout(t)
  }, [summary, api, queue, shareAbout])

  // A record added or removed sends everything a few seconds later, not at the next full pass.
  // Which records there are, cheaply: how many, and their ids added up.
  const shelf = useLiveQuery(async () => {
    const ids = (await db.collection.toCollection().primaryKeys()) as number[]
    return `${ids.length}:${ids.reduce((a, b) => a + b, 0)}`
  })
  const sentShelf = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (shelf === undefined || !api) return
    // the first look is what the pass on opening sends
    if (sentShelf.current === undefined) sentShelf.current = shelf
    if (sentShelf.current === shelf) return
    const t = setTimeout(() => {
      sentShelf.current = shelf
      share()
    }, SETTLE)
    return () => clearTimeout(t)
  }, [shelf, api, share])

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
    share,
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
