import { useQuery } from "@tanstack/react-query"
import { Clock3, Globe, Package, Plus, Search, Upload, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { listBuckets } from "@/lib/depot"

export default function BucketsPage() {
  const [search, setSearch] = useState("")
  const { isAdmin } = useAuth()

  const bucketsQuery = useQuery({ queryKey: ["buckets"], queryFn: listBuckets })

  const buckets = useMemo(() => bucketsQuery.data ?? [], [bucketsQuery.data])
  const filteredBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.name.toLowerCase().includes(search.trim().toLowerCase())),
    [buckets, search],
  )

  return (
    <PageContainer>
      <PageHeader
        title="Buckets"
        description="Namespaces for application and team files."
        action={
          isAdmin ? (
            <Button asChild>
              <Link to="/buckets/new">
                <Plus className="size-4" />
                Bucket
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 flex h-11 max-w-xl min-w-0 items-center gap-2 rounded-lg bg-card px-3 shadow-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter buckets"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {bucketsQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : filteredBuckets.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Package className="size-5 text-muted-foreground" />
            </div>
            <div className="mt-4 text-sm font-medium">
              {buckets.length === 0 ? "No buckets yet" : "No buckets match your filter"}
            </div>
            {buckets.length === 0 && (
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {isAdmin
                  ? "Create a bucket to start storing files."
                  : "Ask an admin to create a bucket and grant your group access."}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredBuckets.map((bucket) => (
            <Link key={bucket.id} to={`/buckets/${bucket.name}`} className="group">
              <Card className="h-full gap-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg">
                <CardHeader className="gap-3">
                  <CardTitle className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-gr-purple to-gr-pink text-white">
                      <Package className="size-4" />
                    </span>
                    <span className="min-w-0 truncate font-mono text-base font-semibold">
                      {bucket.name}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {bucket.description || "No description"}
                  </p>
                  <div className="flex min-h-6 flex-wrap gap-1.5">
                    {bucket.allow_authenticated_write ? (
                      <Badge variant="secondary">
                        <Upload className="size-3" /> Authenticated write
                      </Badge>
                    ) : bucket.allow_authenticated_read ? (
                      <Badge variant="secondary">
                        <Users className="size-3" /> Authenticated read
                      </Badge>
                    ) : null}
                    {bucket.allow_public_files && (
                      <Badge variant="outline" className="border-gr-purple text-gr-purple">
                        <Globe className="size-3" /> Public files
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    Updated {new Date(bucket.updated_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
