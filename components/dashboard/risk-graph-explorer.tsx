"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CircleDot,
  FileText,
  Filter,
  Network,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type {
  SharedRiskGraph,
  SharedRiskGraphEdge,
  SharedRiskGraphNode,
  SharedRiskGraphNodeKind,
} from "@/lib/risk-graph/types"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  graph: SharedRiskGraph
  campaignName: string
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function riskClass(node: SharedRiskGraphNode) {
  if (node.riskLevel === "critical") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (node.riskLevel === "high") return "border-orange-400/35 bg-orange-400/10 text-orange-200"
  if (node.riskLevel === "caution") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  if (node.riskLevel === "safe") return "border-green-400/35 bg-green-400/10 text-green-200"
  return "border-border bg-muted/30 text-muted-foreground"
}

function sourceLabel(source: string) {
  if (source === "wallet_graph") return "Wallet Graph"
  if (source === "sybil_engine") return "Sybil Engine"
  if (source === "telegram_guardian") return "Telegram Guardian"
  if (source === "scam_dna") return "Scam DNA"
  if (source === "scamguard") return "ScamGuard"
  return label(source)
}

function NodeCard({
  node,
  selected,
  edgeCount,
  onSelect,
}: {
  node: SharedRiskGraphNode
  selected: boolean
  edgeCount: number
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
            <Badge variant="outline">{label(node.kind)}</Badge>
            <Badge variant="outline" className={riskClass(node)}>{label(node.riskLevel)}</Badge>
          </div>
          <p className="mt-3 break-words font-medium">{node.label}</p>
          {node.value && node.value !== node.label && (
            <p className="mt-1 break-all text-xs text-muted-foreground">{node.value}</p>
          )}
        </div>
        <div className="shrink-0 rounded-lg border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground">
          {edgeCount} links
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {node.sources.map((source) => (
          <Badge key={source} variant="secondary" className="text-[10px]">
            {sourceLabel(source)}
          </Badge>
        ))}
      </div>
    </button>
  )
}

function EdgeRow({ edge, nodes }: { edge: SharedRiskGraphEdge; nodes: Map<string, SharedRiskGraphNode> }) {
  const source = nodes.get(edge.source)
  const target = nodes.get(edge.target)
  return (
    <div className="rounded-lg border border-border bg-background/45 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={edge.riskBearing ? "border-red-400/30 text-red-200" : ""}>
          {label(edge.kind)}
        </Badge>
        <span className="text-xs text-muted-foreground">{edge.confidence}% confidence</span>
      </div>
      <p className="mt-2 text-sm">
        <strong>{source?.label ?? edge.source}</strong>
        <span className="mx-2 text-muted-foreground">→</span>
        <strong>{target?.label ?? edge.target}</strong>
      </p>
      {edge.evidence[0] && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{edge.evidence[0]}</p>
      )}
    </div>
  )
}

export function RiskGraphExplorer({ graph, campaignName }: Props) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<"all" | SharedRiskGraphNodeKind>("all")
  const [selectedKey, setSelectedKey] = useState<string | null>(
    graph.nodes.find((node) => node.kind === "campaign")?.key ?? graph.nodes[0]?.key ?? null
  )

  const nodesByKey = useMemo(
    () => new Map(graph.nodes.map((node) => [node.key, node])),
    [graph.nodes]
  )
  const edgeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    graph.edges.forEach((edge) => {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
    })
    return counts
  }, [graph.edges])
  const kinds = useMemo(
    () => Array.from(new Set(graph.nodes.map((node) => node.kind))).sort(),
    [graph.nodes]
  )
  const filteredNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return graph.nodes.filter((node) => {
      const matchesKind = kind === "all" || node.kind === kind
      const matchesQuery =
        !normalized ||
        node.label.toLowerCase().includes(normalized) ||
        node.value?.toLowerCase().includes(normalized) ||
        node.sources.some((source) => source.includes(normalized))
      return matchesKind && matchesQuery
    })
  }, [graph.nodes, kind, query])

  const selected = selectedKey ? nodesByKey.get(selectedKey) ?? null : null
  const selectedEdges = useMemo(
    () => selectedKey
      ? graph.edges.filter((edge) => edge.source === selectedKey || edge.target === selectedKey)
      : [],
    [graph.edges, selectedKey]
  )
  const riskEdges = useMemo(
    () => graph.edges.filter((edge) => edge.riskBearing).slice(0, 12),
    [graph.edges]
  )
  const coverage = [
    ["Wallet Graph", graph.coverage.walletGraph],
    ["ScamGuard", graph.coverage.scamGuard],
    ["Scam DNA", graph.coverage.scamDna],
    ["Telegram", graph.coverage.telegramGuardian],
  ] as const

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary">
              <Network className="size-3.5" /> Shared Risk Graph v1
            </Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">{campaignName}</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Campaign wallets, funding and referral relationships, exact-match ScamGuard intelligence,
              Telegram observations and Scam DNA links in one versioned graph contract.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/campaigns/${graph.campaignId}`} className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft data-icon="inline-start" /> Campaign details
            </Link>
            {graph.analysisId && (
              <Link href={`/dashboard/analysis/${graph.analysisId}`} className={buttonVariants()}>
                <FileText data-icon="inline-start" /> Open report
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Nodes", graph.summary.nodeCount, "Normalized entities"],
          ["Edges", graph.summary.edgeCount, "Evidence-bearing relations"],
          ["Risk edges", graph.summary.riskBearingEdgeCount, "Require attention"],
          ["Sources", graph.summary.sourceCount, "Merged evidence systems"],
        ].map(([name, value, description]) => (
          <Card key={String(name)} className="glass-panel premium-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{String(name)}</p>
              <p className="mt-2 text-2xl font-semibold">{formatNumber(Number(value))}</p>
              <p className="mt-2 text-xs text-muted-foreground">{String(description)}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Source coverage</CardTitle>
          <CardDescription>Only exact, campaign-relevant overlaps are attached to this graph.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {coverage.map(([name, available]) => (
            <Badge key={name} variant="outline" className={available ? "border-green-400/35 bg-green-400/10 text-green-200" : "text-muted-foreground"}>
              {available ? "Connected" : "No exact match"} · {name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <Card className="glass-panel premium-card min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CircleDot className="size-5 text-primary" /> Graph entities</CardTitle>
            <CardDescription>Search and select a node to inspect its immediate evidence neighborhood.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet, domain, source..." className="pl-9" />
              </div>
              <label className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as "all" | SharedRiskGraphNodeKind)}
                  className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                >
                  <option value="all">All entity types</option>
                  {kinds.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                </select>
              </label>
            </div>
            <div className="grid max-h-[720px] gap-3 overflow-y-auto pr-1">
              {filteredNodes.map((node) => (
                <NodeCard
                  key={node.key}
                  node={node}
                  selected={selectedKey === node.key}
                  edgeCount={edgeCounts.get(node.key) ?? 0}
                  onSelect={() => setSelectedKey(node.key)}
                />
              ))}
              {filteredNodes.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No graph entities match these filters.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="glass-panel premium-card xl:sticky xl:top-5">
            <CardHeader>
              <CardTitle>Selected neighborhood</CardTitle>
              <CardDescription>{selected ? `${selectedEdges.length} direct relationships` : "Select an entity"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{label(selected.kind)}</Badge>
                    <Badge variant="outline" className={riskClass(selected)}>{label(selected.riskLevel)}</Badge>
                  </div>
                  <p className="mt-3 break-words font-semibold">{selected.label}</p>
                  {selected.value && <p className="mt-1 break-all text-xs text-muted-foreground">{selected.value}</p>}
                </div>
              )}
              {selectedEdges.map((edge) => <EdgeRow key={edge.key} edge={edge} nodes={nodesByKey} />)}
              {selected && selectedEdges.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No direct relationships recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {riskEdges.length > 0 && (
        <Card className="glass-panel premium-card border-red-400/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-red-300" /> Priority risk relationships</CardTitle>
            <CardDescription>Highest-priority evidence-bearing links currently visible in this campaign graph.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {riskEdges.map((edge) => <EdgeRow key={edge.key} edge={edge} nodes={nodesByKey} />)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
