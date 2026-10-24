import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { getFields } from '../api/discogs/endpoints'
import { Card } from '../components/ui'
import { getSetting, setSetting } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { matchFields, type FieldMap } from '../lib/fields'

const DISMISSED = 'fieldNudgeDismissed'

// Small reminder when some custom fields aren't set up yet; it can be put away for good
export function FieldNudge({ className = '' }: { className?: string }) {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    getSetting<boolean>(DISMISSED).then((d) => setDismissed(Boolean(d)))
  }, [])
  const { client, username } = useSignedIn()
  const { data: missing } = useAsync(async () => {
    const [{ fields }, map] = await Promise.all([getFields(client, username), getSetting<FieldMap>('fieldMap')])
    return matchFields(fields, map ?? {}).filter((m) => m.source === 'none' && !m.spec.optional).length
  }, [client, username])

  if (!missing || dismissed) return null
  return (
    <Card className={`flex items-center justify-between gap-3 py-3 ${className}`}>
      <p className="text-sm">
        {missing} collection field{missing > 1 ? 's' : ''} not set up yet.
      </p>
      <span className="flex shrink-0 items-center gap-1">
        <Link href="/setup" className="text-sm font-semibold underline">
          Set up
        </Link>
        <button
          type="button"
          aria-label="Not now"
          onClick={() => {
            setDismissed(true)
            setSetting(DISMISSED, true)
          }}
          className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={16} />
        </button>
      </span>
    </Card>
  )
}
