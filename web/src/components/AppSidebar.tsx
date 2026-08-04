import { Container, Gauge, ScanBarcode, Settings, Warehouse } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import { HazardTape } from "@/components/freight"
import { dockLabel, useDepotStatus } from "@/lib/status"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/dashboard", label: "Terminal", icon: Gauge },
  { to: "/buckets", label: "Bays", icon: Warehouse },
  { to: "/search", label: "Tracking", icon: ScanBarcode },
  { to: "/settings", label: "Settings", icon: Settings },
]

function isActive(currentPath: string, target: string) {
  return currentPath === target || currentPath.startsWith(`${target}/`)
}

export function AppSidebar() {
  const { pathname } = useLocation()
  const { env } = useDepotStatus()

  return (
    <aside className="hidden border-r border-sidebar-border/70 bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col">
      <div className="border-b border-sidebar-border/70">
        <HazardTape />
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="flex size-9 items-center justify-center rounded-md bg-gradient-to-br from-gr-purple to-gr-pink text-primary-foreground shadow-sm shadow-primary/25">
            <Container className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="stencil text-lg leading-none">The Depot</div>
            <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              GR Freight Terminal
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const active = isActive(pathname, item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "stencil flex h-10 items-center gap-2.5 rounded-md border border-transparent px-3 text-[13px] transition-colors",
                active
                  ? "border-primary/30 bg-primary text-primary-foreground shadow-sm shadow-primary/15"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="px-3 pb-4">
        <div className="rounded-md bg-gradient-to-r from-gr-purple to-gr-pink px-3 py-2 text-white shadow-sm shadow-primary/20">
          <p className="stencil text-[11px]">{dockLabel(env)}</p>
          <p className="mt-0.5 font-mono text-[10px] text-white/75">
            authorized personnel only
          </p>
        </div>
      </div>
    </aside>
  )
}
