import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import type { CloudApi } from '../lib/cloud'
import { publishProfile } from '../lib/profile'
import { useProfileSharing } from './profileSharing'

vi.mock('./session', () => ({ useSession: () => ({ session: null, client: null }) }))
vi.mock('../lib/profile', async (original) => ({
  ...(await original<typeof import('../lib/profile')>()),
  publishProfile: vi.fn(async () => []),
}))

const api = {
  profileSettings: async () => ({ sections: { collection: 'public' }, who: 'public', hidden: false, details: [] }),
} as unknown as CloudApi

function Harness() {
  useProfileSharing(api)
  return null
}

// lets IndexedDB and the hook's promises settle
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))
const passes = () => vi.mocked(publishProfile).mock.calls.length

describe('useProfileSharing', () => {
  let root: Root
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true })
    await Promise.all([db.plays.clear(), db.masters.clear()])
    vi.mocked(publishProfile).mockClear()
    root = createRoot(document.createElement('div'))
    await act(async () => root.render(<Harness />))
    await settle()
  })
  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('sends a few seconds after opening, then a few seconds after a play', async () => {
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(passes()).toBe(1)

    await act(async () => void (await db.plays.add({ instanceId: 1, releaseId: 1, at: Date.now(), before: {} })))
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(passes()).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(passes()).toBe(2)
  })

  it('sends album years at most once a minute', async () => {
    await act(() => vi.advanceTimersByTimeAsync(3000))
    const before = passes()
    for (let i = 0; i < 5; i++) {
      await act(async () => void (await db.masters.put({ masterId: i, year: 1970, at: Date.now() })))
      await act(() => vi.advanceTimersByTimeAsync(5000))
    }
    expect(passes()).toBe(before)
    await act(() => vi.advanceTimersByTimeAsync(40_000))
    expect(passes()).toBe(before + 1)
  })

  it('a play during a background wait still goes in seconds', async () => {
    await act(() => vi.advanceTimersByTimeAsync(3000))
    const before = passes()
    await act(async () => void (await db.masters.put({ masterId: 9, year: 1980, at: Date.now() })))
    await act(async () => void (await db.plays.add({ instanceId: 2, releaseId: 2, at: Date.now(), before: {} })))
    await act(() => vi.advanceTimersByTimeAsync(3500))
    expect(passes()).toBe(before + 1)
  })
})
