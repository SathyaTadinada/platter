import { Card, ExternalLink, Screen, Section } from '../components/ui'
import { useSession } from '../hooks/session'

export function About() {
  const { session } = useSession()
  return (
    <Screen title="About Platter" back={session ? '/settings' : '/'}>
      <Section>
        <p className="text-stone-700 dark:text-stone-300">
          Platter adds records to your Discogs collection by scanning their barcodes. It's free and open source.
        </p>
      </Section>

      <Section title="Privacy">
        <Card className="space-y-2 text-sm text-stone-700 dark:text-stone-300">
          <p>Platter has no accounts or analytics of its own.</p>
          <p>Everything it saves, including your sign-in, stays in this browser, and it talks to Discogs directly from your device.</p>
          <p>
            If you log in with Discogs, each request is signed by a small Platter server first. That server doesn't keep anything and never
            sees Discogs' replies.
          </p>
          <p>
            Other services are only used when you need them. If Discogs doesn't know a barcode, Platter checks MusicBrainz and the Cover Art
            Archive. Tapping Apple Music or All services looks the album up with Apple. Plays go to ListenBrainz only if you've connected
            it.
          </p>
          <p>Photos of runouts and spines are read on your device and never uploaded.</p>
          <p>Signing out deletes everything Platter saved here.</p>
        </Card>
      </Section>

      <Section title="Source">
        <p className="text-sm">
          The code is on GitHub at{' '}
          <ExternalLink href="https://github.com/SathyaTadinada/platter">github.com/SathyaTadinada/platter</ExternalLink> under the MIT
          license.
        </p>
      </Section>

      <Section>
        <p className="text-xs text-stone-500">
          This application uses Discogs’ API but is not affiliated with, sponsored or endorsed by Discogs. ‘Discogs’ is a trademark of Zink
          Media, LLC.
        </p>
      </Section>
    </Screen>
  )
}
