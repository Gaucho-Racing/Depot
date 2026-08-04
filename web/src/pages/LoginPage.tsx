import { Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"

import { api } from "@/lib/api"
import { clearSession, saveSession } from "@/lib/auth"

const sentinelURL = import.meta.env.VITE_SENTINEL_URL ?? "https://sso.gauchoracing.com"
const sentinelClientID = import.meta.env.VITE_SENTINEL_CLIENT_ID ?? ""
const oauthScope = "user:read groups:read"

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const exchangedRef = useRef(false)
  const redirectedRef = useRef(false)
  const [loading, setLoading] = useState(!searchParams.has("error"))
  const [errorMessage, setErrorMessage] = useState("")
  const fromLocation = (
    location.state as {
      from?: { pathname: string; search?: string; hash?: string }
    } | null
  )?.from
  const from = fromLocation
    ? `${fromLocation.pathname}${fromLocation.search ?? ""}${fromLocation.hash ?? ""}`
    : "/dashboard"

  useEffect(() => {
    if (exchangedRef.current) return
    const code = searchParams.get("code")
    const oauthError = searchParams.get("error")
    if (!code) {
      if (oauthError) {
        return
      }
      if (redirectedRef.current) return
      redirectedRef.current = true
      redirectToSentinel(from)
      return
    }
    exchangedRef.current = true

    void (async () => {
      setLoading(true)
      try {
        const response = await api.post<TokenResponse>(
          `/auth/login?code=${encodeURIComponent(code)}`,
        )
        saveSession({
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresIn: response.data.expires_in,
        })
        navigate(sanitizeReturnTo(searchParams.get("state") || from), { replace: true })
      } catch (error) {
        clearSession()
        const message =
          (error as { response?: { data?: { error?: string; message?: string } } })?.response
            ?.data?.error ??
          (error as { response?: { data?: { error?: string; message?: string } } })?.response
            ?.data?.message ??
          "Sentinel sign-on failed. Please try again."
        setErrorMessage(message)
        setLoading(false)
        navigate("/auth/login?error=oauth", { replace: true })
      }
    })()
  }, [from, navigate, searchParams])

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="hazard-tape h-2 w-full" />
        <div className="space-y-5 px-6 py-8 text-center">
          <div>
            <p className="stencil text-xl">Security Checkpoint</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              GR Freight Terminal · Dock 9999
            </p>
          </div>

          {loading && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying credentials with Sentinel...</p>
            </div>
          )}

          {!loading && (searchParams.get("error") || errorMessage) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage || "Sentinel sign-on failed. Please try again."}
            </div>
          )}
        </div>
        <div className="hazard-tape h-2 w-full" />
      </div>
    </main>
  )
}

function redirectToSentinel(returnTo: string) {
  const params = new URLSearchParams({
    client_id: sentinelClientID,
    response_type: "code",
    redirect_uri: `${window.location.origin}/auth/login`,
    scope: oauthScope,
    prompt: "none",
    state: sanitizeReturnTo(returnTo),
  })
  window.location.href = `${sentinelURL.replace(/\/+$/, "")}/oauth/authorize?${params.toString()}`
}

function sanitizeReturnTo(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/api/")) {
    return "/dashboard"
  }
  return value
}
