import { useMemo, useState } from "react"
import {
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  ExternalLink,
  KeyRound,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react"
import { toast } from "sonner"

import { PageContainer } from "@/components/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiBaseURL } from "@/lib/api"
import { cn } from "@/lib/utils"

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type Endpoint = {
  method: HttpMethod
  path: string
  summary: string
  access: string
}

type EndpointGroup = {
  name: string
  description: string
  endpoints: Endpoint[]
}

const methodStyles: Record<HttpMethod, string> = {
  GET: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  POST: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PUT: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PATCH: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  DELETE: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
}

const endpointGroups: EndpointGroup[] = [
  {
    name: "Files",
    description: "Upload, find, inspect, and deliver application files.",
    endpoints: [
      { method: "GET", path: "/files/search", summary: "Search files across readable buckets.", access: "Bearer token" },
      { method: "GET", path: "/download/:fileID", summary: "Stream file bytes through Depot.", access: "Public or READ" },
      { method: "GET", path: "/buckets/:bucketName/files", summary: "List and filter files in a bucket.", access: "READ grant" },
      { method: "POST", path: "/buckets/:bucketName/files", summary: "Upload a file as multipart form data.", access: "WRITE grant" },
      { method: "GET", path: "/buckets/:bucketName/files/:id", summary: "Get metadata for one file.", access: "Public or READ" },
      { method: "GET", path: "/buckets/:bucketName/files/:id/access-logs", summary: "Get the latest access events for a file.", access: "Admin" },
      { method: "POST", path: "/buckets/:bucketName/files/:id/download-url", summary: "Create a temporary direct-download URL.", access: "Public or READ" },
      { method: "POST", path: "/buckets/:bucketName/uploads", summary: "Start a direct-to-storage upload.", access: "WRITE grant" },
      { method: "POST", path: "/buckets/:bucketName/uploads/:id/complete", summary: "Verify and activate a direct upload.", access: "WRITE grant" },
    ],
  },
  {
    name: "Buckets",
    description: "Discover buckets and manage their access policies.",
    endpoints: [
      { method: "GET", path: "/buckets", summary: "List buckets visible to the caller.", access: "Bearer token" },
      { method: "POST", path: "/buckets", summary: "Create a bucket.", access: "Admin" },
      { method: "GET", path: "/buckets/:bucketName", summary: "Get bucket details.", access: "READ grant" },
      { method: "PUT", path: "/buckets/:bucketName", summary: "Replace editable bucket settings.", access: "Admin" },
      { method: "DELETE", path: "/buckets/:bucketName", summary: "Delete an empty bucket.", access: "Admin" },
      { method: "GET", path: "/buckets/:bucketName/grants", summary: "List application grants for a bucket.", access: "Bearer token" },
      { method: "POST", path: "/buckets/:bucketName/grants", summary: "Grant an application READ or WRITE access.", access: "Admin" },
      { method: "PATCH", path: "/buckets/:bucketName/grants/:clientID", summary: "Change an application's bucket grant.", access: "Admin" },
      { method: "DELETE", path: "/buckets/:bucketName/grants/:clientID", summary: "Revoke an application's bucket grant.", access: "Admin" },
    ],
  },
  {
    name: "Authentication",
    description: "Browser sessions and Sentinel-backed identity information.",
    endpoints: [
      { method: "POST", path: "/auth/login?code=:code", summary: "Exchange a Sentinel authorization code.", access: "Public" },
      { method: "GET", path: "/auth/session", summary: "Inspect the current Depot session.", access: "Bearer token" },
      { method: "POST", path: "/auth/refresh", summary: "Exchange a refresh token for a new session.", access: "Public" },
      { method: "POST", path: "/auth/logout", summary: "End the client-side Depot session.", access: "Public" },
      { method: "GET", path: "/users/@me", summary: "Get the current Sentinel user.", access: "Bearer token" },
      { method: "GET", path: "/groups", summary: "List Sentinel groups visible to the caller.", access: "Bearer token" },
      { method: "GET", path: "/applications", summary: "List Sentinel applications.", access: "Admin" },
    ],
  },
  {
    name: "Operations",
    description: "Usage metrics, health checks, and storage administration.",
    endpoints: [
      { method: "GET", path: "/ping", summary: "Check API availability and environment.", access: "Public" },
      { method: "GET", path: "/stats", summary: "Get aggregate metrics for readable buckets.", access: "Bearer token" },
      { method: "GET", path: "/stats/activity?days=:days", summary: "Get 1–365 days of file activity.", access: "Bearer token" },
      { method: "GET", path: "/storage-backends", summary: "List configured storage backends.", access: "Bearer token" },
      { method: "GET", path: "/storage-backends/providers", summary: "List supported providers and regions.", access: "Bearer token" },
      { method: "POST", path: "/storage-backends", summary: "Create a storage backend.", access: "Admin" },
      { method: "PATCH", path: "/storage-backends/:backendName", summary: "Update a storage backend.", access: "Admin" },
      { method: "DELETE", path: "/storage-backends/:backendName", summary: "Delete an unused storage backend.", access: "Admin" },
      { method: "POST", path: "/storage-backends/:backendName/ping", summary: "Verify backend read, write, and delete access.", access: "Admin" },
    ],
  },
]

const quickStartCode = `const depotBaseUrl = process.env.DEPOT_BASE_URL
const depotToken = process.env.DEPOT_ACCESS_TOKEN

if (!depotBaseUrl || !depotToken) {
  throw new Error("Depot configuration is missing")
}

const response = await fetch(
  \`${"${depotBaseUrl}"}/buckets/assets/files?path_prefix=vehicles/\`,
  { headers: { Authorization: \`Bearer ${"${depotToken}"}\` } },
)

if (!response.ok) {
  throw new Error(\`Depot request failed: ${"${response.status}"}\`)
}

const files = await response.json()`

const uploadCode = `curl --fail-with-body \\
  --request POST \\
  --header "Authorization: Bearer $DEPOT_ACCESS_TOKEN" \\
  --form "file=@./telemetry.json" \\
  --form "path=telemetry/2026" \\
  --form 'tags={"car":"GR26","session":"autocross"}' \\
  "$DEPOT_BASE_URL/buckets/telemetry/files"`

const presignedCode = `# 1. Ask Depot for a temporary storage URL
UPLOAD=$(curl --fail-with-body --request POST \\
  --header "Authorization: Bearer $DEPOT_ACCESS_TOKEN" \\
  --header "Content-Type: application/json" \\
  --data '{"original_name":"run.mp4","content_type":"video/mp4"}' \\
  "$DEPOT_BASE_URL/buckets/media/uploads")

# 2. PUT the bytes to upload_url using the returned method
# 3. Confirm with POST /buckets/media/uploads/{file.id}/complete`

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error("Could not copy to the clipboard")
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
      {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  )
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950 text-zinc-100 shadow-inner">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">{language}</span>
        <CopyButton value={code} label="Copy" />
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6 sm:text-[13px]">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function SetupStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      <div className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border last:hidden" />
      <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20">
        {number}
      </div>
      <div className="pt-1">
        <h3 className="font-medium">{title}</h3>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div className="grid gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 md:grid-cols-[72px_minmax(260px,1fr)_minmax(180px,0.8fr)_120px] md:items-center">
      <Badge variant="outline" className={cn("justify-center font-mono", methodStyles[endpoint.method])}>
        {endpoint.method}
      </Badge>
      <code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs font-medium sm:text-sm">
        /api{endpoint.path}
      </code>
      <p className="text-sm text-muted-foreground">{endpoint.summary}</p>
      <div className="flex md:justify-end">
        <Badge variant="secondary" className="font-normal">{endpoint.access}</Badge>
      </div>
    </div>
  )
}

export default function ApiDocumentationPage() {
  const [query, setQuery] = useState("")
  const displayBaseURL = apiBaseURL.startsWith("http")
    ? apiBaseURL
    : `${window.location.origin}${apiBaseURL}`

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return endpointGroups

    return endpointGroups
      .map((group) => ({
        ...group,
        endpoints: group.endpoints.filter((endpoint) =>
          [endpoint.method, endpoint.path, endpoint.summary, endpoint.access]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.endpoints.length > 0)
  }, [query])

  const resultCount = filteredGroups.reduce((count, group) => count + group.endpoints.length, 0)

  return (
    <PageContainer className="max-w-[1440px]">
      <section className="relative overflow-hidden rounded-xl border border-primary/15 bg-card px-5 py-8 shadow-sm sm:px-8 sm:py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--color-primary)_15%,transparent),transparent_42%)]" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-4 border-primary/20 bg-primary/5 text-primary">
            <Code2 className="size-3" /> API reference
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Build with Depot</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            Store, organize, and deliver application files through one authenticated API. Start with a
            Sentinel service account, grant it access to a bucket, and use the same bearer token for every request.
          </p>
          <div className="mt-6 flex flex-col gap-2 rounded-lg border border-border/60 bg-background/80 p-3 sm:flex-row sm:items-center">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Base URL</span>
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm">{displayBaseURL}</code>
            <CopyButton value={displayBaseURL} label="Copy URL" />
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-10">
          <section id="getting-started" className="scroll-mt-24">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Get connected</h2>
              <p className="mt-1 text-sm text-muted-foreground">The production path for backend services and scheduled jobs.</p>
            </div>
            <Card>
              <CardContent className="pt-1">
                <SetupStep number="1" title="Create or choose a Sentinel application">
                  Depot identifies your application by the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">client_id</code> in its Sentinel token.
                </SetupStep>
                <SetupStep number="2" title="Create a service account">
                  In the Sentinel application page, create a service account and store its token in your secret manager. Depot does not require Sentinel API scopes for bucket access.
                </SetupStep>
                <SetupStep number="3" title="Request a bucket grant">
                  Ask a Depot admin for <strong className="font-medium text-foreground">READ</strong> access to consume files or <strong className="font-medium text-foreground">WRITE</strong> access to upload and read. WRITE includes READ.
                </SetupStep>
                <SetupStep number="4" title="Send the bearer token">
                  Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">Authorization: Bearer &lt;token&gt;</code> on each request. Keep service-account tokens on the server and rotate them from Sentinel.
                </SetupStep>
              </CardContent>
            </Card>
          </section>

          <section id="quick-start" className="scroll-mt-24">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Quick start</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use environment variables so credentials never enter source control.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Code2 className="size-4 text-primary" />List files</CardTitle>
                  <CardDescription>Server-side JavaScript using the built-in Fetch API.</CardDescription>
                </CardHeader>
                <CardContent><CodeBlock code={quickStartCode} language="typescript" /></CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Terminal className="size-4 text-primary" />Upload a file</CardTitle>
                  <CardDescription>Multipart upload for files within the configured proxy limit.</CardDescription>
                </CardHeader>
                <CardContent><CodeBlock code={uploadCode} language="shell" /></CardContent>
              </Card>
            </div>
          </section>

          <section id="large-files" className="scroll-mt-24">
            <Card className="border-primary/15">
              <CardHeader>
                <CardTitle>Large files and direct transfers</CardTitle>
                <CardDescription>
                  Use the presigned flow to bypass Depot's proxy upload limit and move bytes directly to storage.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] lg:items-start">
                <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                  <p>Initiating an upload creates a PENDING file and returns a temporary storage URL. Upload the bytes with the returned HTTP method, then call the completion endpoint.</p>
                  <p>Only the application that initiated an upload can complete it. A successful completion verifies the object and changes the file to ACTIVE.</p>
                  <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    Do not send your Depot bearer token to the presigned storage URL.
                  </div>
                </div>
                <CodeBlock code={presignedCode} language="shell" />
              </CardContent>
            </Card>
          </section>

          <section id="endpoints" className="scroll-mt-24">
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Endpoint reference</h2>
                <p className="mt-1 text-sm text-muted-foreground">All paths below are relative to the displayed base URL.</p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search endpoints…" className="pl-9" />
              </div>
            </div>

            <div className="space-y-5">
              {filteredGroups.map((group) => (
                <Card key={group.name} className="gap-0 py-0">
                  <CardHeader className="border-b py-4">
                    <CardTitle>{group.name}</CardTitle>
                    <CardDescription>{group.description}</CardDescription>
                  </CardHeader>
                  <div>
                    {group.endpoints.map((endpoint) => (
                      <EndpointRow key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} />
                    ))}
                  </div>
                </Card>
              ))}
              {resultCount === 0 && (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No endpoints match “{query}”.
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-4">
            <Card size="sm">
              <CardHeader><CardTitle>On this page</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {[
                  ["getting-started", "Get connected"],
                  ["quick-start", "Quick start"],
                  ["large-files", "Large files"],
                  ["endpoints", "Endpoint reference"],
                ].map(([id, label]) => (
                  <a key={id} href={`#${id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    {label}<ChevronRight className="size-3.5" />
                  </a>
                ))}
              </CardContent>
            </Card>
            <Card size="sm" className="bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound className="size-4 text-primary" />Authentication rule</CardTitle>
                <CardDescription>Service-account tokens belong in backend services, never browser bundles or public clients.</CardDescription>
              </CardHeader>
            </Card>
            <a href="#endpoints" className="flex items-center gap-2 px-1 text-xs text-muted-foreground hover:text-foreground">
              View {endpointGroups.reduce((count, group) => count + group.endpoints.length, 0)} documented endpoints
              <ExternalLink className="size-3" />
            </a>
          </div>
        </aside>
      </div>
    </PageContainer>
  )
}
