import { ChevronRight } from 'lucide-react'
import { Link, useSearch } from 'wouter'
import { Stars } from '../../components/Stars'
import { Section } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { useAsync } from '../../hooks/useAsync'
import type { CopyDetails, ProfileItem } from '../../lib/profile'

const LONG = 32
const row = 'flex justify-between gap-4 px-4 py-3'

// Someone's copy of this release, when the page was opened from their profile: who it's from (in the
// address, so a reload or a shared link keeps it) and what they show about it
export function useTheirCopy(releaseId: number): { owner: string; copy: CopyDetails } | null {
  const params = new URLSearchParams(useSearch())
  const owner = params.get('from')
  const key = params.get('copy')
  const { reader } = useCloud()
  const found = useAsync(async () => {
    if (!owner || !key) return null
    const row = await reader.profileItem(owner, key)
    const item = JSON.parse(row.value) as ProfileItem
    // only for this release, so an old link can't put one record's details on another
    return item.id === releaseId && item.copy ? { owner, copy: item.copy } : null
  }, [owner, key, releaseId])
  return found.data ?? null
}

export function TheirCopy({ owner, copy }: { owner: string; copy: CopyDetails }) {
  return (
    <Section title={`${owner}’s copy`}>
      <dl className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
        {copy.rating ? (
          <div className={`${row} items-center`}>
            <dt className="text-stone-500">Rating</dt>
            <dd>
              <Stars value={copy.rating} size={16} />
            </dd>
          </div>
        ) : null}
        {copy.fields?.map(([name, value]) =>
          // a short value sits beside its name; a long one (notes, usually) reads better under it
          value.length > LONG || value.includes('\n') ? (
            <div key={name} className="px-4 py-3">
              <dt className="text-stone-500">{name}</dt>
              <dd className="mt-1 break-words whitespace-pre-line">{value}</dd>
            </div>
          ) : (
            <div key={name} className={row}>
              <dt className="shrink-0 text-stone-500">{name}</dt>
              <dd className="min-w-0 text-right break-words">{value}</dd>
            </div>
          ),
        )}
        <Link
          href={`/u/${encodeURIComponent(owner)}`}
          className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50"
        >
          {owner}’s profile
          <ChevronRight size={16} aria-hidden />
        </Link>
      </dl>
    </Section>
  )
}
