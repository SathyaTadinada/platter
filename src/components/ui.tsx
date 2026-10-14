import { Check, ChevronLeft, ChevronRight, ExternalLink as ExternalIcon, TriangleAlert } from 'lucide-react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, useLocation } from 'wouter'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-stone-900 text-white dark:bg-accent-500 dark:text-stone-950 active:opacity-80 hover:opacity-90',
  secondary: 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100 active:opacity-80 hover:opacity-90',
  ghost: 'text-stone-700 dark:text-stone-300 active:bg-stone-200 hover:bg-stone-100 dark:active:bg-stone-800 dark:hover:bg-stone-900',
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
      <ExternalIcon size={14} aria-hidden />
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
  const icon = tone === 'success' ? <Check size={18} /> : tone === 'info' ? null : <TriangleAlert size={18} />
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

const widths = { narrow: 'max-w-xl', wide: 'max-w-5xl' }

// Page with a header that stays put and covers the status bar area,
// so scrolled content never shows through behind the clock.
export function Screen({
  title,
  back,
  children,
  actions,
  width = 'narrow',
}: {
  title: string
  back?: string
  children: ReactNode
  actions?: ReactNode
  width?: keyof typeof widths
}) {
  const [, navigate] = useLocation()
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-stone-50/95 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/95">
        <div className={`mx-auto flex min-h-14 w-full items-center gap-1 px-4 lg:px-8 ${widths[width]}`}>
          {back && (
            <button
              type="button"
              aria-label="Back"
              className="-ml-2 rounded-full p-2 hover:bg-stone-200 active:bg-stone-200 dark:hover:bg-stone-800 dark:active:bg-stone-800"
              onClick={() => navigate(back)}
            >
              <ChevronLeft />
            </button>
          )}
          <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{title}</h1>
          {actions}
        </div>
      </header>
      <div className={`mx-auto w-full px-4 pt-4 pb-8 lg:px-8 lg:pt-6 ${widths[width]}`}>{children}</div>
    </>
  )
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</h2>}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800 ${className}`}>{children}</div>
}

// Grouped list, like iOS settings
export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      {children}
    </ul>
  )
}

type RowProps = {
  label: ReactNode
  detail?: ReactNode
  value?: ReactNode
  trailing?: ReactNode
  href?: string
  onClick?: () => void
  danger?: boolean
}

export function Row({ label, detail, value, trailing, href, onClick, danger }: RowProps) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className={`truncate ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{label}</p>
        {detail && <p className="truncate text-sm text-stone-500">{detail}</p>}
      </div>
      {value && <span className="shrink-0 text-sm text-stone-500">{value}</span>}
      {trailing}
      {href && <ChevronRight size={18} className="shrink-0 text-stone-400" aria-hidden />}
    </>
  )
  const cls = 'flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left'
  const interactive = 'hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800'
  return (
    <li>
      {href ? (
        <Link href={href} className={`${cls} ${interactive}`}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={`${cls} ${interactive}`}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}
