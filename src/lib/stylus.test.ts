import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { recordSeconds, staleLengths, stylusUse } from './stylus'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('recordSeconds', () => {
  const track = (duration?: string, type_ = 'track') => ({ position: '', title: '', duration, type_ })

  it('adds up the tracks, skipping headings', () => {
    expect(recordSeconds([track(undefined, 'heading'), track('20:00'), track('19:30')])).toEqual({ seconds: 2370, estimated: false })
  })

  it('fills in missing lengths from the rest', () => {
    expect(recordSeconds([track('10:00'), track('20:00'), track()])).toEqual({ seconds: 2700, estimated: true })
  })

  it('guesses from the number of tracks when nothing has a length', () => {
    expect(recordSeconds([track(), track()])).toEqual({ seconds: 540, estimated: true })
    expect(recordSeconds()).toEqual({ seconds: 2400, estimated: true })
  })
})

describe('stylusUse', () => {
  const lengths = new Map([
    [1, { seconds: 3600, estimated: false }],
    [2, { seconds: 1800, estimated: false }],
  ])

  it('counts each play as the whole record, from the day the stylus went on', () => {
    const plays = [
      { releaseId: 1, at: 5 },
      { releaseId: 2, at: 10 },
      { releaseId: 1, at: 20 },
    ]
    expect(stylusUse(plays, lengths)).toEqual({ hours: 2.5, plays: 3, estimated: false })
    expect(stylusUse(plays, lengths, 10)).toEqual({ hours: 1.5, plays: 2, estimated: false })
  })

  it('says when a length was guessed', () => {
    expect(stylusUse([{ releaseId: 3, at: 1 }], lengths)).toMatchObject({ hours: 2400 / 3600, estimated: true })
  })
})

describe('staleLengths', () => {
  it('lists played records without a recent length', async () => {
    const now = Date.now()
    await db.plays.bulkAdd([
      { instanceId: 1, releaseId: 1, at: now, before: {} },
      { instanceId: 1, releaseId: 1, at: now, before: {} },
      { instanceId: 2, releaseId: 2, at: now, before: {} },
      { instanceId: 3, releaseId: 3, at: now, before: {} },
    ])
    await db.lengths.bulkPut([
      { releaseId: 1, seconds: 100, estimated: false, at: now },
      { releaseId: 2, seconds: 100, estimated: false, at: now - 40 * 24 * 60 * 60 * 1000 },
    ])
    expect((await staleLengths(now)).sort()).toEqual([2, 3])
  })
})
