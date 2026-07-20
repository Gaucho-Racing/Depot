import { useQuery } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
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
import { listSentinelGroups, type Bucket, type BucketInput } from "@/lib/depot"
import { cn } from "@/lib/utils"

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
  const [groups, setGroups] = useState<string[]>(bucket?.access_group_names ?? [])

  const groupsQuery = useQuery({
    queryKey: ["sentinelGroups"],
    queryFn: listSentinelGroups,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  function toggleGroup(groupName: string) {
    setGroups((current) =>
      current.includes(groupName)
        ? current.filter((g) => g !== groupName)
        : [...current, groupName],
    )
  }

  async function handleSubmit() {
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), access_group_names: groups })
      setOpen(false)
      if (!bucket) {
        setName("")
        setDescription("")
        setGroups([])
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
              ? "Update the bucket description and access groups."
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
            <Label>Access groups</Label>
            <p className="text-xs text-muted-foreground">
              Members of these Sentinel groups can read and write this bucket. Leave empty to
              restrict access to admins and service scopes.
            </p>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {groupsQuery.isLoading ? (
                <span className="text-xs text-muted-foreground">Loading groups...</span>
              ) : (
                (groupsQuery.data ?? []).map((group) => {
                  const selected = groups.includes(group.name)
                  return (
                    <button key={group.id} type="button" onClick={() => toggleGroup(group.name)}>
                      <Badge
                        variant={selected ? "default" : "outline"}
                        className={cn("cursor-pointer", selected && "bg-gr-purple")}
                      >
                        {group.name}
                      </Badge>
                    </button>
                  )
                })
              )}
            </div>
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
