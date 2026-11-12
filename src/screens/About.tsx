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
          <p>Platter doesn't track you, and there's no account to make unless you turn on sync.</p>
          <p>Your sign-in stays in this browser, and Platter talks to Discogs directly from your device.</p>
          <p>
            If you log in with Discogs, each request is signed by a small Platter server first. It gets your sign-in key and the address
            being requested, keeps neither, and never sees Discogs' replies.
          </p>
          <p>
            Other services are only used when you need them. If Discogs doesn't know a barcode, Platter checks MusicBrainz and the Cover Art
            Archive. Tapping Apple Music or All services looks the album up with Apple. Plays go to ListenBrainz only if you've connected
            it.
          </p>
          <p>
            With sync turned on, what you save in Platter (plays, value history, cover picks, your batch, and settings) is kept on Platter's
            server so your other devices get it too. You choose what syncs. Your sync password never leaves your device; the server keeps
            only a scrambled fingerprint of it. A synced ListenBrainz token is stored encrypted. Your collection, wantlist, and prices
            always come straight from Discogs.
          </p>
          <p>Photos of runouts and spines are read on your device and never uploaded.</p>
          <p>
            Signing out deletes what Platter saved here, except album years, record lengths, and preferences. Anything synced stays on the
            server until you delete it in Settings.
          </p>
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
