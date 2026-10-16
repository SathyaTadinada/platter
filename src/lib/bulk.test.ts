import { describe, expect, it, vi } from 'vitest'
import { applyFields, runBulk } from './bulk'

describe('runBulk', () => {
  it('keeps going after a failure and reports progress', async () => {
    const progress: number[] = []
    const r = await runBulk(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error('nope')
      },
      (d) => progress.push(d),
    )
    expect(r.done).toEqual([1, 3])
    expect(r.failed).toEqual([{ item: 2, error: 'nope' }])
    expect(progress).toEqual([1, 2, 3])
  })

  it('stops when asked', async () => {
    let stop = false
    const r = await runBulk(
      [1, 2, 3],
      async () => (stop = true),
      undefined,
      () => stop,
    )
    expect(r.done).toEqual([1])
  })
})

describe('applyFields', () => {
  it('writes only what differs and returns the merged fields', async () => {
    const writes: [number, string][] = []
    const write = async (id: number, v: string) => writes.push([id, v])
    const fields = { 1: 'Near Mint (NM or M-)', 2: 'Very Good (VG)', 3: 'Original pressing' }
    const out = await applyFields(fields, { 1: 'Near Mint (NM or M-)', 2: 'Near Mint (NM or M-)', 4: 'Shelf B' }, write)
    expect(writes).toEqual([
      [2, 'Near Mint (NM or M-)'],
      [4, 'Shelf B'],
    ])
    expect(out).toEqual({ 1: 'Near Mint (NM or M-)', 2: 'Near Mint (NM or M-)', 3: 'Original pressing', 4: 'Shelf B' })
  })

  it('does nothing for a record that already matches', async () => {
    const write = vi.fn()
    expect(await applyFields({ 1: 'Mint (M)' }, { 1: 'Mint (M)' }, write)).toBeUndefined()
    expect(write).not.toHaveBeenCalled()
  })

  it('clears a field set to empty', async () => {
    const write = vi.fn(async () => {})
    expect(await applyFields({ 4: 'Shelf B' }, { 4: '' }, write)).toEqual({ 4: '' })
    expect(write).toHaveBeenCalledWith(4, '')
  })
})
