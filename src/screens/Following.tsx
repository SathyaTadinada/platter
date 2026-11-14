import { useCallback, useEffect, useState } from 'react'
import { Redirect } from 'wouter'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { Button, Notice, Screen, Section, Spinner, useBack } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import { addedAt, type ProfileItem } from '../lib/profile'
import { dayAgo } from '../lib/time'

type Added = { username: string; key: string; item: ProfileItem }

// What the people you follow added most recently, newest first, from what their profiles publish
export function Following() {
  const { api } = useCloud()
  const back = useBack('/search?who=1')
  const [added, setAdded] = useState<Added[] | null>(null)
  const [more, setMore] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(
    async (after?: string) => {
      if (!api) return
      setLoading(true)
      setError(false)
      try {
        const page = await api.feed(after)
        const rows = page.items.map((i) => ({ username: i.username, key: i.key, item: JSON.parse(i.value) as ProfileItem }))
        setAdded((old) => (after ? [...(old ?? []), ...rows] : rows))
        setMore(page.more ? page.items.at(-1)!.key : null)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    },
    [api],
  )
  useEffect(() => {
    load()
  }, [load])

  if (!api) return <Redirect to="/search?who=1" replace />

  return (
    <Screen title="Recently added" back={back} width={added ? 'narrow' : 'full'}>
      {error && <Notice tone="error">Couldn’t load this just now. Try again in a minute.</Notice>}
      {!added ? (
        !error && <Spinner />
      ) : !added.length ? (
        <Notice>Nothing yet.</Notice>
      ) : (
        <Section>
          <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
            {added.map(({ username, key, item }) => (
              <li key={`${username}:${key}`}>
                <RecordRow
                  item={{ instanceId: item.id, title: item.title, artist: item.artist, thumb: item.thumb, cover: item.cover }}
                  href={`/release/${item.id}`}
                  detail={`${item.artist} · ${username}`}
                >
                  <span className="text-sm text-stone-500 tabular-nums">{dayAgo(addedAt(key))}</span>
                </RecordRow>
              </li>
            ))}
          </ul>
          {more && (
            <Button variant="secondary" className="w-full" disabled={loading} onClick={() => load(more)}>
              {loading ? 'Loading…' : 'Show more'}
            </Button>
          )}
          <p>
            <DiscogsCredit />
          </p>
        </Section>
      )}
    </Screen>
  )
}
