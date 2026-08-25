"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleDot,
  Clock3,
  Copy,
  Eye,
  GitBranch,
  History,
  Loader2,
  Maximize2,
  Network,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deterministicRelationshipInterpretation,
  graphComponentLabel,
  graphEvidenceConfidence,
  relationshipStrengths,
  type EvidenceStrength,
} from "@/lib/graph/investigation-presentation"
import { cn } from "@/lib/utils"
import type {
  WalletGraphComponent,
  WalletGraphEdge,
  WalletGraphNode,
  WalletGraphSeverity,
  WalletGraphSummary,
} from "@/types"

type AiRelationshipInsight = {
  source: "gemini" | "fallback"
  model: string | null
  recommendation: string
  confidence: number | null
  evidenceSufficiency: number | null
  coordinationEvidenceStrength: number | null
  automationEvidenceStrength: number | null
  neutralExplanationStrength: number | null
  heterogeneityEvidenceStrength: number | null
  interpretation: string | null
  counterEvidence: string[]
  unresolvedQuestions: string[]
  limitations: string[]
  generatedAt: string
}

type GraphPayload = {
  graph: {
    componentId: string | null
    nodes: WalletGraphNode[]
    edges: WalletGraphEdge[]
    truncated: boolean
  } | null
  aiInsight?: AiRelationshipInsight | null
  message?: string
}

const severityStyles: Record<WalletGraphSeverity, string> = {
  info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  caution: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  high: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
}

const strengthStyles: Record<EvidenceStrength, string> = {
  none: "border-border bg-background/55 text-muted-foreground",
  low: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  high: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
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

const edgeLabels: Record<WalletGraphEdge["kind"], string> = {
  funded: "funded",
  referred: "referred",
  self_referral: "self referral",
  deployed: "deployed",
  created_by_factory: "factory",
  proxy_implementation: "implementation",
}

function shortValue(value: string | null, fallback: string) {
  if (!value) return fallback
  if (value.length <= 18) return value
  return `${value.slice(0, 7)}…${value.slice(-5)}`
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function nodeKindLabel(kind: WalletGraphNode["kind"]) {
  return {
    wallet: "Wallet",
    funder: "Funding origin",
    referrer: "Referrer",
    referral_code: "Referral code",
    service: "Known service",
    deployer: "Contract deployer",
    factory: "Contract factory",
    implementation: "Proxy implementation",
  }[kind]
}

function recommendationLabel(value: string) {
  if (value === "manual_review") return "Manual review recommended"
  if (value === "collect_more_evidence") return "Collect more evidence"
  return "No decision change recommended"
}

function pct(value: number | null) {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`
}

function riskContextSeverity(score: number): WalletGraphSeverity {
  if (score >= 80) return "critical"
  if (score >= 55) return "high"
  if (score >= 25) return "caution"
  return "info"
}

function formatTimestamp(value: string | null) {
  if (!value) return "Not recorded"
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return "Not recorded"
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(timestamp))
}

function formatObservedSpan(edges: WalletGraphEdge[]) {
  const timestamps = edges
    .map((edge) => (edge.observedAt ? Date.parse(edge.observedAt) : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
  if (timestamps.length < 2) return "Not enough timestamps"
  const minutes = Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60_000)
  if (minutes < 60) return `${Math.max(minutes, 1)} min`
  const hours = Math.round((minutes / 60) * 10) / 10
  if (hours < 48) return `${hours} hr`
  return `${Math.round((hours / 24) * 10) / 10} days`
}

function nodeDegree(nodes: WalletGraphNode[], edges: WalletGraphEdge[]) {
  const visible = new Set(nodes.map((node) => node.nodeKey))
  const degree = new Map<string, number>()
  edges.forEach((edge) => {
    if (!visible.has(edge.sourceKey) || !visible.has(edge.targetKey)) return
    degree.set(edge.sourceKey, (degree.get(edge.sourceKey) ?? 0) + 1)
    degree.set(edge.targetKey, (degree.get(edge.targetKey) ?? 0) + 1)
  })
  return degree
}

function buildPositions(nodes: WalletGraphNode[], edges: WalletGraphEdge[]) {
  const degree = nodeDegree(nodes, edges)
  const contextNodes = nodes.filter((node) => node.kind !== "wallet")
  const hub = [...(contextNodes.length ? contextNodes : nodes)].sort(
    (left, right) => (degree.get(right.nodeKey) ?? 0) - (degree.get(left.nodeKey) ?? 0)
  )[0]
  const positions = new Map<string, { x: number; y: number }>()
  if (!hub) return positions

  positions.set(hub.nodeKey, { x: 50, y: 46 })
  const secondaryContext = contextNodes.filter((node) => node.nodeKey !== hub.nodeKey)
  secondaryContext.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(secondaryContext.length, 1) - Math.PI / 2
    positions.set(node.nodeKey, {
      x: 50 + Math.cos(angle) * 24,
      y: 46 + Math.sin(angle) * 21,
    })
  })

  const wallets = nodes.filter((node) => node.kind === "wallet" && node.nodeKey !== hub.nodeKey)
  wallets.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(wallets.length, 1) - Math.PI / 2
    const radius = wallets.length > 18 && index % 2 ? 34 : 41
    positions.set(node.nodeKey, {
      x: 50 + Math.cos(angle) * radius,
      y: 48 + Math.sin(angle) * (radius * 0.82),
    })
  })

  return positions
}

function NodeShape({
  node,
  x,
  y,
  selected,
  opacity,
}: {
  node: WalletGraphNode
  x: number
  y: number
  selected: boolean
  opacity: number
}) {
  const fill = nodeColors[node.kind]
  const stroke = selected ? "white" : "color-mix(in srgb, white 55%, transparent)"
  const strokeWidth = selected ? 0.9 : 0.35

  if (node.kind === "funder") {
    return (
      <polygon
        points={`${x},${y - 4.2} ${x + 4.2},${y} ${x},${y + 4.2} ${x - 4.2},${y}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    )
  }
  if (node.kind === "service") {
    return (
      <rect
        x={x - 3.8}
        y={y - 3.8}
        width={7.6}
        height={7.6}
        rx={1.2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    )
  }
  if (node.kind === "referrer" || node.kind === "referral_code") {
    return (
      <polygon
        points={`${x - 3.7},${y - 2.2} ${x},${y - 4.2} ${x + 3.7},${y - 2.2} ${x + 3.7},${y + 2.2} ${x},${y + 4.2} ${x - 3.7},${y + 2.2}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    )
  }
  if (node.kind === "deployer" || node.kind === "factory" || node.kind === "implementation") {
    return (
      <rect
        x={x - 3.4}
        y={y - 3.4}
        width={6.8}
        height={6.8}
        rx={0.6}
        transform={`rotate(45 ${x} ${y})`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    )
  }
  return (
    <circle
      cx={x}
      cy={y}
      r={selected ? 4.2 : 3.35}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
  )
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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [showLabels, setShowLabels] = useState(false)
  const visibleNodes = nodes.slice(0, 40)
  const positions = useMemo(() => buildPositions(visibleNodes, edges), [visibleNodes, edges])
  const degree = useMemo(() => nodeDegree(visibleNodes, edges), [visibleNodes, edges])
  const selectedNeighbors = useMemo(() => {
    const values = new Set<string>()
    if (!selectedNode) return values
    values.add(selectedNode)
    edges.forEach((edge) => {
      if (edge.sourceKey === selectedNode) values.add(edge.targetKey)
      if (edge.targetKey === selectedNode) values.add(edge.sourceKey)
    })
    return values
  }, [edges, selectedNode])

  async function toggleFullscreen() {
    if (!wrapperRef.current || typeof document === "undefined") return
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
      return
    }
    await wrapperRef.current.requestFullscreen?.().catch(() => undefined)
  }

  return (
    <div
      ref={wrapperRef}
      className="relative min-h-[400px] overflow-hidden rounded-2xl border border-primary/20 bg-background/75 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--primary)_10%,transparent)] sm:min-h-[470px]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_42%),linear-gradient(to_right,color-mix(in_srgb,var(--primary)_5%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--primary)_5%,transparent)_1px,transparent_1px)] bg-[size:auto,38px_38px,38px_38px]" />
      <div className="absolute right-3 top-3 z-20 flex gap-1 rounded-xl border border-border/80 bg-background/90 p-1 shadow-lg backdrop-blur">
        <Button type="button" size="icon" variant="ghost" aria-label="Toggle relationship labels" aria-pressed={showLabels} onClick={() => setShowLabels((value) => !value)}>
          <Eye className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.8, value - 0.15))}>
          <ZoomOut className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Reset zoom" onClick={() => setZoom(1)}>
          <RotateCcw className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.7, value + 0.15))}>
          <ZoomIn className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" aria-label="Toggle fullscreen" onClick={toggleFullscreen}>
          <Maximize2 className="size-4" />
        </Button>
      </div>

      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full transition-transform duration-200"
        style={{ transform: `scale(${zoom})`, transformOrigin: "50% 50%" }}
        role="img"
        aria-label="Directional funding, referral, and provenance investigation graph"
      >
        <defs>
          <marker id="arrow-context" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--primary)" opacity="0.75" />
          </marker>
          <marker id="arrow-investigation" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--guard-orange)" opacity="0.9" />
          </marker>
          <marker id="arrow-referral" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L6,3 L0,6 Z" fill="#a78bfa" opacity="0.85" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const source = positions.get(edge.sourceKey)
          const target = positions.get(edge.targetKey)
          if (!source || !target) return null
          const provenance = edge.kind === "deployed" || edge.kind === "created_by_factory" || edge.kind === "proxy_implementation"
          const referral = edge.kind === "referred" || edge.kind === "self_referral"
          const active = !selectedNode || edge.sourceKey === selectedNode || edge.targetKey === selectedNode
          const stroke = edge.isRiskBearing
            ? "var(--guard-orange)"
            : referral
              ? "#a78bfa"
              : provenance
                ? "#22d3ee"
                : "var(--primary)"
          const shouldLabel = showLabels && active && (edge.isRiskBearing || visibleNodes.length <= 14)
          const midX = (source.x + target.x) / 2
          const midY = (source.y + target.y) / 2
          return (
            <g key={edge.edgeKey} opacity={active ? 1 : 0.12}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={stroke}
                strokeWidth={edge.isRiskBearing ? 0.72 : 0.38}
                strokeOpacity={edge.isRiskBearing ? 0.92 : 0.52}
                strokeDasharray={referral || provenance ? "2 1.5" : undefined}
                markerEnd={`url(#${edge.isRiskBearing ? "arrow-investigation" : referral ? "arrow-referral" : "arrow-context"})`}
              >
                <title>{`${edgeLabels[edge.kind]} · ${edge.confidence}% evidence confidence${edge.isRiskBearing ? " · investigation-relevant" : ""}`}</title>
              </line>
              {shouldLabel && (
                <text
                  x={midX}
                  y={midY - 1.2}
                  textAnchor="middle"
                  fontSize="2.05"
                  fill={stroke}
                  stroke="var(--background)"
                  strokeWidth="0.7"
                  paintOrder="stroke"
                  className="select-none"
                >
                  {edgeLabels[edge.kind]}
                </text>
              )}
            </g>
          )
        })}

        {visibleNodes.map((node) => {
          const position = positions.get(node.nodeKey)
          if (!position) return null
          const selected = selectedNode === node.nodeKey
          const connected = !selectedNode || selectedNeighbors.has(node.nodeKey)
          const label = shortValue(node.label ?? node.address, nodeKindLabel(node.kind))
          const showNodeLabel = selected || (degree.get(node.nodeKey) ?? 0) >= 3 || visibleNodes.length <= 14
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
              {selected && (
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={6.3}
                  fill="none"
                  stroke={nodeColors[node.kind]}
                  strokeWidth="0.55"
                  strokeOpacity="0.5"
                />
              )}
              <NodeShape node={node} x={position.x} y={position.y} selected={selected} opacity={connected ? 1 : 0.24} />
              {showNodeLabel && (
                <text
                  x={position.x}
                  y={position.y + 6.8}
                  textAnchor="middle"
                  fontSize="2.4"
                  fill="currentColor"
                  opacity={connected ? 1 : 0.24}
                  stroke="var(--background)"
                  strokeWidth="0.75"
                  paintOrder="stroke"
                  className="select-none"
                >
                  {label}
                </text>
              )}
              <title>{`${label} · ${nodeKindLabel(node.kind)}`}</title>
            </g>
          )
        })}
      </svg>

      {!visibleNodes.length && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
          No relationship edges were recorded for this component.
        </div>
      )}
      <div className="absolute bottom-3 left-3 rounded-lg border border-border/70 bg-background/88 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        {Math.round(zoom * 100)}% · select a node to isolate direct relationships · eye toggles edge labels
      </div>
    </div>
  )
}

function StrengthRow({ label, value }: { label: string; value: EvidenceStrength }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="outline" className={cn("capitalize", strengthStyles[value])}>
        {value}
      </Badge>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/75 bg-background/55 p-3">
      <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold">{value}</p>
    </div>
  )
}

function componentById(summary: WalletGraphSummary, componentId: string | null) {
  return summary.components.find((component) => component.componentId === componentId) ?? summary.components[0] ?? null
}

function componentTabLabel(component: WalletGraphComponent) {
  return graphComponentLabel(component).replace(" cluster", "")
}

function investigationAction(component: WalletGraphComponent | null, riskRelevantCount: number) {
  if (!component) return "Observe"
  if (component.severity === "critical" || component.severity === "high" || riskRelevantCount > 0) return "Prioritize review"
  if (component.severity === "caution") return "Review context"
  return "Observe"
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
  const [aiInsight, setAiInsight] = useState<AiRelationshipInsight | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(summary))
  const [error, setError] = useState("")
  const [retryNonce, setRetryNonce] = useState(0)
  const [copied, setCopied] = useState(false)

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
        setAiInsight(body.aiInsight ?? null)
        const highestDegreeNode = body.graph?.nodes
          .map((node) => ({
            node,
            degree: body.graph?.edges.filter((edge) => edge.sourceKey === node.nodeKey || edge.targetKey === node.nodeKey).length ?? 0,
          }))
          .sort((left, right) => right.degree - left.degree)[0]?.node
        setSelectedNode(highestDegreeNode?.nodeKey ?? body.graph?.nodes[0]?.nodeKey ?? null)
      })
      .catch((caught: Error) => {
        if (caught.name !== "AbortError") setError(caught.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [analysisId, componentId, retryNonce, summary])

  const currentComponent = useMemo(
    () => (summary ? componentById(summary, payload?.componentId ?? componentId) : null),
    [componentId, payload?.componentId, summary]
  )
  const activeNode = useMemo(
    () => payload?.nodes.find((node) => node.nodeKey === selectedNode) ?? null,
    [payload, selectedNode]
  )
  const activeEdges = useMemo(
    () => payload?.edges.filter((edge) => edge.sourceKey === selectedNode || edge.targetKey === selectedNode) ?? [],
    [payload, selectedNode]
  )
  const nodeByKey = useMemo(
    () => new Map((payload?.nodes ?? []).map((node) => [node.nodeKey, node] as const)),
    [payload]
  )
  const strengths = useMemo(
    () => relationshipStrengths(payload?.nodes ?? [], payload?.edges ?? []),
    [payload]
  )
  const evidenceConfidence = useMemo(
    () => graphEvidenceConfidence(payload?.edges ?? []),
    [payload]
  )
  const deterministicInsight = useMemo(
    () => deterministicRelationshipInterpretation(currentComponent, payload?.nodes ?? [], payload?.edges ?? []),
    [currentComponent, payload]
  )
  const activeEdgeStats = useMemo(() => {
    if (!activeEdges.length) return { incoming: 0, outgoing: 0, investigationRelevant: 0, averageConfidence: null as number | null }
    return {
      incoming: activeEdges.filter((edge) => edge.targetKey === selectedNode).length,
      outgoing: activeEdges.filter((edge) => edge.sourceKey === selectedNode).length,
      investigationRelevant: activeEdges.filter((edge) => edge.isRiskBearing).length,
      averageConfidence: Math.round(activeEdges.reduce((sum, edge) => sum + edge.confidence, 0) / activeEdges.length),
    }
  }, [activeEdges, selectedNode])
  const componentMetrics = useMemo(() => {
    const nodes = payload?.nodes ?? []
    const edges = payload?.edges ?? []
    const walletKeys = new Set(nodes.filter((node) => node.kind === "wallet").map((node) => node.nodeKey))
    const fundingEdges = edges.filter((edge) => edge.kind === "funded")
    const fundingOriginCoverage = new Map<string, Set<string>>()
    fundingEdges.forEach((edge) => {
      const source = nodeByKey.get(edge.sourceKey)
      const target = nodeByKey.get(edge.targetKey)
      if (!source || !target) return
      const originKey = source.kind === "wallet" && target.kind !== "wallet" ? target.nodeKey : source.nodeKey
      const walletKey = walletKeys.has(edge.targetKey) ? edge.targetKey : walletKeys.has(edge.sourceKey) ? edge.sourceKey : null
      if (!walletKey) return
      const wallets = fundingOriginCoverage.get(originKey) ?? new Set<string>()
      wallets.add(walletKey)
      fundingOriginCoverage.set(originKey, wallets)
    })
    const dominantCoverage = [...fundingOriginCoverage.values()].reduce((max, wallets) => Math.max(max, wallets.size), 0)
    const walletCount = currentComponent?.walletAddresses.length ?? walletKeys.size
    const concentration = walletCount > 0 && dominantCoverage > 0 ? Math.round((dominantCoverage / walletCount) * 100) : null
    const observedEdges = edges.filter((edge) => Boolean(edge.observedAt))
    const transactionReferences = edges.filter((edge) => Boolean(edge.transactionId)).length
    const amountObservations = edges.filter((edge) => edge.amount !== null).length
    return {
      concentration,
      uniqueFundingOrigins: fundingOriginCoverage.size,
      observedSpan: formatObservedSpan(observedEdges),
      firstObserved: observedEdges
        .map((edge) => edge.observedAt)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null,
      lastObserved: observedEdges
        .map((edge) => edge.observedAt)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null,
      transactionReferences,
      amountObservations,
    }
  }, [currentComponent?.walletAddresses.length, nodeByKey, payload])

  const timelineEdges = useMemo(
    () => [...activeEdges]
      .filter((edge) => Boolean(edge.observedAt))
      .sort((left, right) => Date.parse(left.observedAt ?? "") - Date.parse(right.observedAt ?? "")),
    [activeEdges]
  )

  const strengthenSignals = useMemo(() => {
    const values: string[] = []
    if (strengths.funding === "high" || strengths.funding === "medium") values.push("Independent timing or behavioral evidence that corroborates the shared funding pattern.")
    if (strengths.referral === "high" || strengths.referral === "medium") values.push("Repeated referral relationships that align with the same wallet cohort.")
    if (strengths.riskRelevant !== "none") values.push("Persistent investigation-relevant relationships across additional analysis runs.")
    if (!values.length) values.push("A second independent evidence family, such as timing, behavior, referral, or campaign coordination.")
    return values.slice(0, 3)
  }, [strengths])

  const weakenSignals = useMemo(() => {
    const values = [
      "Resolution of the shared origin to a known exchange, bridge, protocol, service, or trusted distributor.",
      "Evidence that the origin broadly funds unrelated users outside this campaign cohort.",
      "Sparse, truncated, or low-confidence provenance that cannot support the observed relationship consistently.",
    ]
    if (strengths.serviceResolution === "high") values.unshift("Existing neutral-service resolution already provides a plausible non-malicious explanation.")
    return values.slice(0, 3)
  }, [strengths.serviceResolution])

  async function copyNodeValue() {
    const value = activeNode?.address ?? activeNode?.walletAddress ?? activeNode?.label ?? activeNode?.nodeKey
    if (!value || !navigator.clipboard) return
    await navigator.clipboard.writeText(value).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <Card className="glass-panel premium-card overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_45%)]">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
              <Network className="size-4" /> Relationship intelligence
            </div>
            <CardTitle>Wallet Relationship Investigation</CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6">
              A forensic review surface for persisted funding, referral, service, and contract-provenance relationships. It prioritizes investigation context without turning graph proximity into an ownership, automation, Sybil, or malicious-intent claim.
            </CardDescription>
          </div>
          {summary && currentComponent && (
            <div className="grid min-w-full gap-2 sm:grid-cols-2 xl:min-w-[460px]">
              <div className="rounded-xl border border-border/75 bg-background/55 px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Review priority</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{investigationAction(currentComponent, strengths.riskRelevantCount)}</span>
                  <Badge variant="outline" className={severityStyles[currentComponent.severity]}>{currentComponent.severity}</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-border/75 bg-background/55 px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Evidence confidence</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold capitalize">{evidenceConfidence}</span>
                  <Badge variant="outline" className={strengthStyles[evidenceConfidence]}>persisted</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-border/75 bg-background/55 px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Ownership claim</p>
                <p className="mt-1.5 text-sm font-semibold">Not established</p>
              </div>
              <div className="rounded-xl border border-border/75 bg-background/55 px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Service resolution</p>
                <p className="mt-1.5 text-sm font-semibold capitalize">{strengths.serviceResolution}</p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!summary ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border p-6">
            <GitBranch className="mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">Relationship evidence is not available for this report</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                This analysis predates graph intelligence. A new analysis will persist funding, referral, and provenance paths automatically.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-5">
              {[
                [CircleDot, "Evidence links", summary.totalEdges],
                [Users, "Connected wallets", summary.connectedWallets],
                [Share2, "Referral links", summary.referralLinks],
                [AlertTriangle, "Review-priority components", summary.highRiskComponents],
                [ShieldCheck, "Neutral services", summary.neutralServiceFunders],
              ].map(([Icon, label, value]) => {
                const MetricIcon = Icon as typeof CircleDot
                return (
                  <div key={String(label)} className="rounded-xl border border-border/75 bg-background/45 p-3.5 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <MetricIcon className="size-4 text-primary" />
                      <span className="text-2xl font-semibold tabular-nums">{String(value)}</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-4 text-muted-foreground sm:text-xs">{String(label)}</p>
                  </div>
                )
              })}
            </div>

            {currentComponent && (
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-4xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">Cluster investigation — {currentComponent.componentId}</p>
                      <Badge variant="outline" className={severityStyles[currentComponent.severity]}>
                        {currentComponent.severity} review priority
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{deterministicInsight}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">Persisted graph state</Badge>
                    <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">No ownership inference</Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-border/75 bg-background/55 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary">What we observed</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {componentMetrics.concentration !== null
                        ? `${componentMetrics.concentration}% of the component wallets are connected to the dominant observed funding origin in this bounded graph view.`
                        : `${currentComponent.walletAddresses.length} wallets are connected through persisted relationship evidence in this component.`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/75 bg-background/55 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary">Why it matters</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {strengths.serviceResolution === "none"
                        ? "The dominant relationship is not resolved here to a known neutral service, so it remains useful investigation context."
                        : "Known-service context is present and must be considered before treating shared infrastructure as meaningful coordination evidence."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/75 bg-background/55 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary">Decision boundary</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      The graph supports prioritization only. It does not establish shared ownership, one operator, automation, or malicious intent.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/75 bg-background/55 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary">Recommended next step</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Compare funding with timing, behavior, referral, and downstream activity before an operational wallet decision is made.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                  <MiniStat label="Wallets" value={currentComponent.walletAddresses.length} />
                  <MiniStat label="Investigation links" value={strengths.riskRelevantCount} />
                  <MiniStat label="Known services" value={strengths.serviceNodeCount} />
                  <MiniStat label="Evidence confidence" value={titleCase(evidenceConfidence)} />
                  <MiniStat label="Funding concentration" value={componentMetrics.concentration === null ? "n/a" : `${componentMetrics.concentration}%`} />
                  <MiniStat label="Funding origins" value={componentMetrics.uniqueFundingOrigins || "n/a"} />
                  <MiniStat label="Observed span" value={componentMetrics.observedSpan} />
                  <MiniStat label="Tx references" value={componentMetrics.transactionReferences} />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Shared funding", strengths.funding],
                      ["Referral overlap", strengths.referral],
                      ["Service resolution", strengths.serviceResolution],
                      ["Investigation evidence", strengths.riskRelevant],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl border border-border/70 bg-background/50 p-3.5">
                        <p className="text-xs text-muted-foreground">{String(label)}</p>
                        <Badge variant="outline" className={cn("mt-2 capitalize", strengthStyles[value as EvidenceStrength])}>{String(value)}</Badge>
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-border/70 rounded-xl border border-border/75 bg-background/55 px-4 py-1">
                    <StrengthRow label="Shared funding" value={strengths.funding} />
                    <StrengthRow label="Referral overlap" value={strengths.referral} />
                    <StrengthRow label="Service resolution" value={strengths.serviceResolution} />
                  </div>
                </div>
              </div>
            )}

            {summary.components.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Relationship components</p>
                  <p className="text-xs text-muted-foreground">Select a component to inspect its persisted relationships</p>
                </div>
                <div className="flex flex-wrap gap-2" aria-label="Relationship components">
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
                      className="h-auto min-w-0 flex-1 basis-[160px] justify-start rounded-xl px-3 py-2.5 sm:flex-none"
                    >
                      <GitBranch className="size-4 shrink-0" />
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-xs font-medium">{componentTabLabel(component)} · {component.walletAddresses.length}</span>
                        <span className="block font-mono text-[10px] opacity-65">{component.componentId}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {error ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
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
                  <RefreshCw className="size-4" /> Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="grid min-h-[420px] place-items-center rounded-2xl border border-border bg-background/45">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" /> Loading relationship evidence
                </div>
              </div>
            ) : (
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.45fr)]">
                <div>
                  <GraphCanvas
                    nodes={payload?.nodes ?? []}
                    edges={payload?.edges ?? []}
                    selectedNode={selectedNode}
                    onSelectNode={setSelectedNode}
                  />
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-border/65 bg-background/35 px-3 py-2.5 text-[11px] text-muted-foreground sm:text-xs">
                    {[
                      ["Wallet", nodeColors.wallet, "circle"],
                      ["Funding origin", nodeColors.funder, "diamond"],
                      ["Referrer", nodeColors.referrer, "hex"],
                      ["Known service", nodeColors.service, "square"],
                      ["Contract provenance", nodeColors.deployer, "diamond"],
                    ].map(([label, color, shape]) => (
                      <span key={label} className="flex items-center gap-2">
                        <span
                          className={cn("size-2.5 shrink-0", shape === "circle" ? "rounded-full" : shape === "square" ? "rounded-[2px]" : "rotate-45 rounded-[1px]")}
                          style={{ backgroundColor: color }}
                        />
                        {label}
                      </span>
                    ))}
                    <span className="flex items-center gap-2">
                      <span className="h-0.5 w-5 bg-orange-400" /> Investigation-relevant relationship
                    </span>
                  </div>
                  {payload?.truncated && (
                    <p className="mt-2 text-xs text-amber-200">This component is large; the canvas shows a bounded evidence view for readability.</p>
                  )}
                </div>

                <div className="2xl:sticky 2xl:top-4 2xl:self-start">
                  <div className="rounded-2xl border border-border bg-background/45 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Selected node</p>
                        <p className="mt-1 text-sm font-semibold">Investigation intelligence</p>
                      </div>
                      {activeNode && (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{nodeKindLabel(activeNode.kind)}</Badge>
                      )}
                    </div>

                    {activeNode ? (
                      <>
                        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/50 p-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {activeNode.kind === "service" && <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Neutral service context</Badge>}
                            </div>
                            <p className="mt-2 break-all font-mono text-xs leading-5 sm:text-sm">
                              {activeNode.label ?? activeNode.address ?? activeNode.nodeKey}
                            </p>
                          </div>
                          <Button type="button" size="icon" variant="outline" className="shrink-0" aria-label="Copy selected node" onClick={copyNodeValue}>
                            <Copy className="size-4" />
                          </Button>
                        </div>
                        {copied && <p className="mt-2 text-xs text-green-300">Copied</p>}

                        <Tabs defaultValue="overview" className="mt-4">
                          <TabsList variant="line" className="grid w-full grid-cols-4">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="evidence">Evidence</TabsTrigger>
                            <TabsTrigger value="timeline">Timeline</TabsTrigger>
                            <TabsTrigger value="analyst">Analyst</TabsTrigger>
                          </TabsList>

                          <TabsContent value="overview" className="mt-3">
                            <div className="grid grid-cols-2 gap-2">
                              <MiniStat label="Chain" value={activeNode.chain ?? "n/a"} />
                              <MiniStat label="Direct links" value={activeEdges.length} />
                              <MiniStat label="Incoming" value={activeEdgeStats.incoming} />
                              <MiniStat label="Outgoing" value={activeEdgeStats.outgoing} />
                              <MiniStat label="Investigation links" value={activeEdgeStats.investigationRelevant} />
                              <MiniStat label="Avg confidence" value={activeEdgeStats.averageConfidence === null ? "n/a" : `${activeEdgeStats.averageConfidence}%`} />
                              <MiniStat label="First observed" value={formatTimestamp(timelineEdges[0]?.observedAt ?? null)} />
                              <MiniStat label="Last observed" value={formatTimestamp(timelineEdges[timelineEdges.length - 1]?.observedAt ?? null)} />
                            </div>
                            <div className="mt-3 rounded-xl border border-border/70 bg-background/45 p-3 text-xs leading-5 text-muted-foreground">
                              Node intelligence reflects persisted relationship evidence only. The selected node is not independently classified by this panel.
                            </div>
                          </TabsContent>

                          <TabsContent value="evidence" className="mt-3 space-y-2.5">
                            {activeEdges.slice(0, 7).map((edge) => {
                              const source = nodeByKey.get(edge.sourceKey)
                              const target = nodeByKey.get(edge.targetKey)
                              return (
                                <div key={edge.edgeKey} className={cn("rounded-xl border p-3 text-sm", edge.isRiskBearing ? "border-orange-400/25 bg-orange-400/[0.055]" : "border-border/75 bg-background/50")}>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium capitalize">{edgeLabels[edge.kind]}</span>
                                    <div className="flex items-center gap-2">
                                      {edge.isRiskBearing && <Badge variant="outline" className="border-orange-400/30 bg-orange-400/10 text-[10px] text-orange-200">investigation-relevant</Badge>}
                                      <span className="text-xs text-muted-foreground">{edge.confidence}%</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                    <span className="truncate">{shortValue(source?.label ?? source?.address ?? null, nodeKindLabel(source?.kind ?? "wallet"))}</span>
                                    <ArrowRight className="size-3 shrink-0" />
                                    <span className="truncate">{shortValue(target?.label ?? target?.address ?? null, nodeKindLabel(target?.kind ?? "wallet"))}</span>
                                  </div>
                                  <p className="mt-2 leading-5 text-muted-foreground">{edge.evidence[0] ?? "Relationship observation"}</p>
                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                    {edge.observedAt && <span>{formatTimestamp(edge.observedAt)}</span>}
                                    {edge.transactionId && <span>Tx · {shortValue(edge.transactionId, "reference")}</span>}
                                    {edge.amount !== null && <span>Amount recorded</span>}
                                  </div>
                                </div>
                              )
                            })}
                            {!activeEdges.length && <p className="text-sm text-muted-foreground">No direct relationship is selected.</p>}
                          </TabsContent>

                          <TabsContent value="timeline" className="mt-3">
                            {timelineEdges.length ? (
                              <div className="space-y-2">
                                {timelineEdges.slice(0, 8).map((edge, index) => (
                                  <div key={edge.edgeKey} className="flex gap-3 rounded-xl border border-border/70 bg-background/45 p-3">
                                    <div className="flex flex-col items-center">
                                      <div className="grid size-7 place-items-center rounded-full border border-primary/25 bg-primary/10 text-[10px] font-semibold text-primary">{index + 1}</div>
                                      {index < Math.min(timelineEdges.length, 8) - 1 && <div className="mt-1 h-full w-px bg-border" />}
                                    </div>
                                    <div className="min-w-0 pb-1">
                                      <p className="text-sm font-medium capitalize">{edgeLabels[edge.kind]}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(edge.observedAt)}</p>
                                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{edge.evidence[0] ?? "Persisted relationship observation"}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No reliable observed timestamps are stored for the selected node.</div>
                            )}
                          </TabsContent>

                          <TabsContent value="analyst" className="mt-3 space-y-3">
                            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.045] p-3">
                              <div className="flex items-center gap-2 text-sm font-medium"><Activity className="size-4 text-cyan-300" /> What would strengthen this case</div>
                              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                                {strengthenSignals.map((item) => <li key={item}>• {item}</li>)}
                              </ul>
                            </div>
                            <div className="rounded-xl border border-green-400/20 bg-green-400/[0.04] p-3">
                              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-green-300" /> What would weaken this case</div>
                              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                                {weakenSignals.map((item) => <li key={item}>• {item}</li>)}
                              </ul>
                            </div>
                            <div className="rounded-xl border border-border/70 bg-background/45 p-3 text-xs leading-5 text-muted-foreground">
                              <strong className="text-foreground">Analyst boundary:</strong> use this relationship view to prioritize evidence collection and comparison. Wallet execution state remains governed by the stored decision and review workflow.
                            </div>
                          </TabsContent>
                        </Tabs>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Select a node to inspect its evidence.</p>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniStat label="Run ID" value={shortValue(analysisId, analysisId)} />
                    <MiniStat label="Component" value={currentComponent?.componentId ?? "n/a"} />
                    <MiniStat label="First observed" value={formatTimestamp(componentMetrics.firstObserved)} />
                    <MiniStat label="Last observed" value={formatTimestamp(componentMetrics.lastObserved)} />
                  </div>
                  <div className="mt-2 rounded-xl border border-border/70 bg-background/35 p-3 text-[11px] leading-5 text-muted-foreground">
                    Audit context: persisted graph evidence · {componentMetrics.transactionReferences} transaction reference(s) · {componentMetrics.amountObservations} relationship amount observation(s). Amounts are not aggregated here because chain/native-unit semantics may differ.
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <p className="font-semibold">AI relationship insight</p>
                  </div>
                  {aiInsight?.source === "gemini" ? (
                    <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">Audited AI · {aiInsight.model ?? "Gemini"}</Badge>
                  ) : (
                    <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">Deterministic context</Badge>
                  )}
                </div>

                {aiInsight?.source === "gemini" && aiInsight.interpretation ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{aiInsight.interpretation}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ["AI confidence", pct(aiInsight.confidence)],
                        ["Evidence sufficiency", pct(aiInsight.evidenceSufficiency)],
                        ["Coordination evidence", pct(aiInsight.coordinationEvidenceStrength)],
                        ["Neutral explanation", pct(aiInsight.neutralExplanationStrength)],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl border border-border/75 bg-background/55 p-3">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{String(label)}</p>
                          <p className="mt-1 text-base font-semibold">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{recommendationLabel(aiInsight.recommendation)}</Badge>
                      <span className="text-xs leading-6 text-muted-foreground">Analysis-level audited cluster context; it does not independently classify the selected node.</span>
                    </div>
                    {(aiInsight.counterEvidence.length > 0 || aiInsight.unresolvedQuestions.length > 0) && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-background/45 p-3">
                          <p className="text-xs font-medium">Counter-evidence</p>
                          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                            {(aiInsight.counterEvidence.length ? aiInsight.counterEvidence : ["No material counter-evidence was recorded."]).slice(0, 2).map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-background/45 p-3">
                          <p className="text-xs font-medium">Open questions</p>
                          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                            {(aiInsight.unresolvedQuestions.length ? aiInsight.unresolvedQuestions : ["No unresolved AI question was recorded."]).slice(0, 2).map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                    <p className="mt-4 text-[11px] text-muted-foreground">AI context generated: {formatTimestamp(aiInsight.generatedAt)}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{deterministicInsight}</p>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">No audited Gemini cluster assessment is available for this analysis. The relationship graph therefore remains deterministic decision-support context.</p>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-background/45 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Waypoints className="size-4 text-primary" />
                  <p className="font-semibold">Investigation boundary</p>
                </div>
                <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
                  <p>• Shared funding may reflect coordinated onboarding, an exchange withdrawal, a service wallet, or common ownership; additional evidence is required to distinguish them.</p>
                  <p>• Directional edges show observed provenance, not legal or beneficial ownership.</p>
                  <p>• Graph context may prioritize human review but cannot independently create a malicious label.</p>
                  <p>• Neutral infrastructure context remains neutral and cannot be promoted by this presentation layer.</p>
                </div>
              </div>
            </div>

            {summary.findings.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><History className="size-4 text-primary" /><p className="font-semibold">Evidence findings</p></div>
                    <p className="mt-1 text-xs text-muted-foreground">Deterministic graph observations ranked for investigation; not standalone wallet classifications.</p>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {summary.findings.slice(0, 6).map((finding) => (
                    <div key={`${finding.code}:${finding.nodeKey}`} className="rounded-xl border border-border bg-background/45 p-4">
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
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
