"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, Laptop, Link2, Loader2, LogOut, ShieldCheck, Smartphone, Trash2, WalletCards } from "lucide-react"

import { WalletAuthButtons } from "@/components/auth/wallet-auth-buttons"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AccountData = {
  profile: {
    email: string
    emailVerifiedAt: string | null
    referralCode: string | null
  } | null
  sessions: Array<{
    id: string
    userAgent: string | null
    createdAt: string
    lastSeenAt: string
    expiresAt: string
    current: boolean
  }>
  wallets: Array<{
    id: string
    chain: string
    address: string
    createdAt: string
    lastUsedAt: string | null
  }>
}

type ErrorResponse = { error?: string }

function isAccountData(value: AccountData | ErrorResponse | null): value is AccountData {
  return Boolean(value && "sessions" in value && Array.isArray(value.sessions) && "wallets" in value)
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown device"
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Browser"
  const platform = /Windows/i.test(userAgent) ? "Windows" : /Android/i.test(userAgent) ? "Android" : /iPhone|iPad/i.test(userAgent) ? "iOS" : /Mac OS/i.test(userAgent) ? "macOS" : /Linux/i.test(userAgent) ? "Linux" : "device"
  return `${browser} on ${platform}`
}

function shortAddress(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

export function AccountSecurity() {
  const router = useRouter()
  const [data, setData] = useState<AccountData | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [pendingId, setPendingId] = useState("")

  async function load() {
    const response = await fetch("/api/auth/account", { cache: "no-store" })
    const body = (await response.json().catch(() => null)) as AccountData | ErrorResponse | null
    if (!response.ok || !isAccountData(body)) {
      const errorBody = body && "error" in body ? body : null
      setError(errorBody?.error || "Could not load account security.")
      return
    }
    setData(body)
  }

  useEffect(() => {
    void load()
  }, [])

  async function revokeSession(id: string) {
    setPendingId(id)
    const response = await fetch(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" })
    const body = (await response.json().catch(() => null)) as { error?: string; currentRevoked?: boolean } | null
    setPendingId("")
    if (!response.ok) {
      setError(body?.error || "Could not revoke this session.")
      return
    }
    if (body?.currentRevoked) {
      router.replace("/login")
      router.refresh()
      return
    }
    setMessage("Session revoked.")
    await load()
  }

  async function logoutEverywhere() {
    setPendingId("all")
    const response = await fetch("/api/auth/logout-all", { method: "POST" })
    setPendingId("")
    if (!response.ok) {
      setError("Could not revoke all sessions.")
      return
    }
    router.replace("/login")
    router.refresh()
  }

  async function copyReferral() {
    const code = data?.profile?.referralCode
    if (!code) return
    const path = `/register?ref=${encodeURIComponent(code)}`
    await navigator.clipboard.writeText(new URL(path, window.location.origin).toString())
    setMessage("Referral link copied.")
  }

  if (!data) {
    return <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 animate-spin" /> Loading account security…</div>
  }

  const referralPath = data.profile?.referralCode
    ? `/register?ref=${encodeURIComponent(data.profile.referralCode)}`
    : ""

  return (
    <div className="grid gap-5">
      {(error || message) && (
        <Alert variant={error ? "destructive" : "default"}>
          <AlertDescription>{error || message}</AlertDescription>
        </Alert>
      )}

      <Card className="glass-panel premium-card">
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="text-primary" /> Account protection</CardTitle>
            <CardDescription>Review verified identity, active devices, linked wallets, and emergency session controls.</CardDescription>
          </div>
          <Button type="button" variant="destructive" disabled={pendingId === "all"} onClick={logoutEverywhere}>
            {pendingId === "all" ? <Loader2 className="animate-spin" /> : <LogOut />}
            Sign out all devices
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{data.profile?.email}</Badge>
          <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">Email verified</Badge>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><Laptop className="text-primary" /> Active sessions</CardTitle>
            <CardDescription>End any session you do not recognize. Current-device removal signs you out immediately.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/45 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    {/Android|iPhone|iPad/i.test(session.userAgent || "") ? <Smartphone className="size-4 text-primary" /> : <Laptop className="size-4 text-primary" />}
                    {deviceLabel(session.userAgent)}
                    {session.current && <Badge variant="secondary">Current</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Last active {new Date(session.lastSeenAt).toLocaleString()}</p>
                </div>
                <Button type="button" size="icon" variant="outline" aria-label="Revoke session" disabled={pendingId === session.id} onClick={() => revokeSession(session.id)}>
                  {pendingId === session.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><WalletCards className="text-primary" /> Linked wallets</CardTitle>
            <CardDescription>Link EVM or Solana ownership for non-custodial sign-in. No transaction or approval is requested.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <WalletAuthButtons purpose="LINK" onComplete={() => { setMessage("Wallet linked successfully."); void load() }} onError={setError} />
            <div className="grid gap-2">
              {data.wallets.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No wallets linked yet.</p>}
              {data.wallets.map((wallet) => (
                <div key={wallet.id} className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-3 text-sm">
                  <span className="flex items-center gap-2"><Link2 className="size-4 text-primary" /><Badge variant="outline">{wallet.chain}</Badge><code>{shortAddress(wallet.address)}</code></span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {data.profile?.referralCode && (
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="text-white">Referral attribution</CardTitle>
            <CardDescription>New registrations created through your unique URL are attributed to your account.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-lg border border-border bg-background/60 p-3 text-xs text-primary">{referralPath}</code>
            <Button type="button" variant="outline" onClick={copyReferral}><Copy /> Copy link</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
