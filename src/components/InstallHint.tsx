import { Share } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSetting, setSetting } from '../db/db'
import { Button, Card } from './ui'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

// Every browser on iOS uses Safari's engine, and they all install through Share
export const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))

// Chrome, Edge and Android browsers offer a real install prompt; keep hold of it
let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallEvent
  listeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

export function useInstallPrompt() {
  const prompt = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => deferred,
  )
  return prompt
    ? async () => {
        await prompt.prompt()
        await prompt.userChoice
        deferred = null
        listeners.forEach((l) => l())
      }
    : null
}

// Shown on phones only, where installing matters most
export function InstallHint() {
  const install = useInstallPrompt()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    getSetting<boolean>('installHintDismissed').then((d) => setDismissed(Boolean(d)))
  }, [])

  const ios = isIos()
  if (dismissed || isStandalone() || (!ios && !install)) return null

  const dismiss = () => {
    setDismissed(true)
    setSetting('installHintDismissed', true)
  }

  return (
    <Card className="space-y-2 lg:hidden">
      <p className="font-semibold">Add Platter to your home screen</p>
      {ios ? (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Tap <Share className="inline align-text-bottom" size={16} aria-label="Share" />, then <b>Add to Home Screen</b>. Otherwise iOS
            may clear Platter's data if you don't open it for a while, which signs you out.
          </p>
        </>
      ) : (
        <Button className="w-full" onClick={() => install!().then(dismiss)}>
          Install
        </Button>
      )}
      <button type="button" className="text-sm text-stone-500 underline" onClick={dismiss}>
        Not now
      </button>
    </Card>
  )
}
