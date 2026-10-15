import { useLocation, useSearch } from 'wouter'
import { useState } from 'react'
import { Screen } from '../components/ui'
import { ListeningStats } from './Listening'
import { ValueStats } from './Value'

type View = 'value' | 'listening'
const VIEW_KEY = 'platter.statsView'

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'listening' ? 'listening' : 'value'
  } catch {
    return 'value'
  }
}

export function Stats() {
  const params = new URLSearchParams(useSearch())
  const [, navigate] = useLocation()
  const asked = params.get('view')
  const [editing, setEditing] = useState(false)
  const view: View = asked === 'listening' || asked === 'value' ? asked : savedView()

  function show(v: View) {
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // not important
    }
    setEditing(false)
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
        view === 'value' && (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={`rounded-full px-3 py-1.5 text-sm hover:bg-stone-200 dark:hover:bg-stone-800 ${editing ? 'font-semibold text-accent' : 'font-medium'}`}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )
      }
    >
      {view === 'value' ? <ValueStats editing={editing} /> : <ListeningStats />}
    </Screen>
  )
}
