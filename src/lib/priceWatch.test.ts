import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { getWatches, setWatch, underPrice } from './priceWatch'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const price = (lowest: number | null, currency = 'USD') => ({ releaseId: 1, at: 0, currency, lowest, forSale: lowest === null ? 0 : 1 })

describe('price watch', () => {
  it('keeps one price per release', async () => {
    await setWatch(1, { max: 20, currency: 'USD' })
    await setWatch(2, { max: 5, currency: 'USD' })
    await setWatch(1, null)
    expect(await getWatches()).toEqual({ 2: { max: 5, currency: 'USD' } })
  })

  it('marks a copy at or under the price, in the same currency', () => {
    const watch = { max: 20, currency: 'USD' }
    expect(underPrice(price(20), watch)).toBe(true)
    expect(underPrice(price(20.01), watch)).toBe(false)
    expect(underPrice(price(null), watch)).toBe(false)
    expect(underPrice(price(10, 'EUR'), watch)).toBe(false)
    expect(underPrice(price(10), undefined)).toBe(false)
  })
})
