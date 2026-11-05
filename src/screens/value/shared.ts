import type { LibraryItem } from '../../db/db'
import type { RecordValue, ValueSnapshot } from '../../lib/value'
import { statCard } from '../../components/stats'

// What the Value view's sections have in common

export const card = statCard
// a shade darker than usual in light mode so they read on the tinted pills
export const up = 'text-emerald-700 dark:text-emerald-400'
export const down = 'text-red-700 dark:text-red-400'

export type Valued = { item: LibraryItem; value: RecordValue }
export type Money = (n: number, whole?: boolean) => string

export const shortDate = (s: ValueSnapshot) => new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
