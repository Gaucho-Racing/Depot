import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppWindow, Pencil, Plus, Trash2 } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  createBucketGrant,
  deleteBucketGrant,
  errorMessage,
  listBucketGrants,
  updateBucketGrant,
  type BucketAccess,
  type BucketGrant,
  type BucketGrantInput,
} from "@/lib/depot"

function GrantFormDialog({
  trigger,
  grant,
  isPending,
  onSubmit,
}: {
  trigger: ReactNode
  grant?: BucketGrant
  isPending: boolean
  onSubmit: (input: BucketGrantInput) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [clientID, setClientID] = useState("")
  const [description, setDescription] = useState("")
  const [access, setAccess] = useState<BucketAccess>("READ")
  const isEdit = !!grant

  const valid = isEdit || clientID.trim() !== ""

  async function submit() {
    const input: BucketGrantInput = { description: description.trim(), access }
    if (!isEdit) {
      input.client_id = clientID.trim()
    }
    await onSubmit(input)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setClientID(grant?.client_id ?? "")
          setDescription(grant?.description ?? "")
          setAccess(grant?.access ?? "READ")
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit access for ${grant.client_id}` : "Grant application access"}</DialogTitle>
          <DialogDescription>
            Applications authenticate with their own Sentinel client, so access is granted per
            client ID. Read allows downloads; write also allows uploads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="grant-client-id">Client ID</Label>
            <Input
              id="grant-client-id"
              value={clientID}
              disabled={isEdit}
              onChange={(event) => setClientID(event.target.value)}
              placeholder="the application's Sentinel client_id"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-description">Label (optional)</Label>
            <Input
              id="grant-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Mapache telemetry exporter"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-access">Access</Label>
            <Select value={access} onValueChange={(value) => setAccess(value as BucketAccess)}>
              <SelectTrigger id="grant-access" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="READ">Read — download files</SelectItem>
                <SelectItem value="WRITE">Write — upload and download files</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!valid || isPending} onClick={() => void submit()}>
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BucketGrantsCard({ bucketName }: { bucketName: string }) {
  const queryClient = useQueryClient()

  const grantsQuery = useQuery({
    queryKey: ["grants", bucketName],
    queryFn: () => listBucketGrants(bucketName),
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["grants", bucketName] })
  }

  const createMutation = useMutation({
    mutationFn: (input: BucketGrantInput) => createBucketGrant(bucketName, input),
    onSuccess: (grant) => {
      toast.success(`${grant.client_id} granted ${grant.access.toLowerCase()} access`)
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to grant access"))
      throw error
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ clientID, input }: { clientID: string; input: BucketGrantInput }) =>
      updateBucketGrant(bucketName, clientID, input),
    onSuccess: () => {
      toast.success("Access updated")
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to update access"))
      throw error
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (clientID: string) => deleteBucketGrant(bucketName, clientID),
    onSuccess: () => {
      toast.success("Access revoked")
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to revoke access"))
      throw error
    },
  })

  const grants = grantsQuery.data ?? []

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Application access</CardTitle>
          <CardDescription>
            Which applications may read or write files in this bucket. Humans get access through the
            bucket's groups instead.
          </CardDescription>
        </div>
        <GrantFormDialog
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Grant
            </Button>
          }
          isPending={createMutation.isPending}
          onSubmit={async (input) => {
            await createMutation.mutateAsync(input)
          }}
        />
      </CardHeader>
      <CardContent className="p-0">
        {grantsQuery.isLoading ? (
          <div className="space-y-2 px-6 pb-6">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : grants.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            No applications have access. Files in this bucket are reachable only through the web UI.
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {grants.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-gr-purple to-gr-pink text-white">
                  <AppWindow className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm">{grant.client_id}</span>
                    <Badge variant={grant.access === "WRITE" ? "default" : "secondary"}>
                      {grant.access}
                    </Badge>
                  </div>
                  {grant.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {grant.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <GrantFormDialog
                    trigger={
                      <Button variant="outline" size="icon">
                        <Pencil className="size-4" />
                        <span className="sr-only">Edit access for {grant.client_id}</span>
                      </Button>
                    }
                    grant={grant}
                    isPending={updateMutation.isPending}
                    onSubmit={async (input) => {
                      await updateMutation.mutateAsync({ clientID: grant.client_id, input })
                    }}
                  />
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="icon" className="text-destructive">
                        <Trash2 className="size-4" />
                        <span className="sr-only">Revoke access for {grant.client_id}</span>
                      </Button>
                    }
                    title={`Revoke access for ${grant.client_id}?`}
                    description="The application immediately loses access to this bucket. Files it already uploaded are unaffected."
                    confirmLabel="Revoke access"
                    isPending={deleteMutation.isPending}
                    onConfirm={async () => {
                      await deleteMutation.mutateAsync(grant.client_id)
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
