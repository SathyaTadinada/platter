import { useState } from 'react'
import type { Folder } from '../../api/discogs/types'
import { CrateSelect } from '../../components/CrateSelect'
import { inline, Row as FieldRow } from '../../components/CopyDetails'
import { MetadataForm } from '../../components/MetadataForm'
import { formatDay } from '../../components/DateInput'
import { Sheet } from '../../components/Sheet'
import { Button, List } from '../../components/ui'
import type { QueueItem } from '../../db/db'
import { useFieldMatches } from '../../hooks/useFields'
import type { Metadata } from '../../lib/metadata'

// Condition, price and anything else for one record; shared values show as placeholders
export function DetailsSheet({
  item,
  shared,
  matches,
  folders,
  onSave,
  onClose,
}: {
  item: QueueItem
  shared: Metadata
  matches: ReturnType<typeof useFieldMatches>
  folders: Folder[]
  onSave: (m: Metadata, folderId: number | undefined) => void
  onClose: () => void
}) {
  const [meta, setMeta] = useState<Metadata>(item.meta ?? {})
  const [folderId, setFolderId] = useState(item.folderId) // undefined: whatever the batch uses
  const sharedText = [shared.date && formatDay(shared.date), shared.store, shared.location].filter(Boolean).join(' · ')

  return (
    <Sheet
      title={
        <>
          {item.release?.title}
          <span className="block truncate text-sm font-normal text-stone-500">{item.release?.artist}</span>
        </>
      }
      onClose={onClose}
      bodyClassName="space-y-4 p-5"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(meta, folderId)}>Save</Button>
        </div>
      }
    >
      <List>
        <FieldRow label="Crate">
          <CrateSelect
            value={folderId}
            folders={folders}
            onChange={setFolderId}
            onClear={() => setFolderId(undefined)}
            placeholder="Same as batch"
            className={`${inline} cursor-pointer appearance-none [text-align-last:right]`}
          />
        </FieldRow>
      </List>
      <MetadataForm value={meta} onChange={setMeta} matches={matches} />
      {sharedText && <p className="text-xs text-stone-500">Batch values: {sharedText}. Anything entered here replaces them.</p>}
    </Sheet>
  )
}
