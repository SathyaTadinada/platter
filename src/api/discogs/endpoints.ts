import { DISCOGS_MAX_AGE } from '../../db/cache'
import type { DiscogsClient } from './client'
import type {
  AddResponse,
  CollectionPage,
  FieldsResponse,
  FoldersResponse,
  IdentityResponse,
  MarketplaceStats,
  MasterVersionsResponse,
  Release,
  SearchParams,
  SearchResponse,
  WantsPage,
} from './types'

const u = (username: string) => `/users/${encodeURIComponent(username)}`

export const getIdentity = (c: DiscogsClient) => c.get<IdentityResponse>('/oauth/identity')

export const searchReleases = (c: DiscogsClient, params: SearchParams, page = 1) =>
  c.get<SearchResponse>('/database/search', { ...params, type: 'release', per_page: 50, page }, DISCOGS_MAX_AGE)

export const getRelease = (c: DiscogsClient, id: number) => c.get<Release>(`/releases/${id}`, undefined, DISCOGS_MAX_AGE)

export const getMasterVersions = (c: DiscogsClient, masterId: number, page = 1) =>
  c.get<MasterVersionsResponse>(`/masters/${masterId}/versions`, { per_page: 100, page }, DISCOGS_MAX_AGE)

export const getOwnedInstances = (c: DiscogsClient, username: string, releaseId: number) =>
  c.get<CollectionPage>(`${u(username)}/collection/releases/${releaseId}`)

export const getFolders = (c: DiscogsClient, username: string) =>
  c.get<FoldersResponse>(`${u(username)}/collection/folders`)

export const getFields = (c: DiscogsClient, username: string) =>
  c.get<FieldsResponse>(`${u(username)}/collection/fields`)

export const getCollectionPage = (c: DiscogsClient, username: string, page: number) =>
  c.get<CollectionPage>(`${u(username)}/collection/folders/0/releases`, { per_page: 100, page })

export const getWantsPage = (c: DiscogsClient, username: string, page: number) =>
  c.get<WantsPage>(`${u(username)}/wants`, { per_page: 100, page })

export const addToFolder = (c: DiscogsClient, username: string, folderId: number, releaseId: number) =>
  c.request<AddResponse>('POST', `${u(username)}/collection/folders/${folderId}/releases/${releaseId}`)

export const setFieldValue = (
  c: DiscogsClient,
  username: string,
  target: { folderId: number; releaseId: number; instanceId: number },
  fieldId: number,
  value: string,
) =>
  c.request<null>(
    'POST',
    `${u(username)}/collection/folders/${target.folderId}/releases/${target.releaseId}/instances/${target.instanceId}/fields/${fieldId}`,
    { body: { value } },
  )

export const removeWant = (c: DiscogsClient, username: string, releaseId: number) =>
  c.request<null>('DELETE', `${u(username)}/wants/${releaseId}`)

export const getMarketplaceStats = (c: DiscogsClient, releaseId: number) =>
  c.get<MarketplaceStats>(`/marketplace/stats/${releaseId}`, undefined, DISCOGS_MAX_AGE)
