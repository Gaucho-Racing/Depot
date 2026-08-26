import { AppWindow, Check, Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useApplications } from "@/lib/applications"
import { type BucketAccess, type SentinelApplication } from "@/lib/depot"
import { cn } from "@/lib/utils"

export type ApplicationAccess = {
  client_id: string
  access: BucketAccess
}

function matches(app: SentinelApplication, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return app.name.toLowerCase().includes(q) || app.client_id.toLowerCase().includes(q)
}

function AppIcon({ app }: { app?: SentinelApplication }) {
  if (app?.icon_url) {
    return <img src={app.icon_url} alt="" className="size-7 shrink-0 rounded-md object-cover" />
  }
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-gr-purple to-gr-pink text-white">
      <AppWindow className="size-3.5" />
    </div>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-input/80 px-2.5">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        autoComplete="off"
      />
    </div>
  )
}

function ResultsList({
  applications,
  isLoading,
  isError,
  query,
  isSelected,
  onPick,
}: {
  applications: SentinelApplication[]
  isLoading: boolean
  isError: boolean
  query: string
  isSelected: (clientID: string) => boolean
  onPick: (app: SentinelApplication) => void
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Could not load applications from Sentinel. Check that SENTINEL_SA_TOKEN is set and still
        valid — Depot uses its own service account to read the application list.
      </p>
    )
  }
  const results = applications.filter((app) => matches(app, query))
  if (results.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {applications.length === 0 ? "No applications in Sentinel." : "No applications match."}
      </p>
    )
  }
  return (
    <ul className="max-h-64 overflow-y-auto p-1">
      {results.map((app) => {
        const selected = isSelected(app.client_id)
        return (
          <li key={app.id}>
            <button
              type="button"
              onClick={() => onPick(app)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                selected ? "bg-accent" : "hover:bg-muted/50",
              )}
            >
              <AppIcon app={app} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{app.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {app.client_id}
                </span>
              </span>
              {selected && <Check className="size-4 shrink-0 text-gr-purple" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function AccessSelect({
  value,
  onChange,
}: {
  value: BucketAccess
  onChange: (access: BucketAccess) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as BucketAccess)}>
      <SelectTrigger size="sm" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="READ">Read</SelectItem>
        <SelectItem value="WRITE">Write</SelectItem>
      </SelectContent>
    </Select>
  )
}

/**
 * ApplicationAccessPicker selects any number of applications and the access
 * each one gets. Used where grants are chosen up front, e.g. bucket creation.
 */
export function ApplicationAccessPicker({
  value,
  onChange,
  readIsRedundant = false,
}: {
  value: ApplicationAccess[]
  onChange: (next: ApplicationAccess[]) => void
  readIsRedundant?: boolean
}) {
  const [query, setQuery] = useState("")
  const { data, isLoading, isError } = useApplications()
  const applications = useMemo(() => data ?? [], [data])
  const byClientID = useMemo(
    () => new Map(applications.map((app) => [app.client_id, app])),
    [applications],
  )

  function toggle(app: SentinelApplication) {
    const existing = value.find((entry) => entry.client_id === app.client_id)
    if (existing) {
      onChange(value.filter((entry) => entry.client_id !== app.client_id))
      return
    }
    onChange([...value, { client_id: app.client_id, access: "READ" }])
  }

  function setAccess(clientID: string, access: BucketAccess) {
    onChange(value.map((entry) => (entry.client_id === clientID ? { ...entry, access } : entry)))
  }

  return (
    <div className="space-y-3">
      {readIsRedundant && value.some((entry) => entry.access === "READ") && (
        <p className="text-xs text-muted-foreground">
          Read grants below have no effect while the bucket is readable by any authenticated
          application.
        </p>
      )}
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((entry) => {
            const app = byClientID.get(entry.client_id)
            return (
              <li
                key={entry.client_id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2"
              >
                <AppIcon app={app} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {app?.name ?? entry.client_id}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {entry.client_id}
                  </span>
                </span>
                <AccessSelect
                  value={entry.access}
                  onChange={(access) => setAccess(entry.client_id, access)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(value.filter((e) => e.client_id !== entry.client_id))}
                >
                  <X className="size-4" />
                  <span className="sr-only">Remove {entry.client_id}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="rounded-lg border border-border">
        <div className="border-b border-border p-2">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search applications by name or client ID"
          />
        </div>
        <ResultsList
          applications={applications}
          isLoading={isLoading}
          isError={isError}
          query={query}
          isSelected={(clientID) => value.some((entry) => entry.client_id === clientID)}
          onPick={toggle}
        />
      </div>
    </div>
  )
}

/**
 * ApplicationSelect picks a single application plus its access level, for
 * granting access to a bucket that already exists.
 */
export function ApplicationSelect({
  clientID,
  access,
  onSelect,
  onAccessChange,
  excludeClientIDs = [],
}: {
  clientID: string
  access: BucketAccess
  onSelect: (clientID: string) => void
  onAccessChange: (access: BucketAccess) => void
  excludeClientIDs?: string[]
}) {
  const [query, setQuery] = useState("")
  const { data, isLoading, isError } = useApplications()
  const applications = useMemo(
    () => (data ?? []).filter((app) => !excludeClientIDs.includes(app.client_id)),
    [data, excludeClientIDs],
  )
  const selected = applications.find((app) => app.client_id === clientID)

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border">
        <div className="border-b border-border p-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search applications" />
        </div>
        <ResultsList
          applications={applications}
          isLoading={isLoading}
          isError={isError}
          query={query}
          isSelected={(id) => id === clientID}
          onPick={(app) => onSelect(app.client_id)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-sm">
          {selected ? (
            <>
              Granting <span className="font-medium">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select an application</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {access === "WRITE" ? "upload + download" : "download only"}
          </Badge>
          <AccessSelect value={access} onChange={onAccessChange} />
        </div>
      </div>
    </div>
  )
}
