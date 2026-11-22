import { describe, expect, it } from 'vitest'
import { cleanPrice, plainPrice } from './PriceInput'

describe('cleanPrice', () => {
  it('keeps digits and one decimal point with two places', () => {
    expect(cleanPrice('49.98')).toBe('49.98')
    expect(cleanPrice('49.9876')).toBe('49.98')
    expect(cleanPrice('1.2.3')).toBe('1.23')
    expect(cleanPrice('$12')).toBe('12')
    expect(cleanPrice('12,5')).toBe('12,5')
    expect(cleanPrice('.5')).toBe('.5')
  })

  it('stops at nine digits before the point', () => {
    expect(cleanPrice('5552888255255222')).toBe('555288825')
    expect(cleanPrice('5552888255255222.99')).toBe('555288825.99')
  })
})

describe('plainPrice', () => {
  it('takes the number out of a saved price', () => {
    expect(plainPrice('$1,250.00')).toBe('1250')
    expect(plainPrice('$49.98')).toBe('49.98')
    expect(plainPrice('$49.5')).toBe('49.50')
    expect(plainPrice('')).toBe('')
  })
})
