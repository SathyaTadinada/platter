import { useSearch } from 'wouter'
import { getRelease } from '../../api/discogs/endpoints'
import { DiscogsClient, RateLimiter } from '../../api/discogs/client'
import { visitorAuth } from '../../auth/auth'
import { RecordLayout } from '../../components/RecordLayout'
import { Notice, Screen, Spinner, useBack } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { cleanLabel, discogsUrl } from '../../lib/format'
import { joinArtists } from '../../lib/library'
import { TheirCopy, useTheirCopy } from './TheirCopy'

// Signed-out requests share a lower Discogs limit (25 a minute), kept under here
const visitorClient = new DiscogsClient(visitorAuth, undefined, new RateLimiter(22))

// A record from someone's profile, for a visitor without Platter: the record and their copy of it,
// read-only, with Back to the profile it came from
export function VisitorRelease({ id }: { id: string }) {
  const releaseId = Number(id)
  const their = useTheirCopy(releaseId)
  const from = new URLSearchParams(useSearch()).get('from')
  const back = useBack(from ? `/u/${encodeURIComponent(from)}` : '/')
  const release = useAsync(() => getRelease(visitorClient, releaseId), [releaseId])
  const r = release.data

  if (!r) {
    return (
      <Screen title="" back={back} width={release.loading ? 'full' : 'narrow'}>
        {release.loading ? <Spinner /> : <Notice tone="error">{release.error?.message ?? "Couldn't load this record."}</Notice>}
      </Screen>
    )
  }

  const label = r.labels?.[0]
  const where = [r.country, r.released?.slice(0, 4) || r.year || null].filter(Boolean).join(' · ')
  const format = r.formats
    ?.map((f) =>
      [f.qty && Number(f.qty) > 1 ? `${f.qty}× ${f.name}` : f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', '),
    )
    .join(' + ')
  const cover = { cover: r.images?.[0]?.uri, thumb: r.images?.[0]?.uri150 ?? r.thumb }

  return (
    <Screen title={r.title} back={back} width="wide" backdrop={cover.cover ?? cover.thumb}>
      <RecordLayout
        releaseId={releaseId}
        release={r}
        cover={cover}
        title={r.title}
        artist={joinArtists(r.artists)}
        details={[label && [cleanLabel(label.name), label.catno !== 'none' && label.catno].filter(Boolean).join(' · '), where, format]}
        tags={[...(r.genres ?? []), ...(r.styles ?? [])].map((g) => ({ label: g }))}
        url={discogsUrl(r.uri)}
      >
        {their && <TheirCopy owner={their.owner} copy={their.copy} />}
      </RecordLayout>
    </Screen>
  )
}
