import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Globe, Loader2, Lock, X } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { ApplicationDisplay } from "@/components/ApplicationDisplay"
import { IdentityDisplay } from "@/components/IdentityDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  downloadFile,
  errorMessage,
  formatBytes,
  createDownloadURL,
  listFileAccessLogs,
  type DepotFile,
} from "@/lib/depot"
import { useApplicationDirectory, useIdentityDirectory } from "@/lib/directory"
import { cn } from "@/lib/utils"

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  const empty = value === "" || value === null || value === undefined
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className={mono ? "min-w-0 break-all text-right font-mono text-xs" : "min-w-0 text-right"}>
        {empty ? "—" : value}
      </div>
    </div>
  )
}

const actionLabels: Record<string, string> = {
  UPLOAD: "Uploaded",
  PRESIGN_UPLOAD: "Uploaded (presigned)",
  DOWNLOAD: "Downloaded",
  DOWNLOAD_FAILED: "Download failed",
  PRESIGN_DOWNLOAD: "Download link issued",
  DELETE: "Deleted",
}

export function FilePreviewCard({
  file,
  open,
  onClose,
}: {
  file: DepotFile
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const isImage = file.content_type.toLowerCase().startsWith("image/")
  const logsQuery = useQuery({
    queryKey: ["accessLogs", file.id],
    queryFn: () => listFileAccessLogs(file.bucket_name, file.id),
    enabled: open,
  })
  const previewQuery = useQuery({
    queryKey: ["filePreview", file.id],
    queryFn: () => createDownloadURL(file.bucket_name, file.id),
    enabled: open && isImage,
    retry: false,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
  const visibleLogs = (logsQuery.data ?? []).slice(0, 5)
  const identityDirectory = useIdentityDirectory([
    file.created_by_entity_id,
    ...visibleLogs.map((log) => log.entity_id),
  ])
  const applicationDirectory = useApplicationDirectory([
    file.created_by_client_id,
    ...visibleLogs.map((log) => log.client_id),
  ])

  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)

  async function handleDownload() {
    setDownloadProgress(0)
    try {
      await downloadFile(file.id, setDownloadProgress)
    } catch (error) {
      toast.error(errorMessage(error, "Download failed"))
    } finally {
      setDownloadProgress(null)
      void queryClient.invalidateQueries({ queryKey: ["accessLogs", file.id] })
      void queryClient.invalidateQueries({ queryKey: ["activity"] })
    }
  }

  return (
    <Card
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "max-h-[70vh] w-full min-w-0 gap-0 overflow-y-auto py-0 transition-[opacity,translate,scale,box-shadow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none xl:max-h-[calc(100vh-8rem)]",
        open
          ? "translate-x-0 scale-100 opacity-100 shadow-xl starting:translate-x-10 starting:scale-[0.985] starting:opacity-0 starting:shadow-none"
          : "pointer-events-none translate-x-10 scale-[0.985] opacity-0 shadow-none",
      )}
    >
      <div className="sticky top-0 z-10 border-b border-border/70 bg-card/95 p-4 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 break-all font-mono text-sm font-medium">{file.id}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="-mt-1 -mr-1 shrink-0"
          >
            <X className="size-4" />
            <span className="sr-only">Close file preview</span>
          </Button>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-muted-foreground">
          {file.public ? (
            <Badge className="bg-gr-purple">
              <Globe className="size-3" /> Public
            </Badge>
          ) : (
            <Badge variant="secondary">
              <Lock className="size-3" /> Private
            </Badge>
          )}
          <span className="truncate text-xs">{file.original_name || "unnamed"}</span>
        </div>
      </div>

      <div className="space-y-4 p-4 pb-6">
        {isImage && (
          <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/20">
            {previewQuery.isPending ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading preview
              </div>
            ) : previewQuery.isError ? (
              <p className="px-4 text-center text-xs text-muted-foreground">
                Preview unavailable
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="flex w-full cursor-zoom-in items-center justify-center"
                aria-label={`Open ${file.original_name || file.id} full screen`}
              >
                <img
                  src={previewQuery.data.url}
                  alt={file.original_name || file.id}
                  className="max-h-72 w-full object-contain"
                />
              </button>
            )}
          </div>
        )}

        {previewQuery.data && (
          <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <DialogContent className="flex h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] items-center justify-center overflow-hidden border-white/15 bg-black/95 p-4 sm:max-w-[calc(100vw-2rem)]">
              <DialogTitle className="sr-only">
                {file.original_name || file.id}
              </DialogTitle>
              <img
                src={previewQuery.data.url}
                alt={file.original_name || file.id}
                className="h-auto max-h-full w-auto max-w-full object-contain"
              />
            </DialogContent>
          </Dialog>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={handleDownload} disabled={downloadProgress !== null}>
            {downloadProgress === null ? (
              <Download className="size-4" />
            ) : (
              <Loader2 className="size-4 animate-spin" />
            )}
            {downloadProgress === null ? "Download" : `${downloadProgress}%`}
          </Button>
        </div>

        <Separator />

        <div>
          <Row label="Original name" value={file.original_name} />
          <Row label="Path" value={file.path} mono />
          <Row label="Content type" value={file.content_type} />
          <Row label="Size" value={formatBytes(file.size_bytes)} />
          <Row label="Storage backend" value={file.storage_backend} mono />
          <Row
            label="Uploaded by"
            value={
              <IdentityDisplay
                entityID={file.created_by_entity_id}
                identity={identityDirectory.byID.get(file.created_by_entity_id)}
                loading={identityDirectory.isLoading}
                size="sm"
                showDetails={false}
              />
            }
          />
          <Row
            label="Uploaded via"
            value={
              <ApplicationDisplay
                clientID={file.created_by_client_id}
                application={applicationDirectory.byClientID.get(file.created_by_client_id)}
                size="sm"
                showClientID={false}
              />
            }
          />
          <Row label="Created" value={new Date(file.created_at).toLocaleString()} />
          <Row label="Updated" value={new Date(file.updated_at).toLocaleString()} />
        </div>

        {file.tags && Object.keys(file.tags).length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(file.tags).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="font-mono text-xs">
                    {key}={value}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div>
          <p className="mb-2 text-sm font-medium">Recent activity</p>
          {logsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : (logsQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No recorded activity.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {visibleLogs.map((log) => {
                const failed = log.action === "DOWNLOAD_FAILED"
                const actorName = log.public
                  ? "Anonymous"
                  : identityDirectory.byID.get(log.entity_id)?.name || log.entity_id || "Unknown"
                const applicationName = log.client_id
                  ? applicationDirectory.byClientID.get(log.client_id)?.name || log.client_id
                  : ""

                return (
                  <li key={log.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full bg-gr-purple",
                            failed && "bg-destructive",
                          )}
                        />
                        <p className={cn("font-medium", failed && "text-destructive")}>
                          {actionLabels[log.action] ?? log.action}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate pl-3.5 text-muted-foreground">
                        {actorName}
                        {applicationName && ` via ${applicationName}`}
                      </p>
                    </div>
                    <time className="shrink-0 tabular-nums text-muted-foreground">
                      {new Date(log.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
