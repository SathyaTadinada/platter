// One line describing a long-running action (like removing records), shown in the status
// pill at the bottom so there's a single place to watch progress
let text: string | null = null
const listeners = new Set<() => void>()

export function setTask(t: string | null) {
  text = t
  listeners.forEach((f) => f())
}

export const getTask = () => text

export function subscribeTask(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}

// Background work (price checks) waits while something the user started is running, so
// the rate limit goes to that first. holdBackground() returns the release.
let holds = 0

export function holdBackground() {
  holds++
  let released = false
  return () => {
    if (!released) holds--
    released = true
  }
}

export const backgroundHeld = () => holds > 0 || text !== null

// How long a run has left, from the Discogs requests it still needs and the rate Discogs allows
export function timeLeft(requests: number, perMinute: number): string | null {
  if (requests <= 0 || perMinute <= 0) return null
  const minutes = requests / perMinute
  return minutes < 1 ? 'Under a minute left' : `About ${Math.round(minutes)} min left`
}
