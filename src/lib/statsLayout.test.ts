import { describe, expect, it } from 'vitest'
import { defaultLayout, move, normalize, toggle, type Layout } from './statsLayout'

describe('value layout', () => {
  it('fills in missing and drops unknown sections', () => {
    const l = normalize({ order: ['month', 'nope' as never, 'overTime'], hidden: ['price', 'gone' as never] })
    expect(l.order.slice(0, 2)).toEqual(['month', 'overTime'])
    expect(l.order).toHaveLength(6)
    expect(l.hidden).toEqual(['price'])
    expect(normalize(null)).toEqual(defaultLayout())
  })

  it('moves a section to a new position, staying in bounds', () => {
    const layout: Layout = { order: ['overTime', 'paid', 'month', 'top', 'price', 'breakdown'], hidden: [] }
    expect(move(layout, 'month', 0).order.slice(0, 3)).toEqual(['month', 'overTime', 'paid'])
    expect(move(layout, 'overTime', 2).order.slice(0, 3)).toEqual(['paid', 'month', 'overTime'])
    expect(move(layout, 'month', -1)).toBe(layout)
    expect(move(layout, 'month', 6)).toBe(layout)
  })

  it('hides and shows', () => {
    const l = toggle(defaultLayout(), 'top')
    expect(l.hidden).toEqual(['top'])
    expect(toggle(l, 'top').hidden).toEqual([])
  })
})
