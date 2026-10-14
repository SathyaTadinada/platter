import { useState } from 'react'
import { Link } from 'wouter'
import { getFields } from '../api/discogs/endpoints'
import type { CollectionField } from '../api/discogs/types'
import { Check } from 'lucide-react'
import { Button, buttonClass, Card, ExternalLink, Notice, Screen, Section, Spinner } from '../components/ui'
import { getSetting, setSetting } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { FIELDS_SETTINGS_URL, matchFields, type FieldKey, type FieldMap, type FieldMatch } from '../lib/fields'

export function Setup() {
  const { client, username } = useSignedIn()
  const [map, setMap] = useState<FieldMap>({})

  const state = useAsync(async () => {
    const [{ fields }, saved] = await Promise.all([getFields(client, username), getSetting<FieldMap>('fieldMap')])
    setMap(saved ?? {})
    return fields
  }, [client, username])

  async function choose(key: FieldKey, value: string) {
    const next = { ...map }
    if (value === 'auto') delete next[key]
    else next[key] = value === 'off' ? null : Number(value)
    setMap(next)
    await setSetting('fieldMap', next)
  }

  const matches = state.data ? matchFields(state.data, map) : []
  const missing = matches.filter((m) => !m.field && m.source === 'none')

  return (
    <Screen title="Collection fields" back="/settings">
      <Section>
        <p className="text-stone-600 dark:text-stone-400">
          Platter saves things like price and shelf location in Discogs custom fields, so they sync wherever you use Discogs. Fields
          have to be created on the Discogs website. Everything still works without them; Platter just skips what it can't save.
        </p>
      </Section>

      {state.loading && !state.data && <Spinner label="Checking your fields" />}
      {state.error && <Notice tone="error">{state.error.message}</Notice>}

      {state.data && (
        <>
          {missing.length > 0 ? (
            <Card className="mb-6 space-y-3">
              <p className="font-semibold">
                {missing.length} field{missing.length > 1 ? 's' : ''} to add
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>
                  Open <ExternalLink href={FIELDS_SETTINGS_URL}>Discogs collection settings</ExternalLink>
                </li>
                <li>
                  Use <b>Add Field</b> for each one below, with the exact name and type shown. Leave <b>Make Public</b> off.
                </li>
                <li>Save, then come back here and check again.</li>
              </ol>
              <Button variant="secondary" className="w-full" onClick={state.reload} disabled={state.loading}>
                {state.loading ? 'Checking…' : 'Check again'}
              </Button>
            </Card>
          ) : (
            <div className="mb-6">
              <Notice tone="success">All set. Every field Platter uses is connected.</Notice>
            </div>
          )}

          <Section title="Fields">
            <ul className="space-y-3">
              {matches.map((m) => (
                <FieldRow key={m.spec.key} match={m} fields={state.data!} value={map[m.spec.key]} onChoose={(v) => choose(m.spec.key, v)} />
              ))}
            </ul>
          </Section>
        </>
      )}

      <Link href="/" className={buttonClass('primary', 'w-full')}>
        Done
      </Link>
    </Screen>
  )
}

function FieldRow({
  match,
  fields,
  value,
  onChoose,
}: {
  match: FieldMatch
  fields: CollectionField[]
  value: number | null | undefined
  onChoose: (v: string) => void
}) {
  const { spec, field, source } = match
  const selectValue = value === null ? 'off' : value === undefined ? 'auto' : String(value)
  const wrongType = field && field.type !== spec.type && !(spec.key === 'location' && field.type === 'dropdown')

  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
            field ? 'bg-emerald-500 text-white' : 'border-2 border-stone-300 dark:border-stone-700'
          }`}
        >
          {field && <Check size={14} strokeWidth={3} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">{spec.name}</p>
          <p className="text-sm text-stone-600 dark:text-stone-400">{spec.why}</p>
          {field && source === 'name' && field.name !== spec.name && <p className="text-sm text-stone-500">Using your field "{field.name}".</p>}
          {!field && source === 'none' && <p className="text-sm text-stone-500">{spec.setup}</p>}
          {!field && source === 'manual' && <p className="text-sm text-stone-500">Turned off.</p>}
          {wrongType && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              This field is a {field.type === 'dropdown' ? 'Dropdown' : 'Text Area'}; Platter expects a {spec.type === 'dropdown' ? 'Dropdown' : 'Text Area'}.
            </p>
          )}
          <label className="block pt-1">
            <span className="sr-only">Discogs field for {spec.name}</span>
            <select
              value={selectValue}
              onChange={(e) => onChoose(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-stone-300 bg-transparent px-2 text-sm dark:border-stone-700"
            >
              <option value="auto">Match by name</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  Use "{f.name}"
                </option>
              ))}
              <option value="off">Don't use</option>
            </select>
          </label>
        </div>
      </div>
    </li>
  )
}
