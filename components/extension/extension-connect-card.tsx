"use client"

import { FormEvent, useState } from "react"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function ExtensionConnectCard({ requestId, userName }: { requestId: string; userName: string }) {
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [complete, setComplete] = useState(false)

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/extension/connect/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, verificationCode: code }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(body.error ?? "Could not connect this extension.")
        return
      }
      setComplete(true)
    } catch {
      setError("Could not reach Tri-Proof Guard. Check your connection and try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="security-grid flex min-h-screen items-center justify-center px-5 py-12">
      <Card className="glass-panel w-full max-w-lg">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3 text-primary"><ShieldCheck className="size-8" /><span className="font-mono text-xs uppercase tracking-[0.16em]">ScamGuard extension</span></div>
          <CardTitle>Connect this browser securely.</CardTitle>
          <CardDescription>Confirm the six-character code displayed in the ScamGuard popup. This gives the extension your plan access, never your password, private keys, or wallet secrets.</CardDescription>
        </CardHeader>
        <CardContent>
          {complete ? (
            <div className="space-y-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-5 text-sm text-emerald-50">
              <CheckCircle2 className="size-6 text-emerald-300" />
              <div><p className="font-semibold">This browser is connected.</p><p className="mt-1 text-emerald-100/80">Return to the ScamGuard extension. Your plan and daily allowance will appear automatically.</p></div>
            </div>
          ) : (
            <form onSubmit={approve} className="space-y-5">
              <p className="text-sm text-muted-foreground">Signed in as <span className="font-semibold text-foreground">{userName}</span></p>
              <label className="grid gap-2 text-sm font-medium">Verification code<Input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6))} autoComplete="one-time-code" placeholder="A1B2C3" className="font-mono tracking-[0.22em]" required /></label>
              {error && <p className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}
              <Button type="submit" disabled={pending || code.length !== 6} className="w-full">{pending && <Loader2 data-icon="inline-start" className="animate-spin" />} Connect ScamGuard</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
