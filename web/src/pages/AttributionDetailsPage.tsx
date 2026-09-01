import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ArrowLeft, FileIcon, Globe, Search } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router-dom"

import { ApplicationDisplay } from "@/components/ApplicationDisplay"
import { FileSheet } from "@/components/FileSheet"
import { IdentityDisplay } from "@/components/IdentityDisplay"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  formatBytes,
  getAttributionStats,
  listAttributionFiles,
  type DepotFile,
} from "@/lib/depot"
import { useApplicationDirectory, useIdentityDirectory } from "@/lib/directory"

const PAGE_SIZE = 50

type AttributionKind = "uploader" | "application"

function StatTile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-6 w-20" />
        ) : (
          <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  )
}

function formatUploadRange(first?: string, last?: string) {
  if (!first || !last) return "No uploads in buckets you can access."
  const firstDate = new Date(first).toLocaleDateString()
  const lastDate = new Date(last).toLocaleDateString()
  if (firstDate === lastDate) return `Uploads recorded on ${firstDate}.`
  return `Uploads recorded from ${firstDate} through ${lastDate}.`
}

export default function AttributionDetailsPage({ kind }: { kind: AttributionKind }) {
  const params = useParams()
  const identifier = kind === "uploader" ? params.entityID ?? "" : params.clientID ?? ""
  const [query, setQuery] = useState("")
  const [submittedQuery, setSubmittedQuery] = useState("")
  const [selectedFile, setSelectedFile] = useState<DepotFile | null>(null)

  const identityDirectory = useIdentityDirectory(kind === "uploader" ? [identifier] : [])
  const applicationDirectory = useApplicationDirectory(kind === "application" ? [identifier] : [])
  const identity = identityDirectory.byID.get(identifier)
  const application = applicationDirectory.byClientID.get(identifier)

  const statsQuery = useQuery({
    queryKey: ["attributionStats", kind, identifier],
    queryFn: () => getAttributionStats(kind, identifier),
    enabled: identifier !== "",
  })
  const filesQuery = useInfiniteQuery({
    queryKey: ["attributionFiles", kind, identifier, submittedQuery],
    queryFn: ({ pageParam }) =>
      listAttributionFiles(kind, identifier, {
        q: submittedQuery || undefined,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset,
    enabled: identifier !== "",
  })

  const stats = statsQuery.data
  const files = filesQuery.data?.pages.flatMap((page) => page.files) ?? []
  const displayName =
    kind === "uploader" ? identity?.name || identifier : application?.name || identifier

  return (
    <PageContainer>
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Dashboard
      </Link>

      <PageHeader
        title={displayName || (kind === "uploader" ? "Uploader" : "Application")}
        description={kind === "uploader" ? "Files and storage attributed to this uploader." : "Files and storage attributed to this application."}
      />

      <Card className="mb-4">
        <CardContent className="py-4">
          {kind === "uploader" ? (
            <IdentityDisplay
              entityID={identifier}
              identity={identity}
              loading={identityDirectory.isLoading}
            />
          ) : (
            <ApplicationDisplay
              clientID={identifier}
              application={application}
            />
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Files" value={String(stats?.file_count ?? 0)} loading={statsQuery.isLoading} />
        <StatTile label="Storage used" value={formatBytes(stats?.total_bytes ?? 0)} loading={statsQuery.isLoading} />
        <StatTile label="Buckets" value={String(stats?.bucket_count ?? 0)} loading={statsQuery.isLoading} />
        <StatTile label="Public files" value={String(stats?.public_files ?? 0)} loading={statsQuery.isLoading} />
      </div>

      <p className="mb-6 text-xs text-muted-foreground">
        {statsQuery.isLoading
          ? "Loading upload history..."
          : formatUploadRange(stats?.first_upload_at, stats?.last_upload_at)}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,2fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Storage by bucket</CardTitle>
            <CardDescription>Active files attributed to {displayName || "this source"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statsQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)
            ) : (stats?.buckets ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No bucket activity.</p>
            ) : (
              stats?.buckets.map((bucket) => (
                <Link
                  key={bucket.bucket_id}
                  to={`/buckets/${encodeURIComponent(bucket.bucket_name)}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <span className="min-w-0 truncate font-mono text-xs font-medium">
                    {bucket.bucket_name}
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {bucket.file_count} · {formatBytes(bucket.total_bytes)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
            <CardDescription>Newest uploads first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <form
              className="mx-4 mb-4 flex h-10 items-center gap-2 rounded-lg border border-input/80 px-2.5"
              onSubmit={(event) => {
                event.preventDefault()
                setSubmittedQuery(query.trim())
              }}
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search these files by name or path"
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </form>

            {filesQuery.isLoading ? (
              <div className="space-y-2 px-4 pb-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : filesQuery.isError ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Could not load files.
              </p>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <FileIcon className="size-4 text-muted-foreground" />
                </span>
                <p className="mt-3 text-sm font-medium">
                  {submittedQuery ? "No files match this search" : "No files found"}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {files.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(file)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_120px_80px_auto]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {file.original_name || file.id}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {[file.path, file.id].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <Badge variant="outline" className="hidden truncate font-mono text-xs sm:block">
                        {file.bucket_name}
                      </Badge>
                      <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                        {formatBytes(file.size_bytes)}
                      </span>
                      <span className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        {file.public && <Globe className="size-3.5 text-gr-purple" />}
                        {new Date(file.created_at).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {filesQuery.hasNextPage && (
              <div className="border-t border-border p-4">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={filesQuery.isFetchingNextPage}
                  onClick={() => void filesQuery.fetchNextPage()}
                >
                  {filesQuery.isFetchingNextPage ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <FileSheet file={selectedFile} onClose={() => setSelectedFile(null)} />
    </PageContainer>
  )
}
