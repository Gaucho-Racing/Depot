import { useQuery } from "@tanstack/react-query"

import { listSentinelApplications } from "@/lib/depot"

/**
 * useApplications loads the Sentinel application list that Depot proxies.
 * Shared by every grant surface so the list is fetched once per session.
 */
export function useApplications() {
  return useQuery({
    queryKey: ["sentinelApplications"],
    queryFn: listSentinelApplications,
    staleTime: 5 * 60 * 1000,
  })
}
