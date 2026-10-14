// Builds tests/fixtures/collection-demo.json: a made-up collection of well-known
// public releases, in the shape of a /collection/folders/0/releases page.
// Usage: node --env-file=.env scripts/record-demo-library.mjs
import { writeFile } from 'node:fs/promises'

const token = process.env.DISCOGS_TOKEN
if (!token) throw new Error('DISCOGS_TOKEN missing')

const albums = [
  ['Pink Floyd', 'The Dark Side Of The Moon'], ['Fleetwood Mac', 'Rumours'], ['Michael Jackson', 'Thriller'],
  ['The Beatles', 'Abbey Road'], ['Miles Davis', 'Kind Of Blue'], ['Nirvana', 'Nevermind'],
  ['Radiohead', 'OK Computer'], ['Daft Punk', 'Discovery'], ['Kendrick Lamar', 'To Pimp A Butterfly'],
  ['Amy Winehouse', 'Back To Black'], ['Led Zeppelin', 'Led Zeppelin IV'], ['David Bowie', 'The Rise And Fall Of Ziggy Stardust'],
  ['Marvin Gaye', "What's Going On"], ['Stevie Wonder', 'Songs In The Key Of Life'], ['Joni Mitchell', 'Blue'],
  ['Carole King', 'Tapestry'], ['John Coltrane', 'A Love Supreme'], ['Bob Marley & The Wailers', 'Legend'],
  ['Prince', 'Purple Rain'], ['Taylor Swift', 'Folklore'], ['Tame Impala', 'Currents'],
  ['Adele', '21'], ['Herbie Hancock', 'Head Hunters'], ['Dave Brubeck Quartet', 'Time Out'],
  ['Norah Jones', 'Come Away With Me'], ['The Strokes', 'Is This It'], ['Bon Iver', 'For Emma, Forever Ago'],
  ['Kraftwerk', 'Autobahn'], ['Talking Heads', 'Remain In Light'], ['The Velvet Underground', 'The Velvet Underground & Nico'],
  ['Simon & Garfunkel', 'Bridge Over Troubled Water'], ['Queen', 'A Night At The Opera'], ['The Beach Boys', 'Pet Sounds'],
  ['Lauryn Hill', 'The Miseducation Of Lauryn Hill'], ['Portishead', 'Dummy'], ['Massive Attack', 'Mezzanine'],
  ['Björk', 'Homogenic'], ['Vampire Weekend', 'Vampire Weekend'], ['Bill Evans Trio', 'Waltz For Debby'],
  ['Beyoncé', 'Lemonade'],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function search(artist, title) {
  const q = new URLSearchParams({ artist, release_title: title, type: 'release', format: 'Vinyl', per_page: '5' })
  const res = await fetch(`https://api.discogs.com/database/search?${q}`, {
    headers: { 'User-Agent': 'Platter/0.1 +https://platter.tadinada.com', Authorization: `Discogs token=${token}` },
  })
  await sleep(1100)
  if (!res.ok) throw new Error(`${res.status} ${artist}`)
  return (await res.json()).results.find((r) => r.cover_image && !r.cover_image.endsWith('spacer.gif'))
}

// small deterministic "random" so the fixture is stable between runs
let seed = 42
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

const grades = ['Mint (M)', 'Near Mint (NM or M-)', 'Near Mint (NM or M-)', 'Very Good Plus (VG+)', 'Very Good Plus (VG+)', 'Very Good (VG)']
const shelves = ['Shelf A', 'Shelf B', 'Crate 1', 'Living room']

const releases = []
for (const [i, [artist, title]] of albums.entries()) {
  const r = await search(artist, title)
  if (!r) {
    console.log('skip', artist, title)
    continue
  }
  const [a, t] = r.title.split(' - ')
  const added = new Date(Date.UTC(2026, 0, 1) + Math.floor(rand() * 280) * 86400000)
  releases.push({
    id: r.id,
    instance_id: 5000 + i,
    folder_id: rand() < 0.7 ? 1 : 2,
    date_added: added.toISOString().replace('.000Z', '-00:00'),
    rating: rand() < 0.5 ? 0 : 1 + Math.floor(rand() * 5),
    notes: [
      { field_id: 1, value: pick(grades) },
      { field_id: 2, value: pick(grades) },
      ...(rand() < 0.25 ? [{ field_id: 3, value: pick(['Gift from Mom', 'Original pressing', 'Slight warp on side B', 'Signed']) }] : []),
      { field_id: 4, value: pick(shelves) },
    ],
    basic_information: {
      id: r.id,
      master_id: r.master_id ?? 0,
      title: t ?? r.title,
      year: Number(r.year) || 0,
      thumb: r.thumb,
      cover_image: r.cover_image,
      artists: [{ name: a ?? artist }],
      labels: (r.label ?? []).slice(0, 1).map((name) => ({ name, catno: r.catno ?? '' })),
      formats: r.formats ?? [],
      genres: r.genre ?? [],
      styles: r.style ?? [],
    },
  })
  console.log('ok', r.title)
}

const page = { pagination: { page: 1, pages: 1, per_page: 100, items: releases.length, urls: {} }, releases }
await writeFile(new URL('../tests/fixtures/collection-demo.json', import.meta.url), JSON.stringify(page, null, 2) + '\n')
console.log('saved', releases.length)
