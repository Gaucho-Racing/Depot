import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  CloudUpload,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  TriangleAlert,
  X,
} from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage, formatBytes, uploadFile } from "@/lib/depot"
import { cn } from "@/lib/utils"

type UploadStatus = "pending" | "uploading" | "done" | "error"

type PendingUpload = {
  key: string
  file: File
  previewUrl?: string
  status: UploadStatus
  progress: number
  error?: string
}

// Identity for dedupe and for React keys. Two files picked from different
// folders can share a name, so size and mtime are part of it.
function uploadKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  if (type.startsWith("video/")) return <FileVideo className={className} />
  if (type.startsWith("audio/")) return <FileAudio className={className} />
  if (type.startsWith("text/") || type === "application/json")
    return <FileText className={className} />
  if (type.includes("zip") || type.includes("tar") || type.includes("gzip"))
    return <FileArchive className={className} />
  return <FileIcon className={className} />
}

function UploadCard({
  item,
  onRemove,
}: {
  item: PendingUpload
  onRemove: () => void
}) {
  const busy = item.status === "uploading"

  return (
    <li className="group relative overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="relative flex h-24 items-center justify-center bg-muted/40">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <TypeIcon type={item.file.type} className="size-7 text-muted-foreground" />
        )}

        {item.status === "done" && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Check className="size-6 text-gr-purple" />
          </span>
        )}
        {item.status === "error" && (
          <span className="absolute inset-0 flex items-center justify-center bg-destructive/15">
            <TriangleAlert className="size-6 text-destructive" />
          </span>
        )}

        {!busy && item.status !== "done" && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.file.name}`}
            className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md bg-background/85 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {item.status === "error"
            ? (item.error ?? "Upload failed")
            : formatBytes(item.file.size)}
        </p>
      </div>

      {busy && (
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-gr-purple to-gr-pink transition-all"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}
    </li>
  )
}

export function UploadDialog({
  trigger,
  bucket,
  allowPublicFiles,
}: {
  trigger: ReactNode
  bucket: string
  allowPublicFiles: boolean
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PendingUpload[]>([])
  const [path, setPath] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Object URLs are only released on remove, reset, or unmount, so hold the
  // live set in a ref rather than chasing it through render.
  const previewUrls = useRef(new Set<string>())
  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    setItems((current) => {
      const seen = new Set(current.map((item) => item.key))
      const additions: PendingUpload[] = []
      for (const file of Array.from(files)) {
        const key = uploadKey(file)
        if (seen.has(key)) continue
        seen.add(key)
        let previewUrl: string | undefined
        if (file.type.startsWith("image/")) {
          previewUrl = URL.createObjectURL(file)
          previewUrls.current.add(previewUrl)
        }
        additions.push({ key, file, previewUrl, status: "pending", progress: 0 })
      }
      return [...current, ...additions]
    })
  }

  function removeItem(key: string) {
    setItems((current) => {
      const target = current.find((item) => item.key === key)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
        previewUrls.current.delete(target.previewUrl)
      }
      return current.filter((item) => item.key !== key)
    })
  }

  function reset() {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current.clear()
    setItems([])
    setPath("")
    setIsPublic(false)
    setDragging(false)
  }

  function patch(key: string, changes: Partial<PendingUpload>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    )
  }

  // Multi-file upload is a client-side convenience only — each file is its own
  // request. Sequential so progress is unambiguous and a slow batch doesn't
  // open a dozen concurrent connections.
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const queue = items.filter((item) => item.status !== "done")
      let uploaded = 0
      const failed: string[] = []

      for (const item of queue) {
        patch(item.key, { status: "uploading", progress: 0, error: undefined })
        try {
          await uploadFile(
            bucket,
            { file: item.file, path: path.trim(), public: isPublic },
            (percent) => patch(item.key, { progress: percent }),
          )
          patch(item.key, { status: "done", progress: 100 })
          uploaded++
        } catch (error) {
          patch(item.key, {
            status: "error",
            error: errorMessage(error, "Upload failed"),
          })
          failed.push(item.file.name)
        }
      }
      return { uploaded, failed }
    },
    onSuccess: ({ uploaded, failed }) => {
      void queryClient.invalidateQueries({ queryKey: ["files", bucket] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })

      if (uploaded > 0) {
        toast.success(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}`)
      }
      if (failed.length > 0) {
        toast.error(`Failed to upload ${failed.join(", ")}`)
        return
      }
      setOpen(false)
      reset()
    },
  })

  const busy = uploadMutation.isPending
  const remaining = items.filter((item) => item.status !== "done").length
  const doneCount = items.filter((item) => item.status === "done").length

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            Upload into <span className="font-mono">{bucket}</span>. Each file is sent as its own
            request; anything over 100MB needs the presigned API flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              addFiles(event.dataTransfer.files)
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors disabled:opacity-60",
              dragging ? "border-gr-purple bg-accent" : "border-border hover:border-gr-purple/50",
            )}
          >
            <CloudUpload className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? "Drop files here or click to browse"
                : "Drop more files or click to add"}
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {items.length} file{items.length === 1 ? "" : "s"} selected
                  {doneCount > 0 && ` · ${doneCount} uploaded`}
                </p>
                {!busy && doneCount < items.length && (
                  <button
                    type="button"
                    onClick={reset}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                {items.map((item) => (
                  <UploadCard
                    key={item.key}
                    item={item}
                    onRemove={() => removeItem(item.key)}
                  />
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="upload-path">Path (optional)</Label>
            <Input
              id="upload-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="telemetry/run-42"
              autoComplete="off"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              A searchable label applied to every file in this batch. It does not affect where the
              object is stored.
            </p>
          </div>

          {allowPublicFiles ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                disabled={busy}
                className="size-4 accent-(--color-gr-purple)"
              />
              Publicly accessible (no auth required to download)
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              This bucket does not allow public files. Downloads always require a token.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={remaining === 0 || busy}
            onClick={() => uploadMutation.mutate()}
          >
            {busy
              ? `Uploading ${doneCount + 1}/${items.length}`
              : `Upload ${remaining} file${remaining === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
