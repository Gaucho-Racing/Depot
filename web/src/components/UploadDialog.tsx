import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CloudUpload } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
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

export function UploadDialog({ trigger, bucket }: { trigger: ReactNode; bucket: string }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [path, setPath] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: () =>
      uploadFile(bucket, { file: file!, path: path.trim(), public: isPublic }, setProgress),
    onSuccess: (created) => {
      toast.success(`Uploaded ${created.name}`)
      void queryClient.invalidateQueries({ queryKey: ["files", bucket] })
      void queryClient.invalidateQueries({ queryKey: ["stats"] })
      setOpen(false)
      reset()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Upload failed"))
      setProgress(0)
    },
  })

  function reset() {
    setFile(null)
    setPath("")
    setIsPublic(false)
    setProgress(0)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!uploadMutation.isPending) {
          setOpen(next)
          if (!next) reset()
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload file</DialogTitle>
          <DialogDescription>
            Upload into <span className="font-mono">{bucket}</span>. Files over 100MB should use
            the presigned API flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const dropped = event.dataTransfer.files?.[0]
              if (dropped) setFile(dropped)
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
              dragging ? "border-gr-purple bg-accent" : "border-border hover:border-gr-purple/50",
            )}
          >
            <CloudUpload className="size-6 text-muted-foreground" />
            {file ? (
              <div className="text-sm">
                <span className="font-medium">{file.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Drop a file here or click to browse
              </p>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />

          <div className="space-y-2">
            <Label htmlFor="upload-path">Path (optional)</Label>
            <Input
              id="upload-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="telemetry/run-42"
              autoComplete="off"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="size-4 accent-(--color-gr-purple)"
            />
            Publicly accessible (no auth required to download)
          </label>

          {uploadMutation.isPending && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gr-purple to-gr-pink transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={uploadMutation.isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!file || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            {uploadMutation.isPending ? `Uploading ${progress}%` : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
