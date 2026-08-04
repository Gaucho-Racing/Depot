import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CloudUpload } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Truck } from "@/components/freight"
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
          <DialogTitle className="stencil">Inbound cargo</DialogTitle>
          <DialogDescription>
            Receiving into bay <span className="font-mono">{bucket}</span>. Freight over 100MB
            should come through the presigned dock door (API flow).
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
              "w-full overflow-hidden rounded-lg border text-center transition-colors",
              dragging ? "border-gr-purple bg-accent" : "border-border hover:border-gr-purple/50",
            )}
          >
            <span className={cn("hazard-tape block h-2 w-full transition-opacity", dragging ? "opacity-100" : "opacity-50")} />
            <span className="flex flex-col items-center justify-center gap-2 px-4 py-7">
              <CloudUpload className="size-6 text-muted-foreground" />
              {file ? (
                <span className="text-sm">
                  <span className="font-medium">{file.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    WT {formatBytes(file.size)}
                  </span>
                </span>
              ) : (
                <>
                  <span className="stencil text-sm text-muted-foreground">Dock door open</span>
                  <span className="text-xs text-muted-foreground">
                    Back cargo up here — drop a file or click to browse
                  </span>
                </>
              )}
            </span>
            <span className={cn("hazard-tape block h-2 w-full transition-opacity", dragging ? "opacity-100" : "opacity-50")} />
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
            Public freight — anyone can download, no clearance required
          </label>

          {uploadMutation.isPending && (
            <div className="asphalt relative h-14 overflow-hidden rounded-md">
              <div className="road-line absolute inset-x-0 top-1/2 h-0.5" />
              <div className="hazard-tape absolute inset-y-0 right-0 w-2.5" />
              <div
                className="absolute bottom-1 transition-all duration-500 ease-out"
                style={{ left: `calc(${progress}% - ${Math.round(progress * 1.15)}px)` }}
              >
                <span className="block -scale-x-100">
                  <Truck className="h-8 w-auto" />
                </span>
              </div>
              <span className="stencil absolute left-2 top-1.5 text-[10px] text-white/80">
                Backing in · {progress}%
              </span>
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
            {uploadMutation.isPending ? `Receiving ${progress}%` : "Receive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
