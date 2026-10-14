import { Disc3, LibraryBig, ScanBarcode, Search, Settings2, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { useSession } from '../hooks/session'
import { ProfileLink } from './Profile'

const tabs: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/', label: 'Collection', Icon: LibraryBig },
  { href: '/scan', label: 'Scan', Icon: ScanBarcode },
  { href: '/search', label: 'Search', Icon: Search },
  { href: '/settings', label: 'Settings', Icon: Settings2 },
]

function useCurrent() {
  const [path] = useLocation()
  return (href: string) => (href === '/' ? path === '/' || path.startsWith('/collection') : path.startsWith(href))
}

// Phones and tablets: tab bar at the bottom, part of the layout (not fixed),
// so the iOS keyboard can't leave it stranded mid-screen.
export function BottomNav() {
  const isCurrent = useCurrent()
  return (
    <nav className="shrink-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-stone-800 dark:bg-stone-950">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map(({ href, label, Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={isCurrent(href) ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                isCurrent(href) ? 'text-stone-900 dark:text-accent-400' : 'text-stone-500'
              }`}
            >
              <Icon size={22} aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// Desktop: sidebar
export function SideNav() {
  const isCurrent = useCurrent()
  const { session } = useSession()
  return (
    <nav className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white px-3 py-5 lg:flex dark:border-stone-800 dark:bg-stone-950">
      <Link href="/" className="mb-7 flex items-center gap-2.5 px-3 text-2xl font-bold tracking-tight">
        <Disc3 size={30} className="text-accent-500" aria-hidden />
        Platter
      </Link>
      <ul className="space-y-1">
        {tabs.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isCurrent(href) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 font-medium ${
                isCurrent(href)
                  ? 'bg-stone-100 text-stone-900 dark:bg-stone-900 dark:text-accent-400'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900'
              }`}
            >
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
      {session && <ProfileLink className="mt-auto rounded-lg px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-900" />}
    </nav>
  )
}
