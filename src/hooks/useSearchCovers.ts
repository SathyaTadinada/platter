import { useEffect, useState } from 'react'
import { getRelease } from '../api/discogs/endpoints'
import { realImage } from '../lib/format'
import { useSignedIn } from './session'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Signed-out search results (the demo) come without images, though each release still has
// them. Look those up one at a time, quietly and after anything else going on. The lookups
// are cached, so opening one of the results afterwards is instant too.
export function useSearchCovers(ids: number[], enabled: boolean): Map<number, string> {
  const { client } = useSignedIn()
  const [covers, setCovers] = useState(() => new Map<number, string>())
  const key = enabled ? ids.join(',') : ''
  useEffect(() => {
    if (!key) return
    let stopped = false
    ;(async () => {
      for (const id of key.split(',').map(Number)) {
        while (client.status.active > 0 && !stopped) await sleep(500)
        if (stopped) return
        try {
          const r = await getRelease(client.background, id)
          const thumb = realImage(r.images?.[0]?.uri150 ?? r.thumb)
          if (thumb && !stopped) setCovers((m) => new Map(m).set(id, thumb))
        } catch {
          return
        }
      }
    })()
    return () => {
      stopped = true
    }
  }, [key, client])
  return covers
}
