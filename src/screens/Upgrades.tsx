import { useLiveQuery } from 'dexie-react-hooks'
import { Heart } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { addWant, removeWant } from '../api/discogs/endpoints'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { toast } from '../components/Toaster'
import { Card, Notice, Screen, Spinner } from '../components/ui'
import { db, type LibraryItem, type WantItem } from '../db/db'
import { useCurrency, useFreshPrices } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { shortGrade } from '../lib/format'
import { readPref, writePref } from '../lib/prefs'
import { defaultThreshold, needsUpgrade, ungraded, UPGRADE_TARGET } from '../lib/upgrades'
import { formatMoney, type PriceEntry } from '../lib/value'

const PREF = 'platter.upgradeGrade'

export function Upgrades() {
  const { username } = useSignedIn()
  const matches = useFieldMatches()
  const meta = useCollectionMeta().data
  const currency = useCurrency()
  const prices = useFreshPrices(currency)
  const items = useLiveQuery(() => db.collection.toArray(), [])
  const wants = useLiveQuery(async () => new Set((await db.wants.toArray()).map((w) => w.releaseId)), [])

  const media = matches ? fieldFor(matches, 'mediaCondition') : undefined
  const sleeve = matches ? fieldFor(matches, 'sleeveCondition') : undefined
  const grades = media?.type === 'dropdown' ? media.options : []
  const [picked, setPicked] = useState(() => readPref(PREF))
  const threshold = picked && grades.includes(picked) ? picked : defaultThreshold(grades)

  let body
  if (!matches || !meta || !items || !wants) {
    body = <Spinner />
  } else if (!media || !grades.length) {
    body = (
      <Notice tone="info">
        This needs a Media Condition field.{' '}
        <Link href="/setup" className="font-medium underline underline-offset-2">
          Set it up
        </Link>
      </Notice>
    )
  } else {
    const list = needsUpgrade(items, media.id, grades, threshold)
    const unknown = ungraded(items, media.id, grades)
    body = (
      <>
        <label className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
          <span className="text-sm text-stone-500">Media at or below</span>
          <select
            aria-label="Media at or below"
            value={threshold}
            onChange={(e) => {
              setPicked(e.target.value)
              writePref(PREF, e.target.value)
            }}
            className="min-h-10 cursor-pointer appearance-none rounded-lg bg-transparent px-2 text-right font-medium hover:bg-stone-100 focus:ring-2 focus:ring-accent/60 focus:outline-none dark:hover:bg-stone-800 [text-align-last:right]"
          >
            {grades.slice(1).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {list.length ? (
          <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
            {list.map((item) => (
              <UpgradeRow
                key={item.instanceId}
                item={item}
                grade={item.fields[media.id]}
                sleeve={sleeve ? item.fields[sleeve.id] : undefined}
                price={prices?.get(item.releaseId)}
                currency={currency}
                wanted={wants.has(item.releaseId)}
                username={username}
              />
            ))}
          </ul>
        ) : (
          <Card>
            <p className="font-semibold">Nothing that worn</p>
            <p className="mt-1 text-sm text-stone-500">No records are graded {shortGrade(threshold)} or below.</p>
          </Card>
        )}
        <p className="mt-3 px-1 text-sm text-stone-500">
          {list.length > 0 && 'The heart adds that pressing to your wantlist, so Discogs lets you know when a copy is listed. '}
          {unknown > 0 && `${unknown} record${unknown === 1 ? " doesn't" : "s don't"} have a media grade yet.`}
        </p>
        {list.length > 0 && (
          <p className="mt-3 px-1">
            <DiscogsCredit url={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`} />
          </p>
        )}
      </>
    )
  }

  return (
    <Screen title="Worth upgrading" back="/">
      {body}
    </Screen>
  )
}

function UpgradeRow({
  item,
  grade,
  sleeve,
  price,
  currency,
  wanted,
  username,
}: {
  item: LibraryItem
  grade?: string
  sleeve?: string
  price?: PriceEntry
  currency?: string
  wanted: boolean
  username: string
}) {
  const { client } = useSignedIn()
  const [busy, setBusy] = useState(false)
  const target = price?.suggested?.[UPGRADE_TARGET]
  const money = (n: number) => (currency ? formatMoney(n, currency) : '')
  const grades = [grade && `Media ${shortGrade(grade)}`, sleeve && `sleeve ${shortGrade(sleeve)}`].filter(Boolean).join(', ')

  async function toggle() {
    setBusy(true)
    const want: WantItem = {
      releaseId: item.releaseId,
      masterId: item.masterId,
      title: item.title,
      artist: item.artist,
      thumb: item.thumb,
      year: item.year,
      format: item.format,
      dateAdded: new Date().toISOString(),
    }
    try {
      if (wanted) {
        await removeWant(client, username, item.releaseId)
        await db.wants.delete(item.releaseId)
        toast(`Took ${item.title} off your wantlist`)
      } else {
        await addWant(client, username, item.releaseId)
        await db.wants.put(want)
        toast(`Added ${item.title} to your wantlist`, { tone: 'success' })
      }
    } catch (e) {
      toast((e as Error).message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center">
      <div className="min-w-0 flex-1">
        <RecordRow item={item} detail={`${grades} · ${item.artist}`}>
          {target !== undefined ? (
            <>
              <span className="block text-xs text-stone-500">VG+ about</span>
              <span className="block text-sm font-semibold tabular-nums">{money(target)}</span>
            </>
          ) : price?.lowest != null ? (
            <>
              <span className="block text-xs text-stone-500">from</span>
              <span className="block text-sm font-semibold tabular-nums">{money(price.lowest)}</span>
            </>
          ) : price ? (
            <span className="block text-xs text-stone-500">None for sale</span>
          ) : null}
        </RecordRow>
      </div>
      <button
        type="button"
        aria-label={wanted ? `Take ${item.title} off your wantlist` : `Add ${item.title} to your wantlist`}
        aria-pressed={wanted}
        disabled={busy}
        onClick={toggle}
        className={`mr-2 shrink-0 rounded-full p-2.5 hover:bg-stone-100 disabled:opacity-50 dark:hover:bg-stone-800 ${wanted ? 'text-accent' : 'text-stone-400'}`}
      >
        <Heart size={20} fill={wanted ? 'currentColor' : 'none'} />
      </button>
    </li>
  )
}
