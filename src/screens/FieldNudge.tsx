import { Link } from 'wouter'
import { getFields } from '../api/discogs/endpoints'
import { Card } from '../components/ui'
import { getSetting } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { matchFields, type FieldMap } from '../lib/fields'

// Small reminder when some custom fields aren't set up yet
export function FieldNudge() {
  const { client, username } = useSignedIn()
  const { data: missing } = useAsync(async () => {
    const [{ fields }, map] = await Promise.all([getFields(client, username), getSetting<FieldMap>('fieldMap')])
    return matchFields(fields, map ?? {}).filter((m) => m.source === 'none').length
  }, [client, username])

  if (!missing) return null
  return (
    <Card className="flex items-center justify-between gap-3 py-3">
      <p className="text-sm">
        {missing} collection field{missing > 1 ? 's' : ''} not set up yet.
      </p>
      <Link href="/setup" className="shrink-0 text-sm font-semibold underline">
        Set up
      </Link>
    </Card>
  )
}
