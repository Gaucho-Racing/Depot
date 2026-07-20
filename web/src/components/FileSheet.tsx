import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Globe, Lock, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/ConfirmDialog"
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
  deleteFile,
  errorMessage,
  formatBytes,
  listFileAccessLogs,
  updateFile,
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
  canWrite,
  onClose,
}: {
  file: DepotFile | null
  canWrite: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const logsQuery = useQuery({
    queryKey: ["accessLogs", file?.id],
    queryFn: () => listFileAccessLogs(file!.bucket_name, file!.id),
    enabled: !!file,
  })

  const publicMutation = useMutation({
    mutationFn: (next: boolean) => updateFile(file!.bucket_name, file!.id, { public: next }),
    onSuccess: (updated) => {
      toast.success(updated.public ? "File is now public" : "File is now private")
      void queryClient.invalidateQueries({ queryKey: ["files", file?.bucket_name] })
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to update file")),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteFile(file!.bucket_name, file!.id),
    onSuccess: () => {
      toast.success("File deleted")
      void queryClient.invalidateQueries({ queryKey: ["files", file?.bucket_name] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })
      onClose()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to delete file"))
      throw error
    },
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
              <SheetTitle className="break-all font-mono text-base">{file.name}</SheetTitle>
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
                <span className="font-mono text-xs">{file.id}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDownload}>
                  <Download className="size-4" />
                  Download
                </Button>
                {canWrite && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={publicMutation.isPending}
                      onClick={() => publicMutation.mutate(!file.public)}
                    >
                      {file.public ? <Lock className="size-4" /> : <Globe className="size-4" />}
                      Make {file.public ? "private" : "public"}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="outline" className="text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      }
                      title={`Delete ${file.name}?`}
                      description="The file is removed from storage permanently. This cannot be undone."
                      confirmLabel="Delete file"
                      isPending={deleteMutation.isPending}
                      onConfirm={async () => {
                        await deleteMutation.mutateAsync()
                      }}
                    />
                  </>
                )}
              </div>

              <Separator />

              <div>
                <Row label="Path" value={file.path} mono />
                <Row label="Content type" value={file.content_type} />
                <Row label="Size" value={formatBytes(file.size_bytes)} />
                <Row label="Checksum" value={file.checksum} mono />
                <Row label="Uploaded by" value={file.created_by_entity_id} mono />
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
                  <ul className="space-y-2">
                    {(logsQuery.data ?? []).slice(0, 20).map((log) => (
                      <li key={log.id} className="flex items-baseline justify-between gap-3 text-xs">
                        <span>
                          {actionLabels[log.action] ?? log.action}
                          {log.public && " (public)"}
                          <span className="ml-1.5 font-mono text-muted-foreground">
                            {log.entity_id || "anonymous"}
                          </span>
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
