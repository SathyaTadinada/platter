import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'
import { Sheet } from './Sheet'

// React only runs act() quietly when told it's a test
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// jsdom has no modal dialogs
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true
}

function Opener({ confirm }: { confirm?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open &&
        (confirm ? (
          <ConfirmDialog title="Sure?" onCancel={() => setOpen(false)} />
        ) : (
          <Sheet title="Sheet" onClose={() => setOpen(false)}>
            Body
          </Sheet>
        ))}
    </>
  )
}

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
afterEach(() => act(() => root.render(null)))

const click = (el: Element) => act(() => (el as HTMLElement).click())
const button = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name)!

describe('closing a dialog', () => {
  it('puts focus back on the button that opened the sheet', async () => {
    await act(() => root.render(<Opener />))
    button('Open').focus()
    await click(button('Open'))
    expect(document.activeElement?.tagName).toBe('DIALOG')
    await click(button('Close'))
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(button('Open'))
  })

  it('does the same for a confirmation', async () => {
    await act(() => root.render(<Opener confirm />))
    button('Open').focus()
    await click(button('Open'))
    await click(button('OK'))
    expect(document.activeElement).toBe(button('Open'))
  })
})
