import { CalendarRange, ChartLine, Heart, LibraryBig, Link as LinkIcon, UserCheck, UserPlus, UserRound, Users, UserX } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Redirect } from 'wouter'
import type { Section as ProfileSection, Who } from '../../worker/profile'
import { toast } from '../components/Toaster'
import { List, Notice, Row, Screen, Section, Segmented, Switch } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import type { Follows } from '../lib/cloud'
import { FollowSheet, type FollowList } from './account/FollowSheet'
import { explain } from './account/shared'

// What a profile can show. Stats leaves out prices, and Your year what was spent.
const SHOWS: { id: ProfileSection; label: string; icon: ReactNode }[] = [
  { id: 'collection', label: 'Collection', icon: <LibraryBig size={20} /> },
  { id: 'wantlist', label: 'Wantlist', icon: <Heart size={20} /> },
  { id: 'stats', label: 'Stats', icon: <ChartLine size={20} /> },
  { id: 'year', label: 'Your year', icon: <CalendarRange size={20} /> },
]

export const WHO_LABELS: Record<Who, string> = { private: 'Private', followers: 'Followers', unlisted: 'Link only', public: 'Public' }

// The profile and the people around it, one tap in from the account, so someone who only wants sync
// never has to look at any of it
export function ProfileSettings() {
  const cloud = useCloud()
  const [follows, setFollows] = useState<Follows | null>(null)
  const [people, setPeople] = useState<FollowList | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (cloud.api) setFollows(await cloud.api.follows())
  }, [cloud.api])
  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  if (!cloud.enabled) return <Redirect to="/account" replace />

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(explain(e, "This device isn't signed in anymore."))
    }
  }
  const shared = Object.values(cloud.sections ?? {}).some((v) => v === 'public')
  // a private or hidden profile's link goes nowhere, so there's nothing to view or copy
  const reachable = shared && cloud.who !== 'private' && !cloud.hidden

  return (
    <Screen title="Profile" back="/account" width="narrow">
      {error && <Notice tone="error">{error}</Notice>}
      {/* drawn once its settings have come back, so it never shows Public or off by mistake */}
      {cloud.sections && (
        <>
          <Section title="Who it’s for">
            {cloud.hidden && <Notice tone="warn">Your profile has been hidden.</Notice>}
            <Segmented
              label="Who it’s for"
              value={cloud.who}
              onChange={(w) => attempt(() => cloud.setWho(w))}
              options={(Object.keys(WHO_LABELS) as Who[]).map((w) => ({ value: w, label: WHO_LABELS[w] }))}
            />
          </Section>
          <Section title="What it shows">
            <List>
              {SHOWS.map((p) => (
                <Row
                  key={p.id}
                  icon={p.icon}
                  label={p.label}
                  trailing={
                    <Switch
                      label={p.label}
                      checked={cloud.sections?.[p.id] === 'public'}
                      onChange={(on) => attempt(() => cloud.setSections({ [p.id]: on ? 'public' : 'off' }))}
                    />
                  }
                />
              ))}
            </List>
            {reachable && (
              <List>
                <Row icon={<UserRound size={20} />} label="View your profile" href={`/u/${cloud.username}`} />
                <Row
                  icon={<LinkIcon size={20} />}
                  label="Copy link"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${location.origin}/u/${cloud.username}`)
                    toast('Link copied', { tone: 'success' })
                  }}
                />
              </List>
            )}
          </Section>
        </>
      )}
      {follows && (
        <Section title="People">
          <List>
            <Row
              icon={<Users size={20} />}
              label="Followers"
              value={String(follows.followers.length)}
              onClick={() => setPeople('followers')}
            />
            <Row
              icon={<UserCheck size={20} />}
              label="Following"
              value={String(follows.following.length)}
              onClick={() => setPeople('following')}
            />
            {follows.requests.length > 0 && (
              <Row
                icon={<UserPlus size={20} />}
                label="Requests"
                value={String(follows.requests.length)}
                onClick={() => setPeople('requests')}
              />
            )}
            {follows.blocked.length > 0 && (
              <Row icon={<UserX size={20} />} label="Blocked" value={String(follows.blocked.length)} onClick={() => setPeople('blocked')} />
            )}
          </List>
        </Section>
      )}
      {people && follows && (
        <FollowSheet
          list={people}
          people={follows[people]}
          onAct={(what, username) =>
            attempt(async () => {
              const a = cloud.api!
              if (what === 'remove') await a.removeFollower(username)
              else if (what === 'unfollow') await a.unfollow(username)
              else if (what === 'approve' || what === 'decline') await a.respondFollow(username, what === 'approve')
              else await a.unblock(username)
              await reload()
            })
          }
          onClose={() => setPeople(null)}
        />
      )}
    </Screen>
  )
}
