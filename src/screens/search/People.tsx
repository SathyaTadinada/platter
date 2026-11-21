import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FollowButton, PersonRow, recordCount, type FollowState } from '../../components/PersonRow'
import { DiscogsCredit } from '../../components/ReleaseCardView'
import { List, Notice, Section, Spinner } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { type Found, type Person } from '../../lib/cloud'
import { timeAgo } from '../../lib/time'
import { NewFromFollowing } from './NewFromFollowing'

const TYPING = 250

const detailOf = (about: string | null, publishedAt: number | null) => {
  const parts = [recordCount(about), publishedAt && `updated ${timeAgo(publishedAt)}`].filter(Boolean) as string[]
  const line = parts.join(' · ')
  return line && line.charAt(0).toUpperCase() + line.slice(1)
}

// Finding someone by their Discogs username, from the first letter. Nobody is listed until
// something is typed, so a profile is only ever found by someone looking for it. With nothing
// typed: what the people you follow added, and who they are. On wide screens the people you follow
// stay on the right while you search.
export function People() {
  const { api, reader, username: me } = useCloud()
  const [q, setQ] = useState('')
  const [following, setFollowing] = useState<Person[] | null>(null)
  useEffect(() => {
    if (!api) return
    api
      .follows()
      .then((f) => setFollowing(f.following.filter((p) => p.status !== 'pending')))
      .catch(() => {})
  }, [api])
  const [found, setFound] = useState<Found[] | null>(null)
  const [error, setError] = useState(false)
  // follows and unfollows made from the results, over what the search said
  const [states, setStates] = useState<Record<string, FollowState>>({})
  const asked = q.trim()

  useEffect(() => {
    if (!asked) {
      setFound(null)
      setError(false)
      return
    }
    let dropped = false
    const t = setTimeout(() => {
      reader
        .searchProfiles(asked)
        .then((r) => {
          if (dropped) return
          setFound(r.found)
          setError(false)
        })
        .catch(() => !dropped && setError(true))
    }, TYPING)
    return () => {
      dropped = true
      clearTimeout(t)
    }
  }, [reader, asked])

  const followingList = following?.length ? (
    <Section title="Following">
      <List>
        {following.map((p) => (
          <PersonRow key={p.username} username={p.username} about={p.about} detail={recordCount(p.about)} />
        ))}
      </List>
    </Section>
  ) : null

  return (
    <>
      <div>
        {/* a search, not a form to fill in: Safari offers contacts to any field that mentions a
            name, and password managers anything near "username" */}
        <label className="relative mb-6 block">
          <span className="sr-only">Search people</span>
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-500" aria-hidden />
          <input
            id="people-search"
            type="search"
            role="searchbox"
            enterKeyHint="search"
            placeholder="Search people"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            className="min-h-12 w-full rounded-xl border border-stone-300 bg-white pr-10 pl-10 text-base dark:border-stone-700 dark:bg-stone-900 [&::-webkit-search-cancel-button]:hidden"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={100}
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
            >
              <X size={18} />
            </button>
          )}
        </label>

        {asked &&
          (error ? (
            <Notice tone="error">Couldn’t search just now. Try again in a minute.</Notice>
          ) : !found ? (
            <Spinner />
          ) : !found.length ? (
            <Notice>Nobody by that name is sharing a profile.</Notice>
          ) : (
            <Section>
              <List>
                {found.map((p) => {
                  const state = states[p.username] ?? p.following
                  return (
                    <PersonRow
                      key={p.username}
                      username={p.username}
                      about={p.about}
                      detail={detailOf(p.about, p.publishedAt)}
                      action={
                        state && p.username !== me.toLowerCase() ? (
                          <FollowButton
                            username={p.username}
                            state={state}
                            onChange={(next) => setStates((s) => ({ ...s, [p.username]: next }))}
                          />
                        ) : undefined
                      }
                    />
                  )
                })}
              </List>
              <p>
                <DiscogsCredit />
              </p>
            </Section>
          ))}

        {/* kept, not remade, while searching, so clearing the search puts it straight back */}
        <div className={asked ? 'hidden' : ''}>
          <NewFromFollowing />
          <div className="xl:hidden">{followingList}</div>
        </div>
      </div>
      <div className="hidden xl:block">{followingList}</div>
    </>
  )
}
