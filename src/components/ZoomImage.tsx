import { useEffect, useRef, useState } from 'react'

const MAX = 4
const DOUBLE = 2.5 // how far a double-click goes in
const SWIPE = 60 // px sideways before a drag at normal size counts as a swipe

type View = { scale: number; x: number; y: number }
type GestureEvent = Event & { scale: number; clientX: number; clientY: number }

// A photo that zooms inside its own frame: pinch on a trackpad or a screen, or double-click, then
// drag (or scroll) to look around. The page itself never zooms over it, so the arrow keys are left
// to whatever holds it. At normal size a sideways swipe is passed on, for the next photo.
export function ZoomImage({ src, className = '', onSwipe }: { src: string; className?: string; onSwipe?: (by: 1 | -1) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [view, setViewState] = useState<View>({ scale: 1, x: 0, y: 0 })
  // read by every event, and a pinch sends many before the next render, so it's kept up to date here
  // rather than from the last render
  const current = useRef(view)
  const setView = (v: View) => {
    current.current = v
    setViewState(v)
  }
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; scale: number } | null>(null)
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  // never panned past the photo's edges
  const fit = (scale: number, x: number, y: number): View => {
    const el = box.current
    if (!el || scale <= 1) return { scale: 1, x: 0, y: 0 }
    const maxX = (el.clientWidth * (scale - 1)) / 2
    const maxY = (el.clientHeight * (scale - 1)) / 2
    return { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
  }
  // zooms by a factor while keeping the point under the cursor (or fingers) where it is
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const v = current.current
    const scale = Math.min(MAX, Math.max(1, v.scale * factor))
    const k = scale / v.scale
    const px = cx - (r.left + r.width / 2)
    const py = cy - (r.top + r.height / 2)
    setView(fit(scale, px - (px - v.x) * k, py - (py - v.y) * k))
  }
  const zoom = useRef(zoomAt)
  zoom.current = zoomAt
  const pan = useRef<(dx: number, dy: number) => void>(() => {})
  pan.current = (dx, dy) => {
    const v = current.current
    setView(fit(v.scale, v.x + dx, v.y + dy))
  }

  // trackpad pinches: Chrome and Firefox send them as wheel events with ctrl held, Safari as gesture
  // events. Both are taken here so the page doesn't zoom instead.
  useEffect(() => {
    const el = box.current
    if (!el) return
    let gesturing = false
    let start = 1
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        if (!gesturing) zoom.current(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
      } else if (current.current.scale > 1) {
        e.preventDefault()
        pan.current(-e.deltaX, -e.deltaY)
      }
    }
    const gestureStart = (e: Event) => {
      e.preventDefault()
      gesturing = true
      start = current.current.scale
    }
    const gestureChange = (e: Event) => {
      e.preventDefault()
      const g = e as GestureEvent
      zoom.current((start * g.scale) / current.current.scale, g.clientX, g.clientY)
    }
    const gestureEnd = (e: Event) => {
      e.preventDefault()
      gesturing = false
    }
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('gesturestart', gestureStart)
    el.addEventListener('gesturechange', gestureChange)
    el.addEventListener('gestureend', gestureEnd)
    return () => {
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('gesturestart', gestureStart)
      el.removeEventListener('gesturechange', gestureChange)
      el.removeEventListener('gestureend', gestureEnd)
    }
  }, [])

  const distance = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  return (
    <div
      ref={box}
      className={`relative touch-none overflow-hidden select-none ${view.scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'} ${className}`}
      onDoubleClick={(e) => (current.current.scale > 1 ? setView({ scale: 1, x: 0, y: 0 }) : zoomAt(DOUBLE, e.clientX, e.clientY))}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pointers.current.size === 2) {
          pinch.current = { dist: distance(), scale: current.current.scale }
          drag.current = null
        } else if (pointers.current.size === 1) {
          drag.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY }
        }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()]
          const target = (pinch.current.scale * distance()) / pinch.current.dist
          zoomAt(target / current.current.scale, (a.x + b.x) / 2, (a.y + b.y) / 2)
        } else if (drag.current && current.current.scale > 1) {
          pan.current(e.clientX - drag.current.x, e.clientY - drag.current.y)
          drag.current = { ...drag.current, x: e.clientX, y: e.clientY }
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId)
        const d = drag.current
        if (d && current.current.scale === 1 && onSwipe) {
          const dx = e.clientX - d.startX
          if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(e.clientY - d.startY)) onSwipe(dx < 0 ? 1 : -1)
        }
        pinch.current = null
        // one finger left after a pinch carries on as a drag from where it is
        const rest = [...pointers.current.values()][0]
        drag.current = rest ? { x: rest.x, y: rest.y, startX: rest.x, startY: rest.y } : null
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId)
        pinch.current = null
        drag.current = null
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="block max-h-[65dvh] w-auto"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
    </div>
  )
}
