import { useQuery } from "@tanstack/react-query"
import { Globe, Search as SearchIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { FileSheet } from "@/components/FileSheet"
import { PageContainer, PageHeader } from "@/components/PageContainer"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { formatBytes, searchFiles, type DepotFile } from "@/lib/depot"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [selectedFile, setSelectedFile] = useState<DepotFile | null>(null)
  const { user } = useAuth()
  const isAdmin = user?.groups?.includes("Admins") ?? false

  const resultsQuery = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => searchFiles(submitted),
    enabled: submitted.trim().length > 0,
  })

  const results = resultsQuery.data ?? []

  return (
    <PageContainer>
      <PageHeader title="Tracking" description="Trace cargo across every bay you have clearance for." />

      <form
        className="mb-6 flex h-12 max-w-2xl min-w-0 items-center gap-2 rounded-lg bg-card px-3 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(query)
        }}
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter a tracking query — file name or path..."
          className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          autoFocus
        />
      </form>

      {!submitted ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Scan the terminal — type a query and press enter.
        </p>
      ) : resultsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No cargo on record matching "{submitted}".
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {results.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(file)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_130px_90px_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{file.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {file.path || file.id}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <Link
                        to={`/buckets/${file.bucket_name}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Badge variant="outline" className="font-mono text-xs hover:border-gr-purple">
                          {file.bucket_name}
                        </Badge>
                      </Link>
                    </span>
                    <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                      {formatBytes(file.size_bytes)}
                    </span>
                    <span className="flex items-center justify-end gap-2">
                      {file.public && <Globe className="size-3.5 text-gr-purple" />}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {new Date(file.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <FileSheet file={selectedFile} canWrite={isAdmin} onClose={() => setSelectedFile(null)} />
    </PageContainer>
  )
}
