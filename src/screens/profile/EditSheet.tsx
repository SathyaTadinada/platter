import { useState } from 'react'
import { inline, Row as FieldRow } from '../../components/CopyDetails'
import { Sheet } from '../../components/Sheet'
import { Button, List, Notice, Row } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { CloudError, type Setup, type SetupSlot } from '../../lib/cloud'
import { BIO_MAX, hasLink, SETUP_LABELS, SETUP_MAX } from '../../lib/profile'

// What your profile says about you: a short bio and your setup, written here and saved together.
// Who sees the profile and what else is on it stay on the account page, a row away.
export function EditSheet({ onClose }: { onClose: () => void }) {
  const cloud = useCloud()
  const [bio, setBio] = useState(cloud.bio)
  const [setup, setSetup] = useState<Setup>(cloud.setup)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const length = [...bio].length

  async function save() {
    setError(null)
    if ([bio, ...Object.values(setup)].some((t) => t && hasLink(t))) return setError('Links can’t go on a profile.')
    setBusy(true)
    try {
      await cloud.setAbout(bio, setup)
      onClose()
    } catch (e) {
      setError(e instanceof CloudError && e.status === 400 ? 'That didn’t save. Check it for links and try again.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Edit profile"
      width="md"
      bodyClassName="p-4"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between px-1">
            <label htmlFor="bio" className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
              Bio
            </label>
            {/* only once it's getting close, so it doesn't nag */}
            {length > BIO_MAX - 30 && (
              <span className="text-xs text-stone-500 tabular-nums">
                {length}/{BIO_MAX}
              </span>
            )}
          </div>
          <textarea
            id="bio"
            value={bio}
            maxLength={BIO_MAX}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            className="w-full resize-none rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200 focus:ring-2 focus:ring-accent/60 focus:outline-none dark:bg-stone-900 dark:ring-stone-800"
          />
        </div>

        <div>
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Setup</h3>
          <List>
            {SETUP_LABELS.map(([slot, label]) => (
              <FieldRow key={slot} label={label}>
                <input
                  aria-label={label}
                  value={setup[slot as SetupSlot] ?? ''}
                  maxLength={SETUP_MAX}
                  placeholder="Add"
                  autoComplete="off"
                  onChange={(e) => setSetup((s) => ({ ...s, [slot]: e.target.value }))}
                  className={inline}
                />
              </FieldRow>
            ))}
          </List>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <List>
          <Row label="Visibility and what’s on your profile" href="/account" />
        </List>
      </div>
    </Sheet>
  )
}
