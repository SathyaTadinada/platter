import { Camera, Flashlight, FlashlightOff, Keyboard, ScanBarcode, SwitchCamera } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { InstallHint } from '../components/InstallHint'
import { Button, buttonClass, Notice, Screen } from '../components/ui'
import { digitsOnly } from '../lib/barcode'
import { useScanner } from '../scanner/useScanner'
import { FieldNudge } from './FieldNudge'

// The camera only starts after an explicit tap, then stays on for the rest of
// the session so "Scan next" goes straight back to scanning.
let cameraWanted = false

export function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [, navigate] = useLocation()
  const [on, setOn] = useState(cameraWanted)
  const onCode = useCallback((code: string) => navigate(`/results?barcode=${code}`), [navigate])
  const scanner = useScanner(videoRef, onCode, on)
  const { state, torch, zoom, cameras } = scanner

  const start = () => {
    cameraWanted = true
    setOn(true)
  }

  const blocked = state === 'denied' || state === 'unavailable' || state === 'error'
  const live = state === 'scanning'

  return (
    <Screen title="Scan" width="wide">
      <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-8">
        <div>
          <div className="relative mx-auto aspect-[3/4] max-h-[60dvh] w-full overflow-hidden rounded-3xl bg-stone-900 lg:max-h-none">
            <video ref={videoRef} playsInline muted autoPlay className={`size-full object-cover ${on ? '' : 'hidden'}`} />

            {!on && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-stone-300">
                <ScanBarcode size={48} aria-hidden />
                <p className="text-sm">Point your camera at the barcode on the back of the sleeve.</p>
                <button type="button" onClick={start} className={buttonClass('primary', 'bg-accent-500! text-stone-950!')}>
                  Start camera
                </button>
              </div>
            )}

            {live && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-1/2 w-[90%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
              </div>
            )}
            {on && state === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-stone-300">Starting camera…</p>}

            {live && (
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-end gap-2">
                {zoom.levels.length > 0 && (
                  <button type="button" onClick={scanner.cycleZoom} aria-label="Zoom" className="min-w-12 rounded-full bg-black/55 px-3 py-2.5 text-sm font-semibold text-white">
                    {zoom.value}×
                  </button>
                )}
                {torch.supported && (
                  <button
                    type="button"
                    onClick={scanner.toggleTorch}
                    aria-pressed={torch.on}
                    aria-label="Flashlight"
                    className={`rounded-full p-2.5 ${torch.on ? 'bg-accent-500 text-stone-950' : 'bg-black/55 text-white'}`}
                  >
                    {torch.on ? <Flashlight size={22} /> : <FlashlightOff size={22} />}
                  </button>
                )}
                {cameras.length > 1 && (
                  <button type="button" onClick={scanner.switchCamera} aria-label="Switch camera" className="rounded-full bg-black/55 p-2.5 text-white">
                    <SwitchCamera size={22} />
                  </button>
                )}
              </div>
            )}

            {blocked && (
              <div className="absolute inset-0 flex items-center p-4">
                <Notice tone="warn">
                  {state === 'denied'
                    ? 'Camera access is off. Allow it for this site in your browser settings, or take a photo or type the barcode instead.'
                    : state === 'error'
                      ? 'The scanner stopped unexpectedly. Reload the page, or type the barcode instead.'
                      : 'No camera available. Take a photo or type the barcode instead.'}
                </Notice>
              </div>
            )}
          </div>
          {live && scanner.currentLabel && cameras.length > 1 && <p className="mt-2 text-center text-xs text-stone-500">{scanner.currentLabel}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
            <Link href="/search" className={buttonClass('secondary')}>
              <Keyboard size={20} aria-hidden />
              Type it in
            </Link>
            <PhotoButton />
          </div>
        </div>

        <div className="mt-6 space-y-4 lg:mt-0">
          <div className="hidden space-y-4 lg:block">
            <ManualBarcode />
            <PhotoButton />
          </div>
          <InstallHint />
          <FieldNudge />
        </div>
      </div>
    </Screen>
  )
}

// Opens the phone's own camera app, which focuses up close far better than a
// live browser stream, then decodes the still photo.
function PhotoButton() {
  const [, navigate] = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function onFile(file: File) {
    setBusy(true)
    setFailed(false)
    try {
      const { decodeImage } = await import('../scanner/zxing')
      const code = await decodeImage(file)
      if (code) navigate(`/results?barcode=${code}`)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="secondary" className="w-full" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Camera size={20} aria-hidden />
        {busy ? 'Reading…' : 'Take a photo'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      {failed && (
        <div className="col-span-2">
          <Notice tone="warn">No barcode found in that photo. Fill the frame with the barcode and keep it sharp, or type the number in.</Notice>
        </div>
      )}
    </>
  )
}

function ManualBarcode() {
  const [, navigate] = useLocation()
  const [value, setValue] = useState('')
  const code = digitsOnly(value)
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length >= 8) navigate(`/results?barcode=${code}`)
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Or type the barcode number</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 0 75678 16412 5"
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>
      <Button type="submit" className="w-full" disabled={code.length < 8}>
        Look it up
      </Button>
    </form>
  )
}
