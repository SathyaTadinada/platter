import { useState } from 'react'
import { getProfile } from '../api/discogs/endpoints'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'

export const profileUrl = (username: string) => `https://www.discogs.com/user/${encodeURIComponent(username)}`

export function useProfile() {
  const { client, username } = useSignedIn()
  return useAsync(() => getProfile(client, username), [client, username]).data
}

export function Avatar({ src, name, size = 'size-9' }: { src?: string; name: string; size?: string }) {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img src={src} alt="" onError={() => setBroken(true)} className={`${size} shrink-0 rounded-full bg-stone-200 object-cover dark:bg-stone-800`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold uppercase dark:bg-stone-800`} aria-hidden>
      {name.charAt(0)}
    </span>
  )
}

// Avatar and username, linking to the Discogs profile
export function ProfileLink({ detail, className = '' }: { detail?: string; className?: string }) {
  const { username } = useSignedIn()
  const profile = useProfile()
  return (
    <a href={profileUrl(username)} target="_blank" rel="noopener" className={`flex min-w-0 items-center gap-3 ${className}`}>
      <Avatar src={profile?.avatar_url} name={username} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{username}</span>
        {detail && <span className="block truncate text-sm text-stone-500">{detail}</span>}
      </span>
    </a>
  )
}
