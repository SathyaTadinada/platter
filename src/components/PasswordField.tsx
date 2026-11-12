import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'

export const fieldClass =
  'min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900 read-only:bg-stone-100 read-only:text-stone-500 dark:read-only:bg-stone-800 dark:read-only:text-stone-400'

// A password box with a button to show what's typed
export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  invalid,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  invalid?: boolean
}) {
  const id = useId()
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={autoComplete === 'current-password' ? 'password' : undefined}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          className={`${fieldClass} pr-12 ${invalid ? 'border-red-500 dark:border-red-400' : ''}`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

export const MIN_PASSWORD = 8

// 0 too short, 1 weak, 2 good, 3 strong: length counts most, mixing kinds of characters helps
export function strength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < MIN_PASSWORD) return 0
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(pw)).length
  const score = (pw.length >= 12 ? 1 : 0) + (pw.length >= 16 ? 1 : 0) + (kinds >= 3 ? 1 : 0)
  return score >= 2 ? 3 : score === 1 ? 2 : 1
}

const LEVELS = [
  { label: '', bar: '' },
  { label: 'Weak', bar: 'bg-red-500' },
  { label: 'Good', bar: 'bg-amber-500' },
  { label: 'Strong', bar: 'bg-emerald-600' },
]

// Choosing a password: typed twice, with how strong it is
export function NewPassword({
  value,
  onChange,
  confirm,
  onConfirmChange,
  label = 'Password',
}: {
  value: string
  onChange: (v: string) => void
  confirm: string
  onConfirmChange: (v: string) => void
  label?: string
}) {
  const level = strength(value)
  const mismatch = confirm.length > 0 && confirm !== value
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <PasswordInput label={label} value={value} onChange={onChange} autoComplete="new-password" />
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="grid flex-1 grid-cols-3 gap-1" aria-hidden>
            {[1, 2, 3].map((i) => (
              <span key={i} className={`h-1 rounded-full ${level >= i ? LEVELS[level].bar : 'bg-stone-200 dark:bg-stone-700'}`} />
            ))}
          </div>
          <span className="shrink-0 text-right text-xs whitespace-nowrap text-stone-500">
            {level ? LEVELS[level].label : `At least ${MIN_PASSWORD} characters`}
          </span>
        </div>
      </div>
      <PasswordInput label="Confirm password" value={confirm} onChange={onConfirmChange} autoComplete="new-password" invalid={mismatch} />
      {mismatch && <p className="text-sm text-red-700 dark:text-red-400">Passwords don't match.</p>}
    </div>
  )
}

export const newPasswordReady = (value: string, confirm: string) => value.length >= MIN_PASSWORD && value === confirm
