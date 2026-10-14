import { describe, expect, it } from 'vitest'
import fieldsFixture from '../../tests/fixtures/fields.json'
import type { CollectionField } from '../api/discogs/types'
import { fieldValueFits, parseCsv, parseDiscogsExport, planImport } from './csv'

// Same layout as a real Discogs collection export
const sample = `Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,Collection Media Condition,Collection Sleeve Condition,Collection Notes
7E-1084,Eagles,Hotel California,Asylum Records,"LP, Album, SP ",,1976,1934367,Catalog,2026-10-12 18:31:44,Near Mint (NM or M-),Near Mint (NM or M-),
"LAULP002X, 5056167177807",Laufey (2),Typical Of Me,"AWAL Recordings, AWAL Recordings","12"", EP, RE",4,2024,30586288,Catalog,2026-10-12 18:12:35,Very Good Plus (VG+),Generic,"Signed, ""first"" copy"
602547137029,Frank Sinatra,Ultimate Sinatra,Capitol Records,"2xLP, Comp, RP",,0,33413798,Shelf 2,2026-10-12 18:20:57,Mint (M),,
none,Nobody,Broken,,LP,,,,Catalog,,,,
`

const fields = fieldsFixture.fields as CollectionField[]

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ])
  })

  it('keeps newlines inside quotes and drops blank lines', () => {
    expect(parseCsv('a,"line1\nline2"\n\n')).toEqual([['a', 'line1\nline2']])
  })

  it('strips a byte order mark', () => {
    expect(parseCsv('﻿release_id\n1')[0][0]).toBe('release_id')
  })
})

describe('parseDiscogsExport', () => {
  const parsed = parseDiscogsExport(sample)

  it('reads each row', () => {
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows[0]).toMatchObject({
      releaseId: 1934367,
      artist: 'Eagles',
      title: 'Hotel California',
      catno: '7E-1084',
      year: '1976',
      folderName: 'Catalog',
      fields: { 'Media Condition': 'Near Mint (NM or M-)', 'Sleeve Condition': 'Near Mint (NM or M-)' },
    })
  })

  it('cleans up multi-value cells and artist numbering', () => {
    const r = parsed.rows[1]
    expect(r).toMatchObject({ artist: 'Laufey', catno: 'LAULP002X', label: 'AWAL Recordings', rating: 4 })
    expect(r.fields.Notes).toBe('Signed, "first" copy')
  })

  it('treats year 0 as unknown', () => {
    expect(parsed.rows[2].year).toBeUndefined()
  })

  it('skips rows without a release ID', () => {
    expect(parsed.skipped).toEqual([{ line: 5, reason: 'no release ID' }])
  })

  it('finds the field columns', () => {
    expect(parsed.fieldColumns).toEqual(['Media Condition', 'Sleeve Condition', 'Notes'])
  })

  it('rejects files without release IDs', () => {
    expect(() => parseDiscogsExport('Artist,Title\nA,B')).toThrow('release_id')
  })
})

describe('planImport', () => {
  it('matches fields and folders by name', () => {
    const plan = planImport(parseDiscogsExport(sample), fields, [
      { id: 0, name: 'All', count: 0 },
      { id: 9, name: 'catalog', count: 0 },
    ])
    expect(Object.keys(plan.fieldMap)).toEqual(['Media Condition', 'Sleeve Condition', 'Notes'])
    expect(plan.folderMap.Catalog.id).toBe(9)
    expect(plan.missingFolders).toEqual(['Shelf 2'])
  })

  it('lists file fields the user does not have', () => {
    const csv = 'release_id,Collection Purchase Price\n1,$20\n'
    expect(planImport(parseDiscogsExport(csv), fields, []).missingFields).toEqual(['Purchase Price'])
  })
})

describe('fieldValueFits', () => {
  it('only allows listed values in dropdowns', () => {
    const media = fields.find((f) => f.name === 'Media Condition')!
    expect(fieldValueFits(media, 'Mint (M)')).toBe(true)
    expect(fieldValueFits(media, 'Pretty good')).toBe(false)
    expect(fieldValueFits(fields.find((f) => f.name === 'Notes')!, 'anything')).toBe(true)
  })
})
