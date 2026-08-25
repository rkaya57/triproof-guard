"use client"

import { FormEvent, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarRange, CircleDollarSign, Loader2, Network, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { campaignTypes, supportedChains } from "@/lib/validators/wallet"

type RiskPolicy = "conservative" | "balanced" | "strict"

type CampaignCreateResponse = {
  id?: string
  error?: string
  code?: string
}

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

const enrichableChains = supportedChains.filter((chain) => chain !== "Other")

const policyDescriptions: Record<RiskPolicy, string> = {
  conservative: "Minimizes false exclusions. Insufficient evidence stays in review instead of being treated as malicious risk.",
  balanced: "Recommended default for most airdrops, points programs, quests, and reward campaigns.",
  strict: "Higher protection for campaigns where coordinated abuse has a high economic cost.",
}

function optionalIso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim()
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? text : date.toISOString()
}

export function CampaignIntakeForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [chain, setChain] = useState("Ethereum")
  const [campaignType, setCampaignType] = useState("Airdrop")
  const [riskPolicy, setRiskPolicy] = useState<RiskPolicy>("balanced")

  const defaultName = useMemo(
    () => `${chain} ${campaignType} Campaign`,
    [campaignType, chain],
  )

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)

    const form = new FormData(event.currentTarget)
    const rewardPoolText = String(form.get("rewardPoolUsd") ?? "").trim()
    const body = {
      name: String(form.get("name") ?? "").trim() || defaultName,
      campaignType: String(form.get("campaignType") ?? "Airdrop"),
      chain: String(form.get("chain") ?? "Ethereum"),
      riskPolicy: String(form.get("riskPolicy") ?? "balanced"),
      lifecycle: "draft",
      notes: String(form.get("notes") ?? "").trim(),
      campaignContracts: String(form.get("campaignContracts") ?? "").trim(),
      startsAt: optionalIso(form.get("startsAt")),
      endsAt: optionalIso(form.get("endsAt")),
      rewardPoolUsd: rewardPoolText ? Number(rewardPoolText) : null,
      metadata: {
        intakeSource: "dashboard-campaign-v2",
      },
    }

    try {
      const response = await fetch("/api/v2/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = (await response.json().catch(() => ({}))) as CampaignCreateResponse
      if (response.status === 401) {
        router.push("/login")
        return
      }
      if (!response.ok || !result.id) {
        setError(result.error ?? "Campaign could not be created")
        return
      }

      toast("Campaign created. Upload the first wallet cohort when it is ready.", "success")
      router.push(`/dashboard/campaigns/${result.id}`)
      router.refresh()
    } catch {
      setError("Campaign could not be created. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <CardTitle>Create campaign</CardTitle>
        <CardDescription>
          Define the campaign once. Every future wallet analysis run will stay attached to this campaign, policy, and audit history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Campaign name</FieldLabel>
              <Input id="name" name="name" placeholder={defaultName} maxLength={120} />
              <FieldDescription>If left empty, Tri-Proof uses {defaultName}.</FieldDescription>
            </Field>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="campaignType">Campaign type</FieldLabel>
                <select
                  id="campaignType"
                  name="campaignType"
                  className={selectClass}
                  value={campaignType}
                  onChange={(event) => setCampaignType(event.target.value)}
                >
                  {campaignTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="chain">Analysis chain</FieldLabel>
                <select
                  id="chain"
                  name="chain"
                  className={selectClass}
                  value={chain}
                  onChange={(event) => setChain(event.target.value)}
                >
                  {enrichableChains.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <FieldDescription>API v2 currently keeps one canonical analysis chain per campaign.</FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="riskPolicy">Campaign risk policy</FieldLabel>
              <select
                id="riskPolicy"
                name="riskPolicy"
                className={selectClass}
                value={riskPolicy}
                onChange={(event) => setRiskPolicy(event.target.value as RiskPolicy)}
              >
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="strict">Strict</option>
              </select>
              <FieldDescription>{policyDescriptions[riskPolicy]}</FieldDescription>
            </Field>

            <Alert>
              <ShieldCheck />
              <AlertDescription>
                Policy is campaign-level in this intake version. Individual analysis runs cannot silently switch presets; a future policy change will be versioned separately.
              </AlertDescription>
            </Alert>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="startsAt"><CalendarRange className="mr-1 inline size-4" /> Starts at</FieldLabel>
                <Input id="startsAt" name="startsAt" type="datetime-local" />
              </Field>
              <Field>
                <FieldLabel htmlFor="endsAt">Ends at</FieldLabel>
                <Input id="endsAt" name="endsAt" type="datetime-local" />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="rewardPoolUsd"><CircleDollarSign className="mr-1 inline size-4" /> Reward pool (USD, optional)</FieldLabel>
              <Input id="rewardPoolUsd" name="rewardPoolUsd" type="number" min="0" step="0.01" placeholder="50000" />
              <FieldDescription>Stored reward value can later support explicit campaign exposure estimates. No value is inferred when this is empty.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="campaignContracts"><Network className="mr-1 inline size-4" /> Campaign contracts / program IDs</FieldLabel>
              <Textarea
                id="campaignContracts"
                name="campaignContracts"
                rows={4}
                maxLength={5000}
                placeholder="One contract, program ID, or campaign address per line"
              />
              <FieldDescription>Used as campaign-action context. Invalid addresses are ignored rather than converted into evidence.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="notes">Campaign notes</FieldLabel>
              <Textarea id="notes" name="notes" rows={4} maxLength={2000} placeholder="Pilot cohort, eligibility window, customer context…" />
            </Field>
          </FieldGroup>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {pending ? "Creating campaign…" : "Create campaign"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/campaigns")} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
