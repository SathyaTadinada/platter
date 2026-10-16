import { describe, expect, it } from 'vitest'
import { computeOwnership } from './ownership'

const owned = [
  { instanceId: 1, releaseId: 10, masterId: 100, folderId: 1 },
  { instanceId: 2, releaseId: 10, masterId: 100, folderId: 1 },
  { instanceId: 3, releaseId: 11, masterId: 100, folderId: 1 },
  { instanceId: 4, releaseId: 20, masterId: 0, folderId: 1 },
]
const wants = [{ releaseId: 12, masterId: 100 }]

describe('computeOwnership', () => {
  it('counts exact copies and other pressings', () => {
    expect(computeOwnership(10, 100, owned, wants)).toEqual({
      exactCopies: 2,
      otherPressings: 1,
      inWantlist: false,
      wantsOtherPressing: true,
    })
  })

  it('flags a wantlist match', () => {
    expect(computeOwnership(12, 100, owned, wants).inWantlist).toBe(true)
  })

  it('never matches on a missing master id', () => {
    expect(computeOwnership(21, 0, owned, wants).otherPressings).toBe(0)
    expect(computeOwnership(21, undefined, owned, wants).otherPressings).toBe(0)
  })
})
