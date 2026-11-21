import { useSearch } from 'wouter'
import { Row } from '../../components/CopyDetails'
import { Stars } from '../../components/Stars'
import { List, Section } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { useAsync } from '../../hooks/useAsync'
import type { CopyDetails, ProfileItem } from '../../lib/profile'

const LONG = 32

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

// Their copy in the same rows as your own copy's details, so the two read as one kind of thing. Long
// values (notes, usually) go under their name rather than beside it.
export function TheirCopy({ owner, copy }: { owner: string; copy: CopyDetails }) {
  return (
    <Section title={`${owner}’s copy`} link={{ label: 'View profile', href: `/u/${encodeURIComponent(owner)}` }}>
      <List>
        {copy.rating ? (
          <Row label="Rating">
            <span className="flex justify-end px-2">
              <Stars value={copy.rating} size={18} />
            </span>
          </Row>
        ) : null}
        {copy.fields?.map(([name, value]) => {
          const long = value.length > LONG || value.includes('\n')
          return (
            <Row key={name} label={name} stacked={long}>
              <span className={`block font-medium break-words ${long ? 'whitespace-pre-line' : 'px-2 text-right'}`}>{value}</span>
            </Row>
          )
        })}
      </List>
    </Section>
  )
}
