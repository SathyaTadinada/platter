import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { useCloud } from '../hooks/cloud'
import type { ProfileAbout } from '../lib/profile'
import { Avatar } from './Profile'
import { toast } from './Toaster'
import { Button } from './ui'

export const profilePath = (username: string) => `/u/${encodeURIComponent(username)}`

const readAbout = (about: string | null): ProfileAbout => {
  try {
    return about ? JSON.parse(about) : {}
  } catch {
    return {}
  }
}

// Someone in a list of people: picture and name, opening their profile, with a line about them
// and, at the end, what can be done about them
export function PersonRow({
  username,
  about,
  detail,
  action,
  link = true,
}: {
  username: string
  about: string | null
  detail?: string
  action?: ReactNode
  link?: boolean
}) {
  const who = (
    <>
      <Avatar src={readAbout(about).avatar} name={username} size="size-10" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{username}</span>
        {detail && <span className="block truncate text-sm text-stone-500">{detail}</span>}
      </span>
    </>
  )
  const row = 'flex min-h-13 min-w-0 flex-1 items-center gap-3 py-2 pl-4'
  return (
    <li className="flex items-center gap-2 select-none">
      {link ? (
        <Link
          href={profilePath(username)}
          draggable={false}
          className={`${row} ${action ? '' : 'pr-4'} hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800`}
        >
          {who}
          {!action && <ChevronRight size={18} className="shrink-0 text-stone-400" aria-hidden />}
        </Link>
      ) : (
        <span className={row}>{who}</span>
      )}
      {action && <span className="shrink-0 pr-2">{action}</span>}
    </li>
  )
}

export const recordCount = (about: string | null) => {
  const n = readAbout(about).records
  return n === undefined ? undefined : `${n.toLocaleString()} ${n === 1 ? 'record' : 'records'}`
}

export type FollowState = 'none' | 'pending' | 'accepted'

export const smallButton = 'min-h-9 px-3 text-sm'

// Follow, and once you do, Following (or Requested) to take it back. One tap either way, since the
// other is always right there to undo it.
export function FollowButton({
  username,
  state,
  onChange,
}: {
  username: string
  state: FollowState
  onChange: (next: FollowState) => void
}) {
  const { api } = useCloud()
  const [busy, setBusy] = useState(false)
  if (!api) return null
  const click = async () => {
    setBusy(true)
    try {
      if (state === 'none') onChange((await api.follow(username)).status)
      else {
        await api.unfollow(username)
        onChange('none')
      }
    } catch {
      toast('Couldn’t do that just now. Try again in a minute.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant={state === 'none' ? 'primary' : 'secondary'} className={`${smallButton} min-w-24`} disabled={busy} onClick={click}>
      {state === 'accepted' ? 'Following' : state === 'pending' ? 'Requested' : 'Follow'}
    </Button>
  )
}
