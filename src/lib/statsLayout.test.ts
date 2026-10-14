import { describe, expect, it } from 'vitest'
import { defaultLayout, move, normalize, toggle } from './statsLayout'

describe('value layout', () => {
  it('fills in missing and drops unknown sections', () => {
    const l = normalize({ order: ['month', 'nope' as never, 'overTime'], hidden: ['price', 'gone' as never] })
    expect(l.order.slice(0, 2)).toEqual(['month', 'overTime'])
    expect(l.order).toHaveLength(6)
    expect(l.hidden).toEqual(['price'])
    expect(normalize(null)).toEqual(defaultLayout())
  })

  it('moves a section to a new position, staying in bounds', () => {
    const l = defaultLayout()
    expect(move(l, 'paid', 0).order.slice(0, 2)).toEqual(['paid', 'overTime'])
    expect(move(l, 'overTime', 3).order.slice(0, 4)).toEqual(['paid', 'month', 'top', 'overTime'])
    expect(move(l, 'overTime', -1)).toBe(l)
    expect(move(l, 'breakdown', 6)).toBe(l)
  })

  it('hides and shows', () => {
    const l = toggle(defaultLayout(), 'top')
    expect(l.hidden).toEqual(['top'])
    expect(toggle(l, 'top').hidden).toEqual([])
  })
})
