import { useQuery } from "@tanstack/react-query"
import { Boxes, Files, HardDrive } from "lucide-react"
import { Link } from "react-router-dom"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes, getActivity, getStats } from "@/lib/depot"

function StatTile({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string
  value: string
  icon: typeof Files
  loading: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gr-purple to-gr-pink text-white shadow-sm">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-24" />
          ) : (
            <p className="truncate text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats })
  const activityQuery = useQuery({ queryKey: ["activity", 30], queryFn: () => getActivity(30) })

  const stats = statsQuery.data
  const maxBucketBytes = Math.max(1, ...(stats?.buckets ?? []).map((b) => b.total_bytes))

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Storage usage and access activity across your buckets."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Files"
          value={String(stats?.total_files ?? 0)}
          icon={Files}
          loading={statsQuery.isLoading}
        />
        <StatTile
          label="Storage used"
          value={formatBytes(stats?.total_bytes ?? 0)}
          icon={HardDrive}
          loading={statsQuery.isLoading}
        />
        <StatTile
          label="Buckets"
          value={String(stats?.total_buckets ?? 0)}
          icon={Boxes}
          loading={statsQuery.isLoading}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Uploads and downloads over the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {activityQuery.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityQuery.data ?? []} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="fill-uploads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="fill-downloads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(value: string) => value.slice(5)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="uploads"
                    stroke="var(--chart-1)"
                    fill="url(#fill-uploads)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="downloads"
                    stroke="var(--chart-2)"
                    fill="url(#fill-downloads)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Storage by bucket</CardTitle>
            <CardDescription>Active file bytes per bucket.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statsQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
            ) : (stats?.buckets ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No buckets with files yet.
              </p>
            ) : (
              stats?.buckets.map((bucket) => (
                <Link
                  key={bucket.bucket_id}
                  to={`/buckets/${bucket.bucket_name}`}
                  className="block space-y-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium hover:text-gr-purple">
                      {bucket.bucket_name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {bucket.file_count} · {formatBytes(bucket.total_bytes)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gr-purple to-gr-pink"
                      style={{ width: `${Math.max(2, (bucket.total_bytes / maxBucketBytes) * 100)}%` }}
                    />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top uploaders</CardTitle>
            <CardDescription>Applications and users hosting the most files.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {statsQuery.isLoading ? (
              <div className="space-y-3 px-6 pb-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (stats?.top_uploaders ?? []).length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                Nothing uploaded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {stats?.top_uploaders.map((entity, index) => (
                  <li
                    key={entity.entity_id}
                    className="flex items-center gap-3 px-6 py-3 text-sm"
                  >
                    <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {entity.entity_id}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entity.file_count} file{entity.file_count === 1 ? "" : "s"} ·{" "}
                      {formatBytes(entity.total_bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
