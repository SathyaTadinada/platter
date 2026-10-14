import { Link, useLocation } from 'wouter'
import { ScanIcon, SearchIcon, SettingsIcon } from './Icons'

const tabs = [
  { href: '/', label: 'Scan', Icon: ScanIcon },
  { href: '/search', label: 'Search', Icon: SearchIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
]

export function BottomNav() {
  const [path] = useLocation()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map(({ href, label, Icon }) => {
          const current = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  current ? 'text-stone-900 dark:text-accent-400' : 'text-stone-500'
                }`}
              >
                <Icon width={22} height={22} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
