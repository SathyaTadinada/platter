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
