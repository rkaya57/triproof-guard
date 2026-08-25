"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, History, Plus, RefreshCw, RotateCcw, Trash2, Webhook } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Delivery = {
  id: string
  eventType: string | null
  status: string
  statusCode: number | null
  errorMessage: string | null
  responseBody?: string | null
  attemptCount: number
  createdAt: string
  deliveredAt: string | null
}

type Health = {
  state: "healthy" | "degraded" | "failing" | "idle" | "paused"
  recentAttempts: number
  recentSuccesses: number
  recentFailures: number
  recentPending: number
  recentSuccessRate: number | null
  consecutiveFailures: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

type Endpoint = {
  id: string
  url: string
  eventTypes: string[]
  isActive: boolean
  description: string | null
  createdAt: string
  health: Health
  latestDeliveries: Delivery[]
}

const preferredDefaults = [
  "analysis.completed",
  "analysis.review_required",
  "decision_package.ready",
] as const

function displayEvent(event: string | null) {
  return (event ?? "unknown.event").replaceAll("_", " ")
}

function healthClass(state: Health["state"]) {
  if (state === "healthy") return "border-green-400/30 text-green-200"
  if (state === "failing") return "border-red-400/30 text-red-200"
  if (state === "degraded") return "border-amber-400/30 text-amber-200"
  return "border-border text-muted-foreground"
}

function formatRate(value: number | null) {
  if (value === null) return "—"
  return `${Math.round(value * 100)}%`
}

export function WebhookManager() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [supportedEvents, setSupportedEvents] = useState<string[]>([])
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("Campaign automation")
  const [selectedEvents, setSelectedEvents] = useState<string[]>([...preferredDefaults])
  const [revealedSecret, setRevealedSecret] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [historyOpen, setHistoryOpen] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, Delivery[]>>({})
  const [historyCursor, setHistoryCursor] = useState<Record<string, string | null>>({})
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null)

  async function load() {
    const response = await fetch("/api/v2/webhooks", { cache: "no-store" })
    if (!response.ok) return
    const body = await response.json()
    const supported = Array.isArray(body.supportedEvents) ? body.supportedEvents.map(String) : []
    setSupportedEvents(supported)
    setEndpoints(Array.isArray(body.endpoints) ? body.endpoints : [])
    setSelectedEvents((current) => current.filter((event) => supported.length === 0 || supported.includes(event)))
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const eventOptions = useMemo(
    () => supportedEvents.length ? supportedEvents : [...preferredDefaults],
    [supportedEvents],
  )

  function toggleEvent(event: string) {
    setSelectedEvents((current) => current.includes(event)
      ? current.filter((item) => item !== event)
      : [...current, event])
  }

  async function createEndpoint() {
    setPending(true)
    setError("")
    setRevealedSecret("")
    try {
      const response = await fetch("/api/v2/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, description, eventTypes: selectedEvents }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not create webhook endpoint.")
      setRevealedSecret(body.secret ?? "")
      setUrl("")
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create webhook endpoint.")
    } finally {
      setPending(false)
    }
  }

  async function setActive(endpoint: Endpoint, isActive: boolean) {
    setPending(true)
    setError("")
    try {
      const response = await fetch(`/api/v2/webhooks/${endpoint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not update webhook endpoint.")
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update webhook endpoint.")
    } finally {
      setPending(false)
    }
  }

  async function removeEndpoint(endpoint: Endpoint) {
    if (!window.confirm(`Delete webhook endpoint ${endpoint.url}? Delivery history for this endpoint will be removed.`)) return
    setPending(true)
    setError("")
    try {
      const response = await fetch(`/api/v2/webhooks/${endpoint.id}`, { method: "DELETE" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not delete webhook endpoint.")
      setHistory((current) => {
        const next = { ...current }
        delete next[endpoint.id]
        return next
      })
      await load()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete webhook endpoint.")
    } finally {
      setPending(false)
    }
  }

  async function loadHistory(endpointId: string, append = false) {
    setError("")
    try {
      const cursor = append ? historyCursor[endpointId] : null
      const query = new URLSearchParams({ limit: "25" })
      if (cursor) query.set("cursor", cursor)
      const response = await fetch(`/api/v2/webhooks/${endpointId}/deliveries?${query.toString()}`, { cache: "no-store" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not load webhook delivery history.")
      const deliveries = Array.isArray(body.deliveries) ? body.deliveries : []
      setHistory((current) => ({
        ...current,
        [endpointId]: append ? [...(current[endpointId] ?? []), ...deliveries] : deliveries,
      }))
      setHistoryCursor((current) => ({ ...current, [endpointId]: body.nextCursor ?? null }))
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Could not load webhook delivery history.")
    }
  }

  async function toggleHistory(endpointId: string) {
    if (historyOpen === endpointId) {
      setHistoryOpen(null)
      return
    }
    setHistoryOpen(endpointId)
    if (!history[endpointId]) await loadHistory(endpointId)
  }

  async function retryDelivery(endpoint: Endpoint, delivery: Delivery) {
    setRetryingDeliveryId(delivery.id)
    setError("")
    try {
      const response = await fetch(`/api/v2/webhooks/${endpoint.id}/deliveries/${delivery.id}/retry`, { method: "POST" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not retry webhook delivery.")
      await Promise.all([load(), loadHistory(endpoint.id)])
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Could not retry webhook delivery.")
    } finally {
      setRetryingDeliveryId(null)
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value)
  }

  function renderDelivery(endpoint: Endpoint, delivery: Delivery) {
    const retryable = endpoint.isActive && delivery.status === "failed" && delivery.attemptCount < 10
    return (
      <div key={delivery.id} className="grid gap-1 rounded-lg border border-border/70 bg-background/40 p-2.5 text-xs sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate font-mono text-muted-foreground">{displayEvent(delivery.eventType)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            attempts {delivery.attemptCount}{delivery.statusCode ? ` · HTTP ${delivery.statusCode}` : ""}
          </p>
          {delivery.errorMessage && <p className="mt-1 break-words text-[11px] text-red-200/90">{delivery.errorMessage}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={delivery.status === "delivered" ? "text-green-300" : delivery.status === "failed" ? "text-red-300" : "text-amber-200"}>{delivery.status}</span>
          {retryable && (
            <Button type="button" variant="outline" size="sm" disabled={retryingDeliveryId === delivery.id} onClick={() => void retryDelivery(endpoint, delivery)}>
              <RotateCcw data-icon="inline-start" /> Retry
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-white"><Webhook className="text-primary" />Campaign webhooks</CardTitle>
            <CardDescription>Signed delivery, endpoint health, delivery history and controlled retries for API Growth integrations.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void load()}>
            <RefreshCw data-icon="inline-start" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="grid gap-3 rounded-xl border border-border bg-background/45 p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourapp.com/api/triproof-webhook" />
            <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="Description" />
          </div>
          <div className="flex flex-wrap gap-2">
            {eventOptions.map((event) => {
              const selected = selectedEvents.includes(event)
              return (
                <button type="button" key={event} onClick={() => toggleEvent(event)} className={`rounded-lg border px-3 py-2 font-mono text-xs transition ${selected ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/25"}`}>
                  {displayEvent(event)}
                </button>
              )
            })}
          </div>
          <div><Button type="button" disabled={pending || !url.trim() || selectedEvents.length === 0} onClick={createEndpoint}><Plus data-icon="inline-start" /> Create webhook</Button></div>
        </div>

        {revealedSecret && (
          <div className="rounded-xl border border-primary/35 bg-primary/10 p-4">
            <p className="text-sm font-medium text-primary">Copy this signing secret now</p>
            <p className="mt-1 text-xs text-muted-foreground">It is shown only at endpoint creation time.</p>
            <code className="mt-3 block break-all text-xs text-foreground">{revealedSecret}</code>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => copy(revealedSecret)}><Copy data-icon="inline-start" /> Copy secret</Button>
          </div>
        )}

        <div className="grid gap-3">
          {endpoints.length === 0 ? <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p> : endpoints.map((endpoint) => (
            <div key={endpoint.id} className="rounded-xl border border-border bg-background/45 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={endpoint.isActive ? "border-green-400/30 text-green-200" : "border-amber-400/30 text-amber-200"}>{endpoint.isActive ? "Active" : "Paused"}</Badge>
                    <Badge variant="outline" className={healthClass(endpoint.health.state)}>Health: {endpoint.health.state}</Badge>
                    {endpoint.description && <span className="text-sm font-medium">{endpoint.description}</span>}
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{endpoint.url}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Recent success {formatRate(endpoint.health.recentSuccessRate)} · failures {endpoint.health.recentFailures} · consecutive {endpoint.health.consecutiveFailures}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{endpoint.eventTypes.map((event) => <Badge key={event} variant="secondary" className="font-mono text-[10px]">{event}</Badge>)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void toggleHistory(endpoint.id)}><History data-icon="inline-start" /> {historyOpen === endpoint.id ? "Hide history" : "History"}</Button>
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setActive(endpoint, !endpoint.isActive)}>{endpoint.isActive ? "Pause" : "Resume"}</Button>
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => removeEndpoint(endpoint)}><Trash2 data-icon="inline-start" /> Delete</Button>
                </div>
              </div>

              {endpoint.latestDeliveries.length > 0 && historyOpen !== endpoint.id && (
                <div className="mt-4 grid gap-2 border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent deliveries</p>
                  {endpoint.latestDeliveries.slice(0, 5).map((delivery) => renderDelivery(endpoint, delivery))}
                </div>
              )}

              {historyOpen === endpoint.id && (
                <div className="mt-4 grid gap-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery history</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void loadHistory(endpoint.id)}><RefreshCw data-icon="inline-start" /> Refresh history</Button>
                  </div>
                  {(history[endpoint.id] ?? []).map((delivery) => renderDelivery(endpoint, delivery))}
                  {(history[endpoint.id] ?? []).length === 0 && <p className="text-xs text-muted-foreground">No deliveries recorded yet.</p>}
                  {historyCursor[endpoint.id] && <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => void loadHistory(endpoint.id, true)}>Load more</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
