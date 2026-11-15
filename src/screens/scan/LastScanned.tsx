import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Disc3, Undo2 } from 'lucide-react'
import { Link } from 'wouter'
import { buttonClass, IconButton } from '../../components/ui'
import { db, type QueueItem } from '../../db/db'
import { formatBarcodeInput } from '../../lib/barcode'

const STATUS: Partial<Record<QueueItem['status'], string>> = {
  pending: 'Looking it up…',
  choose: 'More than one match',
  notfound: 'Not found on Discogs',
  ready: 'Ready to add',
  failed: 'Didn’t work',
}

// Batch mode, under the camera: the record just scanned (with an Undo, for the wrong barcode), and
// the way to the batch with how many are waiting
export function LastScanned() {
  const last = useLiveQuery(
    () =>
      db.queue
        .orderBy('createdAt')
        .reverse()
        .filter((i) => i.source !== 'csv' && i.status !== 'added')
        .first(),
    [],
  )
  const waiting = useLiveQuery(() => db.queue.where('status').noneOf(['added']).count(), []) ?? 0

  if (!last) {
    return (
      <Link href="/batch" className={buttonClass('secondary', 'mt-4 w-full')}>
        Batch is empty
        <ChevronRight size={18} aria-hidden />
      </Link>
    )
  }

  const title = last.release?.title ?? (last.barcode ? formatBarcodeInput(last.barcode) : 'Record')
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      {last.release?.thumb ? (
        <img src={last.release.thumb} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400 dark:bg-stone-800">
          <Disc3 size={20} aria-hidden className={last.status === 'pending' ? 'animate-spin' : ''} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${last.release ? '' : 'font-mono text-sm'}`}>{title}</p>
        <p className="truncate text-xs text-stone-500">{last.release?.artist ?? STATUS[last.status]}</p>
      </div>
      <IconButton label={`Take ${title} back out`} onClick={() => last.id !== undefined && db.queue.delete(last.id)}>
        <Undo2 size={20} />
      </IconButton>
      <Link href="/batch" className={buttonClass('primary', 'min-h-9 shrink-0 px-3 text-sm')}>
        Review {waiting}
      </Link>
    </div>
  )
}
