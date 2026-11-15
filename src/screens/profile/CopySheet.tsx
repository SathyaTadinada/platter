import { Link } from 'wouter'
import { Cover } from '../../components/Cover'
import { Sheet } from '../../components/Sheet'
import { Stars } from '../../components/Stars'
import { buttonClass } from '../../components/ui'
import type { ProfileItem } from '../../lib/profile'

const LONG = 32

// Someone's copy of a record: what they chose to show about it, with the way to the record itself
export function CopySheet({ item, owner, onClose }: { item: ProfileItem; owner: string; onClose: () => void }) {
  const about = [item.year, item.format, item.label].filter(Boolean).join(' · ')
  return (
    <Sheet
      title={`${owner}’s copy`}
      onClose={onClose}
      bodyClassName="p-5"
      width="md"
      footer={
        <Link href={`/release/${item.id}`} onClick={onClose} className={buttonClass('secondary', 'w-full')}>
          Open record
        </Link>
      }
    >
      <div className="flex items-center gap-4">
        <Cover item={item} className="size-24 shrink-0 rounded-xl shadow-sm ring-1 ring-black/5" />
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight">{item.title}</p>
          <p className="text-stone-600 dark:text-stone-300">{item.artist}</p>
          {about && <p className="mt-1 text-sm text-stone-500">{about}</p>}
        </div>
      </div>
      {item.copy && (
        <dl className="mt-5 divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
          {item.copy.rating ? (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-stone-500">Rating</dt>
              <dd>
                <Stars value={item.copy.rating} size={16} />
              </dd>
            </div>
          ) : null}
          {item.copy.fields?.map(([name, value]) =>
            // a short value sits beside its name; a long one (notes, usually) reads better under it
            value.length > LONG || value.includes('\n') ? (
              <div key={name} className="px-4 py-3">
                <dt className="text-stone-500">{name}</dt>
                <dd className="mt-1 break-words whitespace-pre-line">{value}</dd>
              </div>
            ) : (
              <div key={name} className="flex justify-between gap-4 px-4 py-3">
                <dt className="shrink-0 text-stone-500">{name}</dt>
                <dd className="min-w-0 text-right break-words">{value}</dd>
              </div>
            ),
          )}
        </dl>
      )}
    </Sheet>
  )
}
