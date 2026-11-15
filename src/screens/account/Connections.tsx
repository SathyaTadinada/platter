import { UserMinus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, Redirect, useSearch } from 'wouter'
import { Button, IconButton, List, Notice, Screen, Section, Segmented, Spinner } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import type { Follows, Person } from '../../lib/cloud'
import { replaceAddress } from '../../lib/nav'
import type { ProfileAbout } from '../../lib/profile'
import { Avatar } from '../search/People'
import { explain } from './shared'

export type FollowList = 'followers' | 'following' | 'requests' | 'blocked'

const TITLES: Record<FollowList, string> = {
  followers: 'Followers',
  following: 'Following',
  requests: 'Requests',
  blocked: 'Blocked',
}

const LISTS = Object.keys(TITLES) as FollowList[]

// Where a count of followers, following, or requests leads
export const peopleLink = (list: FollowList) => `/account/people?list=${list}`

const small = 'min-h-9 px-3 text-sm'

type Act = 'remove' | 'unfollow' | 'approve' | 'decline' | 'unblock'

// The people around your profile, a list at a time: who follows you, who you follow, who's asking,
// and who you've blocked. Only yours to see, so it's part of the account.
export function Connections() {
  const cloud = useCloud()
  const asked = new URLSearchParams(useSearch()).get('list')
  const [list, setList] = useState<FollowList>(LISTS.includes(asked as FollowList) ? (asked as FollowList) : 'followers')
  const [follows, setFollows] = useState<Follows | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (cloud.api) setFollows(await cloud.api.follows())
  }, [cloud.api])
  useEffect(() => {
    reload().catch((e) => setError(explain(e, "Couldn't load this just now. Try again in a minute.")))
  }, [reload])
  // the address follows the list, so Back and a reload come back to it
  useEffect(() => replaceAddress(peopleLink(list)), [list])

  if (!cloud.enabled) return <Redirect to="/account" replace />

  // Requests while there are some or the profile asks for them, Blocked while anyone is
  const shown = LISTS.filter(
    (l) =>
      l === 'followers' ||
      l === 'following' ||
      (l === 'requests' && (follows?.requests.length || cloud.who === 'followers' || list === l)) ||
      (l === 'blocked' && (follows?.blocked.length || list === l)),
  )

  const act = async (what: Act, username: string) => {
    setError(null)
    try {
      const a = cloud.api!
      if (what === 'remove') await a.removeFollower(username)
      else if (what === 'unfollow') await a.unfollow(username)
      else if (what === 'approve' || what === 'decline') await a.respondFollow(username, what === 'approve')
      else await a.unblock(username)
      await reload()
    } catch (e) {
      setError(explain(e, "This device isn't signed in anymore."))
    }
  }

  const people = follows?.[list]
  return (
    <Screen
      title="People"
      back="/account"
      width="narrow"
      toolbar={
        <Segmented label="Which people" value={list} onChange={setList} options={shown.map((l) => ({ value: l, label: TITLES[l] }))} />
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!people ? (
        !error && <Spinner />
      ) : people.length ? (
        <Section>
          <PeopleList list={list} people={people} onAct={act} />
        </Section>
      ) : (
        <Notice>Nobody yet.</Notice>
      )}
    </Screen>
  )
}

// One list, each person with what can be done about them. Buttons rather than a menu per row, since a
// menu would be cut off by the list's rounded edge.
function PeopleList({ list, people, onAct }: { list: FollowList; people: Person[]; onAct: (what: Act, username: string) => void }) {
  return (
    <List>
      {people.map((p) => {
        const about: ProfileAbout = p.about ? JSON.parse(p.about) : {}
        const who = (
          <>
            <Avatar src={about.avatar} name={p.username} />
            <span className="truncate">{p.username}</span>
          </>
        )
        return (
          <li key={p.username} className="flex min-h-13 items-center gap-3 py-2 pr-2 pl-4">
            {/* a blocked person's profile isn't one you'd open */}
            {list === 'blocked' ? (
              <span className="flex min-w-0 flex-1 items-center gap-3">{who}</span>
            ) : (
              <Link href={`/u/${encodeURIComponent(p.username)}`} draggable={false} className="flex min-w-0 flex-1 items-center gap-3">
                {who}
              </Link>
            )}
            {list === 'followers' && (
              <IconButton label={`Remove ${p.username}`} danger onClick={() => onAct('remove', p.username)}>
                <UserMinus size={18} />
              </IconButton>
            )}
            {list === 'following' && (
              <Button variant="secondary" className={small} onClick={() => onAct('unfollow', p.username)}>
                Unfollow
              </Button>
            )}
            {list === 'requests' && (
              <span className="flex gap-2">
                <Button variant="secondary" className={small} onClick={() => onAct('decline', p.username)}>
                  Decline
                </Button>
                <Button className={small} onClick={() => onAct('approve', p.username)}>
                  Approve
                </Button>
              </span>
            )}
            {list === 'blocked' && (
              <Button variant="secondary" className={small} onClick={() => onAct('unblock', p.username)}>
                Unblock
              </Button>
            )}
          </li>
        )
      })}
    </List>
  )
}
