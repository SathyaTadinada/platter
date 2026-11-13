import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { Button, Card, ExternalLink, Notice, Screen, Section, Spinner } from '../components/ui'
import { db, type QueueItem } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { parseDiscogsExport, planImport, type ImportPlan, type ParsedImport } from '../lib/csv'
import { enqueueCsv, planFills, waitingInBatch } from '../lib/queue'

type Loaded = {
  name: string
  parsed: ParsedImport
  plan: ImportPlan
  owned: Set<number>
  waiting: Set<number> // releases already in the batch
  fills: QueueItem[] // details the file can add to copies already in the collection
}

// What to do with records the collection already has
type Owned = 'skip' | 'fill' | 'copy'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function Import() {
  const [, navigate] = useLocation()
  const { username } = useSignedIn()
  const meta = useCollectionMeta()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ownedChoice, setOwnedChoice] = useState<Owned>('skip')
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setError(null)
    setLoaded(null)
    try {
      const parsed = parseDiscogsExport(await file.text())
      if (!parsed.rows.length) throw new Error('No records with a release ID in that file.')
      const plan = planImport(parsed, meta.data?.fields ?? [], meta.data?.folders ?? [])
      const copies = await db.collection.toArray()
      const owned = new Set(copies.map((c) => c.releaseId))
      const waiting = await waitingInBatch()
      const fills = planFills(
        parsed.rows.filter((r) => owned.has(r.releaseId)),
        plan,
        copies,
      ).filter((f) => !waiting.copies.has(f.instanceId!))
      setLoaded({ name: file.name, parsed, plan, owned, waiting: waiting.releases, fills })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // records already waiting in the batch aren't queued again
  const rows = loaded ? loaded.parsed.rows.filter((r) => !loaded.waiting.has(r.releaseId)) : []
  const ownedCount = loaded ? rows.filter((r) => loaded.owned.has(r.releaseId)).length : 0
  const toAdd = ownedChoice === 'copy' ? rows : rows.filter((r) => !loaded?.owned.has(r.releaseId))
  const toFill = loaded && ownedChoice === 'fill' ? loaded.fills : []
  const waitingCount = loaded ? loaded.parsed.rows.length - rows.length : 0

  async function queue() {
    if (!loaded) return
    setBusy(true)
    await enqueueCsv(toAdd, loaded.plan)
    if (toFill.length) await db.queue.bulkAdd(toFill.map((f, i) => ({ ...f, createdAt: Date.now() + toAdd.length + i })))
    navigate('/batch')
  }
  const matchedFields = loaded ? Object.keys(loaded.plan.fieldMap) : []
  const matchedFolders = loaded ? Object.entries(loaded.plan.folderMap) : []
  const rated = loaded ? loaded.parsed.rows.filter((r) => r.rating).length : 0

  return (
    <Screen title="Import collection" back="/settings">
      <Section>
        <p className="text-stone-600 dark:text-stone-400">
          Add records from a Discogs collection export, yours or someone else's. Crates, conditions, notes, and ratings are copied over if
          you have matching ones.
        </p>
        <p className="text-sm text-stone-500">
          To get one, open your{' '}
          <ExternalLink href={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`}>
            collection on Discogs
          </ExternalLink>{' '}
          and use Export.
        </p>
      </Section>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />

      {meta.loading && !meta.data ? (
        <Spinner />
      ) : (
        <Button variant={loaded ? 'secondary' : 'primary'} className="w-full" onClick={() => fileRef.current?.click()}>
          <FileUp size={20} aria-hidden />
          {loaded ? 'Choose a different file' : 'Choose file'}
        </Button>
      )}

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {loaded && (
        <div className="mt-6 space-y-4">
          <Card className="space-y-3">
            <p className="font-semibold">{loaded.name}</p>
            <ul className="space-y-1.5 text-sm">
              <li>{plural(loaded.parsed.rows.length, 'record')} in the file</li>
              {waitingCount > 0 && <li className="text-stone-500">{plural(waitingCount, 'record')} already in the batch</li>}
              {loaded.parsed.skipped.length > 0 && (
                <li className="text-stone-500">{plural(loaded.parsed.skipped.length, 'row')} skipped (no release ID)</li>
              )}
              <li>
                {matchedFields.length ? (
                  <>Copies {matchedFields.join(', ')}</>
                ) : (
                  <span className="text-stone-500">No field columns match your Discogs fields</span>
                )}
              </li>
              {loaded.plan.missingFields.length > 0 && (
                <li className="text-stone-500">
                  Skips {loaded.plan.missingFields.join(', ')}: you don't have{' '}
                  {loaded.plan.missingFields.length === 1 ? 'that field' : 'those fields'}.{' '}
                  <Link href="/setup" className="underline">
                    Set up fields
                  </Link>
                </li>
              )}
              {rated > 0 && <li>Copies {plural(rated, 'rating')}</li>}
              {matchedFolders.length > 0 && <li>Uses your crates: {matchedFolders.map(([, f]) => f.name).join(', ')}</li>}
              {loaded.plan.missingFolders.length > 0 && (
                <li className="text-stone-500">
                  No crate called {loaded.plan.missingFolders.join(', ')}; those go to the crate you pick in the batch.
                </li>
              )}
            </ul>
          </Card>

          {ownedCount > 0 && (
            <fieldset className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              <legend className="sr-only">Records you already have</legend>
              <p className="mb-2 text-sm font-medium">You already have {plural(ownedCount, 'record')}</p>
              {(
                [
                  ['skip', 'Skip them'],
                  ['fill', 'Fill in missing details'],
                  ['copy', 'Add another copy of each'],
                ] as const
              ).map(([value, label]) => {
                const nothing = value === 'fill' && !loaded.fills.length
                return (
                  <label
                    key={value}
                    className={`flex min-h-10 items-center gap-3 text-sm ${nothing ? 'text-stone-500' : 'cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name="owned"
                      value={value}
                      checked={ownedChoice === value}
                      disabled={nothing}
                      onChange={() => setOwnedChoice(value)}
                      className="size-4"
                    />
                    <span className="flex-1">{label}</span>
                    {value === 'fill' && (
                      <span className="text-stone-500 tabular-nums">
                        {nothing ? 'Nothing to fill in' : plural(loaded.fills.length, 'record')}
                      </span>
                    )}
                  </label>
                )
              })}
            </fieldset>
          )}

          <Button className="w-full" onClick={queue} disabled={busy || toAdd.length + toFill.length === 0}>
            {toAdd.length + toFill.length === 0
              ? 'Nothing new to add'
              : toFill.length
                ? `Send ${plural(toAdd.length + toFill.length, 'record')} to the batch`
                : `Add ${plural(toAdd.length, 'record')} to the batch`}
          </Button>
          <p className="text-center text-xs text-stone-500">
            You'll review them before anything changes on Discogs. Large files take a while.
          </p>
        </div>
      )}
    </Screen>
  )
}
