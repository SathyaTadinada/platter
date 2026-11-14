import { CloudError } from '../../lib/cloud'

const CANT_CHECK = 'Can’t check with Discogs right now. Try again in a minute.'

export function explain(e: unknown, wrong: string): string | null {
  // the passkey prompt was closed
  if (e instanceof Error && e.name === 'NotAllowedError') return null
  if (e instanceof CloudError) {
    if (e.status === 401) return wrong
    if (e.status === 403) return e.message
    if (e.status === 429) return 'Too many tries. Wait a minute and try again.'
    if (e.status === 503) return CANT_CHECK
    if (e.status === 0) return e.message
  }
  return 'Something went wrong. Try again in a minute.'
}

// Set when this browser has just made the account, so a passkey can be offered once
export const created = { now: false }
