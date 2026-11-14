import { Award, Eye, EyeOff, KeyRound, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, Redirect } from 'wouter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Menu } from '../components/Menu'
import { List, Notice, Row, Screen, Section, Spinner } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { useCloud } from '../hooks/cloud'
import type { Badge, Member } from '../lib/cloud'
import { timeAgo } from '../lib/time'
import { BadgeCell, BadgesSheet } from './admin/Badges'

const joined = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

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

const WHO: Record<Member['profile'], string> = { none: 'None', private: 'Private', unlisted: 'Link only', public: 'Public' }

function ProfileState({ m }: { m: Member }) {
  if (m.profile === 'none' && !m.hidden) return <span className="text-sm text-stone-500">None</span>
  return (
    <span className="flex flex-wrap gap-1">
      {m.hidden ? (
        <Chip tone="warn">Taken down</Chip>
      ) : (
        <Link href={`/u/${encodeURIComponent(m.name)}`} className="rounded-md hover:opacity-80">
          <Chip>{WHO[m.profile]}</Chip>
        </Link>
      )}
    </span>
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
  const [badges, setBadges] = useState<Badge[]>([])
  // the badge list, and whether it opened to make a new one
  const [managing, setManaging] = useState<{ startNew: boolean } | null>(null)
  const [query, setQuery] = useState('')
  // the member whose details are open, on screens too narrow for the table
  const [open, setOpen] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ member: Member; what: 'clear' | 'delete' } | null>(null)

  const reload = useCallback(async () => {
    if (!api) return
    try {
      const [m, b] = await Promise.all([api.members(), api.badges()])
      setMembers(m.members)
      setBadges(b.badges)
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
  const choices = (m: Member) => [
    ...(m.profile === 'none' && !m.hidden
      ? []
      : [
          {
            label: m.hidden ? 'Put profile back' : 'Take profile down',
            icon: m.hidden ? <Eye size={18} /> : <EyeOff size={18} />,
            onSelect: () => attempt(() => api.hideProfile(m.id, !m.hidden)),
          },
        ]),
    { label: 'Clear ways in', icon: <KeyRound size={18} />, onSelect: () => setConfirming({ member: m, what: 'clear' }) },
    { label: 'Delete account', icon: <Trash2 size={18} />, danger: true, onSelect: () => setConfirming({ member: m, what: 'delete' }) },
  ]
  const actions = (m: Member) => <Menu label={`More for ${m.name}`} items={choices(m)} />
  const lastSeen = (m: Member) => {
    const t = m.lastSeenAt ? timeAgo(m.lastSeenAt) : 'Never'
    return t.charAt(0).toUpperCase() + t.slice(1)
  }

  const q = query.trim().toLowerCase()
  const shown = members?.filter((m) => !q || m.name.includes(q)) ?? []
  const opened = members?.find((m) => m.id === open)

  return (
    <Screen
      title="Members"
      back="/account"
      width={members ? 'wide' : 'full'}
      actions={
        members && (
          <button
            type="button"
            onClick={() => setManaging({ startNew: false })}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800 dark:active:bg-stone-800"
          >
            <Award size={20} aria-hidden />
            Badges
          </button>
        )
      }
    >
      {managing && (
        <BadgesSheet
          badges={badges}
          startNew={managing.startNew}
          onCreate={async (label) => {
            await api.createBadge(label)
            await reload()
          }}
          onRename={async (id, label) => {
            await api.renameBadge(id, label)
            await reload()
          }}
          onDelete={async (id) => {
            await api.deleteBadge(id)
            await reload()
          }}
          onClose={() => setManaging(null)}
        />
      )}
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
      {opened && (
        <Sheet title={opened.name} bodyClassName="p-4" width="md" onClose={() => setOpen(null)}>
          <div className="space-y-4 py-2">
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-stone-500">Joined</dt>
              <dd>{joined(opened.createdAt)}</dd>
              <dt className="text-stone-500">Last seen</dt>
              <dd>
                {lastSeen(opened)} · {plural(opened.devices, 'device')}
              </dd>
              <dt className="text-stone-500">Sign-in</dt>
              <dd>
                <SignIn m={opened} />
              </dd>
              <dt className="text-stone-500">Profile</dt>
              <dd>
                <ProfileState m={opened} />
              </dd>
              <dt className="text-stone-500">Badges</dt>
              <dd>
                <BadgeCell m={opened} badges={badges} onToggle={toggle(opened)} onNew={() => setManaging({ startNew: true })} />
              </dd>
            </dl>
            <List>
              {choices(opened).map((c) => (
                <Row key={c.label} icon={c.icon} label={c.label} danger={c.danger} onClick={c.onSelect} />
              ))}
            </List>
          </div>
        </Sheet>
      )}
      {!members ? (
        <Spinner />
      ) : (
        <Section title={q ? `${shown.length} of ${plural(members.length, 'member')}` : plural(members.length, 'member')}>
          {error && <Notice tone="error">{error}</Notice>}
          <label className="relative block">
            <span className="sr-only">Find a member</span>
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a member"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white pr-9 pl-10 text-base dark:border-stone-700 dark:bg-stone-900 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-stone-500"
              >
                <X size={18} />
              </button>
            )}
          </label>
          {q && !shown.length && <Notice>Nobody by that name.</Notice>}

          {/* wide screens: one row per member. No overflow clipping, so the menus can open past the edge. */}
          <div
            className={`hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800 ${shown.length ? 'xl:block' : ''}`}
          >
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wide whitespace-nowrap text-stone-500 uppercase">
                <tr className="border-b border-stone-200 dark:border-stone-800">
                  <th className="py-3 pr-3 pl-4 font-medium">Member</th>
                  <th className="px-3 py-3 font-medium">Joined</th>
                  <th className="px-3 py-3 font-medium">Last seen</th>
                  <th className="px-3 py-3 text-right font-medium">Devices</th>
                  <th className="px-3 py-3 font-medium">Sign-in</th>
                  <th className="px-3 py-3 font-medium">Profile</th>
                  <th className="px-3 py-3 font-medium">Badges</th>
                  <th className="py-3 pr-2 pl-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {shown.map((m) => (
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
                    <td className="px-3 py-2.5">
                      <ProfileState m={m} />
                    </td>
                    <td className="px-3 py-1.5">
                      <BadgeCell m={m} badges={badges} onToggle={toggle(m)} onNew={() => setManaging({ startNew: true })} />
                    </td>
                    <td className="w-0 py-1.5 pr-2 pl-1">{actions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* narrower screens: a row per member, opening their details */}
          {shown.length > 0 && (
            <div className="xl:hidden">
              <List>
                {shown.map((m) => (
                  <Row
                    key={m.id}
                    label={<Name m={m} />}
                    detail={`Last seen ${lastSeen(m).toLowerCase()} · ${plural(m.devices, 'device')}`}
                    value={m.hidden ? 'Taken down' : m.profile === 'none' ? undefined : WHO[m.profile]}
                    onClick={() => setOpen(m.id)}
                  />
                ))}
              </List>
            </div>
          )}
        </Section>
      )}
    </Screen>
  )
}
