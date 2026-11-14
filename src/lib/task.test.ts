import { describe, expect, it } from 'vitest'
import { backgroundHeld, holdBackground, setTask, timeLeft } from './task'

describe('background hold', () => {
  it('holds while something is running and lets go after', () => {
    expect(backgroundHeld()).toBe(false)
    const a = holdBackground()
    const b = holdBackground()
    a()
    a() // releasing twice doesn't count twice
    expect(backgroundHeld()).toBe(true)
    b()
    expect(backgroundHeld()).toBe(false)
    setTask('Removing 1 of 3')
    expect(backgroundHeld()).toBe(true)
    setTask(null)
    expect(backgroundHeld()).toBe(false)
  })
})

describe('timeLeft', () => {
  it('rounds to minutes, with nothing when nothing is left', () => {
    expect(timeLeft(0, 55)).toBeNull()
    expect(timeLeft(30, 55)).toBe('Under a minute left')
    expect(timeLeft(170, 55)).toBe('About 3 min left')
  })
})
