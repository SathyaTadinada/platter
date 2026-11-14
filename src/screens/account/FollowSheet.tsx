import { UserMinus } from 'lucide-react'
import { Link } from 'wouter'
import { Sheet } from '../../components/Sheet'
import { Button, IconButton, List } from '../../components/ui'
import type { Person } from '../../lib/cloud'
import type { ProfileAbout } from '../../lib/profile'
import { Avatar } from '../search/People'

export type FollowList = 'followers' | 'following' | 'requests' | 'blocked'

export const TITLES: Record<FollowList, string> = {
  followers: 'Followers',
  following: 'Following',
  requests: 'Requests',
  blocked: 'Blocked',
}

const small = 'min-h-9 px-3 text-sm'

// One of the account's lists of people, each with what can be done about them. Buttons rather than
// a menu per row, since a menu would be cut off by the list's rounded edge.
export function FollowSheet({
  list,
  people,
  onAct,
  onClose,
}: {
  list: FollowList
  people: Person[]
  onAct: (what: 'remove' | 'unfollow' | 'approve' | 'decline' | 'unblock', username: string) => void
  onClose: () => void
}) {
  return (
    <Sheet title={TITLES[list]} bodyClassName="p-4" width="md" onClose={onClose}>
      <div className="py-2">
        {people.length ? (
          <List>
            {people.map((p) => {
              const about: ProfileAbout = p.about ? JSON.parse(p.about) : {}
              return (
                <li key={p.username} className="flex min-h-13 items-center gap-3 py-2 pr-2 pl-4">
                  {/* a blocked person's profile isn't one you'd open */}
                  {list === 'blocked' ? (
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar src={about.avatar} name={p.username} />
                      <span className="truncate">{p.username}</span>
                    </span>
                  ) : (
                    <Link
                      href={`/u/${encodeURIComponent(p.username)}`}
                      onClick={onClose}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar src={about.avatar} name={p.username} />
                      <span className="truncate">{p.username}</span>
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
        ) : (
          <p className="px-1 text-sm text-stone-500">Nobody yet.</p>
        )}
      </div>
    </Sheet>
  )
}
