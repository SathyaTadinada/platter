import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'

export const CODE_LENGTH = 6
// pairing codes leave out 0/O and 1/I, so a code read off a screen is typed right
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

const box =
  'flex h-14 w-11 items-center justify-center rounded-xl bg-white text-center font-mono text-2xl font-semibold uppercase ring-1 ring-stone-300 dark:bg-stone-900 dark:ring-stone-700 sm:w-12'

// A code split into its six characters, with a gap in the middle like it's shown
function Halves({ children }: { children: (i: number) => ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[0, 1, 2].map(children)}
      <span className="w-2 text-center text-stone-400" aria-hidden>
        –
      </span>
      {[3, 4, 5].map(children)}
    </div>
  )
}

// The code on the device that already syncs: big, copyable, and with the time it has left
export function PairingCodeDisplay({ code, expiresAt, onRenew }: { code: string; expiresAt: number; onRenew: () => void }) {
  const chars = clean(code)
  const [now, setNow] = useState(Date.now)
  const [copied, setCopied] = useState(false)
  const [total] = useState(() => Math.max(1, expiresAt - Date.now()))
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, expiresAt - now)
  const expired = left === 0
  const mm = Math.floor(left / 60_000)
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')

  async function copy() {
    await navigator.clipboard?.writeText(chars).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className={expired ? 'opacity-40' : ''} aria-label={`Code ${chars.split('').join(' ')}`} role="group">
        <Halves>
          {(i) => (
            <span key={i} className={box}>
              {chars[i]}
            </span>
          )}
        </Halves>
      </div>
      {expired ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-stone-500">This code has expired.</p>
          <button type="button" onClick={onRenew} className="text-sm font-semibold text-accent">
            Get a new code
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
                style={{ width: `${(left / total) * 100}%` }}
              />
            </div>
            <p className="text-center text-xs text-stone-500 tabular-nums">
              Expires in {mm}:{ss}
            </p>
          </div>
          <button
            type="button"
            onClick={copy}
            className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      )}
    </div>
  )
}

// Typing a code in: one box per character. Pasting fills them all, and a full code is sent right away.
export function PairingCodeInput({ onComplete, disabled }: { onComplete: (code: string) => void; disabled?: boolean }) {
  const [chars, setChars] = useState<string[]>(() => Array(CODE_LENGTH).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  function fill(from: number, text: string) {
    const typed = clean(text).slice(0, CODE_LENGTH - from)
    if (!typed) return
    const next = [...chars]
    typed.split('').forEach((c, j) => (next[from + j] = c))
    setChars(next)
    const end = Math.min(from + typed.length, CODE_LENGTH - 1)
    refs.current[end]?.focus()
    if (next.every(Boolean)) onComplete(next.join(''))
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !chars[i] && i > 0) {
      e.preventDefault()
      const next = [...chars]
      next[i - 1] = ''
      setChars(next)
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus()
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    fill(i, e.clipboardData.getData('text'))
  }

  return (
    <div role="group" aria-label="Pairing code">
      <Halves>
        {(i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            value={chars[i]}
            disabled={disabled}
            aria-label={`Character ${i + 1}`}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            spellCheck={false}
            maxLength={CODE_LENGTH}
            onChange={(e) => {
              const v = clean(e.target.value)
              if (!v) {
                const next = [...chars]
                next[i] = ''
                setChars(next)
              } else fill(i, v.slice(chars[i] ? 1 : 0) || v)
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
            className={`${box} focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50`}
          />
        )}
      </Halves>
    </div>
  )
}
