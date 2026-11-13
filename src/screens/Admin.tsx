import { ChevronDown, KeyRound, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Redirect } from 'wouter'
import { BADGES } from '../../worker/badges'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Menu } from '../components/Menu'
import { Notice, Screen, Section, Spinner } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import type { Member } from '../lib/cloud'
import { timeAgo } from '../lib/time'

const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`
const badgeLabel = (id: string) => BADGES.find((b) => b.id === id)?.label ?? id

function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'warn' }) {
  const tones = {
    plain: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
    warn: 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

// How each member can get in: Discogs once their account is tied to it, then a password and passkeys
function SignIn({ m, wrap = true }: { m: Member; wrap?: boolean }) {
  return (
    <span className={`flex gap-1 ${wrap ? 'flex-wrap' : ''}`}>
      {m.discogsId === null ? <Chip tone="warn">Not tied to Discogs</Chip> : <Chip>Discogs</Chip>}
      {m.password && <Chip>Password</Chip>}
      {m.passkeys > 0 && <Chip>{plural(m.passkeys, 'passkey')}</Chip>}
    </span>
  )
}

const pickerClass =
  'flex min-h-8 items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-stone-100 active:bg-stone-100 dark:hover:bg-stone-800 dark:active:bg-stone-800'

// Each badge is ticked or not; picking one switches it
function Badges({ m, onToggle }: { m: Member; onToggle: (badge: string, on: boolean) => void }) {
  return (
    <Menu
      label={`Badges for ${m.name}`}
      align="left"
      buttonClassName={pickerClass}
      button={
        <>
          {m.badges.length ? (
            <span className="flex flex-wrap gap-1">
              {m.badges.map((b) => (
                <Chip key={b}>{badgeLabel(b)}</Chip>
              ))}
            </span>
          ) : (
            <span className="text-sm text-stone-500">None</span>
          )}
          <ChevronDown size={16} className="shrink-0 text-stone-400" aria-hidden />
        </>
      }
      items={BADGES.map((b) => ({
        label: b.label,
        checked: m.badges.includes(b.id),
        onSelect: () => onToggle(b.id, !m.badges.includes(b.id)),
      }))}
    />
  )
}

function Name({ m }: { m: Member }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{m.name}</span>
      {m.admin && <Chip>Admin</Chip>}
    </span>
  )
}

// Members of Platter, for accounts with the admin flag. Anyone else is sent back to their account.
export function Admin() {
  const { api } = useCloud()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [refused, setRefused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ member: Member; what: 'clear' | 'delete' } | null>(null)

  const reload = useCallback(async () => {
    if (!api) return
    try {
      setMembers((await api.members()).members)
    } catch {
      setRefused(true)
    }
  }, [api])
  useEffect(() => {
    reload()
  }, [reload])

  if (!api || refused) return <Redirect to="/account" replace />

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
      await reload()
    } catch {
      setError('Something went wrong. Try again in a minute.')
    }
  }
  const toggle = (m: Member) => (badge: string, on: boolean) => {
    // shown straight away, then confirmed by the reload
    setMembers(
      (list) =>
        list?.map((x) => (x.id === m.id ? { ...x, badges: on ? [...x.badges, badge] : x.badges.filter((b) => b !== badge) } : x)) ?? null,
    )
    attempt(() => api.setBadge(m.id, badge, on))
  }
  const actions = (m: Member) => (
    <Menu
      label={`More for ${m.name}`}
      items={[
        { label: 'Clear ways in', icon: <KeyRound size={18} />, onSelect: () => setConfirming({ member: m, what: 'clear' }) },
        { label: 'Delete account', icon: <Trash2 size={18} />, danger: true, onSelect: () => setConfirming({ member: m, what: 'delete' }) },
      ]}
    />
  )
  const lastSeen = (m: Member) => {
    const t = m.lastSeenAt ? timeAgo(m.lastSeenAt) : 'Never'
    return t.charAt(0).toUpperCase() + t.slice(1)
  }

  return (
    <Screen title="Members" back="/account" width={members ? 'wide' : 'full'}>
      {confirming && (
        <ConfirmDialog
          title={confirming.what === 'clear' ? `Clear ${confirming.member.name}’s ways in?` : `Delete ${confirming.member.name}’s account?`}
          action={confirming.what === 'clear' ? 'Clear' : 'Delete'}
          onConfirm={() => {
            const { member, what } = confirming
            setConfirming(null)
            attempt(() => (what === 'clear' ? api.clearWaysIn(member.id) : api.deleteMember(member.id)))
          }}
          onCancel={() => setConfirming(null)}
        >
          {confirming.what === 'clear'
            ? 'Removes their password and passkeys and signs out all their devices. Logging in with Discogs still gets them back in.'
            : 'Deletes everything they have on Platter’s server, right away.'}
        </ConfirmDialog>
      )}
      {!members ? (
        <Spinner />
      ) : (
        <Section title={plural(members.length, 'member')}>
          {error && <Notice tone="error">{error}</Notice>}

          {/* wide screens: one row per member. No overflow clipping, so the menus can open past the edge. */}
          <div className="hidden rounded-2xl bg-white ring-1 ring-stone-200 xl:block dark:bg-stone-900 dark:ring-stone-800">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wide whitespace-nowrap text-stone-500 uppercase">
                <tr className="border-b border-stone-200 dark:border-stone-800">
                  <th className="py-3 pr-3 pl-4 font-medium">Member</th>
                  <th className="px-3 py-3 font-medium">Joined</th>
                  <th className="px-3 py-3 font-medium">Last seen</th>
                  <th className="px-3 py-3 text-right font-medium">Devices</th>
                  <th className="px-3 py-3 font-medium">Sign-in</th>
                  <th className="px-3 py-3 font-medium">Badges</th>
                  <th className="py-3 pr-2 pl-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-56 py-2.5 pr-3 pl-4">
                      <Name m={m} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-stone-600 dark:text-stone-400">{joined(m.createdAt)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-stone-600 dark:text-stone-400">{lastSeen(m)}</td>
                    <td className="px-3 py-2.5 text-right text-stone-600 tabular-nums dark:text-stone-400">{m.devices}</td>
                    <td className="px-3 py-2.5">
                      <SignIn m={m} wrap={false} />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <Badges m={m} onToggle={toggle(m)} />
                    </td>
                    <td className="w-0 py-1.5 pr-2 pl-1">{actions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* narrower screens: a card per member with the same details */}
          <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
            {members.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
                <div className="-mt-1.5 -mr-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Name m={m} />
                  </div>
                  {actions(m)}
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
                  <dt className="text-stone-500">Joined</dt>
                  <dd>{joined(m.createdAt)}</dd>
                  <dt className="text-stone-500">Last seen</dt>
                  <dd>
                    {lastSeen(m)} · {plural(m.devices, 'device')}
                  </dd>
                  <dt className="text-stone-500">Sign-in</dt>
                  <dd>
                    <SignIn m={m} />
                  </dd>
                  <dt className="text-stone-500">Badges</dt>
                  <dd className="-ml-1.5">
                    <Badges m={m} onToggle={toggle(m)} />
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Screen>
  )
}
