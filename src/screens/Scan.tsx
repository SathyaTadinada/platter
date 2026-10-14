import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronRight, Flashlight, FlashlightOff, ImageUp, Keyboard, ScanBarcode, SwitchCamera } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { InstallHint } from '../components/InstallHint'
import { Button, buttonClass, Notice, Screen } from '../components/ui'
import { db } from '../db/db'
import { useQueue } from '../hooks/queue'
import { digitsOnly, formatBarcodeInput } from '../lib/barcode'
import { enqueueBarcode } from '../lib/queue'
import { useScanner } from '../scanner/useScanner'
import { FieldNudge } from './FieldNudge'

// The camera only starts after an explicit tap, then stays on for the rest of
// the session so "Scan next" goes straight back to scanning.
let cameraWanted = false

// A still image being read: a photo the user picked, or a frame from the shutter
type Still = { url: string; status: 'reading' | 'failed' }

type Mode = 'single' | 'batch'
const MODE_KEY = 'platter.scanMode'

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'batch' ? 'batch' : 'single'
  } catch {
    return 'single'
  }
}

export function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [, navigate] = useLocation()
  const [on, setOn] = useState(cameraWanted)
  const [still, setStill] = useState<Still | null>(null)
  const [mode, setMode] = useState<Mode>(loadMode)
  const [flash, setFlash] = useState<string | null>(null)
  const { kick } = useQueue()
  const waiting = useLiveQuery(() => db.queue.where('status').noneOf(['added']).count(), []) ?? 0

  // batch mode: queue it, show a quick confirmation, keep scanning
  const onCode = useCallback(
    (code: string, source: 'scan' | 'typed' = 'scan') => {
      if (mode === 'single') return navigate(`/results?barcode=${code}`)
      enqueueBarcode(code, source).then(kick)
      setFlash(code)
      setStill(null)
    },
    [mode, navigate, kick],
  )
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1500)
    return () => clearTimeout(t)
  }, [flash])
  const scanner = useScanner(videoRef, onCode, on, mode === 'batch')

  function switchMode(m: Mode) {
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // not important
    }
  }
  const { state, torch, zoom, cameras } = scanner

  const stillUrl = still?.url
  useEffect(() => () => void (stillUrl && URL.revokeObjectURL(stillUrl)), [stillUrl])

  const start = () => {
    cameraWanted = true
    setOn(true)
  }

  async function readStill(image: Blob) {
    setStill({ url: URL.createObjectURL(image), status: 'reading' })
    try {
      const { decodeImage } = await import('../scanner/zxing')
      const code = await decodeImage(image)
      if (code) return onCode(code, 'scan')
    } catch {
      // fall through to the failed state
    }
    setStill((s) => s && { ...s, status: 'failed' })
  }

  // Grabs the current frame at full resolution; slower to read than the live
  // scan but tries harder (rotation, both binarizers)
  function shutter() {
    const v = videoRef.current
    if (!v?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0)
    canvas.toBlob((b) => b && readStill(b), 'image/jpeg', 0.92)
  }

  const blocked = state === 'denied' || state === 'unavailable' || state === 'error'
  const live = state === 'scanning' && !still

  const chooseButton = (
    <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
      <ImageUp size={20} aria-hidden />
      Choose a photo
    </Button>
  )

  const modeSwitch = (
    <div
      role="tablist"
      aria-label="Scan mode"
      className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200 p-1 lg:max-w-[26rem] dark:bg-stone-800"
    >
      {(
        [
          ['single', 'One at a time'],
          ['batch', 'Batch'],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => switchMode(m)}
          className={`min-h-9 rounded-lg text-sm font-medium ${mode === m ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <Screen title="Scan" width="wide" toolbar={modeSwitch}>
      {/* no `capture` attribute, so phones offer camera, photo library, and files */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) readStill(f)
          e.target.value = ''
        }}
      />
      <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-8">
        <div>
          <div className="relative mx-auto aspect-[4/5] max-h-[55dvh] w-full overflow-hidden rounded-3xl bg-stone-900 lg:aspect-[3/4] lg:max-h-none">
            <video ref={videoRef} playsInline muted autoPlay className={`size-full object-cover ${on ? '' : 'hidden'}`} />

            {!on && !still && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-stone-300">
                <ScanBarcode size={48} aria-hidden />
                <p className="text-sm">Point the camera at the barcode</p>
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
            {on && state === 'starting' && (
              <p className="absolute inset-0 flex items-center justify-center text-stone-300">Starting camera…</p>
            )}

            {flash && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3" role="status">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-lg">
                  <Check size={16} aria-hidden />
                  Added {flash} to the batch
                </span>
              </div>
            )}

            {still && (
              <div className="absolute inset-0 bg-stone-950">
                <img src={still.url} alt="" className="size-full object-contain" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 p-6 text-center text-white">
                  {still.status === 'reading' ? (
                    <>
                      <span className="size-12 animate-spin rounded-full border-4 border-white/30 border-t-white" aria-hidden />
                      <p className="font-medium">Reading barcode…</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Couldn't find a barcode</p>
                      <p className="text-sm text-white/80">Get closer so it fills the frame, or type it in.</p>
                      <Button variant="secondary" onClick={() => setStill(null)}>
                        {on ? 'Back to camera' : 'OK'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {live && (
              <>
                <button
                  type="button"
                  onClick={shutter}
                  aria-label="Take photo"
                  className="absolute bottom-4 left-1/2 size-16 -translate-x-1/2 rounded-full border-4 border-white bg-white/25 transition active:scale-90 active:bg-white/60"
                />
                <div className="absolute right-3 bottom-5 flex items-center gap-2">
                  {zoom.levels.length > 0 && (
                    <button
                      type="button"
                      onClick={scanner.cycleZoom}
                      aria-label="Zoom"
                      className="min-w-11 rounded-full bg-black/55 px-2.5 py-2.5 text-sm font-semibold text-white"
                    >
                      {zoom.value}×
                    </button>
                  )}
                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={scanner.switchCamera}
                      aria-label="Switch camera"
                      className="rounded-full bg-black/55 p-2.5 text-white"
                    >
                      <SwitchCamera size={22} />
                    </button>
                  )}
                </div>
                {torch.supported && (
                  <button
                    type="button"
                    onClick={scanner.toggleTorch}
                    aria-pressed={torch.on}
                    aria-label="Flashlight"
                    className={`absolute bottom-5 left-3 rounded-full p-2.5 ${torch.on ? 'bg-accent-500 text-stone-950' : 'bg-black/55 text-white'}`}
                  >
                    {torch.on ? <Flashlight size={22} /> : <FlashlightOff size={22} />}
                  </button>
                )}
              </>
            )}

            {blocked && !still && (
              <div className="absolute inset-0 flex items-center p-4">
                <Notice tone="warn">
                  {state === 'denied'
                    ? 'Camera access is blocked. Allow it in your browser settings, or use a photo or type the barcode.'
                    : state === 'error'
                      ? 'The scanner stopped. Reload the page or type the barcode.'
                      : 'No camera found. Use a photo or type the barcode.'}
                </Notice>
              </div>
            )}
          </div>
          {live && scanner.currentLabel && cameras.length > 1 && (
            <p className="mt-2 text-center text-xs text-stone-500">{scanner.currentLabel}</p>
          )}

          {mode === 'batch' && (
            <Link href="/batch" className={buttonClass(waiting ? 'primary' : 'secondary', 'mt-4 w-full')}>
              {waiting ? `Review batch (${waiting})` : 'Batch is empty'}
              <ChevronRight size={18} aria-hidden />
            </Link>
          )}

          {mode === 'single' ? (
            <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
              <Link href="/search" className={buttonClass('secondary')}>
                <Keyboard size={20} aria-hidden />
                Type it in
              </Link>
              {chooseButton}
            </div>
          ) : (
            <div className="mt-4 space-y-2 lg:hidden">
              <ManualBarcode label="Or type a barcode" button="Add" onSubmit={(c) => onCode(c, 'typed')} inline />
              {chooseButton}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4 lg:mt-0">
          <div className="hidden space-y-4 lg:block">
            <ManualBarcode
              label="Or type the barcode number"
              button={mode === 'batch' ? 'Add to batch' : 'Look it up'}
              onSubmit={(c) => onCode(c, 'typed')}
            />
            {chooseButton}
          </div>
          <InstallHint />
          <FieldNudge />
        </div>
      </div>
    </Screen>
  )
}

function ManualBarcode({
  label,
  button,
  onSubmit,
  inline,
}: {
  label: string
  button: string
  onSubmit: (code: string) => void
  inline?: boolean
}) {
  const [value, setValue] = useState('')
  const code = digitsOnly(value)
  return (
    <form
      className={inline ? 'flex items-end gap-2' : 'space-y-2'}
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length < 8) return
        onSubmit(code)
        setValue('')
      }}
    >
      <label className={inline ? 'block min-w-0 flex-1' : 'block'}>
        <span className="mb-1 block text-sm font-medium">{label}</span>
        <input
          value={value}
          onChange={(e) => setValue(formatBarcodeInput(e.target.value))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 0 75678 16412 5"
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>
      <Button type="submit" className={inline ? '' : 'w-full'} disabled={code.length < 8}>
        {button}
      </Button>
    </form>
  )
}
