import { Camera, Cloud, KeyRound, LogOut, Plug, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { ExternalLink, Screen, Section } from '../components/ui'
import { useSession } from '../hooks/session'

// In pairs of about the same length, since they sit side by side on wide screens
const PRIVACY: { icon: ReactNode; title: string; text: ReactNode }[] = [
  {
    icon: <ShieldCheck size={20} />,
    title: 'No tracking',
    text: 'No ads or analytics. You only need an account if you want to sync between devices.',
  },
  {
    icon: <Camera size={20} />,
    title: 'Photos',
    text: (
      <>
        Photos of barcodes, runouts, and spines are read on your device with{' '}
        <ExternalLink href="https://github.com/zxing-cpp/zxing-cpp">ZXing</ExternalLink> and{' '}
        <ExternalLink href="https://tesseract.projectnaptha.com">Tesseract</ExternalLink>, and are never uploaded.
      </>
    ),
  },
  {
    icon: <KeyRound size={20} />,
    title: 'Log in with Discogs',
    text: 'Your Discogs sign-in stays in this browser, and Platter talks to Discogs directly. If you log in with Discogs, Platter’s server signs each request without storing your key or seeing the response.',
  },
  {
    icon: <Cloud size={20} />,
    title: 'Sync',
    text: 'Enable sync to keep your plays, value history, covers, batch, and settings on your other devices. This feature is off by default.',
  },
  {
    icon: <Plug size={20} />,
    title: 'Other services',
    text: 'When Discogs doesn’t recognize a barcode, Platter can check MusicBrainz and the Cover Art Archive. Apple and ListenBrainz are used only when you choose to use them.',
  },
  {
    icon: <LogOut size={20} />,
    title: 'Signing out',
    text: 'Signing out clears this browser. With sync on, your data remains in Platter. Without sync, album years, record lengths, and preferences stay unless you delete everything.',
  },
]

export function About() {
  const { session } = useSession()
  return (
    <Screen title="About Platter" back={session ? '/settings' : '/'} width="wide">
      <Section>
        <p className="text-lg text-stone-700 dark:text-stone-300">
          Scan a record’s barcode to add it to your Discogs collection. Platter is free and open source.
        </p>
      </Section>

      <Section title="Privacy">
        <ul className="grid gap-3 sm:grid-cols-2">
          {PRIVACY.map((p) => (
            <li key={p.title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              <span className="mt-0.5 shrink-0 text-accent">{p.icon}</span>
              <div className="min-w-0">
                <h3 className="font-medium">{p.title}</h3>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
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
