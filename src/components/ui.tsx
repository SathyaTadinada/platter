import { backLabel, backTarget, rememberTitle, subscribeNav } from '../lib/nav'
import { Check, ChevronLeft, ChevronRight, ExternalLink as ExternalIcon, Info, TriangleAlert } from 'lucide-react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'wouter'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-stone-900 text-white dark:bg-accent dark:text-accent-fg active:opacity-80 hover:opacity-90',
  secondary: 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100 active:opacity-80 hover:opacity-90',
  ghost: 'text-stone-700 dark:text-stone-300 active:bg-stone-200 hover:bg-stone-100 dark:active:bg-stone-800 dark:hover:bg-stone-900',
  // red text for anything that removes or leaves; solid red only for the final yes in a confirmation
  destructive: 'bg-stone-200 text-red-700 dark:bg-stone-800 dark:text-red-400 active:opacity-80 hover:opacity-90',
  danger: 'bg-red-600 text-white active:opacity-80',
}

export const buttonClass = (variant: Variant = 'primary', extra = '') =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition disabled:opacity-40 ${variants[variant]} ${extra}`

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />
}

export function ExternalLink({ children, className = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  // The last word and the icon stay on one line, so the icon never wraps on its own
  const text = typeof children === 'string' ? children : null
  const split = text ? text.lastIndexOf(' ') + 1 : 0
  const icon = <ExternalIcon size={14} aria-hidden className="ml-1 inline align-[-2px]" />
  return (
    // inline rather than flex, so selecting a sentence carries on through the link
    <a target="_blank" rel="noopener" className={`underline underline-offset-2 ${className}`} {...props}>
      {text ? text.slice(0, split) : children}
      <span className="whitespace-nowrap">
        {text ? text.slice(split) : '⁠'}
        {icon}
      </span>
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
    <div className="flex animate-appear items-center justify-center gap-3 py-10 text-stone-500" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  )
}

// Every page shares one container so titles line up; narrow pages just keep
// their content to a readable width, left-aligned
const container = 'mx-auto w-full max-w-7xl px-4 lg:px-8'
const widths = { narrow: 'max-w-2xl', wide: 'max-w-6xl', full: '' }

// Page with a header that stays put and covers the status bar area,
// so scrolled content never shows through behind the clock.
export function Screen({
  title,
  back,
  children,
  actions,
  toolbar,
  width = 'narrow',
  backdrop,
  fill,
}: {
  title: ReactNode
  back?: string | (() => void)
  children: ReactNode
  actions?: ReactNode
  toolbar?: ReactNode // stays pinned under the title
  width?: keyof typeof widths
  backdrop?: string // image shown blurred behind the top of the page
  fill?: boolean // content stretches to the bottom of the screen, so something can sit there with mt-auto
}) {
  const goBack = useBack(typeof back === 'string' ? back : undefined)
  // where Back leads, named next to the arrow where there's room
  const backName = useSyncExternalStore(subscribeNav, () => (back ? backLabel(typeof back === 'string' ? back : undefined) : undefined))
  // the browser tab (and history menu) names the page, and so does the Back button of the next one
  useEffect(() => {
    document.title = typeof title === 'string' && title ? `${title} · Platter` : 'Platter'
    rememberTitle(typeof title === 'string' ? title : '')
  }, [title])
  return (
    <div className={`relative isolate ${fill ? 'flex min-h-full flex-col' : ''}`}>
      {backdrop && (
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] overflow-hidden" aria-hidden>
          <img src={backdrop} alt="" className="size-full scale-125 object-cover opacity-40 blur-3xl saturate-150 dark:opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-stone-50 dark:to-stone-950" />
        </div>
      )}
      <header
        className={`sticky top-0 z-10 border-b print:hidden border-stone-200/70 pt-[var(--header-inset,env(safe-area-inset-top))] backdrop-blur-xl standalone:bg-stone-50 standalone:backdrop-blur-none dark:border-stone-800/70 dark:standalone:bg-stone-950 ${
          backdrop ? 'bg-stone-50/70 dark:bg-stone-950/70' : 'bg-stone-50/95 dark:bg-stone-950/95'
        }`}
      >
        {/* as wide as the content below, so the actions end where it does */}
        <div className={container}>
          <div className={`${widths[width]} flex min-h-14 items-center gap-1 lg:min-h-16`}>
            {back && (
              <button
                type="button"
                aria-label={backName ? `Back to ${backName}` : 'Back'}
                className={`-ml-2 flex min-w-0 shrink-0 items-center rounded-full p-2 hover:bg-stone-200 active:bg-stone-200 dark:hover:bg-stone-800 dark:active:bg-stone-800 ${
                  backName ? 'sm:mr-1 sm:pr-3' : ''
                }`}
                onClick={() => (typeof back === 'function' ? back() : goBack())}
              >
                <ChevronLeft className="shrink-0" />
                {backName && <span className="hidden max-w-40 truncate text-sm font-medium text-stone-500 sm:inline">{backName}</span>}
              </button>
            )}
            <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight lg:text-2xl">{title}</h1>
            {actions}
          </div>
        </div>
        {toolbar && (
          <div className={`${container} pb-3`}>
            <div className={widths[width]}>{toolbar}</div>
          </div>
        )}
      </header>
      <div className={`${container} pt-4 pb-8 lg:pt-6 ${fill ? 'flex flex-1 flex-col' : ''}`}>
        <div className={`${widths[width]} ${fill ? 'flex w-full flex-1 flex-col' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

// info: a note about the section, behind an (i) next to the title. Or the section shows more
// itself: details is whether that's open, and the (i) toggles it.
export function Section({
  title,
  info,
  details,
  children,
}: {
  title?: string
  info?: ReactNode
  details?: { open: boolean; toggle: () => void }
  children: ReactNode
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const open = details ? details.open : noteOpen
  return (
    <section className="mb-6">
      {title && (
        <div className="mb-2 flex items-center gap-1 px-1">
          <h2 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</h2>
          {(info || details) && (
            <button
              type="button"
              aria-label={`About ${title.toLowerCase()}`}
              aria-expanded={open}
              onClick={() => (details ? details.toggle() : setNoteOpen(!open))}
              className={`-my-1.5 rounded-full p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800 ${open ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500'}`}
            >
              <Info size={14} />
            </button>
          )}
        </div>
      )}
      {info && !details && open && <p className="mb-3 px-1 text-sm text-stone-500">{info}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800 ${className}`}>
      {children}
    </div>
  )
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
  icon?: ReactNode
  label: ReactNode
  detail?: ReactNode
  value?: ReactNode
  trailing?: ReactNode
  href?: string
  onClick?: () => void
  danger?: boolean
}

export function Row({ icon, label, detail, value, trailing, href, onClick, danger }: RowProps) {
  const body = (
    <>
      {icon && <span className={`shrink-0 ${danger ? 'text-red-600 dark:text-red-400' : 'text-stone-500'}`}>{icon}</span>}
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
        // a row is a place to go, not something to drag out
        <Link href={href} draggable={false} className={`${cls} ${interactive}`}>
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

// A row of mutually exclusive buttons, like the Scan modes or a chart's grouping.
// "sm" is the compact one used inside cards; "card" sits it on a white card.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  card = false,
  className = '',
}: {
  label: string
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  card?: boolean
  className?: string
}) {
  const sm = size === 'sm'
  return (
    <div
      role="group"
      aria-label={label}
      className={`${sm ? 'inline-flex gap-1 rounded-lg p-0.5' : 'grid gap-1 rounded-xl p-1'} ${sm || card ? 'bg-stone-100' : 'bg-stone-200'} dark:bg-stone-800 ${className}`}
      style={sm ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`font-medium ${sm ? 'rounded-md px-2.5 py-1 text-xs' : 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-sm'} ${
            value === o.value ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

// An on/off setting. Put it in a <label> with its name so tapping the name flips it too.
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-2 disabled:opacity-40 ${
        checked ? 'bg-accent' : 'bg-stone-300 dark:bg-stone-700'
      }`}
    >
      <span
        className={`inline-block size-6 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

// The ::after pads the hit area out to 44px for fingers without changing the look
// danger: turns red on hover, for buttons that delete, remove, or sign something out
const iconClass =
  'relative rounded-full p-2 text-stone-700 after:absolute after:-inset-1 hover:bg-stone-200 active:bg-stone-200 disabled:opacity-40 max-[359px]:p-1.5 dark:text-stone-300 dark:hover:bg-stone-800 dark:active:bg-stone-800'

// An icon in a toolbar that goes somewhere: in the app, or (external) out to another site
export function IconLink({ label, href, external, children }: { label: string; href: string; external?: boolean; children: ReactNode }) {
  return external ? (
    <a href={href} target="_blank" rel="noopener" aria-label={label} title={label} className={iconClass}>
      {children}
    </a>
  ) : (
    <Link href={href} aria-label={label} title={label} className={iconClass}>
      {children}
    </Link>
  )
}

export function IconButton({
  label,
  children,
  danger,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${iconClass} ${danger ? 'hover:text-red-600 dark:hover:text-red-400' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// Goes back in history when there is somewhere to go, otherwise to a fallback
// Back to the previous page in this tab, or to the fallback if there isn't one
export function useBack(fallback?: string) {
  const [, navigate] = useLocation()
  return () => {
    const t = backTarget(fallback)
    if ('history' in t) history.back()
    else navigate(t.to, { replace: true, state: t.state })
  }
}
