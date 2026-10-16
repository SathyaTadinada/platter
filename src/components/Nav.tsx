import { ChartLine, Disc3, LibraryBig, PanelLeftClose, PanelLeftOpen, ScanBarcode, Search, Settings2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useSession } from '../hooks/session'
import { inSearchArea, lastSearch } from '../lib/nav'
import { ProfileLink } from './Profile'
import { readPref, writePref } from '../lib/prefs'

const tabs: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/', label: 'Collection', Icon: LibraryBig },
  { href: '/scan', label: 'Scan', Icon: ScanBarcode },
  { href: '/search', label: 'Search', Icon: Search },
  { href: '/stats', label: 'Stats', Icon: ChartLine },
  { href: '/settings', label: 'Settings', Icon: Settings2 },
]

function useCurrent() {
  const [path] = useLocation()
  return (href: string) =>
    href === '/' ? path === '/' || path.startsWith('/collection') : href === '/search' ? inSearchArea(path) : path.startsWith(href)
}

// Search goes back to the last results or release, along with the page that one was opened
// from (so its Back button still works); tapping it again from there starts over
function useTarget() {
  const isCurrent = useCurrent()
  return (href: string): { href: string; state?: Record<string, string> } => {
    if (href !== '/search' || isCurrent(href)) return { href }
    const { url, from } = lastSearch()
    return { href: url, state: from ? { platterFrom: from } : undefined }
  }
}

// Phones and tablets: tab bar at the bottom, part of the layout (not fixed),
// so the iOS keyboard can't leave it stranded mid-screen.
export function BottomNav() {
  const isCurrent = useCurrent()
  const targetOf = useTarget()
  return (
    <nav className="shrink-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-stone-800 dark:bg-stone-950">
      <ul className="mx-auto flex max-w-xl">
        {tabs.map(({ href, label, Icon }) => (
          <li key={href} className="flex-1">
            <Link
              {...targetOf(href)}
              aria-current={isCurrent(href) ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                isCurrent(href) ? 'text-accent' : 'text-stone-500'
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

const COLLAPSED_KEY = 'platter.sidebarCollapsed'

const loadCollapsed = () => readPref(COLLAPSED_KEY) === '1'

// Desktop: sidebar, collapsible to icons only
export function SideNav() {
  const isCurrent = useCurrent()
  const targetOf = useTarget()
  const { session } = useSession()
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  function toggle() {
    setCollapsed(!collapsed)
    writePref(COLLAPSED_KEY, collapsed ? '0' : '1')
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <nav
      className={`hidden shrink-0 flex-col border-r border-stone-200 bg-white py-5 transition-[width] lg:flex dark:border-stone-800 dark:bg-stone-950 ${
        collapsed ? 'w-[4.5rem] items-center px-2' : 'w-64 px-3'
      }`}
    >
      <div className={`mb-8 flex items-center ${collapsed ? 'flex-col gap-3' : 'justify-between pr-1 pl-3'}`}>
        <Link href="/" className="flex items-center gap-2.5 text-[1.75rem] font-bold tracking-tight" aria-label="Platter">
          <Disc3 size={34} className="text-accent" aria-hidden />
          {!collapsed && 'Platter'}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-900 dark:hover:text-stone-100"
        >
          <ToggleIcon size={20} />
        </button>
      </div>
      <ul className={`space-y-1 ${collapsed ? '' : 'w-full'}`}>
        {tabs.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              {...targetOf(href)}
              aria-current={isCurrent(href) ? 'page' : undefined}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-lg py-2 font-medium ${collapsed ? 'justify-center px-2.5' : 'px-3'} ${
                isCurrent(href)
                  ? 'bg-stone-100 text-accent dark:bg-stone-900'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900'
              }`}
            >
              <Icon size={20} aria-hidden />
              {collapsed ? <span className="sr-only">{label}</span> : label}
            </Link>
          </li>
        ))}
      </ul>
      {session && (
        <ProfileLink
          compact={collapsed}
          className={`mt-auto rounded-lg py-2 hover:bg-stone-100 dark:hover:bg-stone-900 ${collapsed ? 'justify-center px-1.5' : 'px-3'}`}
        />
      )}
    </nav>
  )
}
