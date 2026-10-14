import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { Button, Card, ExternalLink, Notice, Screen, Section, Spinner } from '../components/ui'
import { db } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { parseDiscogsExport, planImport, type ImportPlan, type ParsedImport } from '../lib/csv'
import { enqueueCsv } from '../lib/queue'

type Loaded = { name: string; parsed: ParsedImport; plan: ImportPlan; owned: Set<number> }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function Import() {
  const [, navigate] = useLocation()
  const { username } = useSignedIn()
  const meta = useCollectionMeta()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [skipOwned, setSkipOwned] = useState(true)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setError(null)
    setLoaded(null)
    try {
      const parsed = parseDiscogsExport(await file.text())
      if (!parsed.rows.length) throw new Error('No records with a release ID in that file.')
      const plan = planImport(parsed, meta.data?.fields ?? [], meta.data?.folders ?? [])
      const owned = new Set((await db.collection.toArray()).map((c) => c.releaseId))
      setLoaded({ name: file.name, parsed, plan, owned })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function queue() {
    if (!loaded) return
    setBusy(true)
    const rows = skipOwned ? loaded.parsed.rows.filter((r) => !loaded.owned.has(r.releaseId)) : loaded.parsed.rows
    await enqueueCsv(rows, loaded.plan)
    navigate('/batch')
  }

  const ownedCount = loaded ? loaded.parsed.rows.filter((r) => loaded.owned.has(r.releaseId)).length : 0
  const toAdd = loaded ? loaded.parsed.rows.length - (skipOwned ? ownedCount : 0) : 0
  const matchedFields = loaded ? Object.keys(loaded.plan.fieldMap) : []
  const matchedFolders = loaded ? Object.entries(loaded.plan.folderMap) : []
  const rated = loaded ? loaded.parsed.rows.filter((r) => r.rating).length : 0

  return (
    <Screen title="Import a CSV" back="/settings">
      <Section>
        <p className="text-stone-600 dark:text-stone-400">
          Add every record from a Discogs collection export to your collection, with folders, conditions, notes and ratings where they match yours. It
          works with your own export or one someone shared with you.
        </p>
        <p className="text-sm text-stone-500">
          To get one, open your <ExternalLink href={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`}>collection on Discogs</ExternalLink>{' '}
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
          {loaded ? 'Choose a different file' : 'Choose CSV file'}
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
                  Skips {loaded.plan.missingFields.join(', ')}: you don't have {loaded.plan.missingFields.length === 1 ? 'that field' : 'those fields'}.{' '}
                  <Link href="/setup" className="underline">
                    Set up fields
                  </Link>
                </li>
              )}
              {rated > 0 && <li>Copies {plural(rated, 'rating')}</li>}
              {matchedFolders.length > 0 && <li>Uses your folders: {matchedFolders.map(([, f]) => f.name).join(', ')}</li>}
              {loaded.plan.missingFolders.length > 0 && (
                <li className="text-stone-500">
                  No folder called {loaded.plan.missingFolders.join(', ')}; those go to the folder you pick in the batch.
                </li>
              )}
            </ul>
          </Card>

          {ownedCount > 0 && (
            <label className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              <input type="checkbox" checked={skipOwned} onChange={(e) => setSkipOwned(e.target.checked)} className="mt-1 size-4 accent-amber-500" />
              <span className="text-sm">
                <span className="font-medium">Skip the {plural(ownedCount, 'record')} you already have</span>
                <span className="block text-stone-500">Turn off to add another copy of each.</span>
              </span>
            </label>
          )}

          <Button className="w-full" onClick={queue} disabled={busy || toAdd === 0}>
            {toAdd === 0 ? 'Nothing new to add' : `Add ${plural(toAdd, 'record')} to the batch`}
          </Button>
          <p className="text-center text-xs text-stone-500">
            You'll review them before anything is added to Discogs. Each record takes a few requests, so large files take a while.
          </p>
        </div>
      )}
    </Screen>
  )
}
