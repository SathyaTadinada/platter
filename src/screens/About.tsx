import { Camera, Cloud, KeyRound, LogOut, Plug, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { ExternalLink, Screen, Section } from '../components/ui'
import { useSession } from '../hooks/session'

// In pairs of about the same length, since they sit side by side on wide screens
const PRIVACY: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <ShieldCheck size={20} />, title: 'No tracking', text: 'No analytics and no ads. You only need an account if you want sync.' },
  { icon: <Camera size={20} />, title: 'Photos', text: 'Photos of runouts and spines are read on your device. They never get uploaded.' },
  {
    icon: <KeyRound size={20} />,
    title: 'Your Discogs sign-in',
    text: 'It stays in this browser, and Platter talks to Discogs directly. If you log in with Discogs, Platter’s server signs each request but never keeps your key or sees the reply.',
  },
  {
    icon: <Cloud size={20} />,
    title: 'Sync',
    text: 'If you turn it on, your plays, value history, covers, batch, and settings are stored on Platter’s server for your other devices. Your password never leaves your device.',
  },
  {
    icon: <Plug size={20} />,
    title: 'Other services',
    text: 'MusicBrainz and the Cover Art Archive fill in barcodes Discogs doesn’t know. Apple and ListenBrainz are only used when you use them.',
  },
  {
    icon: <LogOut size={20} />,
    title: 'Signing out',
    text: 'Clears this browser but keeps album years, record lengths, and preferences. Anything synced stays until you delete it.',
  },
]

export function About() {
  const { session } = useSession()
  return (
    <Screen title="About Platter" back={session ? '/settings' : '/'} width="wide">
      <Section>
        <p className="max-w-2xl text-lg text-stone-700 dark:text-stone-300">
          Platter adds records to your Discogs collection by scanning their barcodes. It's free and open source.
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
