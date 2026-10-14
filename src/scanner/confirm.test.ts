import { describe, expect, it } from 'vitest'
import { ReadConfirmer } from './confirm'

describe('ReadConfirmer', () => {
  it('needs two matching reads', () => {
    const c = new ReadConfirmer()
    expect(c.push('123', 0)).toBeNull()
    expect(c.push('123', 100)).toBe('123')
  })

  it('tolerates empty frames in between', () => {
    const c = new ReadConfirmer()
    c.push('123', 0)
    c.push(null, 100)
    c.push(null, 200)
    expect(c.push('123', 300)).toBe('123')
  })

  it('ignores a different misread in between', () => {
    const c = new ReadConfirmer()
    c.push('123', 0)
    c.push('999', 100)
    expect(c.push('123', 200)).toBe('123')
  })

  it('forgets reads outside the window', () => {
    const c = new ReadConfirmer()
    c.push('123', 0)
    expect(c.push('123', 2000)).toBeNull()
  })
})
