"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, CirclePause, CirclePlay, Loader2, Settings2, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"

type Lifecycle = "draft" | "active" | "paused" | "completed" | "archived"
type RiskPolicy = "conservative" | "balanced" | "strict"

type CampaignOperationsPanelProps = {
  campaignId: string
  lifecycle: Lifecycle
  riskPolicy: RiskPolicy
  policyVersion: string | null
}

type OperationResponse = {
  error?: string
  code?: string
  lifecycle?: Lifecycle
  policy?: {
    preset: RiskPolicy
    version: number
  }
}

const lifecycleTransitions: Record<Lifecycle, Lifecycle[]> = {
  draft: ["active", "archived"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "completed", "archived"],
  completed: ["archived"],
  archived: [],
}

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function lifecycleLabel(value: Lifecycle) {
  if (value === "draft") return "Draft"
  if (value === "active") return "Active"
  if (value === "paused") return "Paused"
  if (value === "completed") return "Completed"
  return "Archived"
}

function lifecycleIcon(value: Lifecycle) {
  if (value === "active") return <CirclePlay className="size-4" />
  if (value === "paused") return <CirclePause className="size-4" />
  if (value === "archived") return <Archive className="size-4" />
  return <Settings2 className="size-4" />
}

export function CampaignOperationsPanel({
  campaignId,
  lifecycle,
  riskPolicy,
  policyVersion,
}: CampaignOperationsPanelProps) {
  const router = useRouter()
  const { toast } = useToast()
  const transitions = lifecycleTransitions[lifecycle]
  const [nextLifecycle, setNextLifecycle] = useState<Lifecycle | "">(transitions[0] ?? "")
  const [policyPreset, setPolicyPreset] = useState<RiskPolicy>(riskPolicy === "strict" ? "balanced" : "strict")
  const [rationale, setRationale] = useState("")
  const [lifecyclePending, setLifecyclePending] = useState(false)
  const [policyPending, setPolicyPending] = useState(false)
  const [error, setError] = useState("")

  const policyOptions = useMemo(
    () => (["conservative", "balanced", "strict"] as RiskPolicy[]).filter((preset) => preset !== riskPolicy),
    [riskPolicy],
  )

  async function changeLifecycle() {
    if (!nextLifecycle) return
    if (
      (nextLifecycle === "completed" || nextLifecycle === "archived") &&
      !window.confirm(
        nextLifecycle === "archived"
          ? "Archive this campaign? Campaign Operations v1 does not allow archived campaigns to be reopened."
          : "Mark this campaign completed? It can only be archived afterward and cannot return to active.",
      )
    ) return

    setError("")
    setLifecyclePending(true)
    try {
      const response = await fetch(`/api/v2/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle: nextLifecycle }),
      })
      const result = (await response.json().catch(() => ({}))) as OperationResponse
      if (response.status === 401) {
        router.push("/login")
        return
      }
      if (!response.ok) {
        setError(result.error ?? "Campaign lifecycle could not be changed")
        return
      }
      toast(`Campaign lifecycle changed to ${lifecycleLabel(nextLifecycle)}.`, "success")
      router.refresh()
    } catch {
      setError("Campaign lifecycle could not be changed. Please try again.")
    } finally {
      setLifecyclePending(false)
    }
  }

  async function activatePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPolicyPending(true)
    try {
      const response = await fetch(`/api/v2/campaigns/${campaignId}/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: policyPreset, rationale }),
      })
      const result = (await response.json().catch(() => ({}))) as OperationResponse
      if (response.status === 401) {
        router.push("/login")
        return
      }
      if (!response.ok || !result.policy) {
        setError(result.error ?? "Campaign policy version could not be activated")
        return
      }
      toast(`Policy v${result.policy.version} activated as ${result.policy.preset}.`, "success")
      setRationale("")
      router.refresh()
    } catch {
      setError("Campaign policy version could not be activated. Please try again.")
    } finally {
      setPolicyPending(false)
    }
  }

  const policyClosed = lifecycle === "completed" || lifecycle === "archived"

  return (
    <Card className="glass-panel premium-card border-violet-400/20">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Settings2 className="size-5 text-violet-300" /> Campaign Operations</CardTitle>
            <CardDescription className="mt-1">
              Control campaign lifecycle and activate a new versioned policy for future analysis runs.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">{lifecycle}</Badge>
            <Badge variant="outline" className="capitalize">{riskPolicy} {policyVersion ? `· ${policyVersion}` : ""}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-background/40 p-4">
          <h3 className="font-medium">Lifecycle</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pausing blocks new campaign analysis runs. Completed and archived states are intentionally one-way.
          </p>

          {transitions.length ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field className="flex-1">
                <FieldLabel htmlFor={`lifecycle-${campaignId}`}>Next state</FieldLabel>
                <select
                  id={`lifecycle-${campaignId}`}
                  className={selectClass}
                  value={nextLifecycle}
                  onChange={(event) => setNextLifecycle(event.target.value as Lifecycle)}
                >
                  {transitions.map((value) => (
                    <option key={value} value={value}>{lifecycleLabel(value)}</option>
                  ))}
                </select>
              </Field>
              <Button type="button" variant="outline" onClick={changeLifecycle} disabled={lifecyclePending || !nextLifecycle}>
                {lifecyclePending ? <Loader2 className="animate-spin" /> : nextLifecycle ? lifecycleIcon(nextLifecycle) : null}
                {lifecyclePending ? "Updating…" : "Change lifecycle"}
              </Button>
            </div>
          ) : (
            <Alert className="mt-4">
              <Archive />
              <AlertDescription>Archived is terminal in Campaign Operations v1. No reopen action is available.</AlertDescription>
            </Alert>
          )}
        </section>

        <section className="rounded-xl border border-border bg-background/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-medium">Versioned policy</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                A new policy affects future runs only. Existing wallet decisions and analysis packages are not recomputed.
              </p>
            </div>
            <Link href={`/dashboard/campaigns/${campaignId}/policy`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Simulate policy
            </Link>
          </div>

          {policyClosed ? (
            <Alert className="mt-4">
              <ShieldCheck />
              <AlertDescription>A {lifecycle} campaign cannot receive a new policy version.</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={activatePolicy} className="mt-4 flex flex-col gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`policy-${campaignId}`}>New preset</FieldLabel>
                  <select
                    id={`policy-${campaignId}`}
                    className={selectClass}
                    value={policyPreset}
                    onChange={(event) => setPolicyPreset(event.target.value as RiskPolicy)}
                  >
                    {policyOptions.map((preset) => (
                      <option key={preset} value={preset}>{preset[0].toUpperCase()}{preset.slice(1)}</option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`policy-rationale-${campaignId}`}>Change rationale</FieldLabel>
                  <Textarea
                    id={`policy-rationale-${campaignId}`}
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    minLength={8}
                    maxLength={2000}
                    rows={3}
                    required
                    placeholder="Why should future campaign runs use this policy?"
                  />
                  <FieldDescription>Stored with the new policy version as activation audit context.</FieldDescription>
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={policyPending || rationale.trim().length < 8} className="w-fit">
                {policyPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                {policyPending ? "Activating…" : "Activate new policy version"}
              </Button>
            </form>
          )}
        </section>

        {error && (
          <Alert variant="destructive" className="xl:col-span-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
