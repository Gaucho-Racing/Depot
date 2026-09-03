import { useQuery } from "@tanstack/react-query"
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CircleDollarSign, Files, HardDrive } from "lucide-react"
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

import { ApplicationDisplay } from "@/components/ApplicationDisplay"
import { IdentityDisplay } from "@/components/IdentityDisplay"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes, getActivity, getStats, getTransferAnalytics } from "@/lib/depot"
import { useApplicationDirectory, useIdentityDirectory } from "@/lib/directory"

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

function formatUSD(value: number) {
  if (value === 0) return "$0.00"
  const fractionDigits = value < 0.0001 ? 8 : value < 0.01 ? 6 : 2
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function formatTrackingDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

export default function DashboardPage() {
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats })
  const activityQuery = useQuery({ queryKey: ["activity", 30], queryFn: () => getActivity(30) })
  const transfersQuery = useQuery({
    queryKey: ["transfer-analytics", 30],
    queryFn: () => getTransferAnalytics(30),
  })

  const stats = statsQuery.data
  const identityDirectory = useIdentityDirectory(
    (stats?.top_uploaders ?? []).map((entity) => entity.entity_id),
  )
  const applicationDirectory = useApplicationDirectory(
    (stats?.top_applications ?? []).map((application) => application.client_id),
  )
  const maxBucketBytes = Math.max(1, ...(stats?.buckets ?? []).map((b) => b.total_bytes))
  const transfers = transfersQuery.data
  const costEstimate = transfers?.cost_estimate

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

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Transfer volume</CardTitle>
              <CardDescription>
                {transfers?.tracking_started_at
                  ? `Measured since ${formatTrackingDate(transfers.tracking_started_at)}.`
                  : "Byte tracking starts with the next transfer."}
              </CardDescription>
            </div>
            {!transfersQuery.isLoading && transfers ? (
              <div className="flex shrink-0 flex-wrap gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <ArrowUpFromLine className="size-3.5 text-[var(--chart-1)]" />
                  {formatBytes(transfers.totals.upload_bytes)} uploaded
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <ArrowDownToLine className="size-3.5 text-[var(--chart-2)]" />
                  {formatBytes(transfers.totals.download_bytes)} downloaded
                </span>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {transfersQuery.isLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : transfersQuery.isError ? (
              <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Transfer analytics are unavailable.
              </p>
            ) :
              (transfers?.totals.upload_bytes ?? 0) === 0 &&
              (transfers?.totals.download_bytes ?? 0) === 0 ? (
              <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No measured transfer bytes yet.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={transfers?.daily ?? []} margin={{ left: 8, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="fill-upload-bytes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="fill-download-bytes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.55} />
                        <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.03} />
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
                      width={68}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(value: number) => formatBytes(value)}
                    />
                    <Tooltip
                      formatter={(value) => formatBytes(Number(value ?? 0))}
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
                      dataKey="upload_bytes"
                      name="Uploaded"
                      stroke="var(--chart-1)"
                      fill="url(#fill-upload-bytes)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="download_bytes"
                      name="Downloaded"
                      stroke="var(--chart-2)"
                      fill="url(#fill-download-bytes)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {!transfersQuery.isLoading && transfers && transfers.totals.download_failures > 0 ? (
              <p className="mt-3 text-xs text-destructive">
                {transfers.totals.download_failures} failed download
                {transfers.totals.download_failures === 1 ? "" : "s"} excluded from downloaded bytes.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="size-5 text-gr-purple" />
              Estimated cost
            </CardTitle>
            <CardDescription>Monthly storage plus the 30-day request run rate.</CardDescription>
          </CardHeader>
          <CardContent>
            {transfersQuery.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : transfersQuery.isError || !costEstimate ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Cost estimates are unavailable.
              </p>
            ) : costEstimate.priced_backend_count === 0 && costEstimate.unpriced_backend_count > 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No priced storage backends are in this view.
              </p>
            ) : (
              <>
                <p className="text-3xl font-semibold tabular-nums tracking-tight">
                  {formatUSD(costEstimate.estimated_monthly_usd)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>
                </p>
                <dl className="mt-5 space-y-2 border-y border-border py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Stored data</dt>
                    <dd className="font-mono text-xs tabular-nums">
                      {formatUSD(costEstimate.monthly_storage_usd)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Request run rate</dt>
                    <dd className="font-mono text-xs tabular-nums">
                      {formatUSD(costEstimate.monthly_request_run_rate_usd)}
                    </dd>
                  </div>
                </dl>
                {costEstimate.backends.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {costEstimate.backends.map((backend) => (
                      <li
                        key={backend.storage_backend}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {backend.storage_backend}
                          {backend.region ? ` · ${backend.region}` : ""}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {backend.priced ? formatUSD(backend.estimated_monthly_usd) : "Not priced"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
            {costEstimate ? (
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                AWS S3 Standard rates as of {costEstimate.pricing_as_of}. Excludes data transfer,
                multipart request fan-out, failed and non-transfer API calls, compute, NAT, taxes,
                discounts, and free tier.
              </p>
            ) : null}
          </CardContent>
        </Card>
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

      <div className="grid gap-4 lg:grid-cols-3">
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
            <CardDescription>Entities hosting the most files.</CardDescription>
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
                    <Link
                      to={`/uploaders/${encodeURIComponent(entity.entity_id)}`}
                      className="min-w-0 flex-1 rounded-md hover:text-gr-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <IdentityDisplay
                        entityID={entity.entity_id}
                        identity={identityDirectory.byID.get(entity.entity_id)}
                        loading={identityDirectory.isLoading}
                        size="sm"
                      />
                    </Link>
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

        <Card>
          <CardHeader>
            <CardTitle>Top applications</CardTitle>
            <CardDescription>Files by the client that uploaded them.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {statsQuery.isLoading ? (
              <div className="space-y-3 px-6 pb-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (stats?.top_applications ?? []).length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                No application uploads recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {stats?.top_applications.map((app, index) => (
                  <li key={app.client_id} className="flex items-center gap-3 px-6 py-3 text-sm">
                    <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <Link
                      to={`/applications/${encodeURIComponent(app.client_id)}`}
                      className="min-w-0 flex-1 rounded-md hover:text-gr-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ApplicationDisplay
                        clientID={app.client_id}
                        application={applicationDirectory.byClientID.get(app.client_id)}
                        size="sm"
                        showClientID={false}
                      />
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {app.file_count} file{app.file_count === 1 ? "" : "s"} ·{" "}
                      {formatBytes(app.total_bytes)}
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
