import { api } from "@/lib/api"

export type Bucket = {
  id: string
  name: string
  description: string
  access_group_names: string[] | null
  created_by_entity_id: string
  updated_by_entity_id: string
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
  checksum: string
  status: "PENDING" | "ACTIVE"
  public: boolean
  tags: Record<string, string> | null
  created_by_entity_id: string
  updated_by_entity_id: string
  created_at: string
  updated_at: string
}

export type AccessLog = {
  id: string
  file_id: string
  file_name: string
  bucket_id: string
  bucket_name: string
  action: "UPLOAD" | "PRESIGN_UPLOAD" | "DOWNLOAD" | "PRESIGN_DOWNLOAD" | "DELETE"
  entity_id: string
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

export type Stats = {
  total_files: number
  total_bytes: number
  total_buckets: number
  buckets: BucketStats[]
  top_uploaders: EntityStats[]
}

export type ActivityPoint = {
  date: string
  uploads: number
  downloads: number
  deletes: number
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
  access_group_names: string[]
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

export async function updateFile(
  bucket: string,
  id: string,
  input: Partial<{ name: string; path: string; public: boolean; tags: Record<string, string> }>,
) {
  const response = await api.put<DepotFile>(
    `/buckets/${encodeURIComponent(bucket)}/files/${encodeURIComponent(id)}`,
    input,
  )
  return response.data
}

export async function deleteFile(bucket: string, id: string) {
  await api.delete(`/buckets/${encodeURIComponent(bucket)}/files/${encodeURIComponent(id)}`)
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
