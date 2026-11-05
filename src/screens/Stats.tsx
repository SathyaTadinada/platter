import { useLocation, useSearch } from 'wouter'
import { useState } from 'react'
import { History, Share, SlidersHorizontal } from 'lucide-react'
import { ChartsSheet } from '../components/ChartsSheet'
import { CollectionShare } from '../components/ShareSheet'
import { IconButton, Screen, Segmented } from '../components/ui'
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
          {view === 'value' && (
            <IconButton label="Choose charts" onClick={() => setChoosing(true)}>
              <SlidersHorizontal size={20} />
            </IconButton>
          )}
          <IconButton label="Your year" onClick={() => navigate('/stats/year')}>
            <History size={20} />
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
      {sharing && <CollectionShare onClose={() => setSharing(false)} />}
    </Screen>
  )
}
