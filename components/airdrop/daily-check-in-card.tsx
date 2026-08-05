"use client"

import { useEffect, useState } from "react"
import {
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type DailyCheckInState = {
  status: "READY" | "CLAIMED" | "REGISTRATION_REQUIRED"
  points: number
  checkInDate: string
  claimedAt: string | null
  pointsAwarded: number
  nextResetAt: string
}

type DailyCheckInResponse = {
  dailyCheckIn: DailyCheckInState
  totalPoints: number
  alreadyClaimed?: boolean
  error?: string
}

function formatDateTime(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

async function readBody(response: Response) {
  return (await response.json().catch(() => null)) as DailyCheckInResponse | null
}

export function AirdropDailyCheckInCard() {
  const [state, setState] = useState<DailyCheckInState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/airdrop/daily-check-in?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      const body = await readBody(response)
      if (!response.ok || !body?.dailyCheckIn) {
        throw new Error(body?.error || "Could not load the daily check-in.")
      }
      setState(body.dailyCheckIn)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the daily check-in.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialState() {
      try {
        const response = await fetch(`/api/airdrop/daily-check-in?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        })
        const body = await readBody(response)
        if (!response.ok || !body?.dailyCheckIn) {
          throw new Error(body?.error || "Could not load the daily check-in.")
        }
        if (!cancelled) setState(body.dailyCheckIn)
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load the daily check-in.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadInitialState()
    return () => {
      cancelled = true
    }
  }, [])

  async function claim() {
    if (busy || state?.status === "CLAIMED") return
    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch("/api/airdrop/daily-check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const body = await readBody(response)
      if (!response.ok || !body?.dailyCheckIn) {
        throw new Error(body?.error || "Could not complete the daily check-in.")
      }

      setState(body.dailyCheckIn)
      setMessage(
        body.alreadyClaimed
          ? "Today's check-in was already credited."
          : `Daily check-in complete. +${body.dailyCheckIn.pointsAwarded} points credited.`
      )

      if (!body.alreadyClaimed) {
        window.setTimeout(() => window.location.reload(), 900)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete the daily check-in.")
    } finally {
      setBusy(false)
    }
  }

  const claimed = state?.status === "CLAIMED"
  const registrationRequired = state?.status === "REGISTRATION_REQUIRED"

  return (
    <Card className="glass-panel premium-card overflow-hidden border-cyan-400/25 bg-cyan-400/[0.045]">
      <CardHeader className="relative">
        <div className="pointer-events-none absolute right-0 top-0 size-40 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
              <CalendarCheck2 className="size-6" />
            </span>
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="secondary"><Sparkles className="size-3.5" /> Daily reward</Badge>
                <Badge variant="outline" className="border-cyan-300/30 text-cyan-100">+25 points</Badge>
              </div>
              <CardTitle className="text-2xl text-white">Daily check-in</CardTitle>
              <CardDescription className="mt-2 max-w-2xl leading-6 text-slate-300">
                Check in once per UTC day and receive 25 points instantly. Duplicate requests are locked at the database level.
              </CardDescription>
            </div>
          </div>

          <Badge
            variant="outline"
            className={claimed
              ? "border-green-400/30 bg-green-400/10 text-green-200"
              : registrationRequired
                ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
                : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"}
          >
            {loading ? "Checking status" : claimed ? "Claimed today" : registrationRequired ? "Profile required" : "Ready to claim"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/45 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Today&apos;s UTC cycle</p>
            <p className="mt-1 font-mono text-white">{state?.checkInDate ?? "Loading…"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/45 p-3">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><Clock3 className="size-3.5" /> Next reset</p>
            <p className="mt-1 text-sm text-white">{state ? formatDateTime(state.nextResetAt) : "Loading…"}</p>
          </div>
        </div>

        <div className="flex min-w-56 flex-col gap-2">
          {loading ? (
            <Button disabled><Loader2 className="animate-spin" /> Loading check-in</Button>
          ) : registrationRequired ? (
            <Button variant="outline" onClick={() => void load()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
              Refresh after registration
            </Button>
          ) : claimed ? (
            <Button disabled className="border-green-400/30 bg-green-400/15 text-green-100">
              <CheckCircle2 /> +{state?.pointsAwarded || state?.points || 25} points claimed
            </Button>
          ) : (
            <Button onClick={() => void claim()} disabled={busy} className="glow-primary">
              {busy ? <Loader2 className="animate-spin" /> : <CalendarCheck2 />}
              {busy ? "Crediting points…" : "Check in and earn 25 pts"}
            </Button>
          )}
          {registrationRequired && <p className="text-center text-xs text-yellow-100">Create the contribution profile below, then refresh this card.</p>}
        </div>

        {(message || error) && (
          <div className={`rounded-xl border p-3 text-sm lg:col-span-2 ${error ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-green-400/25 bg-green-400/10 text-green-100"}`}>
            {error ?? message}
          </div>
        )}

        {claimed && state?.claimedAt && (
          <p className="text-xs text-muted-foreground lg:col-span-2">Credited at {formatDateTime(state.claimedAt)}. The next claim opens after the UTC reset.</p>
        )}
      </CardContent>
    </Card>
  )
}
