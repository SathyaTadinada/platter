import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { List, Notice, Spinner } from '../../components/ui'
import { cloudEntry, type Found } from '../../lib/cloud'
import type { ProfileAbout } from '../../lib/profile'
import { timeAgo } from '../../lib/time'

const input = 'min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900'
const TYPING = 300
const MIN_SEARCH = 2 // the server waits for this much too

function Avatar({ src, name }: { src?: string; name: string }) {
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
  const detail = [
    about.records !== undefined && `${about.records} ${about.records === 1 ? 'record' : 'records'}`,
    person.publishedAt && `updated ${timeAgo(person.publishedAt)}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li>
      <Link
        href={`/u/${encodeURIComponent(person.username)}`}
        className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
      >
        <Avatar src={about.avatar} name={person.username} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{person.username}</span>
          {detail && <span className="block truncate text-sm text-stone-500 first-letter:uppercase">{detail}</span>}
        </span>
      </Link>
    </li>
  )
}

// Finding someone by their Discogs username. Part of a name is enough; nobody is listed until
// something is typed, so a profile is only ever found by someone looking for it.
export function People() {
  const [q, setQ] = useState('')
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
      cloudEntry()
        .searchProfiles(asked)
        .then((r) => !dropped && setFound(r.found))
        .catch(() => !dropped && setError(true))
    }, TYPING)
    return () => {
      dropped = true
      clearTimeout(t)
    }
  }, [asked, enough])

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="people" className="mb-1 block text-sm font-medium">
          Discogs username
        </label>
        <input
          id="people"
          className={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={100}
        />
      </div>

      {!enough ? null : error ? (
        <Notice tone="error">Couldn’t search just now. Try again in a minute.</Notice>
      ) : !found ? (
        <Spinner />
      ) : !found.length ? (
        <Notice>Nobody by that name is sharing a profile.</Notice>
      ) : (
        <List>
          {found.map((p) => (
            <Person key={p.username} person={p} />
          ))}
        </List>
      )}
    </div>
  )
}
