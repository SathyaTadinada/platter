import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../db/db'
import { Button, Card } from './ui'
import { ShareIcon } from './Icons'

type InstallEvent = Event & { prompt: () => Promise<void> }

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))

let deferred: InstallEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallEvent
})

export function InstallSteps() {
  if (isIos()) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        In Safari, tap <ShareIcon className="inline align-text-bottom" width={16} height={16} /> Share, then <b>Add to Home Screen</b>.
      </p>
    )
  }
  return <p className="text-sm text-stone-600 dark:text-stone-400">Use your browser's menu and choose Install app or Add to Home screen.</p>
}

export function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    getSetting<boolean>('installHintDismissed').then((d) => setShow(!d))
  }, [])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    setSetting('installHintDismissed', true)
  }

  return (
    <Card className="space-y-2">
      <p className="font-semibold">Add Platter to your home screen</p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        It opens full screen, and your sign-in is safer there: Safari can clear data for sites that aren't installed and haven't been
        opened in a while.
      </p>
      {deferred ? (
        <Button className="w-full" onClick={() => deferred?.prompt().then(dismiss)}>
          Install
        </Button>
      ) : (
        <InstallSteps />
      )}
      <button type="button" className="text-sm text-stone-500 underline" onClick={dismiss}>
        Not now
      </button>
    </Card>
  )
}
