import { Award, KeyRound, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Redirect } from 'wouter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Sheet } from '../components/Sheet'
import { List, Notice, Row, Screen, Section, Spinner, Switch } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import type { Member } from '../lib/cloud'
import { timeAgo } from '../lib/time'

const EARLY = 'early'
const since = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

// Members of Platter, for accounts with the admin flag. Anyone else is sent back to their account.
export function Admin() {
  const { api } = useCloud()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [refused, setRefused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Member | null>(null)
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

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
      await reload()
    } catch {
      setError('Something went wrong. Try again in a minute.')
    }
  }

  if (!api || refused) return <Redirect to="/account" replace />

  return (
    <Screen title="Members" back="/account" width={members ? 'narrow' : 'full'}>
      {confirming && (
        <ConfirmDialog
          title={confirming.what === 'clear' ? `Clear ${confirming.member.name}’s ways in?` : `Delete ${confirming.member.name}’s account?`}
          action={confirming.what === 'clear' ? 'Clear' : 'Delete'}
          onConfirm={() => {
            const { member, what } = confirming
            setConfirming(null)
            setOpen(null)
            attempt(() => (what === 'clear' ? api.clearWaysIn(member.id) : api.deleteMember(member.id)))
          }}
          onCancel={() => setConfirming(null)}
        >
          {confirming.what === 'clear'
            ? 'Removes their password and passkeys and signs out all their devices. Logging in with Discogs still gets them back in.'
            : 'Deletes everything they have on Platter’s server, right away.'}
        </ConfirmDialog>
      )}
      {open && (
        <Sheet title={open.name} bodyClassName="p-4" width="md" onClose={() => setOpen(null)}>
          <div className="py-2">
            <List>
              <Row
                icon={<Award size={20} />}
                label="Early supporter"
                trailing={
                  <Switch
                    label="Early supporter"
                    checked={open.badges.includes(EARLY)}
                    onChange={(on) => {
                      const m = open
                      setOpen({ ...m, badges: on ? [...m.badges, EARLY] : m.badges.filter((b) => b !== EARLY) })
                      attempt(() => api.setBadge(m.id, EARLY, on))
                    }}
                  />
                }
              />
            </List>
            <div className="mt-4">
              <List>
                <Row icon={<KeyRound size={20} />} label="Clear ways in" onClick={() => setConfirming({ member: open, what: 'clear' })} />
                <Row
                  icon={<Trash2 size={20} />}
                  label="Delete account"
                  danger
                  onClick={() => setConfirming({ member: open, what: 'delete' })}
                />
              </List>
            </div>
          </div>
        </Sheet>
      )}
      {!members ? (
        <Spinner />
      ) : (
        <Section title={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}>
          {error && <Notice tone="error">{error}</Notice>}
          <List>
            {members.map((m) => {
              const ways = [m.password && 'password', m.passkeys && `${m.passkeys} ${m.passkeys === 1 ? 'passkey' : 'passkeys'}`].filter(
                Boolean,
              )
              const tags = [m.admin && 'admin', m.badges.includes(EARLY) && 'early supporter'].filter(Boolean)
              return (
                <Row
                  key={m.id}
                  label={tags.length ? `${m.name} · ${tags.join(', ')}` : m.name}
                  detail={
                    `Since ${since(m.createdAt)} · ${m.devices} ${m.devices === 1 ? 'device' : 'devices'}` +
                    (m.lastSeenAt ? `, last seen ${timeAgo(m.lastSeenAt)}` : '') +
                    (ways.length ? ` · ${ways.join(', ')}` : '') +
                    (m.discogsId === null ? ' · not tied to Discogs yet' : '')
                  }
                  onClick={() => setOpen(m)}
                />
              )
            })}
          </List>
        </Section>
      )}
    </Screen>
  )
}
