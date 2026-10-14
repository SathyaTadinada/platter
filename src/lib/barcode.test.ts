import { describe, expect, it } from 'vitest'
import { barcodeVariants, expandUpcE, hasValidCheckDigit } from './barcode'

describe('hasValidCheckDigit', () => {
  it.each(['075678164125', '5012394144777', '0075678164125', '96385074'])('accepts %s', (c) => {
    expect(hasValidCheckDigit(c)).toBe(true)
  })
  it.each(['075678164124', '501239414477', 'abc', '123'])('rejects %s', (c) => {
    expect(hasValidCheckDigit(c)).toBe(false)
  })
})

describe('expandUpcE', () => {
  it('expands each last-digit rule', () => {
    expect(expandUpcE('01234505')).toBe('012000003455')
    expect(expandUpcE('04252614')).toBe('042100005264')
  })
  it('rejects bad input', () => {
    expect(expandUpcE('21234505')).toBeNull()
    expect(expandUpcE('0123')).toBeNull()
  })
})

describe('barcodeVariants', () => {
  it('adds the EAN-13 form of a UPC-A', () => {
    expect(barcodeVariants('0 75678-16412 5')).toEqual(['075678164125', '0075678164125'])
  })
  it('adds the UPC-A form of a zero-led EAN-13', () => {
    expect(barcodeVariants('0075678164125')).toEqual(['0075678164125', '075678164125'])
  })
  it('leaves other EAN-13s alone', () => {
    expect(barcodeVariants('5012394144777')).toEqual(['5012394144777'])
  })
  it('expands UPC-E', () => {
    expect(barcodeVariants('04252614')).toEqual(['04252614', '042100005264', '0042100005264'])
  })
})
