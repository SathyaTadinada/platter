import { useCallback, useEffect, useState } from 'react'
import { Redirect, useSearch } from 'wouter'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FollowButton, PersonRow, smallButton, type FollowState } from '../../components/PersonRow'
import { Button, List, Notice, Screen, Section, Segmented, Spinner } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import type { Follows, Person } from '../../lib/cloud'
import { replaceAddress } from '../../lib/nav'
import { explain } from './shared'

export type FollowList = 'followers' | 'following' | 'requests' | 'blocked'

const TITLES: Record<FollowList, string> = {
  followers: 'Followers',
  following: 'Following',
  requests: 'Requests',
  blocked: 'Blocked',
}

const LISTS = Object.keys(TITLES) as FollowList[]

const EMPTY: Record<FollowList, string> = {
  followers: 'No followers.',
  following: 'You’re not following anyone.',
  requests: 'No follow requests.',
  blocked: 'No one blocked.',
}

// Where a count of followers, following, or requests leads
export const peopleLink = (list: FollowList) => `/account/people?list=${list}`

type Act = 'remove' | 'approve' | 'decline' | 'unblock'

// The people around your profile, a list at a time: who follows you, who you follow, who's asking,
// and who you've blocked. Only yours to see, so it's part of the account.
export function Connections() {
  const cloud = useCloud()
  const asked = new URLSearchParams(useSearch()).get('list')
  const [list, setList] = useState<FollowList>(LISTS.includes(asked as FollowList) ? (asked as FollowList) : 'followers')
  const [follows, setFollows] = useState<Follows | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

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
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing} as a follower?`}
          action="Remove"
          onConfirm={() => {
            act('remove', removing)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
      {!people ? (
        !error && <Spinner />
      ) : people.length ? (
        <Section>
          <PeopleList
            key={list}
            list={list}
            people={people}
            onAct={(what, username) => (what === 'remove' ? setRemoving(username) : act(what, username))}
          />
        </Section>
      ) : (
        <Notice>{EMPTY[list]}</Notice>
      )}
    </Screen>
  )
}

// One list, each person with what can be done about them. Buttons rather than a menu per row, since a
// menu would be cut off by the list's rounded edge. Unfollowing leaves the person in the list with
// Follow, so it's undone in the same place.
function PeopleList({ list, people, onAct }: { list: FollowList; people: Person[]; onAct: (what: Act, username: string) => void }) {
  const [states, setStates] = useState<Record<string, FollowState>>({})
  return (
    <List>
      {people.map((p) => (
        <PersonRow
          key={p.username}
          username={p.username}
          about={p.about}
          // a blocked person's profile isn't one you'd open
          link={list !== 'blocked'}
          action={
            list === 'followers' ? (
              <Button variant="secondary" className={smallButton} onClick={() => onAct('remove', p.username)}>
                Remove
              </Button>
            ) : list === 'following' ? (
              <FollowButton
                username={p.username}
                state={states[p.username] ?? p.status ?? 'accepted'}
                onChange={(next) => setStates((s) => ({ ...s, [p.username]: next }))}
              />
            ) : list === 'requests' ? (
              <span className="flex gap-2">
                <Button variant="secondary" className={smallButton} onClick={() => onAct('decline', p.username)}>
                  Decline
                </Button>
                <Button className={smallButton} onClick={() => onAct('approve', p.username)}>
                  Approve
                </Button>
              </span>
            ) : (
              <Button variant="secondary" className={smallButton} onClick={() => onAct('unblock', p.username)}>
                Unblock
              </Button>
            )
          }
        />
      ))}
    </List>
  )
}
