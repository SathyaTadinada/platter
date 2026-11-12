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
          <p>Platter has no analytics, and no accounts of its own: your Discogs sign-in is the account.</p>
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
            If you turn on sync across devices, what you save in Platter (plays, value history, cover picks, your batch, settings, and your
            ListenBrainz token, encrypted) is kept on Platter's server under your Discogs username. Your collection, wantlist, and prices
            still come only from Discogs. To check a sign-in is yours, the server asks Discogs once and then keeps only a scrambled
            fingerprint of it, never the sign-in itself. Signing in on a new device checks whether your account already syncs.
          </p>
          <p>Photos of runouts and spines are read on your device and never uploaded.</p>
          <p>
            Signing out deletes what Platter saved here, except album years, record lengths, and preferences. A synced copy stays until you
            delete it in Settings.
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
