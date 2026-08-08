import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileIcon, Globe, Pencil, Search, Trash2, Upload } from "lucide-react"
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { BucketFormDialog } from "@/components/BucketFormDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { FileSheet } from "@/components/FileSheet"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { UploadDialog } from "@/components/UploadDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import {
  deleteBucket,
  errorMessage,
  formatBytes,
  getBucket,
  listFiles,
  updateBucket,
  type DepotFile,
} from "@/lib/depot"

export default function BucketDetailsPage() {
  const { bucketName = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.groups?.includes("Admins") ?? false

  const [search, setSearch] = useState("")
  const [selectedFile, setSelectedFile] = useState<DepotFile | null>(null)

  const bucketQuery = useQuery({
    queryKey: ["bucket", bucketName],
    queryFn: () => getBucket(bucketName),
  })

  const filesQuery = useQuery({
    queryKey: ["files", bucketName, search],
    queryFn: () => listFiles(bucketName, { q: search || undefined, limit: 200 }),
  })

  const canWrite =
    isAdmin ||
    (bucketQuery.data?.access_group_names ?? []).some((group) => user?.groups?.includes(group))

  const updateMutation = useMutation({
    mutationFn: (input: { description: string; access_group_names: string[] }) =>
      updateBucket(bucketName, input),
    onSuccess: () => {
      toast.success("Bucket updated")
      void queryClient.invalidateQueries({ queryKey: ["bucket", bucketName] })
      void queryClient.invalidateQueries({ queryKey: ["buckets"] })
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to update bucket"))
      throw error
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteBucket(bucketName),
    onSuccess: () => {
      toast.success("Bucket deleted")
      void queryClient.invalidateQueries({ queryKey: ["buckets"] })
      void navigate("/buckets")
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to delete bucket"))
      throw error
    },
  })

  const bucket = bucketQuery.data
  const files = filesQuery.data ?? []

  return (
    <PageContainer>
      <PageHeader
        title={bucketName}
        description={bucket?.description || "Bucket files"}
        action={
          <div className="flex gap-2">
            {isAdmin && bucket && (
              <>
                <BucketFormDialog
                  trigger={
                    <Button variant="outline" size="icon">
                      <Pencil className="size-4" />
                      <span className="sr-only">Edit bucket</span>
                    </Button>
                  }
                  bucket={bucket}
                  isPending={updateMutation.isPending}
                  onSubmit={async (input) => {
                    await updateMutation.mutateAsync({
                      description: input.description,
                      access_group_names: input.access_group_names,
                    })
                  }}
                />
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="icon" className="text-destructive">
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete bucket</span>
                    </Button>
                  }
                  title={`Delete ${bucketName}?`}
                  description="Buckets can only be deleted when empty."
                  confirmLabel="Delete bucket"
                  isPending={deleteMutation.isPending}
                  onConfirm={async () => {
                    await deleteMutation.mutateAsync()
                  }}
                />
              </>
            )}
            {canWrite && (
              <UploadDialog
                trigger={
                  <Button>
                    <Upload className="size-4" />
                    Upload
                  </Button>
                }
                bucket={bucketName}
              />
            )}
          </div>
        }
      />

      {bucket && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {(bucket.access_group_names ?? []).length === 0 ? (
            <Badge variant="secondary">Scoped access</Badge>
          ) : (
            (bucket.access_group_names ?? []).map((group) => (
              <Badge key={group} variant="outline">
                {group}
              </Badge>
            ))
          )}
        </div>
      )}

      <div className="mb-6 flex h-11 max-w-xl min-w-0 items-center gap-2 rounded-lg bg-card px-3 shadow-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search files by name or path"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {filesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <FileIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="mt-4 text-sm font-medium">
              {search ? "No files match your search" : "No files in this bucket yet"}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {files.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(file)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_110px_90px_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{file.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {file.path || file.id}
                      </span>
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {file.content_type || "unknown"}
                    </span>
                    <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                      {formatBytes(file.size_bytes)}
                    </span>
                    <span className="flex items-center justify-end gap-2">
                      {file.public && <Globe className="size-3.5 text-gr-purple" />}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {new Date(file.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <FileSheet file={selectedFile} canWrite={canWrite} onClose={() => setSelectedFile(null)} />
    </PageContainer>
  )
}
