import {
  SHARED_RISK_GRAPH_SCHEMA_VERSION,
  type SharedRiskGraph,
  type SharedRiskGraphCampaignContext,
  type SharedRiskGraphEdge,
  type SharedRiskGraphNode,
  type SharedRiskGraphNodeKind,
  type SharedRiskGraphRiskLevel,
  type SharedRiskGraphSource,
  type SharedRiskGraphVerdict,
} from "@/lib/risk-graph/types"

const riskRank: Record<SharedRiskGraphRiskLevel, number> = {
  unknown: 0,
  safe: 1,
  caution: 2,
  high: 3,
  critical: 4,
}

const verdictRank: Record<SharedRiskGraphVerdict, number> = {
  unknown: 0,
  trusted: 1,
  suspicious: 2,
  known_bad: 3,
}

const chainAddressKinds = new Set<SharedRiskGraphNodeKind>([
  "wallet",
  "funder",
  "referrer",
  "service",
  "token",
  "contract",
  "program",
])

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function normalizedPart(value: string, caseSensitive = false) {
  const trimmed = value.trim()
  const normalized = caseSensitive ? trimmed : trimmed.toLowerCase()
  return normalized.replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 180)
}

export function sharedRiskGraphNodeKey(
  kind: SharedRiskGraphNodeKind,
  value: string,
  chain: string | null = null
) {
  const normalizedChain = chain?.trim().toLowerCase() ?? ""
  const chainPart = normalizedChain ? `${normalizedPart(normalizedChain)}:` : ""
  const caseSensitive = normalizedChain === "solana" && chainAddressKinds.has(kind)
  return `${kind}:${chainPart}${normalizedPart(value, caseSensitive)}`
}

export function normalizeSharedRiskLevel(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "critical") return "critical" as const
  if (normalized === "high") return "high" as const
  if (normalized === "medium" || normalized === "caution" || normalized === "suspicious") {
    return "caution" as const
  }
  if (normalized === "low" || normalized === "safe" || normalized === "trusted") {
    return "safe" as const
  }
  return "unknown" as const
}

export function normalizeSharedVerdict(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "known_bad" || normalized === "known bad") return "known_bad" as const
  if (normalized === "suspicious") return "suspicious" as const
  if (normalized === "trusted") return "trusted" as const
  return "unknown" as const
}

export class SharedRiskGraphBuilder {
  private readonly nodes = new Map<string, SharedRiskGraphNode>()
  private readonly edges = new Map<string, SharedRiskGraphEdge>()
  private readonly coverage = {
    campaign: false,
    walletGraph: false,
    scamGuard: false,
    scamDna: false,
    telegramGuardian: false,
    telegramOnchain: false,
  }

  constructor(private readonly campaign: SharedRiskGraphCampaignContext) {
    this.coverage.campaign = true
    const campaignKey = sharedRiskGraphNodeKey("campaign", campaign.id)
    this.addNode({
      key: campaignKey,
      kind: "campaign",
      label: campaign.name,
      value: campaign.id,
      chain: campaign.chain,
      riskLevel: "unknown",
      riskScore: null,
      verdict: "unknown",
      sources: ["campaign"],
      metadata: { campaignType: campaign.campaignType },
    })

    if (campaign.analysisId) {
      const analysisKey = sharedRiskGraphNodeKey("analysis", campaign.analysisId)
      this.addNode({
        key: analysisKey,
        kind: "analysis",
        label: `Analysis ${campaign.analysisId.slice(0, 8)}`,
        value: campaign.analysisId,
        chain: campaign.chain,
        riskLevel: "unknown",
        riskScore: null,
        verdict: "unknown",
        sources: ["campaign"],
        metadata: {},
      })
      this.addEdge({
        key: `analysis-campaign:${campaign.analysisId}:${campaign.id}`,
        source: analysisKey,
        target: campaignKey,
        kind: "ANALYZED_IN",
        confidence: 100,
        riskBearing: false,
        observedAt: null,
        sources: ["campaign"],
        evidence: ["Analysis belongs to this campaign."],
        metadata: {},
      })
    }
  }

  markCoverage(
    source:
      | "walletGraph"
      | "scamGuard"
      | "scamDna"
      | "telegramGuardian"
      | "telegramOnchain"
  ) {
    this.coverage[source] = true
  }

  addNode(node: SharedRiskGraphNode) {
    const current = this.nodes.get(node.key)
    if (!current) {
      this.nodes.set(node.key, {
        ...node,
        sources: unique(node.sources),
        metadata: { ...node.metadata },
      })
      return node.key
    }

    current.label = current.label || node.label
    current.value ??= node.value
    current.chain ??= node.chain
    current.sources = unique([...current.sources, ...node.sources])
    current.metadata = { ...current.metadata, ...node.metadata }
    current.riskScore = Math.max(current.riskScore ?? 0, node.riskScore ?? 0) || null
    if (riskRank[node.riskLevel] > riskRank[current.riskLevel]) current.riskLevel = node.riskLevel
    if (verdictRank[node.verdict] > verdictRank[current.verdict]) current.verdict = node.verdict
    return current.key
  }

  addEdge(edge: SharedRiskGraphEdge) {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error(`Shared risk graph edge references a missing node: ${edge.key}`)
    }
    const current = this.edges.get(edge.key)
    if (!current) {
      this.edges.set(edge.key, {
        ...edge,
        confidence: Math.max(0, Math.min(100, edge.confidence)),
        sources: unique(edge.sources),
        evidence: unique(edge.evidence),
        metadata: { ...edge.metadata },
      })
      return edge.key
    }
    current.confidence = Math.max(current.confidence, edge.confidence)
    current.riskBearing ||= edge.riskBearing
    current.observedAt ||= edge.observedAt
    current.sources = unique([...current.sources, ...edge.sources])
    current.evidence = unique([...current.evidence, ...edge.evidence])
    current.metadata = { ...current.metadata, ...edge.metadata }
    return current.key
  }

  addParticipation(walletKey: string) {
    const campaignKey = sharedRiskGraphNodeKey("campaign", this.campaign.id)
    this.addEdge({
      key: `participated:${walletKey}:${campaignKey}`,
      source: walletKey,
      target: campaignKey,
      kind: "PARTICIPATED_IN",
      confidence: 100,
      riskBearing: false,
      observedAt: null,
      sources: ["campaign"],
      evidence: ["Wallet appears in the campaign participant analysis."],
      metadata: {},
    })
  }

  finalize(): SharedRiskGraph {
    const nodes = Array.from(this.nodes.values()).sort((a, b) => a.key.localeCompare(b.key))
    const edges = Array.from(this.edges.values()).sort((a, b) => a.key.localeCompare(b.key))
    const sources = new Set<SharedRiskGraphSource>()
    nodes.forEach((node) => node.sources.forEach((source) => sources.add(source)))
    edges.forEach((edge) => edge.sources.forEach((source) => sources.add(source)))

    return {
      schemaVersion: SHARED_RISK_GRAPH_SCHEMA_VERSION,
      campaignId: this.campaign.id,
      analysisId: this.campaign.analysisId ?? null,
      generatedAt: new Date().toISOString(),
      coverage: { ...this.coverage },
      summary: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        walletCount: nodes.filter((node) => node.kind === "wallet").length,
        domainCount: nodes.filter((node) => node.kind === "domain").length,
        telegramObservationCount: nodes.filter((node) => node.kind === "telegram_message").length,
        riskBearingEdgeCount: edges.filter((edge) => edge.riskBearing).length,
        highRiskNodeCount: nodes.filter(
          (node) => node.riskLevel === "high" || node.riskLevel === "critical"
        ).length,
        sourceCount: sources.size,
      },
      nodes,
      edges,
    }
  }
}
