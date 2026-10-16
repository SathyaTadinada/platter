import { DISCOGS_MAX_AGE } from '../../db/cache'
import type { DiscogsClient } from './client'
import type {
  AddResponse,
  CollectionValue,
  CollectionPage,
  FieldsResponse,
  Folder,
  FoldersResponse,
  IdentityResponse,
  MarketplaceStats,
  PriceSuggestions,
  Release,
  SearchParams,
  SearchResponse,
  UserProfile,
  WantsPage,
} from './types'

const u = (username: string) => `/users/${encodeURIComponent(username)}`

export const getIdentity = (c: DiscogsClient) => c.get<IdentityResponse>('/oauth/identity')

export const getProfile = (c: DiscogsClient, username: string) => c.get<UserProfile>(u(username), undefined, DISCOGS_MAX_AGE)

export const searchReleases = (c: DiscogsClient, params: SearchParams, page = 1) =>
  c.get<SearchResponse>('/database/search', { ...params, type: 'release', per_page: 50, page }, DISCOGS_MAX_AGE)

export const getRelease = (c: DiscogsClient, id: number) => c.get<Release>(`/releases/${id}`, undefined, DISCOGS_MAX_AGE)

export const getMaster = (c: DiscogsClient, id: number) => c.get<{ id: number; year?: number }>(`/masters/${id}`)

export const getOwnedInstances = (c: DiscogsClient, username: string, releaseId: number) =>
  c.get<CollectionPage>(`${u(username)}/collection/releases/${releaseId}`)

export const getFolders = (c: DiscogsClient, username: string) => c.get<FoldersResponse>(`${u(username)}/collection/folders`)

export const getFields = (c: DiscogsClient, username: string) => c.get<FieldsResponse>(`${u(username)}/collection/fields`)

export const getCollectionPage = (c: DiscogsClient, username: string, page: number) =>
  c.get<CollectionPage>(`${u(username)}/collection/folders/0/releases`, { per_page: 100, page })

export const getWantsPage = (c: DiscogsClient, username: string, page: number) =>
  c.get<WantsPage>(`${u(username)}/wants`, { per_page: 100, page })

export const addToFolder = (c: DiscogsClient, username: string, folderId: number, releaseId: number) =>
  c.request<AddResponse>('POST', `${u(username)}/collection/folders/${folderId}/releases/${releaseId}`)

export const setFieldValue = (c: DiscogsClient, username: string, target: InstanceTarget, fieldId: number, value: string) =>
  c.request<null>(
    'POST',
    `${u(username)}/collection/folders/${target.folderId}/releases/${target.releaseId}/instances/${target.instanceId}/fields/${fieldId}`,
    { body: { value } },
  )

export const addWant = (c: DiscogsClient, username: string, releaseId: number) =>
  c.request<{ id: number }>('PUT', `${u(username)}/wants/${releaseId}`)

export const removeWant = (c: DiscogsClient, username: string, releaseId: number) =>
  c.request<null>('DELETE', `${u(username)}/wants/${releaseId}`)

// Not cached here: the prices table keeps them, with the time they were fetched
export const getMarketplaceStats = (c: DiscogsClient, releaseId: number, currency: string) =>
  c.get<MarketplaceStats>(`/marketplace/stats/${releaseId}`, { curr_abbr: currency })

// Needs seller settings filled in on Discogs; 404 otherwise
export const getPriceSuggestions = (c: DiscogsClient, releaseId: number) =>
  c.get<PriceSuggestions>(`/marketplace/price_suggestions/${releaseId}`)

// fresh skips the cache, e.g. after records were added or removed
export const getCollectionValue = (c: DiscogsClient, username: string, fresh = false) =>
  c.get<CollectionValue>(`${u(username)}/collection/value`, undefined, fresh ? 1 : DISCOGS_MAX_AGE)

export type InstanceTarget = { folderId: number; releaseId: number; instanceId: number }

const instancePath = (username: string, t: InstanceTarget) =>
  `${u(username)}/collection/folders/${t.folderId}/releases/${t.releaseId}/instances/${t.instanceId}`

// Change rating (0-5) and/or move to another folder
export const editInstance = (c: DiscogsClient, username: string, t: InstanceTarget, changes: { rating?: number; folder_id?: number }) =>
  c.request<null>('POST', instancePath(username, t), { body: changes })

export const deleteInstance = (c: DiscogsClient, username: string, t: InstanceTarget) =>
  c.request<null>('DELETE', instancePath(username, t))

// Crates are Discogs collection folders
export const createFolder = (c: DiscogsClient, username: string, name: string) =>
  c.request<Folder>('POST', `${u(username)}/collection/folders`, { body: { name } })

export const renameFolder = (c: DiscogsClient, username: string, folderId: number, name: string) =>
  c.request<Folder>('POST', `${u(username)}/collection/folders/${folderId}`, { body: { name } })

// Discogs only deletes empty folders
export const deleteFolder = (c: DiscogsClient, username: string, folderId: number) =>
  c.request<null>('DELETE', `${u(username)}/collection/folders/${folderId}`)
