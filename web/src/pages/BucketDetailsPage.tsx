import { useQuery } from "@tanstack/react-query"
import { FileIcon, Globe, Lock, Pencil, Search, Upload } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router-dom"

import { FileSheet } from "@/components/FileSheet"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { UploadDialog } from "@/components/UploadDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import {
  formatBytes,
  getBucket,
  getStats,
  listBucketGrants,
  listFiles,
  type DepotFile,
} from "@/lib/depot"

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/55 bg-card px-3.5 py-2.5">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium tabular-nums">{value}</p>
    </div>
  )
}

export default function BucketDetailsPage() {
  const { bucketName = "" } = useParams()
  const { isAdmin } = useAuth()

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
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats })
  const grantsQuery = useQuery({
    queryKey: ["grants", bucketName],
    queryFn: () => listBucketGrants(bucketName),
  })

  const bucket = bucketQuery.data
  const files = filesQuery.data ?? []
  const bucketStats = statsQuery.data?.buckets.find((entry) => entry.bucket_id === bucket?.id)

  const grants = grantsQuery.data
  // Undefined while the request is in flight — unknown rather than zero.
  const appCount = (count: number) =>
    count === 0 ? "Admins only" : `${count} application${count === 1 ? "" : "s"}`
  const readAccess = bucket?.allow_authenticated_read
    ? "Any application"
    : grants
      ? appCount(grants.length)
      : "—"
  const writeAccess = grants
    ? appCount(grants.filter((grant) => grant.access === "WRITE").length)
    : "—"

  return (
    <PageContainer>
      <PageHeader
        title={bucketName}
        description={bucket?.description || "No description"}
        action={
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link to={`/buckets/${bucketName}/edit`}>
                  <Pencil className="size-4" />
                  Settings
                </Link>
              </Button>
            )}
            {isAdmin && bucket && (
              <UploadDialog
                trigger={
                  <Button>
                    <Upload className="size-4" />
                    Upload
                  </Button>
                }
                bucket={bucketName}
                allowPublicFiles={bucket.allow_public_files}
              />
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5">
        <SummaryTile label="Files" value={String(bucketStats?.file_count ?? 0)} />
        <SummaryTile label="Stored" value={formatBytes(bucketStats?.total_bytes ?? 0)} />
        <SummaryTile label="Read access" value={readAccess} />
        <SummaryTile label="Write access" value={writeAccess} />
        <SummaryTile
          label="Public files"
          value={bucket?.allow_public_files ? "Allowed" : "Not allowed"}
        />
      </div>

      <div className="mb-4 flex h-9 min-w-0 items-center gap-2 rounded-lg border border-input/80 px-2.5 sm:max-w-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search files by name or path"
          className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {filesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <FileIcon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">
              {search ? "No files match your search" : "No files in this bucket yet"}
            </p>
            {!search && (
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Upload one here, or grant an application write access to send files from a service.
              </p>
            )}
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
                      {file.public ? (
                        <Globe className="size-3.5 text-gr-purple" />
                      ) : (
                        <Lock className="size-3.5 text-muted-foreground/60" />
                      )}
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

      <FileSheet file={selectedFile} onClose={() => setSelectedFile(null)} />
    </PageContainer>
  )
}
