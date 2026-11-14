import { History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DiscogsCredit } from '../../components/ReleaseCardView'
import { List, Notice, Row, Section, Spinner } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { type Found, type Person as PersonRow } from '../../lib/cloud'
import type { ProfileAbout } from '../../lib/profile'
import { timeAgo } from '../../lib/time'

const input = 'min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900'
const TYPING = 300
const MIN_SEARCH = 2 // the server waits for this much too

export function Avatar({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      className="size-10 shrink-0 rounded-full bg-stone-200 object-cover dark:bg-stone-800"
    />
  ) : (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-200 font-semibold uppercase dark:bg-stone-800"
      aria-hidden
    >
      {name.charAt(0)}
    </span>
  )
}

function Person({ person }: { person: Found }) {
  const about: ProfileAbout = person.about ? JSON.parse(person.about) : {}
  const parts = [
    about.records !== undefined && `${about.records.toLocaleString()} ${about.records === 1 ? 'record' : 'records'}`,
    person.publishedAt && `updated ${timeAgo(person.publishedAt)}`,
  ].filter(Boolean) as string[]
  const detail = parts.join(' · ')
  return (
    <Row
      icon={<Avatar src={about.avatar} name={person.username} />}
      label={person.username}
      detail={detail && detail.charAt(0).toUpperCase() + detail.slice(1)}
      href={`/u/${encodeURIComponent(person.username)}`}
    />
  )
}

// Finding someone by their Discogs username. Part of a name is enough; nobody is listed until
// something is typed, so a profile is only ever found by someone looking for it.
export function People() {
  const { api, reader } = useCloud()
  const [q, setQ] = useState('')
  // the people you follow, for when nothing is typed
  const [following, setFollowing] = useState<PersonRow[] | null>(null)
  useEffect(() => {
    if (!api) return
    api
      .follows()
      .then((f) => setFollowing(f.following))
      .catch(() => {})
  }, [api])
  const [found, setFound] = useState<Found[] | null>(null)
  const [error, setError] = useState(false)
  const asked = q.trim()
  const enough = asked.length >= MIN_SEARCH

  useEffect(() => {
    if (!enough) {
      setFound(null)
      setError(false)
      return
    }
    let dropped = false
    setError(false)
    const t = setTimeout(() => {
      reader
        .searchProfiles(asked)
        .then((r) => !dropped && setFound(r.found))
        .catch(() => !dropped && setError(true))
    }, TYPING)
    return () => {
      dropped = true
      clearTimeout(t)
    }
  }, [reader, asked, enough])

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="find-people" className="mb-1 block text-sm font-medium">
          Find people
        </label>
        {/* a search, not a sign-in: "username" anywhere near a field makes Safari and password
            managers offer saved logins */}
        <input
          id="find-people"
          type="search"
          enterKeyHint="search"
          placeholder="Name on Discogs"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          className={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={100}
        />
      </div>

      {!enough ? (
        following?.length ? (
          <Section title="Following">
            <List>
              <Row icon={<History size={20} />} label="Recently added" href="/following" />
              {following.map((p) => (
                <Person key={p.username} person={{ username: p.username, about: p.about, publishedAt: null }} />
              ))}
            </List>
          </Section>
        ) : null
      ) : error ? (
        <Notice tone="error">Couldn’t search just now. Try again in a minute.</Notice>
      ) : !found ? (
        <Spinner />
      ) : !found.length ? (
        <Notice>Nobody by that name is sharing a profile.</Notice>
      ) : (
        <>
          <List>
            {found.map((p) => (
              <Person key={p.username} person={p} />
            ))}
          </List>
          <p>
            <DiscogsCredit />
          </p>
        </>
      )}
    </div>
  )
}
