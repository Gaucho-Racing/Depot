import { useQuery } from "@tanstack/react-query"
import { Download, Globe, Lock } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  createDownloadURL,
  errorMessage,
  formatBytes,
  listFileAccessLogs,
  type DepotFile,
} from "@/lib/depot"

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? "min-w-0 break-all text-right font-mono text-xs" : "min-w-0 truncate text-right"}>
        {value || "—"}
      </span>
    </div>
  )
}

const actionLabels: Record<string, string> = {
  UPLOAD: "Uploaded",
  PRESIGN_UPLOAD: "Uploaded (presigned)",
  DOWNLOAD: "Downloaded",
  PRESIGN_DOWNLOAD: "Download link issued",
  DELETE: "Deleted",
}

export function FileSheet({
  file,
  onClose,
}: {
  file: DepotFile | null
  onClose: () => void
}) {
  const logsQuery = useQuery({
    queryKey: ["accessLogs", file?.id],
    queryFn: () => listFileAccessLogs(file!.bucket_name, file!.id),
    enabled: !!file,
  })

  async function handleDownload() {
    try {
      const { url } = await createDownloadURL(file!.bucket_name, file!.id)
      window.open(url, "_blank", "noopener")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to create download link"))
    }
  }

  return (
    <Sheet open={!!file} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {file && (
          <>
            <SheetHeader>
              <SheetTitle className="break-all font-mono text-base">{file.id}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
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
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDownload}>
                  <Download className="size-4" />
                  Download
                </Button>
              </div>

              <Separator />

              <div>
                <Row label="Original name" value={file.original_name} />
                <Row label="Path" value={file.path} mono />
                <Row label="Content type" value={file.content_type} />
                <Row label="Size" value={formatBytes(file.size_bytes)} />
                <Row label="Storage backend" value={file.storage_backend} mono />
                <Row label="Uploaded by" value={file.created_by_entity_id} mono />
                <Row label="Uploaded via" value={file.created_by_client_id} mono />
                <Row label="Created" value={new Date(file.created_at).toLocaleString()} />
                <Row label="Updated" value={new Date(file.updated_at).toLocaleString()} />
              </div>

              {(file.replicas ?? []).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-sm font-medium">Replicas</p>
                    <ul className="space-y-1.5">
                      {file.replicas.map((replica) => (
                        <li key={replica.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate font-mono">{replica.storage_backend}</span>
                          <span className="flex items-center gap-2">
                            {replica.status === "FAILED" && replica.error && (
                              <span className="max-w-48 truncate text-muted-foreground" title={replica.error}>
                                {replica.error}
                              </span>
                            )}
                            <Badge
                              variant={replica.status === "ACTIVE" ? "secondary" : "outline"}
                              className={
                                replica.status === "FAILED"
                                  ? "border-destructive/50 text-destructive"
                                  : replica.status === "PENDING"
                                    ? "text-muted-foreground"
                                    : undefined
                              }
                            >
                              {replica.status}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

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
                  <ul className="space-y-2">
                    {(logsQuery.data ?? []).slice(0, 20).map((log) => (
                      <li key={log.id} className="flex items-baseline justify-between gap-3 text-xs">
                        <span>
                          {actionLabels[log.action] ?? log.action}
                          {log.public && " (public)"}
                          <span className="ml-1.5 font-mono text-muted-foreground">
                            {log.entity_id || "anonymous"}
                          </span>
                          {log.client_id && (
                            <span className="ml-1.5 font-mono text-muted-foreground">
                              via {log.client_id}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {new Date(log.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
