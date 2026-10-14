import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ReadConfirmer } from './confirm'

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error'

type Camera = { id: string; label: string }

const FRAME_GAP = 80 // ms between decode attempts
const MAX_WIDTH = 1280 // downscale frames past this for speed
const CAMERA_KEY = 'platter.camera'

// iPhones expose "virtual" cameras that switch lenses on their own, which is
// the only way to get close-up focus in Safari. Prefer them when present.
const PREFERRED = [/triple camera/i, /dual wide camera/i, /dual camera/i]

function pickCamera(cams: Camera[]): string | undefined {
  try {
    const saved = localStorage.getItem(CAMERA_KEY)
    if (saved && cams.some((c) => c.id === saved)) return saved
  } catch {
    // storage can be unavailable; fall through
  }
  for (const re of PREFERRED) {
    const hit = cams.find((c) => re.test(c.label))
    if (hit) return hit.id
  }
}

function rememberCamera(id: string) {
  try {
    localStorage.setItem(CAMERA_KEY, id)
  } catch {
    // not important
  }
}

type Caps = { torch?: boolean; zoom?: { min: number; max: number } }

// Runs the camera into `videoRef` while `enabled`, decoding frames until a
// barcode is confirmed, then calls onCode and stops.
export function useScanner(videoRef: RefObject<HTMLVideoElement | null>, onCode: (code: string) => void, enabled: boolean) {
  const [state, setState] = useState<ScannerState>('idle')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [cameraId, setCameraId] = useState<string | undefined>()
  const [torch, setTorch] = useState({ supported: false, on: false })
  const [zoom, setZoom] = useState<{ levels: number[]; value: number }>({ levels: [], value: 1 })
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    if (!enabled) {
      setState('idle')
      return
    }
    let stopped = false
    let stream: MediaStream | null = null
    let timer = 0
    let frame = 0
    const confirmer = new ReadConfirmer()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable')
      setState('starting')
      const zxing = await import('./zxing')
      zxing.warmUp()

      const video: MediaTrackConstraints = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video })
      } catch (e) {
        const name = (e as DOMException).name
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
        return
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop())

      // labels are only visible after permission is granted
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams = devices.filter((d) => d.kind === 'videoinput').map((d) => ({ id: d.deviceId, label: d.label }))
      setCameras(cams)
      const track = stream.getVideoTracks()[0]
      if (!cameraId) {
        const better = pickCamera(cams)
        if (better && better !== track.getSettings().deviceId) {
          // restart on the better camera; this effect runs again
          stream.getTracks().forEach((t) => t.stop())
          setCameraId(better)
          return
        }
      }

      trackRef.current = track
      const caps = (track.getCapabilities?.() ?? {}) as Caps
      setTorch({ supported: Boolean(caps.torch), on: false })
      const levels = caps.zoom ? [1, 2, 3].filter((z) => z >= caps.zoom!.min && z <= caps.zoom!.max) : []
      setZoom({ levels: levels.length > 1 ? levels : [], value: 1 })
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})

      const el = videoRef.current
      if (!el) return
      el.srcObject = stream
      await el.play().catch(() => {})
      setState('scanning')
      loop(zxing.decodeFrame)
    }

    async function loop(decode: (img: ImageData, b: 'LocalAverage' | 'GlobalHistogram') => Promise<string | null>) {
      if (stopped) return
      const el = videoRef.current
      if (el && ctx && el.readyState >= 2 && el.videoWidth) {
        // alternate between the middle band and the whole frame, and between
        // two binarizers; glare and low light each suit a different one
        const full = frame % 2 === 1
        const binarizer = frame % 4 < 2 ? 'LocalAverage' : 'GlobalHistogram'
        frame++
        const sw = full ? el.videoWidth : el.videoWidth * 0.9
        const sh = full ? el.videoHeight : el.videoHeight * 0.5
        const sx = (el.videoWidth - sw) / 2
        const sy = (el.videoHeight - sh) / 2
        const scale = Math.min(1, MAX_WIDTH / sw)
        canvas.width = Math.round(sw * scale)
        canvas.height = Math.round(sh * scale)
        ctx.drawImage(el, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        try {
          const code = confirmer.push(await decode(ctx.getImageData(0, 0, canvas.width, canvas.height), binarizer), performance.now())
          if (code && !stopped) {
            stopped = true
            navigator.vibrate?.(40)
            onCodeRef.current(code)
            return
          }
        } catch {
          setState('error')
          return
        }
      }
      timer = window.setTimeout(() => loop(decode), FRAME_GAP)
    }

    start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }
  }, [enabled, cameraId, videoRef])

  const switchCamera = useCallback(() => {
    if (cameras.length < 2) return
    const current = trackRef.current?.getSettings().deviceId ?? cameraId
    const i = cameras.findIndex((c) => c.id === current)
    const next = cameras[(i + 1) % cameras.length]
    rememberCamera(next.id)
    setCameraId(next.id)
  }, [cameras, cameraId])

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current
    if (!track) return
    const on = !torch.on
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => {})
    setTorch((t) => ({ ...t, on }))
  }, [torch.on])

  const cycleZoom = useCallback(async () => {
    const track = trackRef.current
    if (!track || !zoom.levels.length) return
    const next = zoom.levels[(zoom.levels.indexOf(zoom.value) + 1) % zoom.levels.length]
    await track.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] }).catch(() => {})
    setZoom((z) => ({ ...z, value: next }))
  }, [zoom])

  const currentLabel = cameras.find((c) => c.id === (trackRef.current?.getSettings().deviceId ?? cameraId))?.label

  return { state, cameras, currentLabel, switchCamera, torch, toggleTorch, zoom, cycleZoom }
}
