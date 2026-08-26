import { useState, type ReactNode } from "react"

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
import { Textarea } from "@/components/ui/textarea"
import { type Bucket, type BucketInput } from "@/lib/depot"

export function BucketFormDialog({
  trigger,
  bucket,
  isPending,
  onSubmit,
}: {
  trigger: ReactNode
  bucket?: Bucket
  isPending: boolean
  onSubmit: (input: BucketInput) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(bucket?.name ?? "")
  const [description, setDescription] = useState(bucket?.description ?? "")
  const [allowPublicFiles, setAllowPublicFiles] = useState(bucket?.allow_public_files ?? false)

  async function handleSubmit() {
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        allow_public_files: allowPublicFiles,
      })
      setOpen(false)
      if (!bucket) {
        setName("")
        setDescription("")
        setAllowPublicFiles(false)
      }
    } catch {
      return
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bucket ? `Edit ${bucket.name}` : "New bucket"}</DialogTitle>
          <DialogDescription>
            {bucket
              ? "Update the bucket description and public file policy. Manage application access from the bucket page."
              : "Buckets namespace files per application or team."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!bucket && (
            <div className="space-y-2">
              <Label htmlFor="bucket-name">Name</Label>
              <Input
                id="bucket-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="mapache-avatars"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                3–63 lowercase letters, numbers, and hyphens. Cannot be changed later.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bucket-description">Description</Label>
            <Textarea
              id="bucket-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What lives in this bucket?"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Public files</Label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowPublicFiles}
                onChange={(event) => setAllowPublicFiles(event.target.checked)}
                className="mt-0.5 size-4 accent-(--color-gr-purple)"
              />
              <span>
                Allow files here to be downloaded without a token
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Files are still private unless marked public at upload. Turning this off revokes
                  anonymous access to every public file in the bucket.
                </span>
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending || (!bucket && !name.trim())}
            onClick={handleSubmit}
          >
            {isPending ? "Saving" : bucket ? "Save changes" : "Create bucket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
