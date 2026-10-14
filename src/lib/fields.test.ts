import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/fields.json'
import type { CollectionField, FieldsResponse } from '../api/discogs/types'
import { fieldFor, matchFields } from './fields'

const defaults = (fixture as FieldsResponse).fields

const text = (id: number, name: string): CollectionField => ({ id, name, type: 'textarea', position: id, public: false })

describe('matchFields', () => {
  it('finds the three Discogs defaults on a new account', () => {
    const m = matchFields(defaults)
    expect(fieldFor(m, 'mediaCondition')?.id).toBe(1)
    expect(fieldFor(m, 'sleeveCondition')?.id).toBe(2)
    expect(fieldFor(m, 'notes')?.id).toBe(3)
    expect(m.filter((x) => x.source === 'none').map((x) => x.spec.key)).toEqual([
      'purchasePrice',
      'purchasedFrom',
      'purchaseDate',
      'location',
      'playCount',
      'lastPlayed',
    ])
  })

  it('matches ignoring case, spacing and punctuation, and by alias', () => {
    const m = matchFields([text(10, 'purchase-price'), text(11, 'Store'), text(12, 'PLAYS')])
    expect(fieldFor(m, 'purchasePrice')?.id).toBe(10)
    expect(fieldFor(m, 'purchasedFrom')?.id).toBe(11)
    expect(fieldFor(m, 'playCount')?.id).toBe(12)
  })

  it('prefers a manual mapping and never uses a field twice', () => {
    const fields = [text(10, 'Price'), text(11, 'Where I bought it')]
    const m = matchFields(fields, { purchasedFrom: 11, purchasePrice: 11 })
    expect(fieldFor(m, 'purchasedFrom')?.id).toBe(11)
    expect(m.find((x) => x.spec.key === 'purchasePrice')?.source).toBe('manual')
  })

  it('lets the user switch a field off', () => {
    const m = matchFields(defaults, { notes: null })
    expect(fieldFor(m, 'notes')).toBeNull()
  })

  it('ignores a manual mapping to a field that no longer exists', () => {
    const m = matchFields(defaults, { notes: 999 })
    expect(fieldFor(m, 'notes')?.id).toBe(3)
  })
})
