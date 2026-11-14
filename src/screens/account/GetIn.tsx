import { useEffect, useState, type ReactNode } from 'react'
import { PairingCodeInput } from '../../components/PairingCode'
import { fieldClass, PasswordInput } from '../../components/PasswordField'
import { Button, Card, Notice, Section } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { CloudError, passkeysHere, type WaysIn } from '../../lib/cloud'
import { created, explain } from './shared'

// Not in yet: make the account, or get into the one this Discogs user has
export function GetIn() {
  const cloud = useCloud()
  const [ways, setWays] = useState<(WaysIn & { legacy: boolean }) | null>(null)
  const [mode, setMode] = useState<'main' | 'password' | 'code'>('main')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wrong, setWrong] = useState(false)
  const [codeKey, setCodeKey] = useState(0)

  useEffect(() => {
    cloud.waysIn().then(setWays, () => setWays({ exists: false, password: false, passkeys: false, legacy: false }))
    // once per visit (waysIn is a new function on every render)
  }, [cloud.username])

  async function go(task: () => Promise<unknown>, wrongText: string) {
    setBusy(true)
    setError(null)
    setWrong(false)
    try {
      await task()
    } catch (e) {
      setError(explain(e, wrongText))
      setWrong(e instanceof CloudError && e.status === 401)
      if (mode === 'code') setCodeKey((k) => k + 1) // clear the boxes for another try
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (m: typeof mode) => {
    setMode(m)
    setError(null)
    setWrong(false)
  }

  const username = (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" htmlFor="account-username">
        Discogs username
      </label>
      <input id="account-username" name="username" value={cloud.username} readOnly autoComplete="username" className={fieldClass} />
    </div>
  )
  const errorNotice = error && <Notice tone="error">{error}</Notice>

  let body: ReactNode
  if (!ways) {
    body = <p className="py-6 text-center text-sm text-stone-500">Checking…</p>
  } else if (!ways.exists) {
    body = (
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold">Create a Platter account</h2>
          <p className="mt-1 text-sm text-stone-500">Keeps your plays, value history, and settings the same on all your devices.</p>
        </div>
        {username}
        {errorNotice}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() =>
            go(async () => {
              created.now = await cloud.signInWithDiscogs(true)
            }, 'Discogs didn’t accept your login. Log out and back in, then try again.')
          }
        >
          {busy ? 'Checking with Discogs…' : 'Create account'}
        </Button>
      </div>
    )
  } else if (mode === 'code') {
    body = (
      <div className="space-y-5">
        <div>
          <h2 className="font-semibold">Enter the code from your other device</h2>
          <p className="mt-1 text-sm text-stone-500">Get one from a device that’s signed in, under Add a device.</p>
        </div>
        <PairingCodeInput
          key={codeKey}
          disabled={busy}
          onComplete={(code) => go(() => cloud.join(code), 'That code is wrong or has expired.')}
        />
        {busy && <p className="text-center text-sm text-stone-500">Checking…</p>}
        {errorNotice}
        <Button variant="secondary" className="w-full" onClick={() => switchTo(ways.legacy ? 'password' : 'main')}>
          {ways.legacy ? 'Use your password instead' : 'Other ways in'}
        </Button>
      </div>
    )
  } else if (mode === 'password' || ways.legacy) {
    body = (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!password) return
          // the form is swapped out once signed in, and a field removed while focused never blurs, which
          // leaves password managers' field icons floating where it was
          ;(document.activeElement as HTMLElement | null)?.blur()
          go(() => cloud.signIn(password), 'Incorrect password.')
        }}
      >
        <h2 className="font-semibold">Sign in to your Platter account</h2>
        {username}
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" invalid={wrong} />
        {errorNotice}
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => switchTo(ways.legacy ? 'code' : 'main')}>
          {ways.legacy ? 'Use a code instead' : 'Other ways in'}
        </Button>
      </form>
    )
  } else {
    body = (
      <div className="space-y-4">
        <h2 className="font-semibold">Sign in to your Platter account</h2>
        {username}
        {errorNotice}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => go(() => cloud.signInWithDiscogs(false), 'Discogs didn’t accept your login.')}
        >
          {busy ? 'Checking with Discogs…' : 'Sign in'}
        </Button>
        <div className="space-y-2">
          {ways.passkeys && passkeysHere() && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => go(cloud.signInWithPasskey, 'That passkey didn’t work.')}
            >
              Use a passkey
            </Button>
          )}
          {ways.password && (
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => switchTo('password')}>
              Use your password
            </Button>
          )}
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => switchTo('code')}>
            Use a code from another device
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <Section>
        <Card>{body}</Card>
      </Section>
    </div>
  )
}
