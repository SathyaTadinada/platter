// Small per-device preferences, kept in localStorage. Storage can be blocked (some private
// modes do this), so reads fall back to a default and writes just don't outlast the visit.

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// a stored value, if it's one of the allowed ones
export function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = readPref(key)
  return allowed.includes(v as T) ? (v as T) : fallback
}

export function removePref(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // blocked
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // blocked
  }
}
