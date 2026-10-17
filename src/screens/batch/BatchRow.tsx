import { ChevronRight, CircleAlert, CircleCheck, Disc3, Loader, Pencil, RotateCw, X } from 'lucide-react'
import type { QueueItem } from '../../db/db'
import { formatBarcodeInput } from '../../lib/barcode'
import { shortGrade, toCard } from '../../lib/format'
import { formatPrice, hasMetadata, type Metadata } from '../../lib/metadata'

function Badge({ tone, children }: { tone: 'warn' | 'good' | 'plain'; children: React.ReactNode }) {
  const cls = {
    warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
    good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
    plain: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  }[tone]
  return <span className={`max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

type RowProps = {
  item: QueueItem
  dupe?: boolean
  online?: boolean
  ownedExact?: boolean
  ownedOther?: boolean
  wanted?: boolean
  onResolve?: () => void
  onRemove?: () => void
  onRetry?: () => void
  onEdit?: () => void
  currency?: string
  cover?: string // for rows that came without one
}

function metaSummary(m: Metadata, currency: string): string {
  const cond = [shortGrade(m.mediaCondition), shortGrade(m.sleeveCondition)].filter(Boolean).join('/')
  return [cond, formatPrice(m.price, currency), m.store, m.location].filter(Boolean).join(' · ')
}

export function Row({
  item,
  dupe,
  online = true,
  ownedExact,
  ownedOther,
  wanted,
  onResolve,
  onRemove,
  onRetry,
  onEdit,
  currency = 'USD',
  cover,
}: RowProps) {
  const r = item.release
  // not picked yet: the releases sharing a barcode are nearly always the same album, so
  // its cover and name help tell which record this is
  const guess = !r && item.candidates?.length ? toCard(item.candidates[0]) : undefined
  const thumb = r?.thumb ?? guess?.thumb ?? cover
  const meta = r ? [r.label, r.catno, r.year].filter(Boolean).join(' · ') : ''

  let status: React.ReactNode = null
  switch (item.status) {
    case 'pending':
      status = online ? 'Waiting to look up' : 'Will look up when online'
      break
    case 'looking':
      status = (
        <span className="inline-flex items-center gap-1">
          <Loader size={14} className="animate-spin" aria-hidden /> Looking up
        </span>
      )
      break
    case 'choose':
      status =
        item.via === 'musicbrainz'
          ? `Not on Discogs by barcode. MusicBrainz lists it as ${item.guess}.`
          : `${item.candidates?.length} releases have this barcode`
      break
    case 'notfound':
      status = item.guess ? `Not on Discogs by barcode. MusicBrainz lists it as ${item.guess}.` : 'No match on Discogs'
      break
    case 'failed':
      status = <span className="text-red-600 dark:text-red-400">{item.error}</span>
      break
    case 'adding':
      status = (
        <span className="inline-flex items-center gap-1">
          <Loader size={14} className="animate-spin" aria-hidden /> Adding
        </span>
      )
      break
    case 'added':
      status = item.warning ? (
        <span className="text-amber-700 dark:text-amber-400">{item.warning}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CircleCheck size={14} aria-hidden /> Added
        </span>
      )
      break
  }

  const body = (
    <>
      {thumb ? (
        <img src={thumb} alt="" loading="lazy" className="size-12 shrink-0 rounded-md bg-stone-200 object-cover dark:bg-stone-800" />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-stone-200 text-stone-400 dark:bg-stone-800">
          {item.status === 'failed' ? <CircleAlert size={20} aria-hidden /> : <Disc3 size={20} aria-hidden />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r ? r.title : (guess?.title ?? (item.barcode && formatBarcodeInput(item.barcode)))}</p>
        {(r ?? guess) && <p className="truncate text-sm text-stone-600 dark:text-stone-400">{(r ?? guess)!.artist}</p>}
        {meta && <p className="truncate text-xs text-stone-500">{meta}</p>}
        {status && <p className="text-xs text-stone-500">{status}</p>}
        {item.meta && hasMetadata(item.meta) && item.status !== 'added' && (
          <p className="truncate text-xs text-stone-600 dark:text-stone-400">{metaSummary(item.meta, currency)}</p>
        )}
        {(dupe || ownedExact || ownedOther || wanted || item.source === 'csv') && item.status !== 'added' && (
          <div className="mt-1 flex flex-wrap gap-1">
            {ownedExact && <Badge tone="warn">Already in collection</Badge>}
            {ownedOther && <Badge tone="plain">Own another pressing</Badge>}
            {wanted && <Badge tone="good">On your wantlist</Badge>}
            {dupe && <Badge tone="warn">Scanned twice</Badge>}
            {item.source === 'csv' && <Badge tone="plain">Imported</Badge>}
          </div>
        )}
      </div>
    </>
  )

  return (
    <li className="flex items-center gap-1 pr-2">
      {onResolve ? (
        <button
          type="button"
          onClick={onResolve}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
        >
          {body}
          <span className="shrink-0 text-sm font-semibold text-stone-700 dark:text-stone-300">
            {item.status === 'ready' ? (
              <>
                {/* phones are short on room in this row; the whole row is tappable anyway */}
                <span className="hidden sm:inline">Change</span>
                <ChevronRight size={18} className="text-stone-400 sm:hidden" aria-label="Change" />
              </>
            ) : (
              'Pick'
            )}
          </span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">{body}</div>
      )}
      {onEdit && (
        <button
          type="button"
          aria-label="Details"
          onClick={onEdit}
          className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <Pencil size={17} />
        </button>
      )}
      {onRetry && item.status === 'failed' && (
        <button
          type="button"
          aria-label="Retry"
          onClick={onRetry}
          className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <RotateCw size={18} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove from batch"
          onClick={onRemove}
          className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={18} />
        </button>
      )}
    </li>
  )
}
