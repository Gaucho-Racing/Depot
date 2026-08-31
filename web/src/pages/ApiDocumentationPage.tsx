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
import Prism from "prismjs"
import "prismjs/components/prism-bash"
import "prismjs/components/prism-go"
import "prismjs/components/prism-python"
import "prismjs/components/prism-typescript"
import { Highlight, themes } from "prism-react-renderer"
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
      { method: "POST", path: "/buckets/:bucketName/files/:id/download-url", summary: "Create a temporary direct-download URL.", access: "Public or READ" },
      { method: "POST", path: "/buckets/:bucketName/uploads", summary: "Start a direct-to-storage upload.", access: "WRITE grant" },
      { method: "POST", path: "/buckets/:bucketName/uploads/:id/complete", summary: "Verify and activate a direct upload.", access: "WRITE grant" },
    ],
  },
  {
    name: "Buckets",
    description: "Discover the buckets available to your application.",
    endpoints: [
      { method: "GET", path: "/buckets", summary: "List buckets visible to the caller.", access: "Bearer token" },
      { method: "GET", path: "/buckets/:bucketName", summary: "Get bucket details.", access: "READ grant" },
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

const uploadExamples = [
  {
    label: "cURL",
    language: "bash",
    code: `curl --fail-with-body \\
  --request POST \\
  --header "Authorization: Bearer $DEPOT_ACCESS_TOKEN" \\
  --form "file=@./telemetry.json" \\
  --form "path=telemetry/2026" \\
  --form 'tags={"car":"GR26","session":"autocross"}' \\
  "$DEPOT_BASE_URL/buckets/telemetry/files"`,
  },
  {
    label: "TypeScript",
    language: "typescript",
    code: `import { openAsBlob } from "node:fs"

const depotBaseUrl = process.env.DEPOT_BASE_URL
const depotToken = process.env.DEPOT_ACCESS_TOKEN
if (!depotBaseUrl || !depotToken) {
  throw new Error("Depot configuration is missing")
}

const file = await openAsBlob("./telemetry.json", {
  type: "application/json",
})
const form = new FormData()
form.set("file", file, "telemetry.json")
form.set("path", "telemetry/2026")
form.set("tags", JSON.stringify({ car: "GR26", session: "autocross" }))

const response = await fetch(
  \`${"${depotBaseUrl}"}/buckets/telemetry/files\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer ${"${depotToken}"}\`,
    },
    body: form,
  },
)

if (!response.ok) {
  throw new Error(\`Depot upload failed: ${"${response.status}"}\`)
}

const depotFile = await response.json()`,
  },
  {
    label: "Python",
    language: "python",
    code: `import json
import os

import requests

depot_base_url = os.environ["DEPOT_BASE_URL"]
depot_token = os.environ["DEPOT_ACCESS_TOKEN"]

with open("./telemetry.json", "rb") as file:
    response = requests.post(
        f"{depot_base_url}/buckets/telemetry/files",
        headers={"Authorization": f"Bearer {depot_token}"},
        files={"file": ("telemetry.json", file, "application/json")},
        data={
            "path": "telemetry/2026",
            "tags": json.dumps({"car": "GR26", "session": "autocross"}),
        },
        timeout=60,
    )

response.raise_for_status()
depot_file = response.json()`,
  },
  {
    label: "Go",
    language: "go",
    code: `func uploadTelemetry(ctx context.Context) error {
    source, err := os.Open("./telemetry.json")
    if err != nil {
        return fmt.Errorf("open telemetry file: %w", err)
    }
    defer source.Close()

    var body bytes.Buffer
    form := multipart.NewWriter(&body)
    file, err := form.CreateFormFile("file", "telemetry.json")
    if err != nil {
        return fmt.Errorf("create file field: %w", err)
    }
    if _, err := io.Copy(file, source); err != nil {
        return fmt.Errorf("write file field: %w", err)
    }
    if err := form.WriteField("path", "telemetry/2026"); err != nil {
        return fmt.Errorf("write path field: %w", err)
    }
    if err := form.WriteField("tags", ` + "`" + `{"car":"GR26","session":"autocross"}` + "`" + `); err != nil {
        return fmt.Errorf("write tags field: %w", err)
    }
    if err := form.Close(); err != nil {
        return fmt.Errorf("close multipart form: %w", err)
    }

    baseURL := os.Getenv("DEPOT_BASE_URL")
    token := os.Getenv("DEPOT_ACCESS_TOKEN")
    if baseURL == "" || token == "" {
        return errors.New("Depot configuration is missing")
    }

    endpoint := baseURL + "/buckets/telemetry/files"
    request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
    if err != nil {
        return fmt.Errorf("create Depot request: %w", err)
    }
    request.Header.Set("Authorization", "Bearer "+token)
    request.Header.Set("Content-Type", form.FormDataContentType())

    response, err := http.DefaultClient.Do(request)
    if err != nil {
        return fmt.Errorf("upload to Depot: %w", err)
    }
    defer response.Body.Close()

    if response.StatusCode != http.StatusCreated {
        message, err := io.ReadAll(io.LimitReader(response.Body, 4096))
        if err != nil {
            return fmt.Errorf("read Depot error response: %w", err)
        }
        return fmt.Errorf("Depot upload failed (%s): %s", response.Status, message)
    }
    return nil
}`,
  },
] as const

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
      <Highlight prism={Prism} theme={themes.nightOwl} code={code.trim()} language={language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(className, "overflow-x-auto p-4 text-xs leading-6 sm:text-[13px]")}
            style={{ ...style, margin: 0, background: "transparent" }}
          >
            <code>
              {tokens.map((line, lineIndex) => {
                const lineProps = getLineProps({ line })
                return (
                  <span key={lineIndex} {...lineProps} className={cn(lineProps.className, "block")}>
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} {...getTokenProps({ token })} />
                    ))}
                  </span>
                )
              })}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  )
}

function UploadExamples() {
  const [selectedLabel, setSelectedLabel] = useState<string>(uploadExamples[0].label)
  const selectedExample =
    uploadExamples.find((example) => example.label === selectedLabel) ?? uploadExamples[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="size-4 text-primary" />Upload a file
        </CardTitle>
        <CardDescription>
          Multipart upload examples for files within Depot's configured proxy limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Upload example language">
          {uploadExamples.map((example) => (
            <Button
              key={example.label}
              type="button"
              role="tab"
              size="sm"
              variant={example.label === selectedExample.label ? "secondary" : "ghost"}
              aria-selected={example.label === selectedExample.label}
              onClick={() => setSelectedLabel(example.label)}
            >
              {example.label}
            </Button>
          ))}
        </div>
        <div role="tabpanel">
          <CodeBlock code={selectedExample.code} language={selectedExample.language} />
        </div>
      </CardContent>
    </Card>
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
        {endpoint.path}
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
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Code2 className="size-4 text-primary" />List files</CardTitle>
                  <CardDescription>Server-side JavaScript using the built-in Fetch API.</CardDescription>
                </CardHeader>
                <CardContent><CodeBlock code={quickStartCode} language="typescript" /></CardContent>
              </Card>
              <UploadExamples />
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
                <CodeBlock code={presignedCode} language="bash" />
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
                  <CardHeader className="border-b border-border/40 py-4">
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
