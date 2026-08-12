"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CircleDot,
  Copy,
  GitBranch,
  Loader2,
  Maximize2,
  Network,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { decisionLabel } from "@/lib/decision-labels"
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
  VisualDecisionProofCluster,
  VisualDecisionProofClusterIndex,
  VisualDecisionProofFocus,
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
  clusterIndex?: VisualDecisionProofClusterIndex[]
  cluster?: VisualDecisionProofCluster | null
  focus?: VisualDecisionProofFocus | null
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
      className="relative min-h-[380px] overflow-hidden rounded-xl border border-primary/20 bg-background/70 sm:min-h-[440px]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_srgb,var(--primary)_8%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--primary)_8%,transparent)_1px,transparent_1px)] bg-[size:34px_34px]" />
      <div className="absolute right-3 top-3 z-20 flex gap-1 rounded-lg border border-border/80 bg-background/90 p-1 shadow-lg backdrop-blur">
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
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--primary)" opacity="0.8" />
          </marker>
          <marker id="arrow-risk" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
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
          const showLabel = active && (edge.isRiskBearing || visibleNodes.length <= 12)
          const midX = (source.x + target.x) / 2
          const midY = (source.y + target.y) / 2
          return (
            <g key={edge.edgeKey} opacity={active ? 1 : 0.14}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={stroke}
                strokeWidth={edge.isRiskBearing ? 0.72 : 0.42}
                strokeOpacity={edge.isRiskBearing ? 0.9 : 0.58}
                strokeDasharray={referral || provenance ? "2 1.5" : undefined}
                markerEnd={`url(#${edge.isRiskBearing ? "arrow-risk" : referral ? "arrow-referral" : "arrow-context"})`}
              >
                <title>{`${edgeLabels[edge.kind]} · ${edge.confidence}% evidence confidence${edge.isRiskBearing ? " · risk-relevant" : ""}`}</title>
              </line>
              {showLabel && (
                <text
                  x={midX}
                  y={midY - 1.2}
                  textAnchor="middle"
                  fontSize="2.1"
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
          const showLabel = selected || (degree.get(node.nodeKey) ?? 0) >= 3 || visibleNodes.length <= 14
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
              <NodeShape node={node} x={position.x} y={position.y} selected={selected} opacity={connected ? 1 : 0.28} />
              {showLabel && (
                <text
                  x={position.x}
                  y={position.y + 6.8}
                  textAnchor="middle"
                  fontSize="2.45"
                  fill="currentColor"
                  opacity={connected ? 1 : 0.28}
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
      <div className="absolute bottom-3 left-3 rounded-md border border-border/70 bg-background/85 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
        {Math.round(zoom * 100)}% · select a node to isolate its direct relationships
      </div>
    </div>
  )
}

function StrengthRow({ label, value }: { label: string; value: EvidenceStrength }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant="outline" className={cn("capitalize", strengthStyles[value])}>
        {value}
      </Badge>
    </div>
  )
}

function componentById(summary: WalletGraphSummary, componentId: string | null) {
  return summary.components.find((component) => component.componentId === componentId) ?? summary.components[0] ?? null
}

function componentTabLabel(component: WalletGraphComponent) {
  return graphComponentLabel(component).replace(" cluster", "")
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
  const [clusterIndex, setClusterIndex] = useState<VisualDecisionProofClusterIndex[]>([])
  const [selectedCluster, setSelectedCluster] = useState<VisualDecisionProofCluster | null>(null)
  const [clusterLabel, setClusterLabel] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [focus, setFocus] = useState<VisualDecisionProofFocus | null>(null)
  const [loading, setLoading] = useState(Boolean(summary))
  const [error, setError] = useState("")
  const [retryNonce, setRetryNonce] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!summary) return
    const controller = new AbortController()
    const params = new URLSearchParams({ limit: "180" })
    if (componentId) params.set("component", componentId)
    if (clusterLabel) params.set("cluster", clusterLabel)

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
        setClusterIndex(body.clusterIndex ?? [])
        setSelectedCluster(body.cluster ?? null)
        const highestDegreeNode = body.graph?.nodes
          .map((node) => ({
            node,
            degree: body.graph?.edges.filter((edge) => edge.sourceKey === node.nodeKey || edge.targetKey === node.nodeKey).length ?? 0,
          }))
          .sort((left, right) => right.degree - left.degree)[0]?.node
        setSelectedNode((current) =>
          body.graph?.nodes.some((node) => node.nodeKey === current)
            ? current
            : highestDegreeNode?.nodeKey ?? body.graph?.nodes[0]?.nodeKey ?? null
        )
      })
      .catch((caught: Error) => {
        if (caught.name !== "AbortError") setError(caught.message)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [analysisId, clusterLabel, componentId, retryNonce, summary])

  useEffect(() => {
    if (!selectedNode) return

    const controller = new AbortController()
    const params = new URLSearchParams({ view: "focus", node: selectedNode })

    fetch(`/api/analysis/${analysisId}/graph?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as GraphPayload & { error?: string }
        if (!response.ok) throw new Error(body.error ?? "Decision evidence could not be loaded")
        return body.focus ?? null
      })
      .then((value) => setFocus(value))
      .catch((caught: Error) => {
        if (caught.name !== "AbortError") setFocus(null)
      })

    return () => controller.abort()
  }, [analysisId, selectedNode])

  const currentComponent = useMemo(
    () => (summary ? componentById(summary, payload?.componentId ?? componentId) : null),
    [componentId, payload?.componentId, summary]
  )
  const activeNode = useMemo(
    () => payload?.nodes.find((node) => node.nodeKey === selectedNode) ?? null,
    [payload, selectedNode]
  )
  const visibleFocus = selectedNode ? focus : null
  const activeEdges = useMemo(
    () =>
      payload?.edges.filter(
        (edge) => edge.sourceKey === selectedNode || edge.targetKey === selectedNode
      ) ?? [],
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
    if (!activeEdges.length) return { incoming: 0, outgoing: 0, riskRelevant: 0, averageConfidence: null as number | null }
    return {
      incoming: activeEdges.filter((edge) => edge.targetKey === selectedNode).length,
      outgoing: activeEdges.filter((edge) => edge.sourceKey === selectedNode).length,
      riskRelevant: activeEdges.filter((edge) => edge.isRiskBearing).length,
      averageConfidence: Math.round(activeEdges.reduce((sum, edge) => sum + edge.confidence, 0) / activeEdges.length),
    }
  }, [activeEdges, selectedNode])

  async function copyNodeValue() {
    const value = activeNode?.address ?? activeNode?.walletAddress ?? activeNode?.label ?? activeNode?.nodeKey
    if (!value || !navigator.clipboard) return
    await navigator.clipboard.writeText(value).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <Card className="glass-panel premium-card overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-primary/[0.035]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
              <Network className="size-4" /> Relationship intelligence
            </div>
            <CardTitle>Wallet Relationship Investigation</CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6">
              Investigates directional funding, referral, service, and contract-provenance relationships. Graph links prioritize review context; they do not by themselves establish common ownership, Sybil behavior, automation, or malicious intent.
            </CardDescription>
          </div>
          {summary && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("w-fit capitalize", strengthStyles[evidenceConfidence])}>
                Evidence confidence · {evidenceConfidence}
              </Badge>
              <Badge variant="outline" className={cn("w-fit", severityStyles[riskContextSeverity(summary.maxComponentRisk)])}>
                Peak graph context · {summary.maxComponentRisk}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!summary ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-6">
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
                  <div key={String(label)} className="rounded-lg border border-border bg-background/45 p-3.5 sm:p-4">
                    <MetricIcon className="size-4 text-primary" />
                    <p className="mt-3 text-2xl font-semibold">{String(value)}</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground sm:text-xs">{String(label)}</p>
                  </div>
                )
              })}
            </div>

            {currentComponent && (
              <div className="grid gap-4 rounded-xl border border-primary/20 bg-primary/[0.035] p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(250px,0.6fr)]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">Investigation summary</p>
                    <Badge variant="outline" className={severityStyles[currentComponent.severity]}>
                      {currentComponent.severity} context
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">{currentComponent.componentId}</span>
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{deterministicInsight}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Wallets", currentComponent.walletAddresses.length],
                      ["Risk-relevant links", strengths.riskRelevantCount],
                      ["Known services", strengths.serviceNodeCount],
                      ["Evidence confidence", titleCase(evidenceConfidence)],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-border/80 bg-background/55 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{String(label)}</p>
                        <p className="mt-1 text-lg font-semibold">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-border/70 rounded-lg border border-border/80 bg-background/55 px-4 py-2">
                  <StrengthRow label="Shared funding" value={strengths.funding} />
                  <StrengthRow label="Referral overlap" value={strengths.referral} />
                  <StrengthRow label="Service resolution" value={strengths.serviceResolution} />
                  <StrengthRow label="Risk-relevant evidence" value={strengths.riskRelevant} />
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm text-muted-foreground">Ownership inference</span>
                    <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">Not inferred</Badge>
                  </div>
                </div>
              </div>
            )}

            {summary.components.length > 0 && (
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
                    className="h-auto min-w-0 flex-1 basis-[145px] justify-start px-3 py-2 sm:flex-none"
                  >
                    <GitBranch className="size-4 shrink-0" />
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-xs font-medium">{componentTabLabel(component)}</span>
                      <span className="block font-mono text-[10px] opacity-65">{component.componentId}</span>
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {clusterIndex.length > 0 && (
              <div className="grid gap-3 rounded-xl border border-border bg-background/45 p-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
                <div>
                  <p className="text-sm font-semibold">Stored decision clusters</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The selector returns up to 24 persisted clusters and up to 180 stored members. A relationship or cluster alone is not treated as Sybil proof.
                  </p>
                </div>
                <select
                  value={clusterLabel ?? ""}
                  onChange={(event) => {
                    const nextCluster = event.target.value || null
                    setLoading(true)
                    setError("")
                    setClusterLabel(nextCluster)
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label="Select stored decision cluster"
                >
                  <option value="">All relationship components</option>
                  {clusterIndex.map((cluster) => (
                    <option key={cluster.label} value={cluster.label}>
                      {cluster.label} · {cluster.walletCount} wallets · {Math.round(cluster.averageRiskScore)} risk
                    </option>
                  ))}
                </select>
              </div>
            )}

            {clusterLabel && selectedCluster && (
              <div className="rounded-xl border border-primary/25 bg-primary/[0.035] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{selectedCluster.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedCluster.walletCount} stored members{selectedCluster.truncated ? " · member list is bounded" : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-border bg-background/60">
                    Stored cluster context
                  </Badge>
                </div>
                {selectedCluster.reasons.length > 0 && (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{selectedCluster.reasons.join(" ")}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedCluster.members.map((member) => (
                    <Button
                      key={member.walletAddress}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const graphNode = payload?.nodes.find((node) => node.walletAddress === member.walletAddress)
                        if (graphNode) {
                          setSelectedNode(graphNode.nodeKey)
                          return
                        }
                        if (member.graphComponentId && member.graphComponentId !== componentId) {
                          setClusterLabel(null)
                          setComponentId(member.graphComponentId)
                          setLoading(true)
                        }
                      }}
                    >
                      {shortValue(member.walletAddress, "Wallet")} · {member.riskScore}
                    </Button>
                  ))}
                </div>
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
                  <RefreshCw className="size-4" /> Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="grid min-h-[380px] place-items-center rounded-xl border border-border bg-background/45">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" /> Loading relationship evidence
                </div>
              </div>
            ) : (
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.55fr)]">
                <div>
                  <GraphCanvas
                    nodes={payload?.nodes ?? []}
                    edges={payload?.edges ?? []}
                    selectedNode={selectedNode}
                    onSelectNode={setSelectedNode}
                  />
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:text-xs">
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
                      <span className="h-0.5 w-5 bg-orange-400" /> Risk-relevant evidence link
                    </span>
                  </div>
                  {payload?.truncated && (
                    <p className="mt-2 text-xs text-amber-200">This component is large; the canvas shows a bounded evidence view for readability.</p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-background/45 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Selected node intelligence</p>
                    {activeNode ? (
                      <>
                        <div className="mt-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{nodeKindLabel(activeNode.kind)}</Badge>
                              {activeNode.kind === "service" && <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Neutral service context</Badge>}
                            </div>
                            <p className="mt-3 break-all font-mono text-xs leading-5 sm:text-sm">
                              {activeNode.label ?? activeNode.address ?? activeNode.nodeKey}
                            </p>
                          </div>
                          <Button type="button" size="icon" variant="outline" className="shrink-0" aria-label="Copy selected node" onClick={copyNodeValue}>
                            <Copy className="size-4" />
                          </Button>
                        </div>
                        {copied && <p className="mt-2 text-xs text-green-300">Copied</p>}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {[
                            ["Chain", activeNode.chain ?? "n/a"],
                            ["Direct links", activeEdges.length],
                            ["Incoming", activeEdgeStats.incoming],
                            ["Outgoing", activeEdgeStats.outgoing],
                            ["Risk-relevant", activeEdgeStats.riskRelevant],
                            ["Avg edge confidence", activeEdgeStats.averageConfidence === null ? "n/a" : `${activeEdgeStats.averageConfidence}%`],
                          ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-lg border border-border/70 bg-background/55 p-3">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{String(label)}</p>
                              <p className="mt-1 text-sm font-medium">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Select a node to inspect its evidence.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Decision evidence drawer</p>
                    {visibleFocus ? (
                      <>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-border/70 bg-background/55 p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Risk assessment</p>
                            <p className="mt-1 text-base font-semibold">{visibleFocus.risk.score} · {visibleFocus.risk.level}</p>
                          </div>
                          <div className="rounded-lg border border-border/70 bg-background/55 p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Policy decision</p>
                            <p className="mt-1 text-sm font-semibold">{decisionLabel(visibleFocus.decision.status)}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{visibleFocus.decision.explanation}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">Confidence · {visibleFocus.evidence.evidenceConfidence}</Badge>
                          <Badge variant="outline">Risk families · {visibleFocus.evidence.independentRiskFamilyCount}</Badge>
                          <Badge variant="outline">Coverage · {visibleFocus.evidence.limitations.length ? "limited" : "recorded"}</Badge>
                          {visibleFocus.provider && <Badge variant="outline">{visibleFocus.provider.name} · {visibleFocus.provider.status ?? "status not recorded"}</Badge>}
                        </div>
                        <div className="mt-3 space-y-2">
                          {visibleFocus.evidence.evidence.slice(0, 4).map((item) => (
                            <div key={`${item.code}-${item.family}`} className="rounded-lg border border-border/70 bg-background/50 p-3">
                              <p className="text-xs font-medium">{item.title}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                            </div>
                          ))}
                        </div>
                        {visibleFocus.evidence.limitations.length > 0 && (
                          <p className="mt-3 text-xs leading-5 text-amber-200">Limitations: {visibleFocus.evidence.limitations.join(" ")}</p>
                        )}
                        <Link
                          href={`/dashboard/analysis/${analysisId}/evidence?wallet=${encodeURIComponent(visibleFocus.walletAddress)}${selectedCluster ? `&cluster=${encodeURIComponent(selectedCluster.label)}` : ""}`}
                          className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
                        >
                          Open full decision evidence
                        </Link>
                      </>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        This graph node has no stored wallet decision attached. Relationship context remains supporting evidence, not a standalone proof.
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-background/45 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Connection evidence</p>
                    <div className="mt-3 space-y-3">
                      {activeEdges.slice(0, 6).map((edge) => {
                        const source = nodeByKey.get(edge.sourceKey)
                        const target = nodeByKey.get(edge.targetKey)
                        return (
                          <div key={edge.edgeKey} className={cn("rounded-lg border p-3 text-sm", edge.isRiskBearing ? "border-orange-400/25 bg-orange-400/[0.06]" : "border-border/75 bg-background/50")}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium capitalize">{edgeLabels[edge.kind]}</span>
                              <div className="flex items-center gap-2">
                                {edge.isRiskBearing && <Badge variant="outline" className="border-orange-400/30 bg-orange-400/10 text-[10px] text-orange-200">risk-relevant</Badge>}
                                <span className="text-xs text-muted-foreground">{edge.confidence}%</span>
                              </div>
                            </div>
                            <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{shortValue(source?.label ?? source?.address ?? null, nodeKindLabel(source?.kind ?? "wallet"))}</span>
                              <ArrowRight className="size-3 shrink-0" />
                              <span className="truncate">{shortValue(target?.label ?? target?.address ?? null, nodeKindLabel(target?.kind ?? "wallet"))}</span>
                            </div>
                            <p className="mt-2 leading-5 text-muted-foreground">{edge.evidence[0] ?? "Relationship observation"}</p>
                          </div>
                        )
                      })}
                      {!activeEdges.length && <p className="text-sm text-muted-foreground">No direct relationship is selected.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5">
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
                        <div key={String(label)} className="rounded-lg border border-border/75 bg-background/55 p-3">
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
                        <div className="rounded-lg border border-border/70 bg-background/45 p-3">
                          <p className="text-xs font-medium">Counter-evidence</p>
                          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                            {(aiInsight.counterEvidence.length ? aiInsight.counterEvidence : ["No material counter-evidence was recorded."]).slice(0, 2).map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-background/45 p-3">
                          <p className="text-xs font-medium">Open questions</p>
                          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                            {(aiInsight.unresolvedQuestions.length ? aiInsight.unresolvedQuestions : ["No unresolved AI question was recorded."]).slice(0, 2).map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{deterministicInsight}</p>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">No audited Gemini cluster assessment is available for this analysis. The relationship graph therefore remains deterministic decision-support context.</p>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-border bg-background/45 p-4 sm:p-5">
                <p className="font-semibold">Investigation boundary</p>
                <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
                  <p>• Shared funding can indicate coordinated onboarding, an exchange withdrawal, a service wallet, or common ownership; additional evidence is required to distinguish them.</p>
                  <p>• Directional edges show observed provenance, not legal or beneficial ownership.</p>
                  <p>• Graph context may prioritize human review but cannot independently create a malicious label.</p>
                </div>
              </div>
            </div>

            {summary.findings.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Evidence findings</p>
                    <p className="mt-1 text-xs text-muted-foreground">Deterministic graph observations ranked for investigation.</p>
                  </div>
                </div>
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
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
