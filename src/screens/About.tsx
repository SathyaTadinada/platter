import { Card, ExternalLink, Screen, Section } from '../components/ui'
import { useSession } from '../hooks/session'

export function About() {
  const { session } = useSession()
  return (
    <Screen title="About Platter" back={session ? '/settings' : '/'}>
      <Section>
        <p className="text-stone-700 dark:text-stone-300">
          Platter helps you get records into your Discogs collection quickly: scan, pick the right pressing, done. It's free and open
          source.
        </p>
      </Section>

      <Section title="Privacy">
        <Card className="space-y-2 text-sm text-stone-700 dark:text-stone-300">
          <p>There are no accounts, no analytics and no tracking. Platter has no database of its own.</p>
          <p>
            Your Discogs sign-in and everything else Platter stores stay in this browser on this device. The app talks directly to
            Discogs, and to MusicBrainz and the Cover Art Archive when Discogs can't identify a barcode.
          </p>
          <p>
            If you log in with Discogs, a small Platter server signs each request so Discogs knows it came from Platter. It sees which
            Discogs address a request is for, but stores nothing and never sees what Discogs sends back. The request itself goes straight
            from your device to Discogs.
          </p>
          <p>Reading runouts and spines from photos happens on your device too. Photos aren't uploaded anywhere.</p>
          <p>Signing out deletes everything Platter has stored on this device.</p>
        </Card>
      </Section>

      <Section title="Source">
        <p className="text-sm">
          <ExternalLink href="https://github.com/SathyaTadinada/platter">github.com/SathyaTadinada/platter</ExternalLink>, MIT license.
        </p>
      </Section>

      <Section>
        <p className="text-xs text-stone-500">
          This application uses Discogs’ API but is not affiliated with, sponsored or endorsed by Discogs. ‘Discogs’ is a trademark of
          Zink Media, LLC.
        </p>
      </Section>
    </Screen>
  )
}
