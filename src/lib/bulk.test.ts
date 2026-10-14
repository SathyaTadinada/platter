import { describe, expect, it } from 'vitest'
import { runBulk } from './bulk'

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
