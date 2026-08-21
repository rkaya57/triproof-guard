"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, Plus, RefreshCw, Trash2, Webhook } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Delivery = {
  id: string
  eventType: string
  status: string
  statusCode: number | null
  errorMessage: string | null
  createdAt: string
  deliveredAt: string | null
}

type Endpoint = {
  id: string
  url: string
  eventTypes: string[]
  isActive: boolean
  description: string | null
  createdAt: string
  latestDeliveries: Delivery[]
}

const preferredDefaults = [
  "analysis.completed",
  "analysis.review_required",
  "decision_package.ready",
] as const

function displayEvent(event: string) {
  return event.replaceAll("_", " ")
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

  async function load() {
    const response = await fetch("/api/webhooks", { cache: "no-store" })
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
      const response = await fetch("/api/webhooks", {
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
      const response = await fetch(`/api/webhooks/${endpoint.id}`, {
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
      const response = await fetch(`/api/webhooks/${endpoint.id}`, { method: "DELETE" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not delete webhook endpoint.")
      await load()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete webhook endpoint.")
    } finally {
      setPending(false)
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value)
  }

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-white"><Webhook className="text-primary" />Campaign webhooks</CardTitle>
            <CardDescription>Receive signed campaign events in your backend. API Growth or administrator webhook access is required.</CardDescription>
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
                <button
                  type="button"
                  key={event}
                  onClick={() => toggleEvent(event)}
                  className={`rounded-lg border px-3 py-2 font-mono text-xs transition ${selected ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/25"}`}
                >
                  {displayEvent(event)}
                </button>
              )
            })}
          </div>
          <div>
            <Button type="button" disabled={pending || !url.trim() || selectedEvents.length === 0} onClick={createEndpoint}>
              <Plus data-icon="inline-start" /> Create webhook
            </Button>
          </div>
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
          {endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>
          ) : endpoints.map((endpoint) => (
            <div key={endpoint.id} className="rounded-xl border border-border bg-background/45 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={endpoint.isActive ? "border-green-400/30 text-green-200" : "border-amber-400/30 text-amber-200"}>{endpoint.isActive ? "Active" : "Paused"}</Badge>
                    {endpoint.description && <span className="text-sm font-medium">{endpoint.description}</span>}
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{endpoint.url}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{endpoint.eventTypes.map((event) => <Badge key={event} variant="secondary" className="font-mono text-[10px]">{event}</Badge>)}</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setActive(endpoint, !endpoint.isActive)}>{endpoint.isActive ? "Pause" : "Resume"}</Button>
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => removeEndpoint(endpoint)}><Trash2 data-icon="inline-start" /> Delete</Button>
                </div>
              </div>

              {endpoint.latestDeliveries.length > 0 && (
                <div className="mt-4 grid gap-2 border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent deliveries</p>
                  {endpoint.latestDeliveries.map((delivery) => (
                    <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{delivery.eventType}</span>
                      <span className={delivery.status === "delivered" ? "text-green-300" : delivery.status === "failed" ? "text-red-300" : "text-amber-200"}>
                        {delivery.status}{delivery.statusCode ? ` · HTTP ${delivery.statusCode}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
