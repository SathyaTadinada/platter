import {
  siBandcamp,
  siBluesky,
  siFacebook,
  siInstagram,
  siLastdotfm,
  siMastodon,
  siReddit,
  siSoundcloud,
  siSpotify,
  siThreads,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons'
import type { LinkService } from '../../worker/links'

const ICONS: Record<LinkService, SimpleIcon> = {
  instagram: siInstagram,
  tiktok: siTiktok,
  x: siX,
  threads: siThreads,
  bluesky: siBluesky,
  facebook: siFacebook,
  mastodon: siMastodon,
  reddit: siReddit,
  youtube: siYoutube,
  twitch: siTwitch,
  spotify: siSpotify,
  lastfm: siLastdotfm,
  soundcloud: siSoundcloud,
  bandcamp: siBandcamp,
}

// A service's own mark, from Simple Icons, in the text colour around it so it sits with the app's icons
export function BrandIcon({ service, size = 18, className = '' }: { service: LinkService; size?: number; className?: string }) {
  return (
    <svg role="img" aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`shrink-0 ${className}`}>
      <path d={ICONS[service].path} />
    </svg>
  )
}
