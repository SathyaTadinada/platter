import { newUid } from '../db/capture'
import { readPref, writePref } from './prefs'

// This browser, as far as cloud sync is concerned: who's adding a batch record, who logged a play
const KEY = 'platter.device'
let id: string | null = null

export function deviceId(): string {
  id ??= readPref(KEY)
  if (!id) {
    id = newUid()
    writePref(KEY, id)
  }
  return id
}
