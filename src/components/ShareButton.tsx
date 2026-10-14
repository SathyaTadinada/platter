import { Share } from 'lucide-react'
import { toast } from './Toaster'
import { IconButton } from './ui'

// The system share sheet where there is one (phones, Safari), otherwise copy the link
export function ShareButton({ url, title }: { url: string; title: string }) {
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // closed the sheet
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied', { tone: 'success' })
    } catch {
      toast("Couldn't copy the link", { tone: 'error' })
    }
  }
  return (
    <IconButton label="Share the Discogs link" onClick={share}>
      <Share size={20} />
    </IconButton>
  )
}
