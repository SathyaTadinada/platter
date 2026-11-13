import { describe, expect, it } from 'vitest'
import { normalize, place, shown, toggle, VALUE_SECTIONS, valueLayout, type Layout, type ValueKey } from './statsLayout'

const keys = VALUE_SECTIONS.map(([k]) => k)
const defaults = valueLayout.defaults()

describe('stats layout', () => {
  it('fills in missing and drops unknown sections', () => {
    const l = normalize({ left: ['month', 'nope'], right: ['overTime', 'month'], hidden: ['price', 'gone'] }, keys, defaults)
    expect(l.left.slice(0, 1)).toEqual(['month'])
    expect(l.right.slice(0, 1)).toEqual(['overTime'])
    expect([...l.left, ...l.right].sort()).toEqual([...keys].sort())
    expect(l.hidden).toEqual(['price'])
    expect(normalize(null, keys, defaults)).toEqual(defaults)
  })

  it('splits a layout saved before there were columns', () => {
    const l = normalize({ order: ['paid', 'month', 'top', 'overTime', 'price', 'breakdown'], hidden: [] }, keys, defaults)
    expect(l.left).toEqual(['paid', 'month', 'top'])
    expect(l.right).toEqual(['overTime', 'price', 'breakdown'])
  })

  it('moves a section within a column and across to the other, staying in bounds', () => {
    const layout: Layout<ValueKey> = { left: ['month', 'top', 'overTime'], right: ['paid', 'price', 'breakdown'], hidden: [] }
    expect(place(layout, 'overTime', 'left', 0).left).toEqual(['overTime', 'month', 'top'])
    const across = place(layout, 'top', 'right', 1)
    expect(across.left).toEqual(['month', 'overTime'])
    expect(across.right).toEqual(['paid', 'top', 'price', 'breakdown'])
    expect(place(layout, 'month', 'right', 3).right).toEqual(['paid', 'price', 'breakdown', 'month'])
    expect(place(layout, 'month', 'left', -1)).toBe(layout)
    expect(place(layout, 'month', 'right', 4)).toBe(layout)
  })

  it('hides and shows', () => {
    const l = toggle(defaults, 'top')
    expect(l.hidden).toEqual(['top'])
    expect(shown(l, 'left')).toEqual(['month', 'overTime'])
    expect(toggle(l, 'top').hidden).toEqual([])
  })
})
