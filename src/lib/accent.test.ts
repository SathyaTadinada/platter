import { beforeEach, describe, expect, it, vi } from 'vitest'

// accent.ts reads its scope when it loads, so each test gets a fresh copy
async function fresh() {
  vi.resetModules()
  return import('./accent')
}

beforeEach(() => localStorage.clear())

describe('accent', () => {
  it('keeps your pick for your account and uses the default everywhere else', async () => {
    const a = await fresh()
    a.setAccentScope('user')
    a.setAccent('blue')
    a.setAccentScope('none')
    expect(a.getAccent()).toBe('amber')
    expect(document.documentElement.dataset.accent).toBe('amber')
    a.setAccentScope('user')
    expect(a.getAccent()).toBe('blue')
  })

  it('gives the demo its own pick, which a new demo forgets', async () => {
    const a = await fresh()
    a.setAccentScope('user')
    a.setAccent('blue')
    a.setAccentScope('demo')
    expect(a.getAccent()).toBe('amber')
    a.setAccent('rose')
    expect(a.getAccent()).toBe('rose')
    a.setAccentScope('none')
    a.resetDemoAccent()
    a.setAccentScope('demo')
    expect(a.getAccent()).toBe('amber')
    a.setAccentScope('user')
    expect(a.getAccent()).toBe('blue')
  })

  it('starts in the scope it was last in, so the right color shows at launch', async () => {
    const a = await fresh()
    a.setAccentScope('user')
    a.setAccent('teal')
    expect((await fresh()).getAccent()).toBe('teal')
  })
})
