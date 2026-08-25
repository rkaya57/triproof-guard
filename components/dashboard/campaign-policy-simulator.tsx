"use client"

import { useMemo, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Calculator, Loader2, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { CampaignPolicySimulation } from "@/lib/campaign-policy/simulator"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RiskPolicy, SuggestedAction } from "@/types"

const presetDefaults: Record<
  RiskPolicy,
  { corroboratedRejectScore: number; corroboratedFamilyCount: number }
> = {
  conservative: { corroboratedRejectScore: 75, corroboratedFamilyCount: 3 },
  balanced: { corroboratedRejectScore: 60, corroboratedFamilyCount: 2 },
  strict: { corroboratedRejectScore: 50, corroboratedFamilyCount: 2 },
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function actionClass(action: SuggestedAction) {
  if (action === "reject") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (action === "manual_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-green-400/35 bg-green-400/10 text-green-200"
}

function deltaLabel(value: number) {
  if (value > 0) return `+${formatNumber(value)}`
  return formatNumber(value)
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

export function CampaignPolicySimulator({ report }: { report: CampaignPolicyReport }) {
  const baselineThresholds = report.thresholds ?? presetDefaults[report.preset]
  const [preset, setPreset] = useState<RiskPolicy>(report.preset)
  const [rejectScore, setRejectScore] = useState(baselineThresholds.corroboratedRejectScore)
  const [familyCount, setFamilyCount] = useState(baselineThresholds.corroboratedFamilyCount)
  const [simulation, setSimulation] = useState<CampaignPolicySimulation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const visibleTransitions = useMemo(
    () => simulation?.transitions.slice(0, 100) ?? [],
    [simulation],
  )

  function choosePreset(nextPreset: RiskPolicy) {
    const defaults = presetDefaults[nextPreset]
    setPreset(nextPreset)
    setRejectScore(defaults.corroboratedRejectScore)
    setFamilyCount(defaults.corroboratedFamilyCount)
    setSimulation(null)
    setError("")
  }

  async function runSimulation() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/campaigns/${report.campaignId}/policy/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset,
          corroboratedRejectScore: rejectScore,
          corroboratedFamilyCount: familyCount,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        simulation?: CampaignPolicySimulation
      }
      if (!response.ok || !body.simulation) {
        throw new Error(body.error ?? "Policy simulation could not be completed")
      }
      setSimulation(body.simulation)
      setRejectScore(body.simulation.scenario.thresholds.corroboratedRejectScore)
      setFamilyCount(body.simulation.scenario.thresholds.corroboratedFamilyCount)
    } catch (reason) {
      setSimulation(null)
      setError(reason instanceof Error ? reason.message : "Policy simulation could not be completed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="glass-panel premium-card border-primary/25">
      <CardHeader>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1.5 border-primary/30 text-primary">
                <Calculator className="size-3.5" /> Policy Simulator v1
              </Badge>
              <Badge variant="outline">Read-only</Badge>
            </div>
            <CardTitle>Decision impact simulation</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Change policy tolerance and preview how recommendations move before saving or enforcing anything.
              The current campaign decisions and human overrides remain untouched.
            </CardDescription>
          </div>
          <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-xs text-muted-foreground">
            Baseline: <span className="font-medium text-foreground">{title(report.preset)}</span> · score ≥ {baselineThresholds.corroboratedRejectScore} · families ≥ {baselineThresholds.corroboratedFamilyCount}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_.8fr_.8fr_auto] xl:items-end">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Scenario preset</p>
            <div className="flex flex-wrap gap-2">
              {(["conservative", "balanced", "strict"] as RiskPolicy[]).map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={preset === item ? "default" : "outline"}
                  onClick={() => choosePreset(item)}
                >
                  {title(item)}
                </Button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Corroborated reject score
            </span>
            <Input
              type="number"
              min={0}
              max={100}
              value={rejectScore}
              onChange={(event) => setRejectScore(Number(event.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Minimum independent families
            </span>
            <Input
              type="number"
              min={1}
              max={8}
              value={familyCount}
              onChange={(event) => setFamilyCount(Number(event.target.value))}
            />
          </label>
          <Button type="button" disabled={loading} onClick={() => void runSimulation()}>
            {loading ? <Loader2 className="animate-spin" /> : <Calculator />}
            Run simulation
          </Button>
        </div>

        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-muted-foreground">
          Simulation changes only the cross-campaign corroboration thresholds. Eligibility exclusions, decisive current evidence,
          data-coverage safeguards and stored human decisions retain their existing semantics.
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>
        )}

        {simulation && (
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border bg-background/45">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Changed wallets</p>
                  <p className="mt-2 text-2xl font-semibold">{formatNumber(simulation.impact.changedWallets)}</p>
                </CardContent>
              </Card>
              <Card className="border-red-400/20 bg-red-400/5">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Newly rejected</p>
                  <p className="mt-2 text-2xl font-semibold text-red-200">{formatNumber(simulation.impact.newlyRejected)}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-400/20 bg-amber-400/5">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Newly review</p>
                  <p className="mt-2 text-2xl font-semibold text-amber-200">{formatNumber(simulation.impact.newlyReview)}</p>
                </CardContent>
              </Card>
              <Card className="border-blue-400/20 bg-blue-400/5">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Human decisions preserved</p>
                  <p className="mt-2 text-2xl font-semibold text-blue-200">{formatNumber(simulation.impact.humanDecisionsPreserved)}</p>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {[
                { label: "Baseline", value: simulation.baseline },
                { label: "Scenario", value: simulation.scenario },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-border bg-background/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{label}</p>
                    <Badge variant="outline">{title(value.preset)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reject score ≥ {value.thresholds.corroboratedRejectScore} · families ≥ {value.thresholds.corroboratedFamilyCount}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-lg font-semibold text-green-200">{formatNumber(value.approveRecommendations)}</p><p className="text-[11px] text-muted-foreground">Allow</p></div>
                    <div><p className="text-lg font-semibold text-amber-200">{formatNumber(value.reviewRecommendations)}</p><p className="text-[11px] text-muted-foreground">Review</p></div>
                    <div><p className="text-lg font-semibold text-red-200">{formatNumber(value.rejectRecommendations)}</p><p className="text-[11px] text-muted-foreground">Exclude</p></div>
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Escalated", simulation.impact.escalatedWallets],
                ["De-escalated", simulation.impact.deescalatedWallets],
                ["No longer rejected", simulation.impact.noLongerRejected],
                ["No longer review", simulation.impact.noLongerReview],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-border bg-background/45 p-4">
                  <p className="text-xs text-muted-foreground">{String(label)}</p>
                  <p className="mt-2 text-xl font-semibold">{formatNumber(Number(value))}</p>
                </div>
              ))}
            </section>

            {simulation.rewardImpact && (
              <section className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-violet-100">Estimated reward exposure</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Equal allocation assumption · {money(simulation.rewardImpact.equalAllocationPerWalletUsd)} per wallet
                    </p>
                  </div>
                  <Badge variant="outline">Pool {money(simulation.rewardImpact.rewardPoolUsd)}</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Baseline excluded allocation</p><p className="mt-1 font-semibold">{money(simulation.rewardImpact.baselineEstimatedRejectedAllocationUsd)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Scenario excluded allocation</p><p className="mt-1 font-semibold">{money(simulation.rewardImpact.scenarioEstimatedRejectedAllocationUsd)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Delta</p><p className={cn("mt-1 font-semibold", simulation.rewardImpact.deltaEstimatedRejectedAllocationUsd > 0 ? "text-red-200" : "text-green-200")}>{money(simulation.rewardImpact.deltaEstimatedRejectedAllocationUsd)}</p></div>
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">Changed recommendations</p>
                  <p className="text-xs text-muted-foreground">
                    Showing {formatNumber(visibleTransitions.length)} of {formatNumber(simulation.impact.changedWallets)} changed wallets.
                  </p>
                </div>
                {simulation.coverage.transitionsTruncated && <Badge variant="outline">Server transition list truncated</Badge>}
              </div>
              <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1">
                {visibleTransitions.map((transition) => (
                  <div key={`${transition.chain}:${transition.walletAddress}`} className="rounded-xl border border-border bg-background/45 p-4">
                    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {transition.direction === "escalated" ? <ArrowUpRight className="size-4 text-red-300" /> : <ArrowDownRight className="size-4 text-green-300" />}
                          <Badge variant="outline" className={actionClass(transition.baselineAction)}>{title(transition.baselineAction)}</Badge>
                          <span className="text-xs text-muted-foreground">→</span>
                          <Badge variant="outline" className={actionClass(transition.scenarioAction)}>{title(transition.scenarioAction)}</Badge>
                        </div>
                        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{transition.walletAddress}</p>
                      </div>
                      <Badge variant="secondary">{title(transition.direction)}</Badge>
                    </div>
                    {(transition.addedRuleCodes.length > 0 || transition.removedRuleCodes.length > 0) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {transition.addedRuleCodes.map((code) => <Badge key={`add:${code}`} variant="outline" className="border-red-400/30 text-[10px] text-red-200">+ {code}</Badge>)}
                        {transition.removedRuleCodes.map((code) => <Badge key={`remove:${code}`} variant="outline" className="border-green-400/30 text-[10px] text-green-200">− {code}</Badge>)}
                      </div>
                    )}
                  </div>
                ))}
                {visibleTransitions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    This scenario produces the same recommendations as the baseline.
                  </div>
                )}
              </div>
            </section>

            <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-green-300" />
                <div className="space-y-1.5">
                  {simulation.safeguards.map((item) => <p key={item}>• {item}</p>)}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
