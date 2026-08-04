import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Clock3, Plus, Search, Warehouse } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { BucketFormDialog } from "@/components/BucketFormDialog"
import { BayPlate, CrateStack } from "@/components/freight"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { createBucket, errorMessage, listBuckets, type Bucket, type BucketInput } from "@/lib/depot"

function DockDoor({ bucket }: { bucket: Bucket }) {
  const groups = bucket.access_group_names ?? []

  return (
    <Link to={`/buckets/${bucket.name}`} className="group block">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all group-hover:-translate-y-1 group-hover:border-primary/35 group-hover:shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-2">
          <span className="stencil min-w-0 truncate text-sm">{bucket.name}</span>
          <BayPlate id={bucket.id} />
        </div>

        <div className="relative h-44 overflow-hidden bg-[#211c29]">
          <div className="absolute inset-0 flex flex-col justify-between p-3">
            <div>
              <p className="line-clamp-2 text-xs leading-relaxed text-zinc-300">
                {bucket.description || "No manifest notes."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-500">
                  Clearance
                </span>
                {groups.length === 0 ? (
                  <span className="rounded-xs border border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    Restricted
                  </span>
                ) : (
                  groups.map((group) => (
                    <span
                      key={group}
                      className="rounded-xs border border-purple-400/40 px-1.5 py-0.5 text-[10px] text-purple-200"
                    >
                      {group}
                    </span>
                  ))
                )}
              </div>
            </div>
            <CrateStack className="h-11 w-auto self-start" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-purple-400/15 to-transparent" />

          <div className="shutter absolute inset-0 transition-transform duration-500 ease-out group-hover:-translate-y-[84%] motion-reduce:transition-none pointer-coarse:-translate-y-[84%]">
            <div className="flex h-full items-center justify-center">
              <span className="stencil text-[10px] tracking-[0.25em] text-foreground/40">
                Bay {bucket.name}
              </span>
            </div>
            <div className="absolute inset-x-8 bottom-4 h-1.5 rounded-full bg-black/15 dark:bg-white/10" />
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-border/70" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-border/70" />
        </div>

        <div className="hazard-tape h-1.5 w-full opacity-60 transition-opacity group-hover:opacity-100" />
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock3 className="size-3.5" />
            Last activity {new Date(bucket.updated_at).toLocaleDateString()}
          </span>
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  )
}

export default function BucketsPage() {
  const [search, setSearch] = useState("")
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.groups?.includes("Admins") ?? false

  const bucketsQuery = useQuery({ queryKey: ["buckets"], queryFn: listBuckets })

  const createMutation = useMutation({
    mutationFn: (input: BucketInput) => createBucket(input),
    onSuccess: (bucket) => {
      toast.success(`Bucket ${bucket.name} created`)
      void queryClient.invalidateQueries({ queryKey: ["buckets"] })
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to create bucket"))
      throw error
    },
  })

  const buckets = useMemo(() => bucketsQuery.data ?? [], [bucketsQuery.data])
  const filteredBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.name.toLowerCase().includes(search.trim().toLowerCase())),
    [buckets, search],
  )

  return (
    <PageContainer>
      <PageHeader
        title="Storage Bays"
        description="Every bay in the terminal. Hover a door to see what's inside."
        action={
          isAdmin ? (
            <BucketFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Open a bay
                </Button>
              }
              isPending={createMutation.isPending}
              onSubmit={async (input) => {
                await createMutation.mutateAsync(input)
              }}
            />
          ) : undefined
        }
      />

      <div className="mb-6 flex h-11 max-w-xl min-w-0 items-center gap-2 rounded-lg bg-card px-3 shadow-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter bays"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {bucketsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : filteredBuckets.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted">
              <Warehouse className="size-5 text-muted-foreground" />
            </div>
            <div className="stencil mt-4 text-sm">
              {buckets.length === 0 ? "No bays on the floor" : "No bays match your filter"}
            </div>
            {buckets.length === 0 && (
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {isAdmin
                  ? "Open a bay to start receiving cargo."
                  : "Ask an admin to open a bay and grant your group clearance."}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredBuckets.map((bucket) => (
            <DockDoor key={bucket.id} bucket={bucket} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
