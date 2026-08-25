import { chainAddressKey } from "@/lib/address-normalization"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"
import type {
  AnalysisDetail,
  DecisionEvidenceFamily,
  RiskLevel,
  SuggestedAction,
  TeamReviewState,
  WalletGraphEdge,
  WalletGraphNode,
  WalletStatus,
} from "@/types"

export const CLUSTER_INVESTIGATION_SCHEMA_VERSION = "tri-proof-cluster-investigation-v1" as const
export const MAX_CLUSTER_TIMELINE_ITEMS = 250

export type ClusterGroupingFamily =
  | "funding"
  | "temporal"
  | "behavior"
  | "referral"
  | "campaign_event"
  | "participant"

export type ClusterInvestigationEventInput = {
  eventKey: string
  chain: string
  txHash: string
  walletAddress: string
  counterpartyAddress: string | null
  kind: string
  direction: string
  assetSymbol: string | null
  amount: string | number | null
  observedAt: Date | string | null
  confidence: number
}

export type ClusterInvestigationTimelineItem = {
  id: string
  observedAt: string | null
  source: "wallet_activity" | "onchain_event" | "funding_provenance" | "graph"
  kind: string
  title: string
  description: string
  walletAddresses: string[]
  transactionId: string | null
  riskBearing: boolean
  confidence: number | null
}

export type ClusterInvestigationMember = {
  walletAddress: string
  chain: string
  riskScore: number
  riskLevel: RiskLevel
  status: WalletStatus
  recommendedAction: SuggestedAction
  graphComponentId: string | null
  fundingSource: string | null
  evidenceConfidence: "low" | "medium" | "high" | null
  decisionEvidenceFamilies: DecisionEvidenceFamily[]
  decisionEvidenceCodes: string[]
  teamReview: TeamReviewState | null
  reasons: string[]
}

export type ClusterInvestigationReport = {
  schemaVersion: typeof CLUSTER_INVESTIGATION_SCHEMA_VERSION
  analysisId: string
  project: AnalysisDetail["project"]
  cluster: {
    clusterLabel: string
    walletCount: number
    averageRiskScore: number
    behaviorSimilarityScore: number
    suggestedAction: SuggestedAction
    sharedFundingSource: string | null
    storedReasons: string[]
  }
  grouping: {
    minimumWallets: 3
    minimumIndependentFamilies: 2
    observedWallets: number
    observedIndependentFamilies: number
    qualifiesByStoredRule: boolean
    headline: string
    explanation: string
    families: Array<{
      family: ClusterGroupingFamily
      label: string
      storedReason: string
    }>
    caveats: string[]
  }
  members: ClusterInvestigationMember[]
  provenance: {
    funding: {
      relationshipCount: number
      riskBearingCount: number
      neutralizedCount: number
      relationshipKinds: string[]
      relationships: Array<{
        relationshipKey: string
        kind: FundingDecisionRelationshipInput["kind"]
        chain: string
        sourceAddress: string
        targetAddress: string
        viaAddress: string | null
        hopCount: number
        cohortSize: number
        confidence: number
        riskBearing: boolean
        suppressionReason: string | null
        observedAt: string | null
        evidenceEventKeys: string[]
      }>
    }
    graph: {
      componentIds: string[]
      nodeCount: number
      edgeCount: number
      riskBearingEdgeCount: number
      neutralEdgeCount: number
      edges: Array<{
        edgeKey: string
        sourceKey: string
        targetKey: string
        kind: string
        confidence: number
        riskBearing: boolean
        componentId: string | null
        observedAt: string | null
        transactionId: string | null
        evidence: string[]
      }>
    }
  }
  timeline: {
    items: ClusterInvestigationTimelineItem[]
    totalCandidates: number
    truncated: boolean
  }
}

const familyLabels: Record<ClusterGroupingFamily, string> = {
  funding: "Funding",
  temporal: "Temporal coordination",
  behavior: "Behavior similarity",
  referral: "Referral relationship",
  campaign_event: "Campaign-event coordination",
  participant: "Participant fingerprint",
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function familyFromStoredReason(reason: string): ClusterGroupingFamily | null {
  if (reason.startsWith("Funding evidence:")) return "funding"
  if (reason.startsWith("Temporal evidence:")) return "temporal"
  if (reason.startsWith("Behavior evidence:")) return "behavior"
  if (reason.startsWith("Referral evidence:")) return "referral"
  if (reason.includes("privacy-preserving participant fingerprint")) return "participant"
  if (reason.startsWith("Campaign evidence:")) return "campaign_event"
  return null
}

export function storedGroupingFamilies(reasons: readonly string[]) {
  const seen = new Set<ClusterGroupingFamily>()
  const families: ClusterInvestigationReport["grouping"]["families"] = []

  for (const reason of reasons) {
    const family = familyFromStoredReason(reason)
    if (!family || seen.has(family)) continue
    seen.add(family)
    families.push({ family, label: familyLabels[family], storedReason: reason })
  }

  return families
}

function fundingRelationshipTouchesMembers(
  relationship: FundingDecisionRelationshipInput,
  memberKeys: Set<string>,
) {
  return (
    memberKeys.has(chainAddressKey(relationship.sourceAddress, relationship.chain)) ||
    memberKeys.has(chainAddressKey(relationship.targetAddress, relationship.chain))
  )
}

function fundingTitle(relationship: FundingDecisionRelationshipInput) {
  if (relationship.kind === "FUNDED_BY") return "Direct funding provenance"
  if (relationship.kind === "SAME_FUNDER") return "Shared-funder provenance"
  return "Shared funding-lineage provenance"
}

function fundingDescription(relationship: FundingDecisionRelationshipInput) {
  const via = relationship.viaAddress ? ` via ${relationship.viaAddress}` : ""
  if (relationship.riskBearing) {
    return `${relationship.kind} is stored as risk-bearing canonical funding provenance${via}.`
  }
  if (relationship.suppressionReason) {
    return `${relationship.kind} is retained as neutralized canonical funding context${via}; suppression: ${relationship.suppressionReason}.`
  }
  return `${relationship.kind} is retained as canonical funding context${via}.`
}

function graphDescription(edge: WalletGraphEdge) {
  const evidence = edge.evidence.length ? ` Evidence: ${edge.evidence.join("; ")}` : ""
  return `${edge.kind.replaceAll("_", " ")} relationship at ${edge.confidence}% confidence.${evidence}`
}

function timelineForWalletActivity(analysis: AnalysisDetail, memberAddresses: Set<string | null>) {
  const items: ClusterInvestigationTimelineItem[] = []
  for (const wallet of analysis.wallets) {
    if (!memberAddresses.has(wallet.walletAddress)) continue
    if (wallet.firstSeen) {
      items.push({
        id: `wallet:first:${wallet.chain}:${wallet.walletAddress}`,
        observedAt: iso(wallet.firstSeen),
        source: "wallet_activity",
        kind: "first_seen",
        title: "Wallet first observed",
        description: `${wallet.walletAddress} first appears in the available activity window.`,
        walletAddresses: [wallet.walletAddress],
        transactionId: null,
        riskBearing: false,
        confidence: null,
      })
    }
    if (wallet.lastSeen && wallet.lastSeen !== wallet.firstSeen) {
      items.push({
        id: `wallet:last:${wallet.chain}:${wallet.walletAddress}`,
        observedAt: iso(wallet.lastSeen),
        source: "wallet_activity",
        kind: "last_seen",
        title: "Wallet last observed",
        description: `${wallet.walletAddress} last appears in the available activity window.`,
        walletAddresses: [wallet.walletAddress],
        transactionId: null,
        riskBearing: false,
        confidence: null,
      })
    }
  }
  return items
}

function sortTimeline(left: ClusterInvestigationTimelineItem, right: ClusterInvestigationTimelineItem) {
  const leftTime = left.observedAt ? Date.parse(left.observedAt) : Number.MAX_SAFE_INTEGER
  const rightTime = right.observedAt ? Date.parse(right.observedAt) : Number.MAX_SAFE_INTEGER
  if (leftTime !== rightTime) return leftTime - rightTime
  if (left.riskBearing !== right.riskBearing) return left.riskBearing ? -1 : 1
  return left.id.localeCompare(right.id)
}

export function buildClusterInvestigation(input: {
  analysis: AnalysisDetail
  clusterLabel: string
  fundingRelationships?: readonly FundingDecisionRelationshipInput[]
  graphNodes?: readonly WalletGraphNode[]
  graphEdges?: readonly WalletGraphEdge[]
  events?: readonly ClusterInvestigationEventInput[]
  timelineLimit?: number
}): ClusterInvestigationReport | null {
  const cluster = input.analysis.clusters.find((item) => item.clusterLabel === input.clusterLabel)
  if (!cluster) return null

  const members = input.analysis.wallets
    .filter((wallet) => wallet.clusterId === cluster.clusterLabel)
    .sort((left, right) => right.riskScore - left.riskScore || left.walletAddress.localeCompare(right.walletAddress))

  const memberAddresses = new Set<string | null>(members.map((wallet) => wallet.walletAddress))
  const memberKeys = new Set(
    members.map((wallet) => chainAddressKey(wallet.walletAddress, wallet.chain)),
  )
  const groupingFamilies = storedGroupingFamilies(cluster.reasons)
  const qualifiesByStoredRule = members.length >= 3 && groupingFamilies.length >= 2
  const groupingLabels = groupingFamilies.map((family) => family.label)

  const relationships = (input.fundingRelationships ?? [])
    .filter((relationship) => fundingRelationshipTouchesMembers(relationship, memberKeys))
    .sort((left, right) => {
      if (left.riskBearing !== right.riskBearing) return left.riskBearing ? -1 : 1
      if (left.cohortSize !== right.cohortSize) return right.cohortSize - left.cohortSize
      if (left.confidence !== right.confidence) return right.confidence - left.confidence
      return left.relationshipKey.localeCompare(right.relationshipKey)
    })

  const graphNodes = [...(input.graphNodes ?? [])]
  const graphEdges = [...(input.graphEdges ?? [])]
    .sort((left, right) => {
      if (left.isRiskBearing !== right.isRiskBearing) return left.isRiskBearing ? -1 : 1
      if (left.confidence !== right.confidence) return right.confidence - left.confidence
      return left.edgeKey.localeCompare(right.edgeKey)
    })
  const componentIds = Array.from(
    new Set([
      ...members.map((wallet) => wallet.graphComponentId).filter((value): value is string => Boolean(value)),
      ...graphNodes.map((node) => node.componentId).filter((value): value is string => Boolean(value)),
    ]),
  ).sort()

  const timeline: ClusterInvestigationTimelineItem[] = timelineForWalletActivity(
    input.analysis,
    memberAddresses,
  )

  for (const event of input.events ?? []) {
    if (!memberKeys.has(chainAddressKey(event.walletAddress, event.chain))) continue
    const amount = event.amount === null ? "" : ` ${String(event.amount)}`
    const asset = event.assetSymbol ? ` ${event.assetSymbol}` : ""
    const counterparty = event.counterpartyAddress ? ` Counterparty: ${event.counterpartyAddress}.` : ""
    timeline.push({
      id: `event:${event.eventKey}`,
      observedAt: iso(event.observedAt),
      source: "onchain_event",
      kind: event.kind,
      title: `${event.kind.replaceAll("_", " ")} · ${event.direction}`,
      description: `${event.walletAddress}${amount}${asset}.${counterparty}`.replace("..", "."),
      walletAddresses: [event.walletAddress],
      transactionId: event.txHash,
      riskBearing: false,
      confidence: event.confidence,
    })
  }

  for (const relationship of relationships) {
    const wallets = [relationship.sourceAddress, relationship.targetAddress].filter((address) =>
      memberKeys.has(chainAddressKey(address, relationship.chain)),
    )
    timeline.push({
      id: `funding:${relationship.relationshipKey}`,
      observedAt: iso(relationship.observedAt),
      source: "funding_provenance",
      kind: relationship.kind,
      title: fundingTitle(relationship),
      description: fundingDescription(relationship),
      walletAddresses: Array.from(new Set(wallets)),
      transactionId: relationship.evidenceEventKeys[0] ?? null,
      riskBearing: relationship.riskBearing,
      confidence: relationship.confidence,
    })
  }

  for (const edge of graphEdges) {
    if (!edge.observedAt) continue
    const walletAddresses = graphNodes
      .filter((node) => node.nodeKey === edge.sourceKey || node.nodeKey === edge.targetKey)
      .map((node) => node.walletAddress)
      .filter((value): value is string => Boolean(value) && memberAddresses.has(value))
    timeline.push({
      id: `graph:${edge.edgeKey}`,
      observedAt: iso(edge.observedAt),
      source: "graph",
      kind: edge.kind,
      title: edge.isRiskBearing ? "Risk-bearing graph relationship" : "Graph relationship",
      description: graphDescription(edge),
      walletAddresses: Array.from(new Set(walletAddresses)),
      transactionId: edge.transactionId,
      riskBearing: edge.isRiskBearing,
      confidence: edge.confidence,
    })
  }

  const dedupedTimeline = Array.from(new Map(timeline.map((item) => [item.id, item])).values()).sort(sortTimeline)
  const timelineLimit = Math.min(Math.max(input.timelineLimit ?? MAX_CLUSTER_TIMELINE_ITEMS, 25), 500)

  return {
    schemaVersion: CLUSTER_INVESTIGATION_SCHEMA_VERSION,
    analysisId: input.analysis.id,
    project: input.analysis.project,
    cluster: {
      clusterLabel: cluster.clusterLabel,
      walletCount: members.length,
      averageRiskScore: cluster.averageRiskScore,
      behaviorSimilarityScore: cluster.behaviorSimilarityScore,
      suggestedAction: cluster.suggestedAction,
      sharedFundingSource: cluster.sharedFundingSource,
      storedReasons: [...cluster.reasons],
    },
    grouping: {
      minimumWallets: 3,
      minimumIndependentFamilies: 2,
      observedWallets: members.length,
      observedIndependentFamilies: groupingFamilies.length,
      qualifiesByStoredRule,
      headline: groupingFamilies.length
        ? `${groupingFamilies.length} independent relationship families overlap across ${members.length} wallets`
        : `Stored cluster assignment for ${members.length} wallets`,
      explanation: groupingFamilies.length
        ? `This cluster was grouped from stored deterministic evidence: ${groupingLabels.join(" + ")}. The workspace explains the stored grouping and does not recompute cluster membership.`
        : "This analysis stores a cluster assignment, but the current serialized record does not expose the original family-level grouping reasons. Membership is shown without inventing an explanation.",
      families: groupingFamilies,
      caveats: [
        "Cluster grouping describes overlapping relationship evidence; it is not proof that one person controls every wallet.",
        "No single funding, timing, behavior, referral, campaign-event, or participant signal is treated as conclusive by itself.",
        "Funding and graph provenance below are supplemental context and do not recompute the stored cluster or wallet decisions.",
      ],
    },
    members: members.map((wallet) => ({
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      riskScore: wallet.riskScore,
      riskLevel: wallet.riskLevel,
      status: wallet.status,
      recommendedAction: wallet.recommendedAction,
      graphComponentId: wallet.graphComponentId ?? null,
      fundingSource: wallet.fundingSource,
      evidenceConfidence: wallet.decisionEvidence?.evidenceConfidence ?? null,
      decisionEvidenceFamilies: wallet.decisionEvidence?.evidenceFamilies ?? [],
      decisionEvidenceCodes: wallet.decisionEvidence?.evidence.map((item) => item.code) ?? [],
      teamReview: wallet.teamReview ?? null,
      reasons: [...wallet.reasons],
    })),
    provenance: {
      funding: {
        relationshipCount: relationships.length,
        riskBearingCount: relationships.filter((relationship) => relationship.riskBearing).length,
        neutralizedCount: relationships.filter((relationship) => Boolean(relationship.suppressionReason)).length,
        relationshipKinds: Array.from(new Set(relationships.map((relationship) => relationship.kind))).sort(),
        relationships: relationships.slice(0, 100).map((relationship) => ({
          relationshipKey: relationship.relationshipKey,
          kind: relationship.kind,
          chain: relationship.chain,
          sourceAddress: relationship.sourceAddress,
          targetAddress: relationship.targetAddress,
          viaAddress: relationship.viaAddress,
          hopCount: relationship.hopCount,
          cohortSize: relationship.cohortSize,
          confidence: relationship.confidence,
          riskBearing: relationship.riskBearing,
          suppressionReason: relationship.suppressionReason,
          observedAt: iso(relationship.observedAt),
          evidenceEventKeys: [...relationship.evidenceEventKeys],
        })),
      },
      graph: {
        componentIds,
        nodeCount: graphNodes.length,
        edgeCount: graphEdges.length,
        riskBearingEdgeCount: graphEdges.filter((edge) => edge.isRiskBearing).length,
        neutralEdgeCount: graphEdges.filter((edge) => !edge.isRiskBearing).length,
        edges: graphEdges.slice(0, 100).map((edge) => ({
          edgeKey: edge.edgeKey,
          sourceKey: edge.sourceKey,
          targetKey: edge.targetKey,
          kind: edge.kind,
          confidence: edge.confidence,
          riskBearing: edge.isRiskBearing,
          componentId: edge.componentId,
          observedAt: edge.observedAt,
          transactionId: edge.transactionId,
          evidence: [...edge.evidence],
        })),
      },
    },
    timeline: {
      items: dedupedTimeline.slice(0, timelineLimit),
      totalCandidates: dedupedTimeline.length,
      truncated: dedupedTimeline.length > timelineLimit,
    },
  }
}
