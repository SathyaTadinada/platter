import { useLocation, useSearch } from 'wouter'
import { useState } from 'react'
import { CalendarDays, Share, SlidersHorizontal } from 'lucide-react'
import { ChartsSheet } from '../components/ChartsSheet'
import { ShareSheet } from '../components/ShareSheet'
import { IconButton, Screen } from '../components/ui'
import { ListeningStats } from './Listening'
import { ValueStats } from './Value'
import { readChoice, writePref } from '../lib/prefs'

type View = 'value' | 'listening'
const VIEW_KEY = 'platter.statsView'

const savedView = () => readChoice<View>(VIEW_KEY, ['value', 'listening'], 'value')

export function Stats() {
  const params = new URLSearchParams(useSearch())
  const [, navigate] = useLocation()
  const asked = params.get('view')
  const [choosing, setChoosing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const view: View = asked === 'listening' || asked === 'value' ? asked : savedView()

  function show(v: View) {
    writePref(VIEW_KEY, v)
    navigate(`/stats?view=${v}`, { replace: true })
  }

  const toggle = (
    <div
      role="tablist"
      aria-label="Stats"
      className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200 p-1 lg:max-w-[26rem] dark:bg-stone-800"
    >
      {(
        [
          ['value', 'Value'],
          ['listening', 'Listening'],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => show(v)}
          className={`min-h-9 rounded-lg text-sm font-medium ${view === v ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <Screen
      title="Stats"
      width="wide"
      toolbar={toggle}
      actions={
        <>
          {view === 'value' && (
            <IconButton label="Choose charts" onClick={() => setChoosing(true)}>
              <SlidersHorizontal size={20} />
            </IconButton>
          )}
          <IconButton label="Year in review" onClick={() => navigate('/stats/year')}>
            <CalendarDays size={20} />
          </IconButton>
          <IconButton label="Share" onClick={() => setSharing(true)}>
            <Share size={20} />
          </IconButton>
        </>
      }
    >
      {/* on touch screens, holding a chart to read it shouldn't start selecting text instead */}
      <div className="pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]">
        {view === 'value' ? <ValueStats /> : <ListeningStats />}
      </div>
      {choosing && <ChartsSheet onClose={() => setChoosing(false)} />}
      {sharing && <ShareSheet onClose={() => setSharing(false)} />}
    </Screen>
  )
}
