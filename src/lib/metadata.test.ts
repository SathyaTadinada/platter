import { describe, expect, it } from 'vitest'
import fieldsFixture from '../../tests/fixtures/fields.json'
import type { CollectionField } from '../api/discogs/types'
import { matchFields } from './fields'
import { formatPrice, hasMetadata, mergeMetadata, planFieldWrites } from './metadata'

const defaults = fieldsFixture.fields as CollectionField[] // Media Condition 1, Sleeve Condition 2, Notes 3
const text = (id: number, name: string): CollectionField => ({ id, name, type: 'textarea', position: id, public: false })
const full = [...defaults, text(4, 'Purchase Price'), text(5, 'Purchased From'), text(6, 'Purchase Date'), text(7, 'Location')]
const usd = { currency: 'USD', locale: 'en-US' }

describe('formatPrice', () => {
  it('formats numbers in the given currency', () => {
    expect(formatPrice('24.5', 'USD', 'en-US')).toBe('$24.50')
    expect(formatPrice('$1,200', 'USD', 'en-US')).toBe('$1,200.00')
    expect(formatPrice('19,99', 'EUR', 'en-US')).toBe('€19.99')
  })
  it('keeps unparseable input as typed', () => {
    expect(formatPrice('free', 'USD')).toBe('free')
    expect(formatPrice('  ', 'USD')).toBeUndefined()
  })
})

describe('mergeMetadata', () => {
  it('lets later layers win, ignoring blanks', () => {
    expect(mergeMetadata({ store: 'Amoeba', date: '2026-10-14' }, { store: '', price: '20' })).toEqual({
      store: 'Amoeba',
      date: '2026-10-14',
      price: '20',
    })
    expect(hasMetadata({ notes: ' ' })).toBe(false)
  })
})

describe('planFieldWrites', () => {
  const meta = {
    mediaCondition: 'Very Good Plus (VG+)',
    sleeveCondition: 'Near Mint (NM or M-)',
    price: '25',
    store: 'Amoeba',
    date: '2026-10-14',
    location: 'Shelf 2',
    notes: 'Small seam split',
  }

  it('writes every value to its own field when they all exist', () => {
    const plan = planFieldWrites(meta, matchFields(full), usd)
    expect(plan.writes).toEqual({
      1: 'Very Good Plus (VG+)',
      2: 'Near Mint (NM or M-)',
      3: 'Small seam split',
      4: '$25.00',
      5: 'Amoeba',
      6: '2026-10-14',
      7: 'Shelf 2',
    })
    expect(plan.inNotes).toEqual([])
    expect(plan.dropped).toEqual([])
  })

  it('puts purchase details and location into Notes when those fields are missing', () => {
    const plan = planFieldWrites(meta, matchFields(defaults), usd)
    expect(plan.writes[3]).toBe('Small seam split\nBought 2026-10-14 from Amoeba for $25.00\nLocation: Shelf 2')
    expect(plan.inNotes).toEqual(['Purchase Price', 'Purchased From', 'Purchase Date', 'Location'])
  })

  it('reads naturally with only some purchase details', () => {
    expect(planFieldWrites({ price: '12' }, matchFields(defaults), usd).writes[3]).toBe('Bought for $12.00')
    expect(planFieldWrites({ store: 'Rough Trade' }, matchFields(defaults), usd).writes[3]).toBe('Bought from Rough Trade')
  })

  it('reports what it could not save when there is no Notes field either', () => {
    const plan = planFieldWrites({ price: '12', notes: 'hi' }, matchFields(defaults, { notes: null }), usd)
    expect(plan.writes).toEqual({})
    expect(plan.dropped).toEqual(['Purchase Price', 'Notes'])
  })

  it('drops a condition the dropdown does not offer', () => {
    const plan = planFieldWrites({ mediaCondition: 'Pretty good' }, matchFields(defaults), usd)
    expect(plan.writes).toEqual({})
    expect(plan.dropped).toEqual(['Media Condition'])
  })

  it('writes nothing for an empty form', () => {
    expect(planFieldWrites({}, matchFields(full), usd)).toEqual({ writes: {}, inNotes: [], dropped: [] })
  })
})
