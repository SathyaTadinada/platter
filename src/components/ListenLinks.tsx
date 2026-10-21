import { Headphones } from 'lucide-react'
import { useState } from 'react'
import type { Identifier } from '../api/discogs/types'
import { allServicesUrl, findAppleAlbum, searchLinks } from '../lib/listen'
import { toast } from './Toaster'

const pill =
  'inline-flex items-center whitespace-nowrap rounded-full bg-stone-900/5 px-2 py-1.5 text-xs font-medium sm:px-3 hover:bg-stone-900/10 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/15'

// Where to hear it. Apple Music and "All services" look up the exact album when
// tapped (nothing is sent anywhere before that); the rest are plain searches.
export function ListenLinks({
  releaseId,
  artist,
  title,
  identifiers = [],
}: {
  releaseId: number
  artist: string
  title: string
  identifiers?: Identifier[]
}) {
  const links = searchLinks(artist, title)
  const [busy, setBusy] = useState(false)
  const barcodes = identifiers.filter((i) => i.type === 'Barcode').map((i) => i.value)

  async function openExact(kind: 'apple' | 'all') {
    // open the tab right away so it isn't blocked as a popup, then point it at the album
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    setBusy(true)
    try {
      const album = await findAppleAlbum(String(releaseId), barcodes, artist, title)
      // without an Apple Music album there's no album.link page, so search the web instead
      const url = album ? (kind === 'apple' ? album.url : allServicesUrl(album)) : kind === 'apple' ? links.apple : links.web
      if (tab) tab.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      tab?.close()
      toast("Couldn't look that up right now.", { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
      {/* phones need the room for all four links */}
      <Headphones size={16} className="mr-1 hidden text-stone-500 sm:block" aria-hidden />
      <span className="sr-only">Listen on</span>
      <a href={links.spotify} target="_blank" rel="noopener" className={pill}>
        Spotify
      </a>
      <button type="button" disabled={busy} onClick={() => openExact('apple')} className={pill}>
        Apple Music
      </button>
      <a href={links.youtube} target="_blank" rel="noopener" className={pill}>
        YouTube Music
      </a>
      <button type="button" disabled={busy} onClick={() => openExact('all')} className={pill}>
        All services
      </button>
    </div>
  )
}
