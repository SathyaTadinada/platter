import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category } from '../../worker/categories'
import type { Sections, Who } from '../../worker/profile'
import { db } from '../db/db'
import { cloudEntry, type About } from '../lib/cloud'
import { DEMO_ABOUT, demoCloudApi, demoReader } from '../lib/demoCloud'
import type { CloudCtx } from './cloud'

// The demo shows sync as if it were on, with nothing behind it: switches flip, codes count down,
// and nothing leaves the browser
export function useDemoCloud(): CloudCtx {
  const [enabled, setEnabled] = useState(true)
  const [exists, setExists] = useState(true)
  const [off, setOff] = useState<Category[]>([])
  // everything on, so the sample profile shows what a profile can have
  const [demoSections, setDemoSections] = useState<Sections>({ collection: 'public', wantlist: 'public', stats: 'public', year: 'public' })
  const [demoWho, setDemoWho] = useState<Who>('public')
  // the rating and both conditions (the demo's fields 1 and 2)
  const [demoDetails, setDemoDetails] = useState<string[]>(['rating', '1', '2'])
  const [demoAbout, setDemoAbout] = useState<About>(DEMO_ABOUT)
  // a record from the sample collection pinned to the sample profile
  useEffect(() => {
    db.collection
      .orderBy('dateAdded')
      .first()
      .then(
        (r) =>
          r &&
          setDemoAbout((a) => (a.pinned ? a : { ...a, pinned: { id: r.releaseId, title: r.title, artist: r.artist, thumb: r.thumb } })),
      )
  }, [])
  const [syncedAt, setSyncedAt] = useState(() => Date.now() - 2 * 60_000)
  const [running, setRunning] = useState(false)
  const api = useMemo(() => demoCloudApi(), [])
  const anonymous = useMemo(() => cloudEntry(), [])
  // read by the demo's own profile when it's opened, so it shows the settings as they are then
  const settings = useRef({ sections: demoSections, who: demoWho, details: demoDetails, about: demoAbout })
  settings.current = { sections: demoSections, who: demoWho, details: demoDetails, about: demoAbout }
  const reader = useMemo(() => demoReader(anonymous, () => settings.current), [anonymous])
  const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const signIn = async () => {
    await pause(600)
    setEnabled(true)
    setExists(true)
    setSyncedAt(Date.now())
  }
  return {
    available: true,
    username: 'demo',
    enabled,
    running,
    error: null,
    syncedAt,
    off,
    api: enabled ? api : null,
    // its own profile is made here; anyone else's comes from the real server, read anonymously
    reader,
    sections: demoSections,
    setSections: async (next) => {
      await pause(300)
      setDemoSections((s) => ({ ...s, ...next }))
    },
    who: demoWho,
    hidden: false,
    setWho: async (next) => {
      await pause(300)
      setDemoWho(next)
    },
    details: demoDetails,
    setDetails: async (next) => {
      await pause(300)
      setDemoDetails(next)
    },
    about: demoAbout,
    setAbout: async (next) => {
      await pause(300)
      setDemoAbout(next)
      return { published: Promise.resolve() }
    },
    waysIn: async () => ({ exists, password: false, passkeys: exists, legacy: false }),
    signInWithDiscogs: async () => {
      await signIn()
      return true
    },
    signInWithPasskey: signIn,
    syncNow: async () => {
      setRunning(true)
      await pause(800)
      setSyncedAt(Date.now())
      setRunning(false)
    },
    signIn,
    join: signIn,
    pair: async () => {
      await pause(300)
      const pick = () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
      const code = Array.from({ length: 6 }, pick).join('')
      return { code: `${code.slice(0, 3)}-${code.slice(3)}`, expiresAt: Date.now() + 10 * 60_000 }
    },
    changePassword: () => pause(500),
    setOff: async (next) => setOff(next),
    leave: async () => setEnabled(false),
    forget: async () => {
      setEnabled(false)
      setExists(false)
    },
    beforeSignOut: async () => {},
  }
}
