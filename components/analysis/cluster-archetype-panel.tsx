import { AlertTriangle, BrainCircuit, CheckCircle2, Layers3 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assessClusterArchetypes, type ClusterArchetypeConfidence } from "@/lib/cluster-investigation/archetypes"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"

function confidenceClass(confidence: ClusterArchetypeConfidence) {
  if (confidence === "high") return "border-green-400/35 bg-green-400/10 text-green-200"
  if (confidence === "medium") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-border text-muted-foreground"
}

export function ClusterArchetypePanel({ report }: { report: ClusterInvestigationReport }) {
  const assessment = assessClusterArchetypes(report)
  const primary = assessment.primary

  return (
    <div className="mx-auto max-w-7xl px-5 pb-5 sm:px-8">
      <Card className="glass-panel premium-card border-violet-400/20 bg-violet-400/5">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="size-5 text-violet-300" /> Inferred cluster archetype
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Deterministic forensic hypothesis derived from stored grouping families and canonical evidence. It does not rescore wallets or change cluster membership, policy, or decisions.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="border-violet-400/30 text-violet-200">{primary.label}</Badge>
              <Badge variant="outline" className={confidenceClass(primary.confidence)}>{primary.confidence} confidence</Badge>
              <Badge variant="outline">score {primary.score}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4 text-green-300" /> Why this hypothesis</p>
              <div className="mt-3 space-y-2">
                {primary.reasons.map((reason) => (
                  <p key={reason} className="text-xs leading-relaxed text-muted-foreground">• {reason}</p>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-100"><AlertTriangle className="size-4" /> Interpretation caveats</p>
              <div className="mt-3 space-y-2">
                {primary.caveats.map((caveat) => (
                  <p key={caveat} className="text-xs leading-relaxed text-muted-foreground">• {caveat}</p>
                ))}
                {!primary.caveats.length && (
                  <p className="text-xs leading-relaxed text-muted-foreground">• Apply the global attribution boundaries below.</p>
                )}
              </div>
            </div>
          </section>

          {assessment.candidates.length > 1 && (
            <section>
              <p className="mb-3 flex items-center gap-2 text-sm font-medium"><Layers3 className="size-4 text-primary" /> Other supported hypotheses</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {assessment.candidates.slice(1).map((candidate) => (
                  <div key={candidate.id} className="rounded-xl border border-border bg-background/45 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{candidate.label}</Badge>
                      <Badge variant="outline" className={confidenceClass(candidate.confidence)}>{candidate.confidence}</Badge>
                      <span className="text-[11px] text-muted-foreground">score {candidate.score}</span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{candidate.reasons[0] ?? "Supported by the current stored evidence."}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
            <p className="text-xs uppercase tracking-wide text-violet-200">Attribution boundary</p>
            <div className="mt-2 space-y-1.5">
              {assessment.boundaries.map((boundary) => (
                <p key={boundary} className="text-xs leading-relaxed text-muted-foreground">• {boundary}</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
