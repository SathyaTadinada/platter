import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { getProfile } from '../api/discogs/endpoints'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'

const profileUrl = (username: string) => `https://www.discogs.com/user/${encodeURIComponent(username)}`

export function useProfile() {
  const { client, username } = useSignedIn()
  return useAsync(() => getProfile(client, username), [client, username]).data
}

export function Avatar({ src, name, size = 'size-9' }: { src?: string; name: string; size?: string }) {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      className={`${size} shrink-0 rounded-full bg-stone-200 object-cover dark:bg-stone-800`}
    />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-stone-200 font-semibold uppercase dark:bg-stone-800 ${/\btext-/.test(size) ? '' : 'text-sm'}`}
      aria-hidden
    >
      {name.charAt(0)}
    </span>
  )
}

// Avatar and username, linking to the Discogs profile, or to a page here when given one
export function ProfileLink({
  detail,
  className = '',
  compact,
  to,
  chevron,
}: {
  detail?: string
  className?: string
  compact?: boolean
  to?: string
  chevron?: boolean // a row in a list that opens a page, so it ends like the others
}) {
  const { username, session } = useSignedIn()
  const profile = useProfile()
  // the demo has no Discogs profile to link to
  const demo = session.kind === 'demo'
  const name = demo ? 'Demo' : username
  const inner = (
    <>
      <Avatar src={demo ? undefined : profile?.avatar_url} name={name} />
      <span className={compact ? 'sr-only' : 'min-w-0'}>
        <span className="block truncate font-medium">{name}</span>
        {detail && <span className="block truncate text-sm text-stone-500">{detail}</span>}
      </span>
    </>
  )
  const classes = `flex min-w-0 items-center gap-3 ${className}`
  const title = compact ? name : undefined
  if (to) {
    return (
      <Link href={to} title={title} className={classes}>
        {inner}
        {chevron && <ChevronRight size={18} className="ml-auto shrink-0 text-stone-400" aria-hidden />}
      </Link>
    )
  }
  // the demo has no Discogs profile to link to
  if (demo) {
    return (
      <span className={classes} title={title}>
        {inner}
      </span>
    )
  }
  return (
    <a href={profileUrl(username)} target="_blank" rel="noopener" title={title} className={classes}>
      {inner}
    </a>
  )
}
