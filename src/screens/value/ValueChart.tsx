import { TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Segmented } from '../../components/ui'
import { change, chartPaths, chartRanges, inRange, type ChartRange, type ValueSnapshot } from '../../lib/value'
import { down, shortDate, up } from './shared'

export function Delta({ abs, pct: ratio, money, suffix }: { abs: number; pct?: number; money: (n: number) => string; suffix?: string }) {
  const rising = abs >= 0
  const Icon = rising ? TrendingUp : TrendingDown
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap tabular-nums ${
          rising ? 'bg-emerald-500/15 ' + up : 'bg-red-500/15 ' + down
        }`}
      >
        <Icon size={14} aria-hidden />
        {rising ? '+' : '−'}
        {money(Math.abs(abs))}
        {ratio !== undefined && <span className="font-medium">· {Math.abs(Math.round(ratio * 100))}%</span>}
      </span>
      {suffix && <span className="text-stone-500">{suffix}</span>}
    </span>
  )
}

// The chart with a choice of how far back it goes, from the ranges the history covers
export function OverTime({ series, money }: { series: ValueSnapshot[]; money: (n: number) => string }) {
  const ranges = chartRanges(series)
  const [picked, setPicked] = useState<ChartRange>('All')
  const range = ranges.includes(picked) ? picked : 'All'
  return (
    <>
      {ranges.length > 1 && (
        <Segmented
          label="Show"
          size="sm"
          className="mb-4"
          options={ranges.map((r) => ({ value: r, label: r }))}
          value={range}
          onChange={setPicked}
        />
      )}
      {/* a new range starts without a point picked */}
      <Chart key={range} series={inRange(series, range)} money={money} />
    </>
  )
}

function Chart({ series, money }: { series: ValueSnapshot[]; money: (n: number) => string }) {
  const W = 320
  const H = 140
  const paths = chartPaths(series, W, H)!
  const [hover, setHover] = useState<number | null>(null)
  const first = series[0]
  const shown = series[hover ?? series.length - 1]
  const rising = series.at(-1)!.median >= first.median
  const color = rising ? 'emerald' : 'red'
  const point = hover !== null ? paths.points[hover] : null
  // between the whole amounts shown, so a few cents don't read as +$0 or −$0
  const moved = change(Math.round(first.median), Math.round(shown.median))

  function scrub(e: React.PointerEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    let best = 0
    paths.points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(paths.points[best].x - x)) best = i
    })
    setHover(best)
  }

  return (
    <figure>
      <figcaption className="mb-3 flex items-center justify-between gap-x-3">
        <span className="whitespace-nowrap">
          <span className="text-xl font-bold tabular-nums">{money(shown.median)}</span>{' '}
          <span className="text-sm text-stone-500">{hover === null ? 'today' : shortDate(shown)}</span>
        </span>
        {/* since the chart's first day, which its axis names. The card above already shows the overall
            change, and there's nothing to say when it hasn't moved. */}
        {hover !== null && moved.abs !== 0 && <Delta {...moved} money={money} />}
      </figcaption>
      <div className="relative touch-pan-y" onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full overflow-visible"
          preserveAspectRatio="none"
          role="img"
          aria-label="Collection value over time"
        >
          <defs>
            <linearGradient id="value-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className={rising ? 'text-emerald-500' : 'text-red-500'} stopColor="currentColor" stopOpacity={0.25} />
              <stop offset="100%" className={rising ? 'text-emerald-500' : 'text-red-500'} stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={paths.area} fill="url(#value-fill)" />
          <path
            d={paths.line}
            className={`fill-none ${color === 'emerald' ? 'stroke-emerald-500' : 'stroke-red-500'}`}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        {point && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-stone-300 dark:bg-stone-700"
              style={{ left: `${(point.x / W) * 100}%` }}
            />
            <span
              className={`pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white dark:border-stone-900 ${
                rising ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              style={{ left: `${(point.x / W) * 100}%`, top: `${(point.y / H) * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{shortDate(first)}</span>
        <span>{shortDate(series.at(-1)!)}</span>
      </div>
    </figure>
  )
}
