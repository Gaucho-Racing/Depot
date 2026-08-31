import { AppWindow } from "lucide-react"

import type { SentinelApplication } from "@/lib/depot"
import { cn } from "@/lib/utils"

type ApplicationVisual = Pick<SentinelApplication, "name" | "client_id" | "icon_url">
type DisplaySize = "sm" | "md"

const iconSizes: Record<DisplaySize, string> = {
  sm: "size-6 rounded-md",
  md: "size-8 rounded-lg",
}

export function ApplicationIcon({
  application,
  size = "md",
}: {
  application?: ApplicationVisual
  size?: DisplaySize
}) {
  if (application?.icon_url) {
    return (
      <img
        src={application.icon_url}
        alt=""
        className={cn(iconSizes[size], "shrink-0 object-cover")}
      />
    )
  }
  return (
    <span
      className={cn(
        iconSizes[size],
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-gr-purple to-gr-pink text-white",
      )}
    >
      <AppWindow className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  )
}

export function ApplicationDisplay({
  clientID,
  application,
  size = "md",
  showClientID = true,
  className,
}: {
  clientID: string
  application?: ApplicationVisual
  size?: DisplaySize
  showClientID?: boolean
  className?: string
}) {
  const name = application?.name || clientID || "Unknown application"
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <ApplicationIcon application={application} size={size} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate font-medium", size === "sm" ? "text-xs" : "text-sm")}>
          {name}
        </span>
        {showClientID && clientID && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">{clientID}</span>
        )}
      </span>
    </div>
  )
}
