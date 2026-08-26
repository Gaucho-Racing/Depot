import { api } from "@/lib/api"

export type Bucket = {
  id: string
  name: string
  description: string
  allow_public_files: boolean
  created_by_entity_id: string
  updated_by_entity_id: string
  created_at: string
  updated_at: string
}

export type BucketAccess = "READ" | "WRITE"

export type BucketGrant = {
  id: string
  bucket_id: string
  bucket_name: string
  client_id: string
  description: string
  access: BucketAccess
  created_by_entity_id: string
  updated_by_entity_id: string
  created_at: string
  updated_at: string
}

export type BucketGrantInput = {
  client_id?: string
  description: string
  access: BucketAccess
}

export type FileReplica = {
  id: string
  file_id: string
  storage_backend: string
  status: "PENDING" | "ACTIVE" | "FAILED"
  error?: string
  created_at: string
  updated_at: string
}

export type DepotFile = {
  id: string
  bucket_id: string
  bucket_name: string
  name: string
  path: string
  content_type: string
  size_bytes: number
  status: "PENDING" | "ACTIVE"
  public: boolean
  tags: Record<string, string> | null
  storage_backend: string
  replicas: FileReplica[]
  created_by_entity_id: string
  created_by_client_id: string
  updated_by_entity_id: string
  updated_by_client_id: string
  created_at: string
  updated_at: string
}

export type StorageProvider = "aws-s3" | "s3-compatible"

export type StorageBackend = {
  id: string
  name: string
  provider: StorageProvider
  region: string
  bucket: string
  endpoint: string
  force_path_style: boolean
  default: boolean
  enabled: boolean
  created_by_entity_id: string
  updated_by_entity_id: string
  created_at: string
  updated_at: string
}

export type ProviderRegions = {
  provider: StorageProvider
  regions: string[]
  allows_custom: boolean
  region_required: boolean
}

export type StorageBackendInput = {
  name?: string
  provider?: StorageProvider
  region?: string
  bucket?: string
  endpoint?: string
  force_path_style?: boolean
  access_key_id?: string
  secret_access_key?: string
  default?: boolean
  enabled?: boolean
}

export type AccessLog = {
  id: string
  file_id: string
  file_name: string
  bucket_id: string
  bucket_name: string
  action: "UPLOAD" | "PRESIGN_UPLOAD" | "DOWNLOAD" | "PRESIGN_DOWNLOAD" | "DELETE"
  entity_id: string
  client_id: string
  actor_type: "USER" | "SERVICE_ACCOUNT" | "ANONYMOUS"
  public: boolean
  created_at: string
}

export type BucketStats = {
  bucket_id: string
  bucket_name: string
  file_count: number
  total_bytes: number
}

export type EntityStats = {
  entity_id: string
  file_count: number
  total_bytes: number
}

export type ApplicationStats = {
  client_id: string
  file_count: number
  total_bytes: number
}

export type Stats = {
  total_files: number
  total_bytes: number
  total_buckets: number
  buckets: BucketStats[]
  top_uploaders: EntityStats[]
  top_applications: ApplicationStats[]
}

export type ActivityPoint = {
  date: string
  uploads: number
  downloads: number
  deletes: number
}

export type SentinelApplication = {
  id: string
  name: string
  description: string
  client_id: string
  icon_url: string
}

export type SentinelGroup = {
  id: string
  name: string
  description: string
  member_count: number
}

export type BucketInput = {
  name: string
  description: string
  allow_public_files: boolean
}

export async function listStorageBackends() {
  const response = await api.get<StorageBackend[]>("/storage-backends")
  return response.data
}

export async function listStorageProviders() {
  const response = await api.get<ProviderRegions[]>("/storage-backends/providers")
  return response.data
}

export async function createStorageBackend(input: StorageBackendInput) {
  const response = await api.post<StorageBackend>("/storage-backends", input)
  return response.data
}

export async function updateStorageBackend(name: string, input: StorageBackendInput) {
  const response = await api.patch<StorageBackend>(`/storage-backends/${encodeURIComponent(name)}`, input)
  return response.data
}

export async function deleteStorageBackend(name: string) {
  await api.delete(`/storage-backends/${encodeURIComponent(name)}`)
}

export async function listBuckets() {
  const response = await api.get<Bucket[]>("/buckets")
  return response.data
}

export async function getBucket(name: string) {
  const response = await api.get<Bucket>(`/buckets/${encodeURIComponent(name)}`)
  return response.data
}

export async function createBucket(input: BucketInput) {
  const response = await api.post<Bucket>("/buckets", input)
  return response.data
}

export async function updateBucket(name: string, input: Omit<BucketInput, "name">) {
  const response = await api.put<Bucket>(`/buckets/${encodeURIComponent(name)}`, input)
  return response.data
}

export async function deleteBucket(name: string) {
  await api.delete(`/buckets/${encodeURIComponent(name)}`)
}

export async function listBucketGrants(bucket: string) {
  const response = await api.get<BucketGrant[]>(`/buckets/${encodeURIComponent(bucket)}/grants`)
  return response.data
}

export async function createBucketGrant(bucket: string, input: BucketGrantInput) {
  const response = await api.post<BucketGrant>(
    `/buckets/${encodeURIComponent(bucket)}/grants`,
    input,
  )
  return response.data
}

export async function updateBucketGrant(
  bucket: string,
  clientID: string,
  input: Omit<BucketGrantInput, "client_id">,
) {
  const response = await api.patch<BucketGrant>(
    `/buckets/${encodeURIComponent(bucket)}/grants/${encodeURIComponent(clientID)}`,
    input,
  )
  return response.data
}

export async function deleteBucketGrant(bucket: string, clientID: string) {
  await api.delete(`/buckets/${encodeURIComponent(bucket)}/grants/${encodeURIComponent(clientID)}`)
}

export async function listFiles(
  bucket: string,
  params: { q?: string; path_prefix?: string; limit?: number; offset?: number } = {},
) {
  const response = await api.get<DepotFile[]>(`/buckets/${encodeURIComponent(bucket)}/files`, {
    params,
  })
  return response.data
}

export async function searchFiles(q: string, limit = 50) {
  const response = await api.get<DepotFile[]>("/files/search", { params: { q, limit } })
  return response.data
}

export async function uploadFile(
  bucket: string,
  input: { file: File; name?: string; path?: string; public?: boolean; tags?: Record<string, string> },
  onProgress?: (percent: number) => void,
) {
  const form = new FormData()
  form.append("file", input.file)
  if (input.name) form.append("name", input.name)
  if (input.path) form.append("path", input.path)
  if (input.public !== undefined) form.append("public", String(input.public))
  if (input.tags && Object.keys(input.tags).length > 0) form.append("tags", JSON.stringify(input.tags))
  const response = await api.post<DepotFile>(`/buckets/${encodeURIComponent(bucket)}/files`, form, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    },
  })
  return response.data
}

export async function createDownloadURL(bucket: string, id: string) {
  const response = await api.post<{ url: string; method: string; expires_at: string }>(
    `/buckets/${encodeURIComponent(bucket)}/files/${encodeURIComponent(id)}/download-url`,
  )
  return response.data
}

export async function listFileAccessLogs(bucket: string, id: string) {
  const response = await api.get<AccessLog[]>(
    `/buckets/${encodeURIComponent(bucket)}/files/${encodeURIComponent(id)}/access-logs`,
  )
  return response.data
}

export async function getStats() {
  const response = await api.get<Stats>("/stats")
  return response.data
}

export async function getActivity(days = 30) {
  const response = await api.get<ActivityPoint[]>("/stats/activity", { params: { days } })
  return response.data
}

export async function listSentinelApplications() {
  const response = await api.get<SentinelApplication[]>("/applications")
  return response.data
}

export async function listSentinelGroups() {
  const response = await api.get<SentinelGroup[]>("/groups")
  return response.data
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function errorMessage(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  )
}
