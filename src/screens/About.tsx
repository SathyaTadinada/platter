import { Card, ExternalLink, Screen, Section } from '../components/ui'
import { useSession } from '../hooks/session'

export function About() {
  const { session } = useSession()
  return (
    <Screen title="About Platter" back={session ? '/settings' : '/'}>
      <Section>
        <p className="text-stone-700 dark:text-stone-300">
          Platter is a free, open-source app for adding records to your Discogs collection.
        </p>
      </Section>

      <Section title="Privacy">
        <Card className="space-y-2 text-sm text-stone-700 dark:text-stone-300">
          <p>No accounts, analytics, or tracking.</p>
          <p>
            Your sign-in and everything Platter saves are kept in this browser. Requests go straight from your device to Discogs, and to
            MusicBrainz when a barcode isn't on Discogs.
          </p>
          <p>
            When you log in with Discogs, a small Platter server adds a signature to each request. It doesn't store anything or see what
            Discogs sends back.
          </p>
          <p>Photos used to read runouts and spines are processed on your device.</p>
          <p>Signing out deletes everything Platter saved on this device.</p>
        </Card>
      </Section>

      <Section title="Source">
        <p className="text-sm">
          <ExternalLink href="https://github.com/SathyaTadinada/platter">github.com/SathyaTadinada/platter</ExternalLink>, MIT license.
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
