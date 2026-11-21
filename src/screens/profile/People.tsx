import { useEffect, useState } from 'react'
import { useSearch } from 'wouter'
import { PersonRow } from '../../components/PersonRow'
import { List, Notice, Screen, Section, Segmented, Spinner, useBack } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import type { Person } from '../../lib/cloud'
import { replaceAddress } from '../../lib/nav'

type List = 'followers' | 'following'
const TITLES: Record<List, string> = { followers: 'Followers', following: 'Following' }

export const theirPeople = (username: string, list: List) => `/u/${encodeURIComponent(username)}/people?list=${list}`

// Who follows someone and who they follow, for anyone who can see their profile. Only people who can
// be found in Search are named; the rest are counted at the end.
export function ProfilePeople({ username }: { username: string }) {
  const back = useBack(`/u/${encodeURIComponent(username)}`)
  const { reader } = useCloud()
  const asked = new URLSearchParams(useSearch()).get('list')
  const [list, setList] = useState<List>(asked === 'following' ? 'following' : 'followers')
  const [found, setFound] = useState<{ list: List; people: Person[]; more: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => replaceAddress(theirPeople(username, list)), [username, list])
  useEffect(() => {
    let dropped = false
    setError(null)
    reader
      .profilePeople(username, list)
      .then((r) => !dropped && setFound({ list, ...r }))
      .catch(() => !dropped && setError('Couldn’t load this just now.'))
    return () => {
      dropped = true
    }
  }, [reader, username, list])

  const shown = found?.list === list ? found : null
  return (
    <Screen
      title={username}
      back={back}
      width="narrow"
      toolbar={
        <Segmented
          label="Which people"
          value={list}
          onChange={setList}
          options={(Object.keys(TITLES) as List[]).map((l) => ({ value: l, label: TITLES[l] }))}
        />
      }
    >
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !shown ? (
        <Spinner />
      ) : !shown.people.length && !shown.more ? (
        <Notice>{list === 'followers' ? 'No followers.' : 'Not following anyone.'}</Notice>
      ) : (
        <Section>
          {shown.people.length > 0 && (
            <List>
              {shown.people.map((p) => (
                <PersonRow key={p.username} username={p.username} about={p.about} />
              ))}
            </List>
          )}
          {shown.more > 0 && (
            <p className="px-1 text-sm text-stone-500">
              {shown.people.length
                ? `And ${shown.more.toLocaleString()} more`
                : `${shown.more.toLocaleString()} ${shown.more === 1 ? 'person' : 'people'}`}
            </p>
          )}
        </Section>
      )}
    </Screen>
  )
}
