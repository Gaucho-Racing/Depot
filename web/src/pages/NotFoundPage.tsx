import { PackageSearch } from "lucide-react"
import { Link } from "react-router-dom"

import { Stamp } from "@/components/freight"
import { Button } from "@/components/ui/button"

export default function NotFoundPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="space-y-5 text-center">
        <PackageSearch className="mx-auto size-10 text-muted-foreground" />
        <div className="space-y-2">
          <h1 className="stencil text-3xl">Lost Cargo</h1>
          <p className="text-sm text-muted-foreground">
            Nothing on the manifest at this address.
          </p>
        </div>
        <Stamp className="text-sm text-destructive">404 — Not on record</Stamp>
        <div>
          <Button asChild variant="outline">
            <Link to="/dashboard">Return to terminal</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
