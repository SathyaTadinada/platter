import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Menu } from './Menu'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
afterEach(() => act(() => root.render(null)))

const items = ['Edit', 'Move', 'Remove'].map((label) => ({ label, onSelect: () => {}, disabled: label === 'Move' }))
const key = (key: string) => act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
const focused = () => document.activeElement?.textContent

describe('Menu', () => {
  it('moves with the arrow keys, skipping disabled items, and Escape goes back to the button', async () => {
    await act(() => root.render(<Menu label="More" items={items} />))
    const trigger = host.querySelector('button')!
    await act(() => trigger.click())
    expect(focused()).toBe('Edit')
    await key('ArrowDown')
    expect(focused()).toBe('Remove')
    await key('ArrowDown')
    expect(focused()).toBe('Edit')
    await key('End')
    expect(focused()).toBe('Remove')
    await key('Escape')
    expect(host.querySelector('[role=menu]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when focus moves out', async () => {
    await act(() =>
      root.render(
        <>
          <Menu label="More" items={items} />
          <button type="button">Next</button>
        </>,
      ),
    )
    await act(() => host.querySelector('button')!.click())
    expect(host.querySelector('[role=menu]')).not.toBeNull()
    await act(() => [...host.querySelectorAll('button')].at(-1)!.focus())
    expect(host.querySelector('[role=menu]')).toBeNull()
  })
})
