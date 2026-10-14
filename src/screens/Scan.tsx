import { useCallback, useRef } from 'react'
import { Link, useLocation } from 'wouter'
import { InstallHint } from '../components/InstallHint'
import { TorchIcon } from '../components/Icons'
import { buttonClass, Notice } from '../components/ui'
import { useScanner } from '../scanner/useScanner'
import { FieldNudge } from './FieldNudge'

export function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [, navigate] = useLocation()
  const onCode = useCallback((code: string) => navigate(`/results?barcode=${code}`), [navigate])
  const { state, torch, toggleTorch } = useScanner(videoRef, onCode)

  const blocked = state === 'denied' || state === 'unavailable' || state === 'error'

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-28">
      <h1 className="sr-only">Scan</h1>
      <div className="space-y-3">
        <InstallHint />
        <FieldNudge />
      </div>

      <div className="relative mt-3 aspect-[3/4] w-full overflow-hidden rounded-3xl bg-stone-900">
        <video ref={videoRef} playsInline muted autoPlay className="size-full object-cover" />
        {state === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-1/2 w-[90%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
          </div>
        )}
        {state === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-stone-300">Starting camera…</p>}
        {torch.supported && (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torch.on}
            aria-label="Flashlight"
            className={`absolute right-3 bottom-3 rounded-full p-3 ${torch.on ? 'bg-accent-500 text-stone-950' : 'bg-black/50 text-white'}`}
          >
            <TorchIcon />
          </button>
        )}
        {blocked && (
          <div className="absolute inset-0 flex items-center p-4">
            <Notice tone="warn">
              {state === 'denied'
                ? 'Camera access is off. Allow it in your browser settings for this site, or type the barcode instead.'
                : state === 'error'
                  ? 'The scanner stopped unexpectedly. Reload the page, or type the barcode instead.'
                  : 'No camera found on this device. Type the barcode instead.'}
            </Notice>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-sm text-stone-500">Point the camera at the barcode on the back of the sleeve.</p>

      <Link href="/search" className={buttonClass('secondary', 'mt-4 w-full')}>
        Type it in instead
      </Link>
    </div>
  )
}
