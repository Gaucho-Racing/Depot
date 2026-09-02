import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { BucketGrantsCard } from "@/components/BucketGrantsCard"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { deleteBucket, errorMessage, getBucket, updateBucket, type Bucket } from "@/lib/depot"

function BucketSettingsForm({ bucket }: { bucket: Bucket }) {
  const queryClient = useQueryClient()
  const [description, setDescription] = useState(bucket.description)
  const [allowAuthenticatedRead, setAllowAuthenticatedRead] = useState(
    bucket.allow_authenticated_read,
  )
  const [allowPublicFiles, setAllowPublicFiles] = useState(bucket.allow_public_files)

  const dirty =
    description !== bucket.description ||
    allowAuthenticatedRead !== bucket.allow_authenticated_read ||
    allowPublicFiles !== bucket.allow_public_files

  const saveMutation = useMutation({
    mutationFn: () =>
      updateBucket(bucket.name, {
        description: description.trim(),
        allow_authenticated_read: allowAuthenticatedRead,
        allow_public_files: allowPublicFiles,
      }),
    onSuccess: () => {
      toast.success("Bucket updated")
      void queryClient.invalidateQueries({ queryKey: ["bucket", bucket.name] })
      void queryClient.invalidateQueries({ queryKey: ["buckets"] })
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to update bucket")),
  })

  function reset() {
    setDescription(bucket.description)
    setAllowAuthenticatedRead(bucket.allow_authenticated_read)
    setAllowPublicFiles(bucket.allow_public_files)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          The bucket name is part of every object's storage key and cannot change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="bucket-primary-storage-backend">Primary storage backend</Label>
          <Input
            id="bucket-primary-storage-backend"
            value={bucket.primary_storage_backend}
            disabled
          />
          <p className="text-xs text-muted-foreground">
            The primary storage backend cannot be changed after bucket creation.
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

        <div className="space-y-3">
          <Label>Access</Label>
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
                Any caller with a valid Sentinel token can download from this bucket. Uploads still
                need a write grant.
              </span>
            </span>
          </label>
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
                Files stay private unless marked public at upload. Turning this off revokes
                anonymous access to every public file in the bucket.
              </span>
            </span>
          </label>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || saveMutation.isPending}
          onClick={reset}
        >
          Reset
        </Button>
        <Button
          type="button"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </CardFooter>
    </Card>
  )
}

export default function EditBucketPage() {
  const { bucketName = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const bucketQuery = useQuery({
    queryKey: ["bucket", bucketName],
    queryFn: () => getBucket(bucketName),
  })
  const bucket = bucketQuery.data

  const deleteMutation = useMutation({
    mutationFn: () => deleteBucket(bucketName),
    onSuccess: () => {
      toast.success("Bucket deleted")
      void queryClient.invalidateQueries({ queryKey: ["buckets"] })
      void navigate("/buckets")
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to delete bucket"))
      throw error
    },
  })

  return (
    <PageContainer className="max-w-3xl">
      <Link
        to={`/buckets/${bucketName}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {bucketName}
      </Link>

      <PageHeader title="Bucket settings" description={bucketName} />

      {bucketQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {bucket && <BucketSettingsForm key={bucket.id} bucket={bucket} />}

          <BucketGrantsCard bucketName={bucketName} />

          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Delete bucket</CardTitle>
              <CardDescription>
                Only empty buckets can be deleted, and files cannot be removed — so a bucket that
                has ever been written to is permanent.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-destructive">
                    <Trash2 className="size-4" />
                    Delete {bucketName}
                  </Button>
                }
                title={`Delete ${bucketName}?`}
                description="This also revokes every application grant on the bucket. It cannot be undone."
                confirmLabel="Delete bucket"
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  await deleteMutation.mutateAsync()
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  )
}
