import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { inline, Row } from '../../components/CopyDetails'
import { DateInput, formatDay } from '../../components/DateInput'
import { Sheet } from '../../components/Sheet'
import { statCard } from '../../components/stats'
import { toast } from '../../components/Toaster'
import { Button, List } from '../../components/ui'
import { db } from '../../db/db'
import { checkPrices, useCurrency, usePriceCheck } from '../../hooks/prices'
import { useSignedIn } from '../../hooks/session'
import { LIFESPANS, saveStylusSettings, staleLengths, stylusSettings, stylusUse, type StylusSettings } from '../../lib/stylus'
import { localDate } from '../../lib/value'

const hours = (h: number) => (h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString())
const dayStart = (iso: string) => new Date(`${iso}T00:00`).getTime()

// Hours on the stylus, in the Listening view
export function Stylus() {
  const { client, session } = useSignedIn()
  const currency = useCurrency()
  const check = usePriceCheck()
  const [editing, setEditing] = useState(false)
  const data = useLiveQuery(async () => {
    const [settings, plays, lengths, missing] = await Promise.all([
      stylusSettings(),
      db.plays.toArray(),
      db.lengths.toArray(),
      staleLengths(),
    ])
    const use = stylusUse(plays, new Map(lengths.map((l) => [l.releaseId, l])), settings.since)
    return { settings, use, missing: missing.length }
  })

  // records played since the last check have no length yet
  const missing = data?.missing ?? 0
  useEffect(() => {
    if (!missing || !currency || check.running || check.error || session.expired) return
    const t = setTimeout(() => checkPrices(client, [], currency), 1000)
    return () => clearTimeout(t)
  }, [missing, currency, client, check.running, check.error, session.expired])

  if (!data) return null
  const { settings, use } = data
  const share = Math.min(1, use.hours / settings.lifespan)
  const over = use.hours >= settings.lifespan
  const loading = check.running && check.stage === 'lengths'

  async function fitted() {
    const before = settings
    await saveStylusSettings({ ...settings, since: dayStart(localDate(Date.now())) })
    toast('Counting from today', { action: { label: 'Undo', onClick: () => saveStylusSettings(before) } })
  }

  return (
    <div className={`${statCard} p-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <p>
          <span className="text-2xl font-bold tabular-nums">{hours(use.hours)}</span> <span className="text-sm text-stone-500">hours</span>
        </p>
        <p className="text-right text-sm text-stone-500">
          {!settings.since
            ? 'since your first logged play'
            : localDate(settings.since) === localDate(Date.now())
              ? 'since today'
              : `since ${formatDay(localDate(settings.since))}`}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Stylus wear"
        aria-valuemin={0}
        aria-valuemax={settings.lifespan}
        aria-valuenow={Math.round(use.hours)}
        className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-accent'}`}
          style={{ width: `${Math.max(share * 100, use.hours ? 1 : 0)}%` }}
        />
      </div>
      <p className={`mt-2 text-sm ${over ? 'font-medium text-red-600 dark:text-red-400' : 'text-stone-500'}`}>
        {over
          ? `Past the ${settings.lifespan.toLocaleString()} hours you set. Worth checking it for wear.`
          : `About ${Math.round(settings.lifespan - use.hours).toLocaleString()} of ${settings.lifespan.toLocaleString()} hours left`}
      </p>
      <p className="mt-3 text-xs text-stone-500">
        {use.plays} play{use.plays === 1 ? '' : 's'}, each counted as the whole record.
        {loading ? ' Getting record lengths…' : use.estimated ? ' Some lengths are estimates.' : ''}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={fitted}>
          New stylus
        </Button>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
      {editing && (
        <StylusSheet
          settings={settings}
          onSave={async (s) => {
            await saveStylusSettings(s)
            setEditing(false)
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function StylusSheet({
  settings,
  onSave,
  onClose,
}: {
  settings: StylusSettings
  onSave: (s: StylusSettings) => void
  onClose: () => void
}) {
  const [since, setSince] = useState(settings.since ? localDate(settings.since) : '')
  const [lifespan, setLifespan] = useState(settings.lifespan)
  const options = LIFESPANS.includes(lifespan) ? LIFESPANS : [...LIFESPANS, lifespan].sort((a, b) => a - b)
  return (
    <Sheet
      title="Stylus"
      onClose={onClose}
      width="md"
      bodyClassName="p-4"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ since: since ? dayStart(since) : undefined, lifespan })}>Save</Button>
        </div>
      }
    >
      <List>
        <Row label="Fitted on">
          <DateInput value={since} onChange={setSince} label="Fitted on" placeholder="Not set" />
        </Row>
        <Row label="Replace after">
          <select
            aria-label="Replace after"
            value={lifespan}
            onChange={(e) => setLifespan(Number(e.target.value))}
            className={`${inline} cursor-pointer appearance-none [text-align-last:right]`}
          >
            {options.map((h) => (
              <option key={h} value={h}>
                {h.toLocaleString()} hours
              </option>
            ))}
          </select>
        </Row>
      </List>
      <p className="mt-3 text-sm text-stone-500">
        Your stylus maker usually gives a figure. Without a date, hours count from the first play logged in Platter.
      </p>
    </Sheet>
  )
}
