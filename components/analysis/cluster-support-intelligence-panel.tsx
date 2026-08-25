import { AlertTriangle, Layers3, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ClusterSupportIntelligence } from "@/lib/cluster-investigation/intelligence"

function confidenceClass(confidence: ClusterSupportIntelligence["confidence"]) {
  if (confidence === "high") return "border-green-400/35 bg-green-400/10 text-green-200"
  if (confidence === "medium") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-border bg-background/40 text-muted-foreground"
}

function percentage(value: number | null) {
  return value === null ? "Not mapped" : `${Math.round(value * 100)}%`
}

export function ClusterSupportIntelligencePanel({
  intelligence,
}: {
  intelligence: ClusterSupportIntelligence
}) {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-6 sm:px-8">
      <Card className="glass-panel premium-card border-primary/25">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Cluster support confidence
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Evidence-strength assessment for the already-stored cluster. This is not a wallet risk score, Sybil probability, or automatic decision.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={confidenceClass(intelligence.confidence)}>
                {intelligence.confidence.toUpperCase()} SUPPORT
              </Badge>
              <Badge variant="secondary">{intelligence.score}/100</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Stored independent families</p>
              <p className="mt-2 text-2xl font-semibold">{intelligence.observedIndependentFamilies}</p>
              <p className="mt-1 text-xs text-muted-foreground">Only original deterministic grouping families count as independent.</p>
            </div>
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Canonical funding support</p>
              <p className="mt-2 text-2xl font-semibold">{intelligence.context.riskBearingFundingRelationships}</p>
              <p className="mt-1 text-xs text-muted-foreground">Risk-bearing relationships only; neutralized fan-out adds zero points.</p>
            </div>
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Graph context</p>
              <p className="mt-2 text-2xl font-semibold">{intelligence.context.riskBearingGraphEdges}</p>
              <p className="mt-1 text-xs text-muted-foreground">Visible for investigation, never counted as a new independent family.</p>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Layers3 className="size-4 text-primary" />
              <p className="font-medium">Family-level support coverage</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {intelligence.familySupport.map((family) => (
                <div key={family.family} className="rounded-xl border border-border bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{family.label}</Badge>
                    <span className="text-sm font-semibold">{percentage(family.memberCoverage)}</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {family.memberRiskEvidenceFamily
                      ? `${family.supportedMembers}/${family.memberCount} members expose matching risk/corroborating wallet evidence.`
                      : "No dedicated wallet Decision Evidence family exists for this grouping family."}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {intelligence.factors.map((factor) => (
              <div key={factor.code} className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <code className="text-xs text-primary">{factor.code}</code>
                  <Badge variant="secondary">+{factor.points}</Badge>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{factor.explanation}</p>
              </div>
            ))}
          </div>

          {intelligence.limitations.length > 0 && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
              <p className="flex items-center gap-2 font-medium text-amber-100">
                <AlertTriangle className="size-4" /> Evidence limitations
              </p>
              <div className="mt-2 space-y-1.5">
                {intelligence.limitations.map((limitation) => (
                  <p key={limitation} className="text-xs leading-relaxed text-muted-foreground">• {limitation}</p>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-background/35 p-4">
            <p className="font-medium">Decision boundary</p>
            <div className="mt-2 space-y-1.5">
              {intelligence.boundaries.map((boundary) => (
                <p key={boundary} className="text-xs leading-relaxed text-muted-foreground">• {boundary}</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
