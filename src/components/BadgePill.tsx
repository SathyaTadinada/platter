import { Award, Crown, Disc3, Flame, FlaskConical, Gem, Heart, Music2, Sparkles, Star, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BadgeColor, BadgeIcon, BadgeLook } from '../../worker/badges'

export const BADGE_ICON: Record<BadgeIcon, LucideIcon> = {
  award: Award,
  star: Star,
  flame: Flame,
  heart: Heart,
  disc: Disc3,
  crown: Crown,
  sparkles: Sparkles,
  flask: FlaskConical,
  gem: Gem,
  music: Music2,
}

// a light tint with dark text, and the other way round in dark mode, so every color reads in both
export const BADGE_TINT: Record<BadgeColor, string> = {
  gray: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200',
  blue: 'bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200',
  green: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200',
  purple: 'bg-violet-100 text-violet-900 dark:bg-violet-950/70 dark:text-violet-200',
  red: 'bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-200',
}

// the swatch for each color in the badge editor
export const BADGE_SWATCH: Record<BadgeColor, string> = {
  gray: 'bg-stone-400',
  amber: 'bg-amber-500',
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  purple: 'bg-violet-500',
  red: 'bg-rose-500',
}

// A badge as people see it: its icon and name on its color. Anything after the name (a × to take it
// off, on the Members page) goes in children.
export function BadgePill({ badge, children }: { badge: BadgeLook; children?: ReactNode }) {
  const Icon = BADGE_ICON[badge.icon] ?? Award
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2 text-xs font-medium whitespace-nowrap ${children ? 'pr-0.5' : 'pr-2'} ${BADGE_TINT[badge.color] ?? BADGE_TINT.gray}`}
    >
      <Icon size={12} aria-hidden />
      {badge.label}
      {children}
    </span>
  )
}
