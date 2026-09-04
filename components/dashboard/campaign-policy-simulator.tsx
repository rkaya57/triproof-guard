"use client"

import { useMemo, useState } from "react"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  CircleAlert,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react"

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

const presetDescriptions: Record<RiskPolicy, string> = {
  conservative: "Escalates only stronger, independently corroborated Sybil signals.",
  balanced: "Recommended default for most campaigns: catches strong abuse while protecting gray-zone wallets.",
  strict: "More aggressive protection for campaigns with a low tolerance for coordinated farming.",
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

function percentage(value: number, total: number) {
  if (total <= 0) return "0.0%"
  return `${((value / total) * 100).toFixed(1)}%`
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

  const reasonBreakdown = useMemo(() => {
    if (!simulation) return []
    const counts = new Map<string, number>()

    simulation.transitions.forEach((transition) => {
      const codes = transition.addedRuleCodes.length > 0
        ? transition.addedRuleCodes
        : transition.scenarioRuleCodes
      codes.forEach((code) => counts.set(code, (counts.get(code) ?? 0) + 1))
    })

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
  }, [simulation])

  const presetThresholds = presetDefaults[preset]
  const customized =
    rejectScore !== presetThresholds.corroboratedRejectScore ||
    familyCount !== presetThresholds.corroboratedFamilyCount
  const invalidThresholds =
    !Number.isFinite(rejectScore) ||
    rejectScore < 0 ||
    rejectScore > 100 ||
    !Number.isFinite(familyCount) ||
    familyCount < 1 ||
    familyCount > 8

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
    <Card className="glass-panel premium-card border-primary/25" id="policy-simulator">
      <CardHeader>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1.5 border-primary/30 text-primary">
                <Calculator className="size-3.5" aria-hidden="true" /> Policy Simulator
              </Badge>
              <Badge variant="outline" className="border-green-400/30 text-green-200">Read-only</Badge>
            </div>
            <CardTitle className="text-2xl">Test your Sybil rules before enforcing them</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
              Preview how Allow, Review and Exclude recommendations change under a different policy tolerance.
              Nothing is saved or enforced by running a simulation.
            </CardDescription>
          </div>
          <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-xs text-muted-foreground">
            Current policy: <span className="font-medium text-foreground">{title(report.preset)}</span>
            <span className="mx-1">·</span> score ≥ {baselineThresholds.corroboratedRejectScore}
            <span className="mx-1">·</span> families ≥ {baselineThresholds.corroboratedFamilyCount}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-xl border border-green-400/25 bg-green-400/5 p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-green-300" aria-hidden="true" />
            <div>
              <p className="font-medium text-green-100">Safe to experiment</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                No wallet status will change during simulation. Existing campaign decisions, reviewer overrides and reward lists remain untouched.
              </p>
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">Choose a policy style</legend>
          <p className="mt-1 text-xs text-muted-foreground">Start with a preset, then fine-tune thresholds only if needed.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Policy simulation preset">
            {(["conservative", "balanced", "strict"] as RiskPolicy[]).map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={preset === item}
                onClick={() => choosePreset(item)}
                className={cn(
                  "rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  preset === item
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background/45 hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{title(item)}</span>
                  {item === "balanced" && <Badge variant="secondary">Recommended</Badge>}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{presetDescriptions[item]}</p>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Reject score ≥ {presetDefaults[item].corroboratedRejectScore} · families ≥ {presetDefaults[item].corroboratedFamilyCount}
                </p>
              </button>
            ))}
          </div>
        </fieldset>

        <section aria-labelledby="custom-policy-heading" className="rounded-xl border border-border bg-background/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="custom-policy-heading" className="font-medium">Fine-tune policy <span className="text-muted-foreground">(optional)</span></h3>
              <p className="mt-1 text-xs text-muted-foreground">Changing either value creates a custom scenario without changing the stored policy.</p>
            </div>
            {customized && <Badge variant="outline" className="border-violet-400/30 text-violet-200">Custom thresholds</Badge>}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
            <label className="block" htmlFor="policy-reject-score">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Corroborated reject score
              </span>
              <Input
                id="policy-reject-score"
                type="number"
                min={0}
                max={100}
                value={rejectScore}
                aria-describedby="policy-reject-score-help"
                onChange={(event) => setRejectScore(Number(event.target.value))}
              />
              <span id="policy-reject-score-help" className="mt-1 block text-[11px] text-muted-foreground">0–100. Higher values require stronger corroborated risk.</span>
            </label>

            <label className="block" htmlFor="policy-family-count">
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Minimum independent families
              </span>
              <Input
                id="policy-family-count"
                type="number"
                min={1}
                max={8}
                value={familyCount}
                aria-describedby="policy-family-count-help"
                onChange={(event) => setFamilyCount(Number(event.target.value))}
              />
              <span id="policy-family-count-help" className="mt-1 block text-[11px] text-muted-foreground">1–8 independent evidence families.</span>
            </label>

            <Button
              type="button"
              size="lg"
              disabled={loading || invalidThresholds}
              aria-busy={loading}
              onClick={() => void runSimulation()}
            >
              {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Calculator aria-hidden="true" />}
              {loading ? "Simulating…" : "Simulate policy"}
            </Button>
          </div>
          {invalidThresholds && <p className="mt-3 text-xs text-red-200">Enter a reject score from 0–100 and an independent-family count from 1–8.</p>}
        </section>

        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-muted-foreground">
          Simulation changes only cross-campaign corroboration thresholds. Eligibility exclusions, decisive current evidence,
          data-coverage safeguards and stored human decisions retain their existing semantics.
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>
        )}

        {simulation && (
          <div className="space-y-6" aria-live="polite">
            <section aria-labelledby="simulation-outcome-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 id="simulation-outcome-heading" className="text-lg font-semibold">Simulation outcome</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatNumber(simulation.coverage.walletsEvaluated)} wallets evaluated under {title(simulation.scenario.preset)}{simulation.scenario.customized ? " with custom thresholds" : ""}.
                  </p>
                </div>
                <Badge variant="outline">No decisions applied</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "Allow",
                    value: simulation.scenario.approveRecommendations,
                    icon: CheckCircle2,
                    className: "border-green-400/25 bg-green-400/5 text-green-200",
                  },
                  {
                    label: "Review",
                    value: simulation.scenario.reviewRecommendations,
                    icon: CircleAlert,
                    className: "border-amber-400/25 bg-amber-400/5 text-amber-200",
                  },
                  {
                    label: "Exclude",
                    value: simulation.scenario.rejectRecommendations,
                    icon: XCircle,
                    className: "border-red-400/25 bg-red-400/5 text-red-200",
                  },
                ].map((item) => (
                  <div key={item.label} className={cn("rounded-xl border p-4", item.className)}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                        <p className="mt-2 text-3xl font-semibold">{formatNumber(item.value)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{percentage(item.value, simulation.coverage.walletsEvaluated)}</p>
                      </div>
                      <item.icon className="size-6" aria-hidden="true" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="before-after-heading">
              <div className="mb-3">
                <h3 id="before-after-heading" className="text-lg font-semibold">Before / after</h3>
                <p className="mt-1 text-sm text-muted-foreground">See exactly how the proposed policy changes campaign recommendations.</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
                <div className="rounded-xl border border-border bg-background/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Current policy</p>
                    <Badge variant="outline">{title(simulation.baseline.preset)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reject score ≥ {simulation.baseline.thresholds.corroboratedRejectScore} · families ≥ {simulation.baseline.thresholds.corroboratedFamilyCount}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-lg font-semibold text-green-200">{formatNumber(simulation.baseline.approveRecommendations)}</p><p className="text-[11px] text-muted-foreground">Allow</p></div>
                    <div><p className="text-lg font-semibold text-amber-200">{formatNumber(simulation.baseline.reviewRecommendations)}</p><p className="text-[11px] text-muted-foreground">Review</p></div>
                    <div><p className="text-lg font-semibold text-red-200">{formatNumber(simulation.baseline.rejectRecommendations)}</p><p className="text-[11px] text-muted-foreground">Exclude</p></div>
                  </div>
                </div>

                <div className="hidden items-center justify-center lg:flex" aria-hidden="true"><ArrowRight className="size-5 text-primary" /></div>

                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">New simulation</p>
                    <Badge variant="outline">{title(simulation.scenario.preset)}{simulation.scenario.customized ? " · Custom" : ""}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reject score ≥ {simulation.scenario.thresholds.corroboratedRejectScore} · families ≥ {simulation.scenario.thresholds.corroboratedFamilyCount}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-semibold text-green-200">{formatNumber(simulation.scenario.approveRecommendations)}</p>
                      <p className="text-[11px] text-muted-foreground">Allow · {deltaLabel(simulation.scenario.approveRecommendations - simulation.baseline.approveRecommendations)}</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-amber-200">{formatNumber(simulation.scenario.reviewRecommendations)}</p>
                      <p className="text-[11px] text-muted-foreground">Review · {deltaLabel(simulation.scenario.reviewRecommendations - simulation.baseline.reviewRecommendations)}</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-red-200">{formatNumber(simulation.scenario.rejectRecommendations)}</p>
                      <p className="text-[11px] text-muted-foreground">Exclude · {deltaLabel(simulation.scenario.rejectRecommendations - simulation.baseline.rejectRecommendations)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Changed wallets", simulation.impact.changedWallets],
                  ["Escalated", simulation.impact.escalatedWallets],
                  ["De-escalated", simulation.impact.deescalatedWallets],
                  ["Human decisions preserved", simulation.impact.humanDecisionsPreserved],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border bg-background/45 p-4">
                    <p className="text-xs text-muted-foreground">{String(label)}</p>
                    <p className="mt-2 text-xl font-semibold">{formatNumber(Number(value))}</p>
                  </div>
                ))}
              </div>
            </section>

            {reasonBreakdown.length > 0 && (
              <section aria-labelledby="decision-reasons-heading" className="rounded-xl border border-border bg-background/35 p-5">
                <div>
                  <h3 id="decision-reasons-heading" className="text-lg font-semibold">What changed these recommendations?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Rule signals attached to wallets whose recommendation changed in this simulation.</p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {reasonBreakdown.map(([code, count]) => (
                    <div key={code} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/45 p-3">
                      <span className="text-sm text-foreground">{title(code)}</span>
                      <Badge variant="outline">{formatNumber(count)} wallets</Badge>
                    </div>
                  ))}
                </div>
                {simulation.coverage.transitionsTruncated && (
                  <p className="mt-3 text-xs text-muted-foreground">Reason counts use the returned transition sample because the server transition list was truncated.</p>
                )}
              </section>
            )}

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
                  <div><p className="text-xs text-muted-foreground">Current excluded allocation</p><p className="mt-1 font-semibold">{money(simulation.rewardImpact.baselineEstimatedRejectedAllocationUsd)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Simulated excluded allocation</p><p className="mt-1 font-semibold">{money(simulation.rewardImpact.scenarioEstimatedRejectedAllocationUsd)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Delta</p><p className={cn("mt-1 font-semibold", simulation.rewardImpact.deltaEstimatedRejectedAllocationUsd > 0 ? "text-red-200" : "text-green-200")}>{money(simulation.rewardImpact.deltaEstimatedRejectedAllocationUsd)}</p></div>
                </div>
              </section>
            )}

            <section aria-labelledby="changed-recommendations-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="changed-recommendations-heading" className="font-medium">Changed recommendations</h3>
                  <p className="text-xs text-muted-foreground">
                    Showing {formatNumber(visibleTransitions.length)} of {formatNumber(simulation.impact.changedWallets)} changed wallets.
                  </p>
                </div>
                {simulation.coverage.transitionsTruncated && <Badge variant="outline">Server transition list truncated</Badge>}
              </div>
              <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1">
                {visibleTransitions.map((transition) => (
                  <article key={`${transition.chain}:${transition.walletAddress}`} className="rounded-xl border border-border bg-background/45 p-4">
                    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {transition.direction === "escalated" ? <ArrowUpRight className="size-4 text-red-300" aria-hidden="true" /> : <ArrowDownRight className="size-4 text-green-300" aria-hidden="true" />}
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
                  </article>
                ))}
                {visibleTransitions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    This scenario produces the same recommendations as the current policy.
                  </div>
                )}
              </div>
            </section>

            <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-green-300" aria-hidden="true" />
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
