import type { LibraryItem } from '../db/db'
import { yearOf } from './library'
import type { Listening } from './plays'

// The pictures behind "Share" on the Stats tab and on Your year: a big number and a few facts,
// drawn on a canvas so they can be saved or sent anywhere.

export type ShareCard = {
  heading: string // e.g. "sam's collection"
  count: number
  unit: string // after the big number, e.g. "records"
  rows: [string, string, string?][] // label, main line, optional smaller line
  note?: string // small print at the bottom
}

export type CardFacts = {
  user: string
  records: number
  value?: string // already formatted, e.g. "$1,550"
  mostPlayed?: { title: string; artist: string; plays: number }
  genre?: { name: string; count: number }
  oldest?: { title: string; artist: string; year: number }
  addedThisYear: number
}

export function cardFacts(user: string, items: LibraryItem[], rows: Listening[], value?: string, now = new Date()): CardFacts {
  const top = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count)[0]

  const genres = new Map<string, number>()
  for (const i of items) for (const g of new Set(i.genres)) genres.set(g, (genres.get(g) ?? 0) + 1)
  const [genre] = [...genres].sort((a, b) => b[1] - a[1])

  // the oldest music, not the oldest pressing
  const oldest = items.filter((i) => yearOf(i) > 0).sort((a, b) => yearOf(a) - yearOf(b))[0]
  const year = String(now.getFullYear())

  return {
    user,
    records: items.length,
    value,
    mostPlayed: top && { title: top.item.title, artist: top.item.artist, plays: top.count },
    genre: genre && { name: genre[0], count: genre[1] },
    oldest: oldest && { title: oldest.title, artist: oldest.artist, year: yearOf(oldest) },
    addedThisYear: items.filter((i) => i.dateAdded.startsWith(year)).length,
  }
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

// label, main line, and an optional smaller line under it
export function cardRows(f: CardFacts): [string, string, string?][] {
  const rows: [string, string, string?][] = []
  if (f.value) rows.push(['Worth about', f.value])
  if (f.mostPlayed) rows.push(['Most played', f.mostPlayed.title, `${f.mostPlayed.artist} · ${plural(f.mostPlayed.plays, 'play')}`])
  if (f.genre) rows.push(['Mostly', f.genre.name, `${plural(f.genre.count, 'record')}`])
  if (f.oldest) rows.push(['Oldest', f.oldest.title, `${f.oldest.artist}, ${f.oldest.year}`])
  if (f.addedThisYear) rows.push(['Added this year', plural(f.addedThisYear, 'record')])
  return rows.slice(0, 4)
}

export const collectionCard = (f: CardFacts): ShareCard => ({
  heading: `${f.user}'s collection`,
  count: f.records,
  unit: f.records === 1 ? 'record' : 'records',
  rows: cardRows(f),
  note: f.value ? 'Prices from Discogs' : undefined,
})

export const CARD = { width: 1080, height: 1350 }

export type CardTheme = 'light' | 'dark'

const THEMES = {
  light: { paper: '#f5f1ea', ink: '#1c1917', muted: '#78716c', rule: '#e2ddd3', disc: '#1c1917', groove: '#2e2a27', rim: '#1c1917' },
  dark: { paper: '#1c1917', ink: '#fafaf9', muted: '#a8a29e', rule: '#2e2a27', disc: '#0c0a09', groove: '#292524', rim: '#44403c' },
}
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

type Measure = (text: string) => number

function ellipsize(text: string, max: number, measure: Measure) {
  if (measure(text) <= max) return text
  let t = text
  while (t.length > 1 && measure(`${t}…`) > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => ellipsize(text, max, (t) => ctx.measureText(t).width)

// Breaks text between words into at most `most` lines, each no wider than width(line number).
// Only the last line gets cut short, and only if there's still more.
export function wrapText(text: string, width: (line: number) => number, measure: Measure, most = 2): string[] {
  const lines: string[] = []
  let rest = text.split(' ')
  while (rest.length && lines.length < most) {
    let n = 1
    if (lines.length === most - 1) n = rest.length
    else while (n < rest.length && measure(rest.slice(0, n + 1).join(' ')) <= width(lines.length)) n++
    lines.push(rest.slice(0, n).join(' '))
    rest = rest.slice(n)
  }
  const last = lines.length - 1
  lines[last] = ellipsize(lines[last], width(last), measure)
  return lines
}

export function drawCard(canvas: HTMLCanvasElement, card: ShareCard, accent: string, site: string, theme: CardTheme = 'light') {
  const { paper, ink, muted, rule, disc, groove, rim } = THEMES[theme]
  const { width: W, height: H } = CARD
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const pad = 96
  const max = W - pad * 2

  ctx.fillStyle = paper
  ctx.fillRect(0, 0, W, H)

  // a record coming in from the bottom right corner
  const cx = W - 70
  const cy = H - 40
  const R = 330
  ctx.fillStyle = disc
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fill()
  // a faint rim so the record doesn't vanish into a dark background
  ctx.strokeStyle = rim
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, R - 1.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = groove
  ctx.lineWidth = 4
  for (const r of [300, 265, 230, 195, 160]) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(cx, cy, 110, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = paper
  ctx.beginPath()
  ctx.arc(cx, cy, 14, 0, Math.PI * 2)
  ctx.fill()

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = muted
  ctx.font = `500 38px ${FONT}`
  ctx.fillText(fit(ctx, card.heading, max), pad, pad + 40)

  ctx.fillStyle = ink
  ctx.font = `700 150px ${FONT}`
  ctx.fillText(card.count.toLocaleString(), pad, pad + 210)
  const numberWidth = ctx.measureText(card.count.toLocaleString()).width
  ctx.font = `600 52px ${FONT}`
  ctx.fillStyle = muted
  ctx.fillText(card.unit, pad + numberWidth + 24, pad + 210)

  // lines low enough to reach the record stop short of it
  const room = (y: number) => (y > cy - R - 20 ? cx - R - 40 - pad : max)

  // A long title wraps onto a second line, a little smaller, rather than losing its end. To make
  // room, rows sit closer together, and if that's not enough the last one is left off.
  const big = `600 48px ${FONT}`
  const wrapped = `600 44px ${FONT}`
  const bottom = card.note ? H - pad - 60 : H - pad - 40
  const layout = (rows: ShareCard['rows'], gap: number) => {
    let y = pad + 300
    const placed = rows.map(([label, main, sub]) => {
      const top = y
      ctx.font = big
      const one = ctx.measureText(main).width <= room(top + 120)
      ctx.font = wrapped
      const lines = one
        ? [main]
        : wrapText(
            main,
            (i) => room(top + 116 + i * 52),
            (t) => ctx.measureText(t).width,
          )
      y = top + 120 + (lines.length - 1) * 52
      const mainY = top + 120
      const subY = sub ? (y += 46) : undefined
      const end = y
      y += gap
      return { label, sub, lines, one, top, mainY, subY, end }
    })
    return { placed, end: placed.at(-1)?.end ?? 0 }
  }
  let rows = card.rows.slice(0, 4)
  let plan = layout(rows, 44)
  while (plan.end > bottom && rows.length > 1) {
    plan = layout(rows, 28)
    if (plan.end <= bottom) break
    rows = rows.slice(0, -1)
    plan = layout(rows, 44)
  }

  for (const r of plan.placed) {
    ctx.fillStyle = rule
    ctx.fillRect(pad, r.top, max, 2)
    ctx.fillStyle = muted
    ctx.font = `500 32px ${FONT}`
    ctx.fillText(r.label, pad, r.top + 62)
    ctx.fillStyle = ink
    ctx.font = r.one ? big : wrapped
    r.lines.forEach((line, i) => ctx.fillText(r.one ? fit(ctx, line, room(r.mainY)) : line, pad, r.mainY + i * 52))
    if (r.sub && r.subY) {
      ctx.fillStyle = muted
      ctx.font = `400 34px ${FONT}`
      ctx.fillText(fit(ctx, r.sub, room(r.subY)), pad, r.subY)
    }
  }

  ctx.fillStyle = muted
  ctx.font = `500 30px ${FONT}`
  ctx.fillText(site, pad, H - pad + 20)
  if (card.note) {
    ctx.font = `400 26px ${FONT}`
    ctx.fillText(card.note, pad, H - pad - 26)
  }
}
