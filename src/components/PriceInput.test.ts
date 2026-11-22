import { describe, expect, it } from 'vitest'
import { cleanPrice, plainPrice, priceStyle, readPrice, showPrice } from './PriceInput'

const us = priceStyle('USD', 'en-US')
const de = priceStyle('EUR', 'de-DE')

describe('cleanPrice', () => {
  it('keeps digits and one decimal point with two places', () => {
    expect(cleanPrice('49.98')).toBe('49.98')
    expect(cleanPrice('49.9876')).toBe('49.98')
    expect(cleanPrice('1.2.3')).toBe('1.23')
    expect(cleanPrice('.5')).toBe('.5')
  })

  it('stops at nine digits before the point', () => {
    expect(cleanPrice('5552888255255222')).toBe('555288825')
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

describe('showPrice and readPrice', () => {
  it('write the number as a price while typing', () => {
    expect(showPrice('1234.5', us)).toBe('$1,234.5')
    expect(showPrice('1234.', us)).toBe('$1,234.')
    expect(showPrice('.5', us)).toBe('$0.5')
    expect(showPrice('', us)).toBe('')
  })

  it('read back just the number', () => {
    expect(readPrice('$1,234.56', us)).toBe('1234.56')
    expect(readPrice('$1,2345.5', us)).toBe('12345.5')
    expect(readPrice('$1,234.567', us)).toBe('1234.56')
  })

  it('follow the way the device writes prices', () => {
    expect(showPrice('1234.5', de)).toBe('1.234,5 €')
    expect(readPrice('1.234,5 €', de)).toBe('1234.5')
  })
})
