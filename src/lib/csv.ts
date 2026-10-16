import type { CollectionField, Folder } from '../api/discogs/types'
import { cleanLabel } from './format'

// RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '') // Excel adds a BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export type ImportRow = {
  line: number
  releaseId: number
  artist: string
  title: string
  label?: string
  catno?: string
  format?: string
  year?: string
  folderName?: string
  rating?: number
  fields: Record<string, string> // field name (from "Collection <name>") -> value
}

export type ParsedImport = {
  rows: ImportRow[]
  fieldColumns: string[] // field names found in the file
  skipped: { line: number; reason: string }[]
}

const norm = (s: string) => s.trim().toLowerCase()

// Reads a Discogs collection export (or anything with a release_id column).
export function parseDiscogsExport(text: string): ParsedImport {
  const [head, ...body] = parseCsv(text)
  if (!head) throw new Error('That file is empty.')
  const col = (...names: string[]) => head.findIndex((h) => names.includes(norm(h)))
  const idCol = col('release_id', 'release id', 'releaseid')
  if (idCol < 0) throw new Error('No release_id column. Export your collection from Discogs (Collection, then Export) and use that file.')

  const c = {
    artist: col('artist'),
    title: col('title'),
    label: col('label'),
    catno: col('catalog#', 'catalog #', 'catno'),
    format: col('format'),
    year: col('released', 'year'),
    folder: col('collectionfolder', 'collection folder', 'folder'),
    rating: col('rating'),
  }
  const fieldCols = head
    .map((h, i) => ({
      name: h.trim().replace(/^collection\s+/i, ''),
      i,
      isField: /^collection\s+/i.test(h.trim()) && norm(h) !== 'collectionfolder',
    }))
    .filter((f) => f.isField)

  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const rows: ImportRow[] = []
  const skipped: ParsedImport['skipped'] = []

  body.forEach((r, n) => {
    const line = n + 2 // 1-based, after the header
    const releaseId = Number(get(r, idCol))
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      skipped.push({ line, reason: 'no release ID' })
      return
    }
    const fields: Record<string, string> = {}
    for (const f of fieldCols) {
      const v = get(r, f.i)
      if (v) fields[f.name] = v
    }
    const rating = Number(get(r, c.rating))
    const year = get(r, c.year)
    rows.push({
      line,
      releaseId,
      artist: get(r, c.artist).replace(/\s\(\d+\)/g, ''),
      title: get(r, c.title),
      label: cleanLabel(get(r, c.label).split(',')[0]?.trim() ?? '') || undefined,
      catno: get(r, c.catno).split(',')[0]?.trim() || undefined,
      format: get(r, c.format) || undefined,
      year: year && year !== '0' ? year : undefined,
      folderName: get(r, c.folder) || undefined,
      rating: rating >= 1 && rating <= 5 ? rating : undefined,
      fields,
    })
  })
  return { rows, fieldColumns: fieldCols.map((f) => f.name), skipped }
}

export type ImportPlan = {
  fieldMap: Record<string, CollectionField> // file field name -> the user's field
  missingFields: string[] // in the file, but the user has no such field
  folderMap: Record<string, Folder> // file folder name -> the user's folder
  missingFolders: string[]
}

// Lines the file's fields and folders up with the user's, by name.
export function planImport(parsed: ParsedImport, fields: CollectionField[], folders: Folder[]): ImportPlan {
  const fieldMap: ImportPlan['fieldMap'] = {}
  const missingFields: string[] = []
  for (const name of parsed.fieldColumns) {
    const f = fields.find((x) => norm(x.name) === norm(name))
    if (f) fieldMap[name] = f
    else if (parsed.rows.some((r) => r.fields[name])) missingFields.push(name)
  }
  const folderMap: ImportPlan['folderMap'] = {}
  const missingFolders = new Set<string>()
  for (const r of parsed.rows) {
    if (!r.folderName || folderMap[r.folderName]) continue
    const f = folders.find((x) => x.id !== 0 && norm(x.name) === norm(r.folderName!))
    if (f) folderMap[r.folderName] = f
    else missingFolders.add(r.folderName)
  }
  return { fieldMap, missingFields, folderMap, missingFolders: [...missingFolders] }
}

// Dropdown fields only accept their own options
export function fieldValueFits(field: CollectionField, value: string): boolean {
  return field.type !== 'dropdown' || field.options.includes(value)
}
