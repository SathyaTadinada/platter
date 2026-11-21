import { useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import type { Release } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { useStickyColumn } from '../hooks/useStickyColumn'
import { Cover } from './Cover'
import { Identifiers } from './Identifiers'
import { ListenLinks } from './ListenLinks'
import { PhotosSheet } from './PhotosSheet'
import { DiscogsCredit } from './ReleaseCardView'
import { RecordRow, statCard } from './stats'
import { Notice, Section, Spinner } from './ui'

export type Tag = { label: string; href?: string }

const pill = 'rounded-full bg-stone-900/5 px-2.5 py-1 text-xs font-medium dark:bg-white/10'

// One record, however it was reached: your own copy, a release from Search, or someone's copy from
// their profile. The cover, photos, and tracklist sit on the left and stay in view on wide screens;
// the record itself, how to listen, and then whatever this visit is about (children) on the right,
// with the identifiers and credit last. Phones show the tracklist right after the record, so the
// order is the same either way.
export function RecordLayout({
  releaseId,
  release,
  loading,
  cover,
  own,
  title,
  artist,
  details,
  tags,
  extra,
  error,
  url,
  children,
  after,
}: {
  releaseId: number
  release?: Release
  loading?: boolean // the release is on its way
  cover: Pick<LibraryItem, 'cover' | 'thumb'>
  own?: LibraryItem // your copy, whose cover can be picked from the photos
  title: string
  artist: string
  details: (string | null | false | undefined)[]
  tags: Tag[]
  extra?: ReactNode // under the tags: your rating and Play, or that you own it
  error?: string | null
  url: string
  children: ReactNode
  after?: ReactNode // under the credit, for something final like removing it
}) {
  const stickyColumn = useStickyColumn()
  const [viewing, setViewing] = useState(false)
  // a genre can also be one of its styles ("Classical" is both), so each shows once
  const shownTags = tags.filter((t, i) => tags.findIndex((o) => o.label === t.label) === i)
  const photos = release?.images?.length ?? 0

  const tracklist = (
    <Section title="Tracklist">
      {release ? (
        <Tracklist release={release} />
      ) : loading ? (
        <Spinner label="Loading tracklist" />
      ) : (
        <p className="text-sm text-stone-500">Tracklist isn't available right now.</p>
      )}
    </Section>
  )

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-8 xl:grid-cols-[minmax(0,22rem)_1fr] xl:gap-10">
        <div ref={stickyColumn} className="space-y-6 lg:sticky lg:self-start">
          <div>
            <Cover item={cover} className="mx-auto aspect-square w-full max-w-sm rounded-2xl shadow-xl ring-1 ring-black/10" />
            {/* the way to every photo, and on your own copy to picking its cover */}
            {(photos > 1 || own?.originalCover) && (
              <button
                type="button"
                onClick={() => setViewing(true)}
                className="relative mx-auto mt-3 block rounded-full bg-stone-900/5 px-3 py-1 text-xs font-medium text-stone-600 after:absolute after:-inset-y-2.5 hover:bg-stone-900/10 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15"
              >
                {photos === 1 ? '1 photo' : `${photos} photos`}
              </button>
            )}
          </div>
          <div className="hidden lg:block">{tracklist}</div>
        </div>

        <div className="mt-6 min-w-0 lg:mt-0">
          <p className="text-2xl font-bold tracking-tight lg:text-3xl">{title}</p>
          <p className="text-lg text-stone-600 dark:text-stone-300">{artist}</p>
          <div className="mt-2 space-y-0.5 text-sm text-stone-500">
            {details.filter(Boolean).map((d) => (
              <p key={d as string}>{d}</p>
            ))}
          </div>
          {shownTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {shownTags.map((t) =>
                t.href ? (
                  <Link key={t.label} href={t.href} className={`${pill} hover:bg-stone-900/10 dark:hover:bg-white/15`}>
                    {t.label}
                  </Link>
                ) : (
                  <span key={t.label} className={pill}>
                    {t.label}
                  </span>
                ),
              )}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {extra}
            <ListenLinks releaseId={releaseId} artist={artist} title={title} identifiers={release?.identifiers} />
          </div>

          {error && (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          <div className="mt-6">
            <div className="lg:hidden">{tracklist}</div>
            {children}
            {/* shown even when empty, so a pressing with nothing listed doesn't look like a missing section */}
            {release && (
              <Section title="Identifiers">
                <Identifiers identifiers={release.identifiers ?? []} />
              </Section>
            )}
            <Section>
              <DiscogsCredit url={url} />
            </Section>
            {after}
          </div>
        </div>
      </div>
      {viewing && release && <PhotosSheet release={release} own={own} onClose={() => setViewing(false)} />}
    </>
  )
}

export function Tracklist({ release }: { release: Release }) {
  const tracks = release.tracklist ?? []
  if (!tracks.length) return <p className="text-sm text-stone-500">No tracklist on Discogs.</p>
  return (
    <ol className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      {tracks.map((t, i) =>
        t.type_ === 'heading' ? (
          <li key={i} className="bg-stone-50 px-4 py-2 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:bg-stone-950/50">
            {t.title}
          </li>
        ) : (
          <li key={i} className="flex gap-3 border-t border-stone-100 px-4 py-2 text-sm first:border-t-0 dark:border-stone-800">
            <span className="w-8 shrink-0 text-stone-500 tabular-nums">{t.position}</span>
            <span className="min-w-0 flex-1">{t.title}</span>
            {t.duration && <span className="shrink-0 text-stone-500 tabular-nums">{t.duration}</span>}
          </li>
        ),
      )}
    </ol>
  )
}

// Your copies of this release and of its other pressings, each opening its own page
export function YourCopies({
  title,
  items,
  releaseId,
  same,
}: {
  title: string
  items: LibraryItem[]
  releaseId: number
  same: string // what a copy of this very pressing is called here
}) {
  if (!items.length) return null
  return (
    <Section title={title}>
      <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
        {items.map((o) => (
          <li key={o.instanceId}>
            <RecordRow
              item={o}
              detail={
                o.releaseId === releaseId ? same : [o.label, o.catno, o.year || null].filter(Boolean).join(' · ') || 'Another pressing'
              }
            />
          </li>
        ))}
      </ul>
    </Section>
  )
}
