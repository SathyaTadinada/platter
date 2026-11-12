import { describe, expect, it } from 'vitest'
import { newPasswordReady, strength } from './PasswordField'

describe('password strength', () => {
  it('goes up with length and with mixing kinds of characters', () => {
    expect(strength('short')).toBe(0)
    expect(strength('lowercase')).toBe(1)
    expect(strength('Lowercase1')).toBe(2)
    expect(strength('a much longer passphrase')).toBe(3)
    expect(strength('Mixed-Case-12')).toBe(3)
  })

  it('needs the two entries to match before it can be saved', () => {
    expect(newPasswordReady('long enough', 'long enough')).toBe(true)
    expect(newPasswordReady('long enough', 'long enoug')).toBe(false)
    expect(newPasswordReady('short', 'short')).toBe(false)
  })
})
