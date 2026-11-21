// Where someone can be found elsewhere: a username for each service, never a link of their own. Links
// are built from these, so a profile can only ever point at the services listed here. Shared by the
// Worker (which checks them) and the app (which shows them), so nothing here touches the server.

export const LINK_SERVICES = [
  'instagram',
  'tiktok',
  'x',
  'threads',
  'bluesky',
  'facebook',
  'mastodon',
  'reddit',
  'youtube',
  'twitch',
  'spotify',
  'lastfm',
  'soundcloud',
  'bandcamp',
] as const
export type LinkService = (typeof LINK_SERVICES)[number]
export type Links = Partial<Record<LinkService, string>>

export const LINK_NAMES: Record<LinkService, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  threads: 'Threads',
  bluesky: 'Bluesky',
  facebook: 'Facebook',
  mastodon: 'Mastodon',
  reddit: 'Reddit',
  youtube: 'YouTube',
  twitch: 'Twitch',
  spotify: 'Spotify',
  lastfm: 'Last.fm',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
}

const PLAIN = /^[A-Za-z0-9._-]{1,40}$/
const PATTERNS: Partial<Record<LinkService, RegExp>> = {
  bluesky: /^[A-Za-z0-9.-]{3,60}$/, // a domain, like name.bsky.social
  mastodon: /^[A-Za-z0-9_]{1,30}@[A-Za-z0-9.-]{3,60}$/, // name@server
}

// Takes a username however it was typed: with an @ in front, or a whole profile link pasted in
export function handleFrom(service: LinkService, raw: string): string {
  let text = raw.trim()
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      const parts = url.pathname.split('/').filter(Boolean)
      const last = parts.at(-1) ?? ''
      // a Mastodon profile is https://server/@name
      text = service === 'mastodon' && last.startsWith('@') ? `${last.slice(1)}@${url.hostname}` : last
    } catch {
      return text
    }
  }
  return text.replace(/^@/, '')
}

export const validHandle = (service: LinkService, handle: string) => (PATTERNS[service] ?? PLAIN).test(handle)

export function linkFor(service: LinkService, handle: string): string {
  const h = encodeURIComponent(handle)
  switch (service) {
    case 'instagram':
      return `https://www.instagram.com/${h}`
    case 'tiktok':
      return `https://www.tiktok.com/@${h}`
    case 'x':
      return `https://x.com/${h}`
    case 'threads':
      return `https://www.threads.net/@${h}`
    case 'bluesky':
      return `https://bsky.app/profile/${h}`
    case 'facebook':
      return `https://www.facebook.com/${h}`
    case 'mastodon': {
      const [name, server] = handle.split('@')
      return `https://${server}/@${encodeURIComponent(name)}`
    }
    case 'reddit':
      return `https://www.reddit.com/user/${h}`
    case 'youtube':
      return `https://www.youtube.com/@${h}`
    case 'twitch':
      return `https://www.twitch.tv/${h}`
    case 'spotify':
      return `https://open.spotify.com/user/${h}`
    case 'lastfm':
      return `https://www.last.fm/user/${h}`
    case 'soundcloud':
      return `https://soundcloud.com/${h}`
    case 'bandcamp':
      return `https://bandcamp.com/${h}`
  }
}
