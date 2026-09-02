import { useQuery } from "@tanstack/react-query"
import {
  AppWindow,
  Database,
  File,
  History,
  KeyRound,
  Package,
  Search,
  ServerCog,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { omniSearch, type SearchResult, type SearchResultType } from "@/lib/depot"

const resultTypeDetails: Record<SearchResultType, { label: string; icon: LucideIcon }> = {
  bucket: { label: "Buckets", icon: Package },
  file: { label: "Files", icon: File },
  storage_backend: { label: "Storage backends", icon: Database },
  bucket_grant: { label: "Bucket grants", icon: KeyRound },
  access_log: { label: "Access logs", icon: History },
  application: { label: "Applications", icon: AppWindow },
  uploader: { label: "Uploaders", icon: UserRound },
}

const resultTypeOrder = Object.keys(resultTypeDetails) as SearchResultType[]

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])

  return debounced
}

function SearchResultIcon({ result }: { result: SearchResult }) {
  const [failedURL, setFailedURL] = useState<string | null>(null)
  const Icon = resultTypeDetails[result.type]?.icon ?? ServerCog
  if (result.icon_url && result.icon_url !== failedURL) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        <img
          src={result.icon_url}
          alt=""
          className="size-full object-contain"
          onError={() => setFailedURL(result.icon_url ?? null)}
        />
      </span>
    )
  }
  if (result.type === "application" || result.type === "bucket_grant") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gr-pink to-gr-purple text-sm font-semibold text-white">
        {(result.title.slice(0, 1) || "?").toUpperCase()}
      </span>
    )
  }
  if (result.type === "uploader") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {(result.title.slice(0, 1) || "?").toUpperCase()}
      </span>
    )
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-4" />
    </span>
  )
}

export function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query.trim(), 180)
  const navigate = useNavigate()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        if (open) setQuery("")
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  const searchQuery = useQuery({
    queryKey: ["omnisearch", debouncedQuery],
    queryFn: () => omniSearch(debouncedQuery),
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 30_000,
  })
  const groupedResults = useMemo(() => {
    const groups = new Map<SearchResultType, SearchResult[]>()
    for (const result of searchQuery.data?.results ?? []) {
      const current = groups.get(result.type) ?? []
      current.push(result)
      groups.set(result.type, current)
    }
    return groups
  }, [searchQuery.data])
  const visibleGroups = resultTypeOrder.flatMap((type) => {
    const results = groupedResults.get(type)
    return results?.length ? [{ type, results }] : []
  })

  function go(href: string) {
    setOpen(false)
    setQuery("")
    navigate(href)
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) setQuery("")
  }

  const ready = debouncedQuery.length >= 2
  const isDebouncing = query.trim() !== debouncedQuery
  const hasResults = (searchQuery.data?.results.length ?? 0) > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted/60 sm:w-64 sm:justify-start sm:px-3"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left sm:block">Search Depot…</span>
        <kbd className="hidden rounded bg-background px-1.5 py-0.5 font-mono text-[10px] sm:block">⌘K</kbd>
        <span className="sr-only">Search Depot</span>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        title="Search Depot"
        description="Find files, buckets, storage backends, grants, logs, applications, and uploaders."
        shouldFilter={false}
        className="sm:max-w-xl"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search files, buckets, storage backends…"
        />
        <CommandList>
          {!ready && !isDebouncing ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Type at least two characters to search Depot.
            </div>
          ) : isDebouncing || (searchQuery.isFetching && !searchQuery.data) ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Searching…</div>
          ) : searchQuery.isError ? (
            <div className="py-10 text-center text-sm text-destructive">
              Search is unavailable. Please try again.
            </div>
          ) : !hasResults ? (
            <CommandEmpty>No results for “{debouncedQuery}”.</CommandEmpty>
          ) : (
            visibleGroups.map(({ type, results }, index) => {
              return (
                <div key={type}>
                  {index > 0 && <CommandSeparator />}
                  <CommandGroup heading={resultTypeDetails[type].label}>
                    {results.map((result) => (
                      <CommandItem
                        key={`${result.type}:${result.id}`}
                        value={`${result.type}:${result.id}`}
                        onSelect={() => go(result.href)}
                      >
                        <SearchResultIcon result={result} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{result.title}</span>
                          <span className="block truncate text-xs text-muted-foreground sm:hidden">
                            {result.subtitle}
                          </span>
                        </span>
                        <CommandShortcut>{result.subtitle}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              )
            })
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
