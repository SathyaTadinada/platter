import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast, Toaster } from './Toaster'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const showing = () => [...host.querySelectorAll('p')].map((p) => p.textContent)
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('toasts', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    await act(() => root.render(<Toaster />))
  })
  afterEach(() => vi.useRealTimers())

  it('keeps ones with an action up longer', async () => {
    await act(() => {
      toast('Saved')
      toast('Removed', { action: { label: 'Undo', onClick: () => {} } })
    })
    await wait(6_000)
    expect(showing()).toEqual(['Removed'])
    await wait(5_000)
    expect(showing()).toEqual([])
  })

  it('waits while the pointer is on it', async () => {
    await act(() => toast('Logged'))
    await wait(3_000)
    const el = host.querySelector('[role=status]')!
    await act(() => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    await wait(20_000)
    expect(showing()).toEqual(['Logged'])
    await act(() => el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })))
    await wait(1_900)
    expect(showing()).toEqual(['Logged'])
    await wait(200)
    expect(showing()).toEqual([])
  })

  it('waits while its Undo has focus', async () => {
    await act(() => toast('Took it off', { action: { label: 'Undo', onClick: () => {} } }))
    const undo = host.querySelector('button')!
    await act(() => undo.focus())
    await wait(30_000)
    expect(showing()).toEqual(['Took it off'])
    await act(() => undo.blur())
    await wait(10_000)
    expect(showing()).toEqual([])
  })
})
