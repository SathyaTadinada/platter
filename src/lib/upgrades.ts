import type { LibraryItem } from '../db/db'

// Records in rough enough shape to be worth replacing. Grades are the Media Condition field's
// own options, best first, so "at or below" means at that position or later in the list.

export const UPGRADE_TARGET = 'Very Good Plus (VG+)'

// One step below Good, as long as the field has the usual grades
export const defaultThreshold = (grades: string[]) => grades.find((g) => /^fair\b/i.test(g)) ?? grades.at(-2) ?? grades[0]

export function needsUpgrade(items: LibraryItem[], fieldId: number, grades: string[], threshold: string) {
  const cutoff = grades.indexOf(threshold)
  if (cutoff < 0) return []
  return items
    .map((item) => ({ item, rank: grades.indexOf(item.fields[fieldId] ?? '') }))
    .filter((r) => r.rank >= cutoff)
    .sort((a, b) => b.rank - a.rank || a.item.artist.localeCompare(b.item.artist) || a.item.title.localeCompare(b.item.title))
    .map((r) => r.item)
}

// How many records have no grade at all, so the page can say they weren't checked
export const ungraded = (items: LibraryItem[], fieldId: number, grades: string[]) =>
  items.filter((i) => !grades.includes(i.fields[fieldId] ?? '')).length
