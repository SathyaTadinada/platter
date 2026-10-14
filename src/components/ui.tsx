import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { useLocation } from 'wouter'
import { AlertIcon, BackIcon, CheckIcon, ExternalIcon } from './Icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-stone-900 text-white dark:bg-accent-500 dark:text-stone-950 active:opacity-80',
  secondary: 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100 active:opacity-80',
  ghost: 'text-stone-700 dark:text-stone-300 active:bg-stone-200 dark:active:bg-stone-800',
  danger: 'bg-red-600 text-white active:opacity-80',
}

export const buttonClass = (variant: Variant = 'primary', extra = '') =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition disabled:opacity-40 ${variants[variant]} ${extra}`

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />
}

export function ExternalLink({ children, className = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a target="_blank" rel="noopener" className={`inline-flex items-center gap-1 underline underline-offset-2 ${className}`} {...props}>
      {children}
      <ExternalIcon width={14} height={14} />
    </a>
  )
}

type Tone = 'info' | 'warn' | 'success' | 'error'

const tones: Record<Tone, string> = {
  info: 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200',
  warn: 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  success: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
  error: 'bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-200',
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const icon = tone === 'success' ? <CheckIcon width={18} /> : tone === 'info' ? null : <AlertIcon width={18} />
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm ${tones[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-stone-500" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  )
}

export function Screen({ title, back, children, actions }: { title: string; back?: string; children: ReactNode; actions?: ReactNode }) {
  const [, navigate] = useLocation()
  return (
    <div className="mx-auto max-w-xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-28">
      <header className="mb-4 flex min-h-12 items-center gap-1">
        {back && (
          <button type="button" aria-label="Back" className="-ml-2 rounded-full p-2 active:bg-stone-200 dark:active:bg-stone-800" onClick={() => navigate(back)}>
            <BackIcon />
          </button>
        )}
        <h1 className="flex-1 text-2xl font-bold tracking-tight">{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  )
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">{title}</h2>}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800 ${className}`}>{children}</div>
}
