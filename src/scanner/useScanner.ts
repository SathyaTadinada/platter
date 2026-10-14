import { useEffect, useRef, useState, type RefObject } from 'react'

export type ScannerState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'error'

const FRAME_GAP = 120 // ms between decode attempts
const MAX_WIDTH = 960 // downscale frames for speed

// Runs the camera into `videoRef` and calls onCode once a barcode reads the
// same twice in a row, which filters out most misreads.
export function useScanner(videoRef: RefObject<HTMLVideoElement | null>, onCode: (code: string) => void, active = true) {
  const [state, setState] = useState<ScannerState>('starting')
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false })
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    if (!active) return
    let stopped = false
    let stream: MediaStream | null = null
    let timer = 0
    let last = ''
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // loaded on demand; the decoder is most of the bundle
    let decodeFrame: (img: ImageData) => Promise<string | null>

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable')
      const zxing = await import('./zxing')
      decodeFrame = zxing.decodeFrame
      zxing.warmUp()
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
      } catch (e) {
        const name = (e as DOMException).name
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
        return
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop())

      const track = stream.getVideoTracks()[0]
      trackRef.current = track
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean }
      setTorch({ supported: Boolean(caps.torch), on: false })

      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play().catch(() => {})
      setState('scanning')
      loop()
    }

    async function loop() {
      if (stopped) return
      const video = videoRef.current
      if (video && ctx && video.readyState >= 2 && video.videoWidth) {
        // middle band of the frame, where the reticle is
        const sw = video.videoWidth * 0.9
        const sh = video.videoHeight * 0.5
        const sx = (video.videoWidth - sw) / 2
        const sy = (video.videoHeight - sh) / 2
        const scale = Math.min(1, MAX_WIDTH / sw)
        canvas.width = Math.round(sw * scale)
        canvas.height = Math.round(sh * scale)
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        try {
          const code = await decodeFrame(ctx.getImageData(0, 0, canvas.width, canvas.height))
          if (code && code === last && !stopped) {
            stopped = true
            navigator.vibrate?.(40)
            onCodeRef.current(code)
            return
          }
          last = code ?? ''
        } catch {
          setState('error')
          return
        }
      }
      timer = window.setTimeout(loop, FRAME_GAP)
    }

    start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }
  }, [active, videoRef])

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const on = !torch.on
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => {})
    setTorch((t) => ({ ...t, on }))
  }

  return { state, torch, toggleTorch }
}
