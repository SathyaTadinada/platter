import { useLocation, useSearch } from 'wouter'
import { useState } from 'react'
import { CalendarRange, Share, SlidersHorizontal } from 'lucide-react'
import { ChartsSheet } from '../components/ChartsSheet'
import { CollectionShare } from '../components/ShareSheet'
import { IconButton, Screen, Segmented } from '../components/ui'
import { ListeningStats } from './Listening'
import { ValueStats } from './Value'
import { readChoice, writePref } from '../lib/prefs'
import { listeningLayout, valueLayout } from '../lib/statsLayout'

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
    <Segmented
      label="Stats"
      className="lg:max-w-[26rem]"
      value={view}
      onChange={show}
      options={[
        { value: 'value', label: 'Value' },
        { value: 'listening', label: 'Listening' },
      ]}
    />
  )

  return (
    <Screen
      title="Stats"
      width="wide"
      toolbar={toggle}
      actions={
        <>
          {/* named from sm up, since no icon says "your year so far" on its own */}
          <IconButton label="Your year" className="sm:hidden" onClick={() => navigate('/stats/year')}>
            <CalendarRange size={20} />
          </IconButton>
          <button
            type="button"
            onClick={() => navigate('/stats/year')}
            className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200 active:bg-stone-200 sm:flex dark:text-stone-300 dark:hover:bg-stone-800 dark:active:bg-stone-800"
          >
            <CalendarRange size={20} aria-hidden />
            Your year
          </button>
          <IconButton label="Choose charts" onClick={() => setChoosing(true)}>
            <SlidersHorizontal size={20} />
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
      {choosing &&
        (view === 'value' ? (
          <ChartsSheet store={valueLayout} onClose={() => setChoosing(false)} />
        ) : (
          <ChartsSheet store={listeningLayout} onClose={() => setChoosing(false)} />
        ))}
      {sharing && <CollectionShare onClose={() => setSharing(false)} />}
    </Screen>
  )
}
