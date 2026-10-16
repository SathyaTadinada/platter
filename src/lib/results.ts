import type { SearchResult } from '../api/discogs/types'
import { ALL_MEDIA } from './format'
import type { FacetOption } from './library'

// Narrowing down search results by what Discogs says about each release.
// Works on the results already loaded; loading more pages adds to them.

export type ResultFilters = { format?: string; tag?: string; country?: string; decade?: string; genre?: string }
export type ResultFacetKey = keyof ResultFilters

// "All Media" isn't a format (see format.ts), same as in the Collection filter
const formatsOf = (r: SearchResult) =>
  [...new Set(r.formats?.map((f) => f.name) ?? r.format?.slice(0, 1) ?? [])].filter((n) => n !== ALL_MEDIA)
const tagsOf = (r: SearchResult) => {
  const names = new Set(formatsOf(r))
  return [...new Set((r.formats ? r.formats.flatMap((f) => f.descriptions ?? []) : (r.format ?? [])).filter((t) => !names.has(t)))]
}
const decadeOf = (r: SearchResult) => {
  const y = Number(r.year)
  return y > 0 ? [`${Math.floor(y / 10) * 10}s`] : []
}

const values: Record<ResultFacetKey, (r: SearchResult) => string[]> = {
  format: formatsOf,
  tag: tagsOf,
  country: (r) => (r.country ? [r.country] : []),
  decade: decadeOf,
  genre: (r) => r.genre ?? [],
}

const matches = (r: SearchResult, f: ResultFilters, skip?: ResultFacetKey) =>
  (Object.keys(values) as ResultFacetKey[]).every((k) => k === skip || !f[k] || values[k](r).includes(f[k]!))

export const filterResults = (rs: SearchResult[], f: ResultFilters) => rs.filter((r) => matches(r, f))

export const activeResultFilters = (f: ResultFilters) => Object.values(f).filter(Boolean).length

// Counts for each option, as if that group's own choice weren't made yet
export function resultFacets(rs: SearchResult[], f: ResultFilters): Record<ResultFacetKey, FacetOption[]> {
  const out = {} as Record<ResultFacetKey, FacetOption[]>
  for (const k of Object.keys(values) as ResultFacetKey[]) {
    const counts = new Map<string, number>()
    for (const r of rs) if (matches(r, f, k)) for (const v of values[k](r)) counts.set(v, (counts.get(v) ?? 0) + 1)
    const options = [...counts].map(([value, count]) => ({ value, label: value, count }))
    // decades read best in order; everything else by how common it is
    out[k] =
      k === 'decade'
        ? options.sort((a, b) => parseInt(b.value) - parseInt(a.value))
        : options.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }
  return out
}
