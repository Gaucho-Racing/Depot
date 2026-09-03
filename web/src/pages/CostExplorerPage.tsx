import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Database, DollarSign, HardDrive } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes, formatUSD, getTransferAnalytics } from "@/lib/depot"

const PERIODS = [7, 30, 90] as const

function formatUSDAxis(value: number) {
  if (value === 0) return "$0"
  if (value < 0.0001) return `$${value.toExponential(1)}`
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--popover-foreground)",
  fontSize: 12,
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  loading,
}: {
  label: string
  value: string
  detail: string
  icon: typeof DollarSign
  loading: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-gr-purple">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-6 w-24" />
          ) : (
            <p className="mt-0.5 truncate text-xl font-semibold tabular-nums">{value}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function CostValue({
  priced,
  total,
  storage,
  requests,
}: {
  priced: boolean
  total: number
  storage: number
  requests: number
}) {
  if (!priced) {
    return <Badge variant="secondary">Not priced</Badge>
  }
  return (
    <div className="text-right">
      <p className="font-mono text-xs font-medium tabular-nums">{formatUSD(total)}</p>
      <p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">
        {formatUSD(storage)} storage + {formatUSD(requests)} requests
      </p>
    </div>
  )
}

export default function CostExplorerPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  const analyticsQuery = useQuery({
    queryKey: ["transfer-analytics", days],
    queryFn: () => getTransferAnalytics(days),
  })
  const analytics = analyticsQuery.data
  const estimate = analytics?.cost_estimate
  const totalStoredBytes =
    estimate?.backends.reduce((total, backend) => total + backend.stored_bytes, 0) ?? 0
  const backendRows = useMemo(
    () =>
      [...(estimate?.backends ?? [])].sort(
        (left, right) =>
          Number(right.priced) - Number(left.priced) ||
          right.estimated_monthly_usd - left.estimated_monthly_usd ||
          right.stored_bytes - left.stored_bytes,
      ),
    [estimate?.backends],
  )
  const bucketRows = useMemo(
    () =>
      [...(estimate?.buckets ?? [])].sort(
        (left, right) =>
          Number(right.priced) - Number(left.priced) ||
          right.estimated_monthly_usd - left.estimated_monthly_usd ||
          right.stored_bytes - left.stored_bytes,
      ),
    [estimate?.buckets],
  )

  return (
    <PageContainer>
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Dashboard
      </Link>

      <PageHeader
        title="Cost explorer"
        description="Estimated storage and request costs across the buckets you can access."
        action={
          <div className="flex items-center rounded-lg border border-border/60 bg-card p-1">
            {PERIODS.map((period) => (
              <Button
                key={period}
                type="button"
                size="sm"
                variant={days === period ? "secondary" : "ghost"}
                aria-pressed={days === period}
                onClick={() => setDays(period)}
              >
                {period} days
              </Button>
            ))}
          </div>
        }
      />

      {analyticsQuery.isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Cost analytics are unavailable.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Estimated monthly"
              value={formatUSD(estimate?.estimated_monthly_usd ?? 0)}
              detail={`${formatUSD(estimate?.monthly_storage_usd ?? 0)} storage · ${formatUSD(estimate?.monthly_request_run_rate_usd ?? 0)} requests`}
              icon={DollarSign}
              loading={analyticsQuery.isLoading}
            />
            <SummaryCard
              label="Current storage"
              value={formatBytes(totalStoredBytes)}
              detail={`${backendRows.reduce((total, backend) => total + backend.file_count, 0)} active files`}
              icon={HardDrive}
              loading={analyticsQuery.isLoading}
            />
            <SummaryCard
              label={`Uploaded in ${days} days`}
              value={formatBytes(analytics?.totals.upload_bytes ?? 0)}
              detail={`${analytics?.totals.uploads ?? 0} successful uploads`}
              icon={ArrowUpFromLine}
              loading={analyticsQuery.isLoading}
            />
            <SummaryCard
              label={`Downloaded in ${days} days`}
              value={formatBytes(analytics?.totals.download_bytes ?? 0)}
              detail={`${analytics?.totals.downloads ?? 0} successful · ${analytics?.totals.download_failures ?? 0} failed`}
              icon={ArrowDownToLine}
              loading={analyticsQuery.isLoading}
            />
          </div>

          {estimate && estimate.unpriced_backend_count > 0 ? (
            <div className="mb-6 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {estimate.unpriced_backend_count} storage backend
              {estimate.unpriced_backend_count === 1 ? " is" : "s are"} excluded from the total because no pricing model is configured.
            </div>
          ) : null}

          <div className="mb-6 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monthly estimate trend</CardTitle>
                <CardDescription>
                  Storage footprint plus the rolling request run rate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsQuery.isLoading ? (
                  <Skeleton className="h-64 w-full rounded-lg" />
                ) : !estimate || estimate.priced_backend_count === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No priced cost history to display.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={estimate.daily} margin={{ left: 8, right: 8, top: 8 }}>
                        <defs>
                          <linearGradient id="fill-storage-cost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.7} />
                            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.15} />
                          </linearGradient>
                          <linearGradient id="fill-request-run-rate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.7} />
                            <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.15} />
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
                          width={72}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickFormatter={(value: number) => formatUSDAxis(value)}
                        />
                        <Tooltip
                          formatter={(value) => formatUSD(Number(value ?? 0))}
                          contentStyle={tooltipStyle}
                        />
                        <Area
                          type="monotone"
                          dataKey="monthly_storage_usd"
                          name="Storage"
                          stackId="monthly-cost"
                          stroke="var(--chart-1)"
                          fill="url(#fill-storage-cost)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="monthly_request_run_rate_usd"
                          name="Request run rate"
                          stackId="monthly-cost"
                          stroke="var(--chart-2)"
                          fill="url(#fill-request-run-rate)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[var(--chart-1)]" /> Storage
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[var(--chart-2)]" /> Request run rate
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily request cost</CardTitle>
                <CardDescription>Successful Depot transfer requests by day.</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsQuery.isLoading ? (
                  <Skeleton className="h-64 w-full rounded-lg" />
                ) :
                  !estimate ||
                  estimate.daily.every((point) => point.daily_request_usd === 0) ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No priced request activity in this period.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={estimate.daily} margin={{ left: 8, right: 8, top: 8 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickFormatter={(value: string) => value.slice(5)}
                        />
                        <YAxis
                          width={72}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickFormatter={(value: number) => formatUSDAxis(value)}
                        />
                        <Tooltip
                          formatter={(value) => formatUSD(Number(value ?? 0))}
                          contentStyle={tooltipStyle}
                        />
                        <Bar
                          dataKey="upload_request_usd"
                          name="Uploads"
                          stackId="request-cost"
                          fill="var(--chart-1)"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="download_request_usd"
                          name="Downloads"
                          stackId="request-cost"
                          fill="var(--chart-2)"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[var(--chart-1)]" /> Uploads
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[var(--chart-2)]" /> Downloads
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>By bucket</CardTitle>
              <CardDescription>Storage, transfers, and allocated monthly cost.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {analyticsQuery.isLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : bucketRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No bucket usage to estimate.
                </p>
              ) : (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="bg-muted/25 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Bucket</th>
                        <th className="px-4 py-3 font-medium">Backend</th>
                        <th className="px-4 py-3 text-right font-medium">Stored</th>
                        <th className="px-4 py-3 text-right font-medium">Uploaded</th>
                        <th className="px-4 py-3 text-right font-medium">Downloaded</th>
                        <th className="px-4 py-3 text-right font-medium">Estimated monthly</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {bucketRows.map((bucket) => (
                        <tr key={`${bucket.bucket_id}:${bucket.storage_backend}`}>
                          <td className="px-4 py-3">
                            <Link
                              to={`/buckets/${encodeURIComponent(bucket.bucket_name)}`}
                              className="font-mono text-xs font-medium hover:text-gr-purple"
                            >
                              {bucket.bucket_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs">{bucket.storage_backend}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {bucket.provider || "Unknown provider"}
                              {bucket.region ? ` · ${bucket.region}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-mono text-xs">{formatBytes(bucket.stored_bytes)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {bucket.file_count} file{bucket.file_count === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-mono text-xs">{formatBytes(bucket.upload_bytes)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {bucket.uploads} request{bucket.uploads === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-mono text-xs">{formatBytes(bucket.download_bytes)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {bucket.downloads} request{bucket.downloads === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <CostValue
                              priced={bucket.priced}
                              total={bucket.estimated_monthly_usd}
                              storage={bucket.monthly_storage_usd}
                              requests={bucket.monthly_request_run_rate_usd}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4 text-gr-purple" />
                By storage backend
              </CardTitle>
              <CardDescription>Provider-level storage and transfer totals.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {analyticsQuery.isLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : backendRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No storage backend usage to estimate.
                </p>
              ) : (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="bg-muted/25 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Backend</th>
                        <th className="px-4 py-3 font-medium">Provider</th>
                        <th className="px-4 py-3 text-right font-medium">Stored</th>
                        <th className="px-4 py-3 text-right font-medium">Uploaded</th>
                        <th className="px-4 py-3 text-right font-medium">Downloaded</th>
                        <th className="px-4 py-3 text-right font-medium">Estimated monthly</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {backendRows.map((backend) => (
                        <tr key={backend.storage_backend}>
                          <td className="px-4 py-3 font-mono text-xs font-medium">
                            {backend.storage_backend}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs">{backend.provider || "Unknown"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {backend.region || "No region"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-mono text-xs">{formatBytes(backend.stored_bytes)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {backend.file_count} file{backend.file_count === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-mono text-xs">{formatBytes(backend.upload_bytes)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {backend.uploads} request{backend.uploads === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-mono text-xs">{formatBytes(backend.download_bytes)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {backend.downloads} request{backend.downloads === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <CostValue
                              priced={backend.priced}
                              total={backend.estimated_monthly_usd}
                              storage={backend.monthly_storage_usd}
                              requests={backend.monthly_request_run_rate_usd}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {estimate ? (
            <Card>
              <CardHeader>
                <CardTitle>Estimate coverage</CardTitle>
                <CardDescription>
                  Current storage plus the selected period's request activity projected to 30 days.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  AWS S3 Standard pricing is modeled for us-east-1 and us-west-2 using rates current as of {estimate.pricing_as_of}. Generic S3-compatible endpoints remain unpriced until a provider-specific model is configured.
                </p>
                <p>
                  Data transfer, multipart request fan-out, failed and non-transfer API calls, compute, NAT, taxes, discounts, and free tier are excluded.
                </p>
                <a
                  href={estimate.pricing_source}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex font-medium text-foreground underline-offset-4 hover:underline"
                >
                  View pricing source
                </a>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </PageContainer>
  )
}
