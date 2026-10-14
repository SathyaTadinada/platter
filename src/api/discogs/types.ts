// Only the fields Platter reads. Shapes checked against tests/fixtures.

export type Pagination = {
  page: number
  pages: number
  per_page: number
  items: number
}

export type IdentityResponse = { id: number; username: string; resource_url: string; consumer_name: string }

export type SearchFormat = { name: string; qty: string; descriptions?: string[]; text?: string }

export type SearchResult = {
  id: number
  type: 'release'
  title: string // "Artist - Title"
  year?: string
  country?: string
  format?: string[]
  formats?: SearchFormat[]
  label?: string[]
  catno?: string
  barcode?: string[]
  master_id?: number
  thumb?: string
  cover_image?: string
  uri: string // path on discogs.com
  user_data?: { in_wantlist: boolean; in_collection: boolean }
}

export type SearchResponse = { pagination: Pagination; results: SearchResult[] }

export type SearchParams = {
  barcode?: string
  catno?: string
  artist?: string
  release_title?: string
  q?: string
}

export type Identifier = { type: string; value: string; description?: string }

export type Release = {
  id: number
  title: string
  year?: number
  country?: string
  master_id?: number
  uri: string
  artists: { name: string; anv?: string; join?: string }[]
  labels: { name: string; catno: string }[]
  formats: SearchFormat[]
  identifiers: Identifier[]
  images?: { type: string; uri: string; uri150: string }[]
  thumb?: string
}

export type MasterVersion = {
  id: number
  title: string
  format?: string
  label?: string
  catno?: string
  country?: string
  released?: string
  thumb?: string
}

export type MasterVersionsResponse = { pagination: Pagination; versions: MasterVersion[] }

export type Folder = { id: number; name: string; count: number }
export type FoldersResponse = { folders: Folder[] }

export type CollectionField =
  | { id: number; name: string; type: 'dropdown'; position: number; public: boolean; options: string[] }
  | { id: number; name: string; type: 'textarea'; position: number; public: boolean; lines?: number }

export type FieldsResponse = { fields: CollectionField[] }

export type BasicInformation = {
  id: number
  master_id: number
  title: string
  year: number
  thumb?: string
  cover_image?: string
  artists: { name: string }[]
  labels: { name: string; catno: string }[]
  formats: SearchFormat[]
}

export type CollectionItem = {
  id: number
  instance_id: number
  folder_id: number
  date_added: string
  rating: number
  basic_information: BasicInformation
  notes?: { field_id: number; value: string }[]
}

export type CollectionPage = { pagination: Pagination; releases: CollectionItem[] }

export type WantItem = { id: number; basic_information: BasicInformation }
export type WantsPage = { pagination: Pagination; wants: WantItem[] }

export type AddResponse = { instance_id: number; resource_url: string }

export type MarketplaceStats = {
  num_for_sale: number
  lowest_price: { value: number; currency: string } | null
  blocked_from_sale: boolean
}
