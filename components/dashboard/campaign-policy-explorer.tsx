"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Gavel,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type {
  CampaignPolicyMatchedRule,
  CampaignPolicyRecommendation,
  CampaignPolicyReport,
} from "@/lib/campaign-policy/types"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RiskPolicy, SuggestedAction } from "@/types"

type Filter =
  | "all"
  | "approve"
  | "manual_review"
  | "reject"
  | "escalated"
  | "cross_campaign"
  | "telegram"
  | "human"
  | "data_coverage"

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function actionClass(action: SuggestedAction) {
  if (action === "reject") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (action === "manual_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-green-400/35 bg-green-400/10 text-green-200"
}

function severityClass(severity: CampaignPolicyMatchedRule["severity"]) {
  if (severity === "critical") return "border-red-400/35 text-red-200"
  if (severity === "high") return "border-orange-400/35 text-orange-200"
  if (severity === "caution") return "border-amber-400/35 text-amber-200"
  return "text-muted-foreground"
}

function RecommendationCard({
  item,
  selected,
  onSelect,
}: {
  item: CampaignPolicyRecommendation
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition hover:border-primary/50 hover:bg-primary/5",
        selected ? "border-primary bg-primary/10" : "border-border bg-background/45"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={actionClass(item.recommendedAction)}>
              {title(item.recommendedAction)}
            </Badge>
            <Badge variant="secondary">{item.confidence} confidence</Badge>
            {item.changesAutomatedDecision && (
              <Badge variant="outline" className="border-violet-400/35 text-violet-200">
                Escalated
              </Badge>
            )}
            {item.finalHumanDecision && (
              <Badge variant="outline" className="border-blue-400/35 text-blue-200">
                Human decision
              </Badge>
            )}
          </div>
          <p className="mt-3 break-all font-medium">{item.walletAddress}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.explanation}</p>
        </div>
        <div className="shrink-0 rounded-lg border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground">
          {item.matchedRules.length} rules
        </div>
      </div>
    </button>
  )
}

function RuleCard({ rule }: { rule: CampaignPolicyMatchedRule }) {
  return (
    <div className="rounded-xl border border-border bg-background/45 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={severityClass(rule.severity)}>{title(rule.severity)}</Badge>
        <Badge variant="outline" className={actionClass(rule.action)}>{title(rule.action)}</Badge>
      </div>
      <p className="mt-3 font-medium">{rule.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{rule.rationale}</p>
      {(rule.evidenceCodes.length > 0 || rule.evidenceFamilies.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rule.evidenceFamilies.map((family) => (
            <Badge key={family} variant="secondary" className="text-[10px]">{title(family)}</Badge>
          ))}
          {rule.evidenceCodes.slice(0, 5).map((code) => (
            <Badge key={code} variant="outline" className="text-[10px]">{code}</Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function matchesFilter(item: CampaignPolicyRecommendation, filter: Filter) {
  if (filter === "all") return true
  if (filter === "approve" || filter === "manual_review" || filter === "reject") {
    return item.recommendedAction === filter
  }
  if (filter === "escalated") return item.changesAutomatedDecision
  if (filter === "human") return item.finalHumanDecision !== null
  if (filter === "telegram") {
    return item.matchedRules.some((rule) => rule.code === "TELEGRAM_ONCHAIN_CORROBORATION")
  }
  if (filter === "cross_campaign") {
    return item.riskMemory !== null || item.matchedRules.some((rule) =>
      ["CROSS_CAMPAIGN_CORROBORATION", "PRIOR_REJECTION_REVIEW", "CROSS_ROLE_INFRASTRUCTURE_REVIEW"].includes(rule.code)
    )
  }
  return item.matchedRules.some((rule) => rule.code === "DATA_COVERAGE_REVIEW")
}

export function CampaignPolicyExplorer({ report }: { report: CampaignPolicyReport }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selectedAddress, setSelectedAddress] = useState<string | null>(
    report.recommendations.find((item) => item.changesAutomatedDecision)?.walletAddress ??
      report.recommendations[0]?.walletAddress ??
      null
  )

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return report.recommendations.filter((item) => {
      const queryMatch =
        !normalized ||
        item.walletAddress.toLowerCase().includes(normalized) ||
        item.explanation.toLowerCase().includes(normalized) ||
        item.matchedRules.some((rule) =>
          `${rule.code} ${rule.title} ${rule.rationale}`.toLowerCase().includes(normalized)
        )
      return queryMatch && matchesFilter(item, filter)
    })
  }, [filter, query, report.recommendations])

  const selected = report.recommendations.find(
    (item) => item.walletAddress === selectedAddress
  ) ?? null
  const presets: RiskPolicy[] = ["conservative", "balanced", "strict"]

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary">
              <Gavel className="size-3.5" /> Campaign Policy Engine v1
            </Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">{report.campaignName}</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Read-only policy recommendations combining current explainable evidence, exact cross-campaign history,
              Telegram corroboration and stored human decisions.
            </p>
          </div>
          <Link href={`/dashboard/campaigns/${report.campaignId}`} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft data-icon="inline-start" /> Campaign details
          </Link>
        </div>
      </section>

      <Card className="glass-panel premium-card border-amber-400/25">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <p>
            This screen does not rewrite wallet decisions or reward lists. It previews explainable policy actions.
            Human decisions take precedence, missing data cannot create automatic rejection, and recurrence alone is contextual evidence.
          </p>
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle>Policy preset</CardTitle>
          <CardDescription>Preview the same evidence under a different operational tolerance without saving changes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Link
              key={preset}
              href={`/dashboard/campaigns/${report.campaignId}/policy?preset=${preset}`}
              className={buttonVariants({ variant: report.preset === preset ? "default" : "outline", size: "sm" })}
            >
              {title(preset)}
            </Link>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Evaluated", report.coverage.walletsEvaluated],
          ["Approve", report.summary.approveRecommendations],
          ["Review", report.summary.reviewRecommendations],
          ["Reject", report.summary.rejectRecommendations],
          ["Escalated", report.summary.escalatedFromApproved + report.summary.escalatedFromReview],
        ].map(([name, value]) => (
          <Card key={String(name)} className="glass-panel premium-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{String(name)}</p>
              <p className="mt-2 text-2xl font-semibold">{formatNumber(Number(value))}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className={cn("glass-panel premium-card", report.coverage.riskMemoryPartial && "border-amber-400/30")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Evidence coverage</CardTitle>
          <CardDescription>
            {report.coverage.riskMemoryPartial
              ? "Cross-campaign safety limits were reached; policy output records partial memory coverage."
              : "Policy evaluation completed within the configured v1 evidence limits."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{report.coverage.campaignsConsidered} campaigns</Badge>
          <Badge variant="outline">{report.coverage.analysesConsidered} analyses</Badge>
          <Badge variant="outline">
            Risk Memory {report.coverage.riskMemoryAvailable ? "connected" : "not available"}
          </Badge>
          <Badge variant="outline">{report.summary.humanDecisionsPreserved} human decisions preserved</Badge>
          <Badge variant="outline">{report.summary.telegramCorroborated} Telegram corroborations</Badge>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <Card className="glass-panel premium-card min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-primary" /> Policy recommendations</CardTitle>
            <CardDescription>Search wallets or narrow the operational recommendation type.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet, rule or evidence..." className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "approve", "manual_review", "reject", "escalated", "cross_campaign", "telegram", "human", "data_coverage"] as Filter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={buttonVariants({ variant: filter === item ? "default" : "outline", size: "sm" })}
                >
                  {title(item)}
                </button>
              ))}
            </div>
            <div className="grid max-h-[760px] gap-3 overflow-y-auto pr-1">
              {filtered.map((item) => (
                <RecommendationCard
                  key={`${item.chain}:${item.walletAddress}`}
                  item={item}
                  selected={selectedAddress === item.walletAddress}
                  onSelect={() => setSelectedAddress(item.walletAddress)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No policy recommendations match these filters.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card h-fit xl:sticky xl:top-5">
          <CardHeader>
            <CardTitle>Recommendation evidence</CardTitle>
            <CardDescription>{selected ? `${selected.matchedRules.length} matched rules` : "Select a wallet"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected && (
              <>
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.recommendedAction === "approve" ? (
                      <CheckCircle2 className="size-5 text-green-300" />
                    ) : (
                      <ShieldAlert className="size-5 text-amber-300" />
                    )}
                    <Badge variant="outline" className={actionClass(selected.recommendedAction)}>
                      {title(selected.recommendedAction)}
                    </Badge>
                    <Badge variant="secondary">{selected.confidence}</Badge>
                  </div>
                  <p className="mt-3 break-all font-semibold">{selected.walletAddress}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selected.explanation}</p>
                </div>

                {selected.riskMemory && (
                  <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 text-sm">
                    <p className="font-medium text-violet-100">Cross-campaign context</p>
                    <p className="mt-2 text-muted-foreground">
                      {selected.riskMemory.campaignCount} campaigns · roles {selected.riskMemory.roles.map(title).join(", ")}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Prior rejected: {selected.riskMemory.priorRejectedCount} · Telegram evidence: {selected.riskMemory.telegramEvidenceCount}
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {selected.matchedRules.map((matched) => <RuleCard key={matched.code} rule={matched} />)}
                </div>

                <div className="rounded-xl border border-border bg-background/45 p-4">
                  <p className="font-medium">Safeguards</p>
                  <div className="mt-3 space-y-2">
                    {selected.safeguards.map((safeguard) => (
                      <p key={safeguard} className="text-xs leading-relaxed text-muted-foreground">• {safeguard}</p>
                    ))}
                  </div>
                </div>
              </>
            )}
            {!selected && <p className="text-sm text-muted-foreground">No wallet selected.</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
