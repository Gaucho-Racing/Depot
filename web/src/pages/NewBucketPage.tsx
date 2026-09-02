import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { ApplicationAccessPicker, type ApplicationAccess } from "@/components/ApplicationPicker"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createBucket,
  createBucketGrant,
  errorMessage,
  listStorageBackends,
} from "@/lib/depot"

const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/

export default function NewBucketPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [allowPublicFiles, setAllowPublicFiles] = useState(false)
  const [allowAuthenticatedRead, setAllowAuthenticatedRead] = useState(false)
  const [selectedPrimaryStorageBackend, setSelectedPrimaryStorageBackend] = useState("")
  const [grants, setGrants] = useState<ApplicationAccess[]>([])

  const backendsQuery = useQuery({
    queryKey: ["storage-backends"],
    queryFn: listStorageBackends,
  })
  const enabledBackends = (backendsQuery.data ?? []).filter((backend) => backend.enabled)
  const defaultBackend = enabledBackends.find((backend) => backend.default)
  const primaryStorageBackend = selectedPrimaryStorageBackend || defaultBackend?.name || ""

  const trimmedName = name.trim()
  const nameError =
    trimmedName === "" || NAME_PATTERN.test(trimmedName)
      ? ""
      : "3–63 lowercase letters, numbers, and hyphens, starting and ending with a letter or number."

  const createMutation = useMutation({
    mutationFn: async () => {
      const bucket = await createBucket({
        name: trimmedName,
        description: description.trim(),
        primary_storage_backend: primaryStorageBackend,
        allow_public_files: allowPublicFiles,
        allow_authenticated_read: allowAuthenticatedRead,
      })

      // The bucket has to exist before its grants can reference it, so a grant
      // that fails leaves a real bucket behind. Report those rather than
      // rolling back — the bucket page can retry them individually.
      const failed: string[] = []
      for (const grant of grants) {
        try {
          await createBucketGrant(bucket.name, {
            client_id: grant.client_id,
            description: "",
            access: grant.access,
          })
        } catch {
          failed.push(grant.client_id)
        }
      }
      return { bucket, failed }
    },
    onSuccess: ({ bucket, failed }) => {
      void queryClient.invalidateQueries({ queryKey: ["buckets"] })
      if (failed.length > 0) {
        toast.warning(
          `Bucket ${bucket.name} created, but access could not be granted to ${failed.join(", ")}`,
        )
      } else {
        toast.success(`Bucket ${bucket.name} created`)
      }
      void navigate(`/buckets/${bucket.name}`)
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to create bucket")),
  })

  const canSubmit =
    trimmedName !== "" &&
    nameError === "" &&
    primaryStorageBackend !== "" &&
    !backendsQuery.isLoading &&
    !backendsQuery.isError &&
    !createMutation.isPending

  return (
    <PageContainer className="max-w-3xl">
      <Link
        to="/buckets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Buckets
      </Link>

      <PageHeader
        title="New bucket"
        description="Buckets namespace files per application or team."
      />

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) createMutation.mutate()
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>The name becomes part of every object's storage key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bucket-name">Name</Label>
              <Input
                id="bucket-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="mapache-avatars"
                autoComplete="off"
                autoFocus
                aria-invalid={nameError !== ""}
              />
              <p className={nameError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {nameError || "Lowercase letters, numbers, and hyphens. Cannot be changed later."}
              </p>
            </div>

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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardDescription>
              The primary backend stores every file uploaded to this bucket and cannot be changed
              after creation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Primary storage backend</Label>
            <Select
              value={primaryStorageBackend}
              onValueChange={setSelectedPrimaryStorageBackend}
              disabled={backendsQuery.isLoading || enabledBackends.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    backendsQuery.isLoading ? "Loading storage backends..." : "Select a backend"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {enabledBackends.map((backend) => (
                  <SelectItem key={backend.id} value={backend.name}>
                    {backend.name} — {backend.bucket} ({backend.region})
                    {backend.default ? " · Default" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {backendsQuery.isError && (
              <p className="text-xs text-destructive">Storage backends could not be loaded.</p>
            )}
            {!backendsQuery.isLoading && !backendsQuery.isError && enabledBackends.length === 0 && (
              <p className="text-xs text-destructive">
                Create and enable a storage backend before creating a bucket.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Application access</CardTitle>
            <CardDescription>
              Which applications may read or write files here. Depot admins always have access;
              everything else needs a grant. You can change this any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowAuthenticatedRead}
                onChange={(event) => setAllowAuthenticatedRead(event.target.checked)}
                className="mt-0.5 size-4 accent-(--color-gr-purple)"
              />
              <span>
                Readable by any authenticated application
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Any caller with a valid Sentinel token can download from this bucket. Uploads
                  still need a write grant below.
                </span>
              </span>
            </label>
            <ApplicationAccessPicker
              value={grants}
              onChange={setGrants}
              readIsRedundant={allowAuthenticatedRead}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Public files</CardTitle>
            <CardDescription>
              Files are private unless marked public at upload. Turning this off revokes anonymous
              access to every public file in the bucket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowPublicFiles}
                onChange={(event) => setAllowPublicFiles(event.target.checked)}
                className="size-4 accent-(--color-gr-purple)"
              />
              Allow files here to be downloaded without a token
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => void navigate("/buckets")}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {createMutation.isPending ? "Creating..." : "Create bucket"}
          </Button>
        </div>
      </form>
    </PageContainer>
  )
}
