import { describe, expect, it } from 'vitest'
import { catnoCandidates } from './catno'

describe('catnoCandidates', () => {
  it('finds letter-and-number catalog numbers', () => {
    expect(catnoCandidates('PINK FLOYD  THE DARK SIDE OF THE MOON  SHVL 804')).toEqual(['SHVL 804'])
    expect(catnoCandidates('eagles hotel california 7E-1084')).toEqual(['7E-1084'])
    expect(catnoCandidates('RICK ASTLEY PB 41447')).toEqual(['PB 41447'])
    expect(catnoCandidates('LAULP003X')).toEqual(['LAULP003X'])
  })

  it('finds number-only catalog numbers', () => {
    expect(catnoCandidates('DEUTSCHE GRAMMOPHON 2530 231')).toEqual(['2530 231'])
  })

  it('skips years and barcodes', () => {
    expect(catnoCandidates('REMASTERED 2016\n0 75678 16412 5')).toEqual([])
  })

  it('reads several lines, without repeats', () => {
    expect(catnoCandidates('GR036\nHOLLOW KNIGHT\nGR036\nMOVLP 123')).toEqual(['GR036', 'MOVLP 123'])
  })
})
