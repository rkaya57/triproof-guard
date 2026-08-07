"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Building2,
  CircleDot,
  GitBranch,
  Loader2,
  Network,
  RefreshCw,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  WalletGraphEdge,
  WalletGraphNode,
  WalletGraphSeverity,
  WalletGraphSummary,
} from "@/types"

type GraphPayload = {
  graph: {
    componentId: string | null
    nodes: WalletGraphNode[]
    edges: WalletGraphEdge[]
    truncated: boolean
  } | null
  message?: string
}

const severityStyles: Record<WalletGraphSeverity, string> = {
  info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  caution: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  high: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
}

const nodeColors: Record<WalletGraphNode["kind"], string> = {
  wallet: "var(--primary)",
  funder: "var(--guard-orange)",
  referrer: "#a78bfa",
  referral_code: "#c084fc",
  service: "var(--guard-green)",
  deployer: "#22d3ee",
  factory: "#67e8f9",
  implementation: "#38bdf8",
}

function shortValue(value: string | null, fallback: string) {
  if (!value) return fallback
  if (value.length <= 16) return value
  return `${value.slice(0, 7)}...${value.slice(-5)}`
}

function GraphCanvas({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
}: {
  nodes: WalletGraphNode[]
  edges: WalletGraphEdge[]
  selectedNode: string | null
  onSelectNode: (nodeKey: string) => void
}) {
  const visibleNodes = nodes.slice(0, 32)
  const positions = new Map(
    visibleNodes.map((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(visibleNodes.length, 1) - Math.PI / 2
      const ring = index % 3 === 0 ? 31 : 39
      return [
        node.nodeKey,
        {
          x: 50 + Math.cos(angle) * ring,
          y: 50 + Math.sin(angle) * ring,
        },
      ] as const
    })
  )

  return (
    <div className="relative aspect-[16/10] min-h-[330px] overflow-hidden rounded-lg border border-primary/20 bg-background/55">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_srgb,var(--primary)_9%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--primary)_9%,transparent)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" role="img" aria-label="Funding, referral, and EVM provenance evidence graph">
        {edges.map((edge) => {
          const source = positions.get(edge.sourceKey)
          const target = positions.get(edge.targetKey)
          if (!source || !target) return null
          const provenanceEdge =
            edge.kind === "deployed" ||
            edge.kind === "created_by_factory" ||
            edge.kind === "proxy_implementation"
          return (
            <line
              key={edge.edgeKey}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={edge.isRiskBearing ? "var(--guard-red)" : edge.kind === "funded" ? "var(--primary)" : provenanceEdge ? "#22d3ee" : "#a78bfa"}
              strokeWidth={edge.isRiskBearing ? 0.8 : 0.45}
              strokeOpacity={edge.isRiskBearing ? 0.9 : 0.52}
              strokeDasharray={edge.kind === "referred" || provenanceEdge ? "2 1.5" : undefined}
            >
              <title>{`${edge.kind.replace("_", " ")} - ${edge.confidence}% confidence`}</title>
            </line>
          )
        })}
        {visibleNodes.map((node) => {
          const position = positions.get(node.nodeKey)
          if (!position) return null
          const selected = selectedNode === node.nodeKey
          const label = shortValue(node.label ?? node.address, node.kind.replace("_", " "))
          return (
            <g
              key={node.nodeKey}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${label}`}
              className="cursor-pointer outline-none"
              onClick={() => onSelectNode(node.nodeKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelectNode(node.nodeKey)
              }}
            >
              <circle
                cx={position.x}
                cy={position.y}
                r={selected ? 4.3 : 3.3}
                fill={nodeColors[node.kind]}
                stroke={selected ? "white" : "color-mix(in srgb, white 55%, transparent)"}
                strokeWidth={selected ? 0.9 : 0.35}
              >
                <title>{`${label} (${node.kind.replace("_", " ")})`}</title>
              </circle>
              <text
                x={position.x}
                y={position.y + 6.4}
                textAnchor="middle"
                fontSize="2.5"
                fill="currentColor"
                className="select-none"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
      {!visibleNodes.length && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          No graph edges were recorded for this component.
        </div>
      )}
    </div>
  )
}

export function WalletGraphIntelligencePanel({
  analysisId,
  summary,
}: {
  analysisId: string
  summary: WalletGraphSummary | null | undefined
}) {
  const [componentId, setComponentId] = useState(summary?.components[0]?.componentId ?? null)
  const [payload, setPayload] = useState<GraphPayload["graph"]>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(summary))
  const [error, setError] = useState("")
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    if (!summary) return
    const controller = new AbortController()
    const params = new URLSearchParams({ limit: "180" })
    if (componentId) params.set("component", componentId)

    fetch(`/api/analysis/${analysisId}/graph?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as GraphPayload & { error?: string }
        if (!response.ok) throw new Error(body.error ?? "Graph evidence could not be loaded")
        return body
      })
      .then((body) => {
        setPayload(body.graph)
        setSelectedNode(body.graph?.nodes[0]?.nodeKey ?? null)
      })
      .catch((caught: Error) => {
        if (caught.name !== "AbortError") setError(caught.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [analysisId, componentId, retryNonce, summary])

  const activeNode = useMemo(
    () => payload?.nodes.find((node) => node.nodeKey === selectedNode) ?? null,
    [payload, selectedNode]
  )
  const activeEdges = useMemo(
    () =>
      payload?.edges.filter(
        (edge) => edge.sourceKey === selectedNode || edge.targetKey === selectedNode
      ) ?? [],
    [payload, selectedNode]
  )

  return (
    <Card className="glass-panel premium-card overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-primary/[0.035]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
              <Network className="size-4" /> Evidence graph
            </div>
            <CardTitle>Wallet, Referral & Funding Intelligence</CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6">
              Correlates first funding origins, explicit campaign referrals, timing, known service labels, and EVM contract provenance. Shared deployers, factories, and proxy implementations are context only unless independent risk evidence exists.
            </CardDescription>
          </div>
          {summary && (
            <Badge
              variant="outline"
              className={cn(
                "w-fit uppercase",
                severityStyles[
                  summary.maxComponentRisk >= 80
                    ? "critical"
                    : summary.maxComponentRisk >= 55
                      ? "high"
                      : summary.maxComponentRisk >= 25
                        ? "caution"
                        : "info"
                ]
              )}
            >
              Peak graph risk {summary.maxComponentRisk}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {!summary ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-6">
            <GitBranch className="mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">Graph evidence is not available for this report</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                This analysis was created before graph intelligence was enabled. A new analysis will persist funding and referral paths automatically.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                [CircleDot, "Graph edges", summary.totalEdges],
                [Users, "Connected wallets", summary.connectedWallets],
                [Share2, "Referral links", summary.referralLinks],
                [AlertTriangle, "High-risk components", summary.highRiskComponents],
                [ShieldCheck, "Neutral services", summary.neutralServiceFunders],
              ].map(([Icon, label, value]) => {
                const MetricIcon = Icon as typeof CircleDot
                return (
                  <div key={String(label)} className="rounded-lg border border-border bg-background/45 p-4">
                    <MetricIcon className="size-4 text-primary" />
                    <p className="mt-3 text-2xl font-semibold">{String(value)}</p>
                    <p className="text-xs text-muted-foreground">{String(label)}</p>
                  </div>
                )
              })}
            </div>

            {summary.components.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Graph components">
                {summary.components.slice(0, 12).map((component) => (
                  <Button
                    key={component.componentId}
                    type="button"
                    size="sm"
                    variant={componentId === component.componentId ? "default" : "outline"}
                    onClick={() => {
                      setLoading(true)
                      setError("")
                      setComponentId(component.componentId)
                    }}
                    className="shrink-0"
                  >
                    <GitBranch data-icon="inline-start" />
                    {component.componentId}
                    <span className="text-xs opacity-75">{component.walletAddresses.length} wallets</span>
                  </Button>
                ))}
              </div>
            )}

            {error ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                <span>{error}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLoading(true)
                    setError("")
                    setRetryNonce((value) => value + 1)
                  }}
                >
                  <RefreshCw data-icon="inline-start" /> Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="grid min-h-[330px] place-items-center rounded-lg border border-border bg-background/45">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" /> Loading graph evidence
                </div>
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(290px,0.65fr)]">
                <div>
                  <GraphCanvas
                    nodes={payload?.nodes ?? []}
                    edges={payload?.edges ?? []}
                    selectedNode={selectedNode}
                    onSelectNode={setSelectedNode}
                  />
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    {[
                      ["Wallet", nodeColors.wallet],
                      ["Funder", nodeColors.funder],
                      ["Referrer", nodeColors.referrer],
                      ["Known service", nodeColors.service],
                      ["Deployer", nodeColors.deployer],
                      ["Factory", nodeColors.factory],
                      ["Implementation", nodeColors.implementation],
                    ].map(([label, color]) => (
                      <span key={label} className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                        {label}
                      </span>
                    ))}
                    <span className="flex items-center gap-2">
                      <span className="h-0.5 w-5 bg-red-400" /> Risk-bearing edge
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-background/45 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Selected node</p>
                    {activeNode ? (
                      <>
                        <div className="mt-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="break-all font-mono text-sm">{activeNode.label ?? activeNode.address ?? activeNode.nodeKey}</p>
                            <p className="mt-1 text-xs capitalize text-muted-foreground">{activeNode.kind.replace("_", " ")}</p>
                          </div>
                          {activeNode.kind === "service" && <Building2 className="shrink-0 text-green-300" />}
                        </div>
                        <p className="mt-4 text-sm text-muted-foreground">{activeEdges.length} direct evidence link(s)</p>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Select a node to inspect its evidence.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-background/45 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Connection evidence</p>
                    <div className="mt-3 space-y-2">
                      {activeEdges.slice(0, 5).map((edge) => (
                        <div key={edge.edgeKey} className="border-l-2 border-primary/40 pl-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium capitalize">{edge.kind.replace("_", " ")}</span>
                            <span className="text-xs text-muted-foreground">{edge.confidence}%</span>
                          </div>
                          <p className="mt-1 leading-5 text-muted-foreground">{edge.evidence[0] ?? "Graph observation"}</p>
                        </div>
                      ))}
                      {!activeEdges.length && <p className="text-sm text-muted-foreground">No direct edge selected.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              {summary.findings.slice(0, 6).map((finding) => (
                <div key={`${finding.code}:${finding.nodeKey}`} className="rounded-lg border border-border bg-background/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{finding.title}</p>
                      <p className="mt-1 font-mono text-[11px] text-primary">{finding.code}</p>
                    </div>
                    <Badge variant="outline" className={severityStyles[finding.severity]}>
                      {finding.severity}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{finding.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{finding.evidenceCount} evidence observation(s)</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}