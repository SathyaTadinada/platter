import type { CollectionField } from '../api/discogs/types'

export type FieldKey =
  | 'mediaCondition'
  | 'sleeveCondition'
  | 'notes'
  | 'purchasePrice'
  | 'purchasedFrom'
  | 'purchaseDate'
  | 'location'
  | 'playCount'
  | 'lastPlayed'
  | 'lentTo'

export type FieldSpec = {
  key: FieldKey
  name: string // name to create on Discogs
  type: 'dropdown' | 'textarea'
  builtIn: boolean // Discogs creates these for every account
  aliases: string[]
  why: string
  setup: string // what to enter on the Discogs settings page
  optional?: boolean // only for a feature some people won't use; not counted as missing
}

export const FIELDS_SETTINGS_URL = 'https://www.discogs.com/settings/collection'

export const FIELD_SPECS: FieldSpec[] = [
  {
    key: 'mediaCondition',
    name: 'Media Condition',
    type: 'dropdown',
    builtIn: true,
    aliases: ['media', 'record condition', 'vinyl condition'],
    why: 'Grade of the vinyl',
    setup: 'Dropdown, Mint (M) to Poor (P)',
  },
  {
    key: 'sleeveCondition',
    name: 'Sleeve Condition',
    type: 'dropdown',
    builtIn: true,
    aliases: ['sleeve', 'cover condition', 'jacket condition'],
    why: 'Grade of the sleeve',
    setup: 'Dropdown, Generic, No Cover, then Mint (M) to Poor (P)',
  },
  {
    key: 'notes',
    name: 'Notes',
    type: 'textarea',
    builtIn: true,
    aliases: ['note', 'comments'],
    why: 'Anything else',
    setup: 'Text Area',
  },
  {
    key: 'purchasePrice',
    name: 'Purchase Price',
    type: 'textarea',
    builtIn: false,
    aliases: ['price', 'price paid', 'paid', 'cost'],
    why: 'What you paid',
    setup: 'Text Area',
  },
  {
    key: 'purchasedFrom',
    name: 'Purchased From',
    type: 'textarea',
    builtIn: false,
    aliases: ['store', 'shop', 'bought from', 'source', 'seller'],
    why: 'Store or seller',
    setup: 'Text Area',
  },
  {
    key: 'purchaseDate',
    name: 'Purchase Date',
    type: 'textarea',
    builtIn: false,
    aliases: ['date purchased', 'bought', 'date bought', 'acquired'],
    why: 'When you bought it',
    setup: 'Text Area (dates are saved as YYYY-MM-DD)',
  },
  {
    key: 'location',
    name: 'Location',
    type: 'textarea',
    builtIn: false,
    aliases: ['shelf', 'storage', 'where'],
    why: "Where it's kept",
    setup: 'Text Area, or a Dropdown of your shelves',
  },
  {
    key: 'playCount',
    name: 'Play Count',
    type: 'textarea',
    builtIn: false,
    aliases: ['plays', 'times played', 'spins'],
    why: 'Goes up when you log a play',
    setup: 'Text Area',
  },
  {
    key: 'lastPlayed',
    name: 'Last Played',
    type: 'textarea',
    builtIn: false,
    aliases: ['last spin', 'last listened'],
    why: 'Set when you log a play',
    setup: 'Text Area',
  },
  {
    key: 'lentTo',
    name: 'Lent To',
    type: 'textarea',
    builtIn: false,
    aliases: ['lent', 'loaned to', 'lent out', 'borrowed by'],
    why: 'Who has it, when you lend a record out',
    setup: 'Text Area',
    optional: true,
  },
]

export type FieldMap = Partial<Record<FieldKey, number | null>> // null = user chose "don't use"

export type FieldMatch = {
  spec: FieldSpec
  field: CollectionField | null
  source: 'manual' | 'name' | 'none'
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Match Platter's fields to the user's Discogs fields: manual choice first, then by name.
export function matchFields(fields: CollectionField[], manual: FieldMap = {}): FieldMatch[] {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const taken = new Set<number>(Object.values(manual).filter((v): v is number => typeof v === 'number'))

  return FIELD_SPECS.map((spec) => {
    const chosen = manual[spec.key]
    if (chosen === null) return { spec, field: null, source: 'manual' }
    if (typeof chosen === 'number' && byId.has(chosen)) return { spec, field: byId.get(chosen)!, source: 'manual' }

    const names = [spec.name, ...spec.aliases].map(norm)
    const found = fields.find((f) => !taken.has(f.id) && names.includes(norm(f.name)))
    if (found) {
      taken.add(found.id)
      return { spec, field: found, source: 'name' }
    }
    return { spec, field: null, source: 'none' }
  })
}

export const fieldFor = (matches: FieldMatch[], key: FieldKey) => matches.find((m) => m.spec.key === key)?.field ?? null
