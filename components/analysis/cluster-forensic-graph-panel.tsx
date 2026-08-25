"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  Boxes,
  Clock3,
  GitBranch,
  Network,
  RefreshCw,
  Route,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  buildForensicGraphProjection,
  forensicGraphFilters,
  type ForensicGraphEffect,
  type ForensicGraphFilter,
} from "@/lib/cluster-investigation/forensic-graph"
import { formatDateTimeUTC } from "@/lib/format"
import { cn } from "@/lib/utils"

const icons: Record<ForensicGraphFilter, typeof Network> = {
  funding: GitBranch,
  transfers: Route,
  contracts: Boxes,
  behavior: Activity,
  timing: Clock3,
  bridge: RefreshCw,
}

function effectLabel(effect: ForensicGraphEffect) {
  if (effect === "risk_bearing") return "Risk-bearing"
  if (effect === "neutralized") return "Neutralized"
  if (effect === "stored_context") return "Stored context"
  return "Context"
}

function effectClass(effect: ForensicGraphEffect) {
  if (effect === "risk_bearing") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (effect === "neutralized") return "border-green-400/35 bg-green-400/10 text-green-200"
  if (effect === "stored_context") return "border-primary/35 bg-primary/10 text-primary"
  return "border-border text-muted-foreground"
}

export function ClusterForensicGraphPanel({ report }: { report: ClusterInvestigationReport }) {
  const projection = useMemo(() => buildForensicGraphProjection(report), [report])
  const firstWithEvidence = projection.lanes.find((lane) => lane.itemCount > 0)?.filter ?? "funding"
  const [active, setActive] = useState<ForensicGraphFilter>(firstWithEvidence)
  const lane = projection.lanes.find((item) => item.filter === active) ?? projection.lanes[0]!
  const Icon = icons[lane.filter]

  return (
    <div className="mx-auto max-w-7xl px-5 pb-5 sm:px-8">
      <Card className="glass-panel premium-card border-cyan-400/20 bg-cyan-400/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Network className="size-5 text-cyan-300" /> Graph Intelligence v2</CardTitle>
          <CardDescription className="max-w-4xl">
            Forensic views reorganize already stored evidence. Filtering never creates a new edge, changes risk, or alters the stored cluster.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {forensicGraphFilters.map((filter) => {
              const current = projection.lanes.find((item) => item.filter === filter)!
              const FilterIcon = icons[filter]
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActive(filter)}
                  className={buttonVariants({ variant: active === filter ? "default" : "outline", size: "sm" })}
                >
                  <FilterIcon data-icon="inline-start" /> {current.label}
                  <span className={cn("ml-1 rounded-full px-1.5 text-[10px]", active === filter ? "bg-background/20" : "bg-muted")}>{current.itemCount}</span>
                </button>
              )
            })}
          </div>

          <section className="rounded-xl border border-border bg-background/45 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-2 font-medium"><Icon className="size-4 text-cyan-300" /> {lane.label} view</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{lane.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{lane.itemCount} items</Badge>
                <Badge variant="outline" className="border-red-400/30 text-red-200">{lane.riskBearingCount} risk-bearing</Badge>
                <Badge variant="outline" className="border-green-400/30 text-green-200">{lane.neutralizedCount} neutralized</Badge>
              </div>
            </div>
          </section>

          {lane.items.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {lane.items.slice(0, 40).map((item) => (
                <div key={`${item.filter}:${item.id}`} className="rounded-xl border border-border bg-background/45 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.label}</Badge>
                    <Badge variant="outline" className={effectClass(item.effect)}>{effectLabel(item.effect)}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{item.source.replaceAll("_", " ")}</Badge>
                    {item.confidence !== null && <span className="text-[11px] text-muted-foreground">{item.confidence}% confidence</span>}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    {item.observedAt && <span>{formatDateTimeUTC(item.observedAt)}</span>}
                    {item.transactionId && <span className="max-w-[320px] truncate font-mono">tx {item.transactionId}</span>}
                    {item.walletAddresses.length > 0 && <span>{item.walletAddresses.length} wallet reference(s)</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No stored evidence maps to this forensic view. The filter remains available without inventing replacement evidence.
            </div>
          )}

          {lane.items.length > 40 && (
            <p className="text-xs text-muted-foreground">Showing the first 40 of {lane.items.length} items in this bounded investigation view.</p>
          )}

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-xs uppercase tracking-wide text-amber-200">Forensic boundary</p>
            <div className="mt-2 space-y-1.5">
              {projection.boundaries.map((boundary) => (
                <p key={boundary} className="text-xs leading-relaxed text-muted-foreground">• {boundary}</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
