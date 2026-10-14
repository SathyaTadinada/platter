import type { ReleaseCard } from '../lib/format'
import type { Ownership } from '../lib/ownership'
import { DiscIcon } from './Icons'

export function Cover({ src, size = 'size-20' }: { src?: string; size?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className={`${size} shrink-0 rounded-lg bg-stone-200 object-cover dark:bg-stone-800`} />
  ) : (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-stone-200 text-stone-400 dark:bg-stone-800`}>
      <DiscIcon />
    </div>
  )
}

export function Badges({ own }: { own?: Ownership }) {
  if (!own) return null
  const badges: [string, string][] = []
  if (own.exactCopies) badges.push(['You own this', 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'])
  else if (own.otherPressings) badges.push(['You own another pressing', 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'])
  if (own.inWantlist) badges.push(['In your wantlist', 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200'])
  if (!badges.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {badges.map(([text, cls]) => (
        <span key={text} className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
          {text}
        </span>
      ))}
    </div>
  )
}

export function ReleaseSummary({ card }: { card: ReleaseCard }) {
  const line = [card.label, card.catno].filter(Boolean).join(' · ')
  const where = [card.country, card.year].filter(Boolean).join(' · ')
  return (
    <div className="min-w-0 text-left">
      <p className="truncate font-semibold">{card.title}</p>
      <p className="truncate text-sm text-stone-600 dark:text-stone-400">{card.artist}</p>
      {line && <p className="truncate text-sm text-stone-500">{line}</p>}
      {where && <p className="text-sm text-stone-500">{where}</p>}
      {card.format && <p className="line-clamp-2 text-xs text-stone-500">{card.format}</p>}
    </div>
  )
}

// Discogs API terms ask for this next to any data from them
export function DiscogsCredit({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener" className="text-xs text-stone-500 underline underline-offset-2">
      Data provided by Discogs.
    </a>
  )
}

export function ReleaseCardView({ card, own, onPick }: { card: ReleaseCard; own?: Ownership; onPick: () => void }) {
  return (
    <li className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <button type="button" onClick={onPick} className="flex w-full gap-3 p-3 text-left active:bg-stone-50 dark:active:bg-stone-800/50">
        <Cover src={card.thumb} />
        <div className="min-w-0 flex-1">
          <ReleaseSummary card={card} />
          <Badges own={own} />
        </div>
      </button>
      <div className="border-t border-stone-100 px-3 py-1.5 dark:border-stone-800">
        <DiscogsCredit url={card.discogsUrl} />
      </div>
    </li>
  )
}
