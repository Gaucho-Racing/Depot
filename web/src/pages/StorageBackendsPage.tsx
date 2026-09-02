import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Database, Loader2, Pencil, Plug, Plus, Star, Trash2 } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { useAuth } from "@/lib/auth"
import {
  createStorageBackend,
  deleteStorageBackend,
  errorMessage,
  listStorageBackends,
  listStorageProviders,
  pingStorageBackend,
  updateStorageBackend,
  type ProviderRegions,
  type StorageBackend,
  type StorageBackendInput,
  type StorageProvider,
} from "@/lib/depot"

const CUSTOM_REGION = "__custom__"

type FormState = {
  name: string
  provider: StorageProvider
  regionChoice: string
  customRegion: string
  bucket: string
  endpoint: string
  forcePathStyle: boolean
  accessKeyID: string
  secretAccessKey: string
  isDefault: boolean
  enabled: boolean
}

function emptyForm(): FormState {
  return {
    name: "",
    provider: "aws-s3",
    regionChoice: "",
    customRegion: "",
    bucket: "",
    endpoint: "",
    forcePathStyle: false,
    accessKeyID: "",
    secretAccessKey: "",
    isDefault: false,
    enabled: true,
  }
}

function formFromBackend(backend: StorageBackend, catalog: ProviderRegions[]): FormState {
  const providerRegions = catalog.find((entry) => entry.provider === backend.provider)?.regions ?? []
  const isKnown = providerRegions.includes(backend.region)
  return {
    name: backend.name,
    provider: backend.provider,
    regionChoice: backend.region === "" ? "" : isKnown ? backend.region : CUSTOM_REGION,
    customRegion: isKnown ? "" : backend.region,
    bucket: backend.bucket,
    endpoint: backend.endpoint,
    forcePathStyle: backend.force_path_style,
    accessKeyID: "",
    secretAccessKey: "",
    isDefault: backend.default,
    enabled: backend.enabled,
  }
}

function BackendFormDialog({
  trigger,
  title,
  backend,
  catalog,
  isPending,
  onSubmit,
}: {
  trigger: ReactNode
  title: string
  backend?: StorageBackend
  catalog: ProviderRegions[]
  isPending: boolean
  onSubmit: (input: StorageBackendInput) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const isEdit = !!backend

  const providerInfo = catalog.find((entry) => entry.provider === form.provider)
  const region = form.regionChoice === CUSTOM_REGION ? form.customRegion.trim() : form.regionChoice
  const regionMissing = !!providerInfo?.region_required && region === ""
  const valid =
    form.name.trim() !== "" &&
    form.bucket.trim() !== "" &&
    !regionMissing &&
    (isEdit || (form.accessKeyID.trim() !== "" && form.secretAccessKey.trim() !== ""))

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function submit() {
    const input: StorageBackendInput = {
      provider: form.provider,
      region,
      bucket: form.bucket.trim(),
      endpoint: form.endpoint.trim(),
      force_path_style: form.forcePathStyle,
      default: form.isDefault,
      enabled: form.enabled,
    }
    if (!isEdit) {
      input.name = form.name.trim()
    }
    if (form.accessKeyID.trim() !== "") {
      input.access_key_id = form.accessKeyID.trim()
    }
    if (form.secretAccessKey.trim() !== "") {
      input.secret_access_key = form.secretAccessKey.trim()
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
          setForm(backend ? formFromBackend(backend, catalog) : emptyForm())
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Credentials are only overwritten when new values are entered."
              : "Buckets must already exist at the provider — Depot never provisions cloud resources."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sb-name">Name</Label>
              <Input
                id="sb-name"
                value={form.name}
                disabled={isEdit}
                onChange={(event) => set("name", event.target.value)}
                placeholder="aws-usw2"
                autoComplete="off"
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">Names are immutable — files reference them.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={form.provider}
                onValueChange={(value) => {
                  set("provider", value as StorageProvider)
                  set("regionChoice", "")
                  set("customRegion", "")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((entry) => (
                    <SelectItem key={entry.provider} value={entry.provider}>
                      {entry.provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Region
                {providerInfo?.region_required ? "" : " (optional)"}
              </Label>
              <Select value={form.regionChoice} onValueChange={(value) => set("regionChoice", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {(providerInfo?.regions ?? []).map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {entry}
                    </SelectItem>
                  ))}
                  {providerInfo?.allows_custom && (
                    <SelectItem value={CUSTOM_REGION}>Custom...</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.regionChoice === CUSTOM_REGION && (
                <Input
                  value={form.customRegion}
                  onChange={(event) => set("customRegion", event.target.value)}
                  placeholder="custom-region-1"
                  autoComplete="off"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-bucket">Bucket</Label>
              <Input
                id="sb-bucket"
                value={form.bucket}
                onChange={(event) => set("bucket", event.target.value)}
                placeholder="gr-depot-dev"
                autoComplete="off"
              />
            </div>
          </div>

          {form.provider === "s3-compatible" && (
            <div className="space-y-2">
              <Label htmlFor="sb-endpoint">Endpoint</Label>
              <Input
                id="sb-endpoint"
                value={form.endpoint}
                onChange={(event) => set("endpoint", event.target.value)}
                placeholder="https://<account>.r2.cloudflarestorage.com"
                autoComplete="off"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.forcePathStyle}
                  onChange={(event) => set("forcePathStyle", event.target.checked)}
                  className="size-4 accent-(--color-gr-purple)"
                />
                Force path-style addressing (MinIO-style endpoints)
              </label>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sb-access-key">Access key ID</Label>
              <Input
                id="sb-access-key"
                value={form.accessKeyID}
                onChange={(event) => set("accessKeyID", event.target.value)}
                placeholder={isEdit ? "(unchanged)" : ""}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-secret-key">Secret access key</Label>
              <Input
                id="sb-secret-key"
                type="password"
                value={form.secretAccessKey}
                onChange={(event) => set("secretAccessKey", event.target.value)}
                placeholder={isEdit ? "(unchanged)" : ""}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => set("isDefault", event.target.checked)}
                className="size-4 accent-(--color-gr-purple)"
              />
              Default backend for new uploads
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => set("enabled", event.target.checked)}
                className="size-4 accent-(--color-gr-purple)"
              />
              Enabled
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!valid || isPending} onClick={() => void submit()}>
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Add backend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function StorageBackendsPage() {
  const queryClient = useQueryClient()
  const { isAdmin } = useAuth()

  const backendsQuery = useQuery({ queryKey: ["storage-backends"], queryFn: listStorageBackends })
  const providersQuery = useQuery({ queryKey: ["storage-providers"], queryFn: listStorageProviders })

  const catalog = useMemo(() => providersQuery.data ?? [], [providersQuery.data])
  const backends = backendsQuery.data ?? []

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["storage-backends"] })
  }

  const createMutation = useMutation({
    mutationFn: (input: StorageBackendInput) => createStorageBackend(input),
    onSuccess: (backend) => {
      toast.success(`Storage backend ${backend.name} added`)
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to add storage backend"))
      throw error
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ name, input }: { name: string; input: StorageBackendInput }) =>
      updateStorageBackend(name, input),
    onSuccess: (backend) => {
      toast.success(`Storage backend ${backend.name} updated`)
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to update storage backend"))
      throw error
    },
  })

  const pingMutation = useMutation({
    mutationFn: (name: string) => pingStorageBackend(name),
    onSuccess: (result, name) => {
      if (result.ok) {
        toast.success(`${name} passed: wrote, read back and deleted a test object`)
        return
      }
      toast.error(result.error ?? `${name} failed the connection test`, { duration: 12000 })
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to run the connection test"))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteStorageBackend(name),
    onSuccess: () => {
      toast.success("Storage backend deleted")
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to delete storage backend"))
      throw error
    },
  })

  return (
    <PageContainer>
      <PageHeader
        title="Storage Backends"
        description="Where file objects physically live. Buckets and files reference these by name."
        action={
          isAdmin ? (
            <BackendFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Backend
                </Button>
              }
              title="Add storage backend"
              catalog={catalog}
              isPending={createMutation.isPending}
              onSubmit={async (input) => {
                await createMutation.mutateAsync(input)
              }}
            />
          ) : undefined
        }
      />

      {backendsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : backends.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Database className="size-5 text-muted-foreground" />
            </div>
            <div className="mt-4 text-sm font-medium">No storage backends configured</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {backends.map((backend) => (
                <li key={backend.id} className="flex flex-wrap items-center gap-3 px-4 py-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gr-purple to-gr-pink text-white">
                    <Database className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{backend.name}</span>
                      {backend.default && (
                        <Badge className="bg-gr-purple">
                          <Star className="size-3" /> Default
                        </Badge>
                      )}
                      {!backend.enabled && (
                        <Badge variant="outline" className="border-destructive/50 text-destructive">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {backend.provider}
                      {backend.region && ` · ${backend.region}`} · {backend.bucket}
                      {backend.endpoint && ` · ${backend.endpoint}`}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={pingMutation.isPending}
                        onClick={() => pingMutation.mutate(backend.name)}
                      >
                        {pingMutation.isPending && pingMutation.variables === backend.name ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plug className="size-4" />
                        )}
                        <span className="sr-only">Test {backend.name}</span>
                      </Button>
                      <BackendFormDialog
                        trigger={
                          <Button variant="outline" size="icon">
                            <Pencil className="size-4" />
                            <span className="sr-only">Edit {backend.name}</span>
                          </Button>
                        }
                        title={`Edit ${backend.name}`}
                        backend={backend}
                        catalog={catalog}
                        isPending={updateMutation.isPending}
                        onSubmit={async (input) => {
                          await updateMutation.mutateAsync({ name: backend.name, input })
                        }}
                      />
                      <ConfirmDialog
                        trigger={
                          <Button variant="outline" size="icon" className="text-destructive">
                            <Trash2 className="size-4" />
                            <span className="sr-only">Delete {backend.name}</span>
                          </Button>
                        }
                        title={`Delete ${backend.name}?`}
                        description="Backends can only be deleted when no buckets or files reference them."
                        confirmLabel="Delete backend"
                        isPending={deleteMutation.isPending}
                        onConfirm={async () => {
                          await deleteMutation.mutateAsync(backend.name)
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  )
}
