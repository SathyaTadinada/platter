import { Camera, Cloud, Code2, ExternalLink as ExternalIcon, KeyRound, LogOut, Plug, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Screen, Section } from '../components/ui'
import { useSession } from '../hooks/session'

const PRIVACY: { icon: ReactNode; title: string; text: ReactNode }[] = [
  {
    icon: <ShieldCheck size={20} />,
    title: 'No tracking',
    text: 'No analytics and no ads. There’s no account to make unless you turn on sync.',
  },
  {
    icon: <KeyRound size={20} />,
    title: 'Your Discogs sign-in',
    text: 'It stays in this browser, and Platter talks to Discogs straight from your device. With Log in with Discogs, a small Platter server signs each request first. It doesn’t keep your key and never sees Discogs’ replies.',
  },
  {
    icon: <Plug size={20} />,
    title: 'Other services',
    text: 'Only when you need them: MusicBrainz and the Cover Art Archive for barcodes Discogs doesn’t know, Apple when you tap Apple Music or All services, and ListenBrainz if you connect it.',
  },
  {
    icon: <Camera size={20} />,
    title: 'Photos',
    text: 'Photos of runouts and spines are read on your device and never uploaded.',
  },
  {
    icon: <Cloud size={20} />,
    title: 'Sync, if you turn it on',
    text: 'Your plays, value history, cover picks, batch, and settings are stored on Platter’s server so your other devices get them, and you choose which. Your sync password never leaves your device, and a synced ListenBrainz token is encrypted. Your collection, wantlist, and prices always come from Discogs.',
  },
  {
    icon: <LogOut size={20} />,
    title: 'Signing out',
    text: 'Clears what Platter saved in this browser, except album years, record lengths, and preferences. Synced data stays until you delete it in Settings.',
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
        <a
          href="https://github.com/SathyaTadinada/platter"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200 hover:bg-stone-50 sm:max-w-md dark:bg-stone-900 dark:ring-stone-800 dark:hover:bg-stone-800/50"
        >
          <Code2 size={20} className="shrink-0 text-stone-500" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block">github.com/SathyaTadinada/platter</span>
            <span className="block text-sm text-stone-500">MIT license</span>
          </span>
          <ExternalIcon size={18} className="shrink-0 text-stone-400" aria-hidden />
        </a>
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
