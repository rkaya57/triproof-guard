import { createHash } from "node:crypto"

import { chainAddressKey } from "@/lib/address-normalization"
import { assessClusterArchetypes } from "@/lib/cluster-investigation/archetypes"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import { buildForensicGraphProjection } from "@/lib/cluster-investigation/forensic-graph"
import {
  CLUSTER_ANALYST_PROPOSAL_SCHEMA_VERSION,
  clusterAnalystProposalBoundaries,
  type NormalizedClusterAnalystProposal,
} from "@/lib/cluster-investigation/proposals"

export const CLUSTER_ANALYST_PROPOSAL_SNAPSHOT_SCHEMA_VERSION = "tri-proof-cluster-analyst-proposal-snapshot-v1" as const
export const MAX_ANALYST_PROPOSAL_SNAPSHOT_MEMBERS = 100

function membershipFingerprint(report: ClusterInvestigationReport) {
  const canonical = report.members
    .map((member) => chainAddressKey(member.walletAddress, member.chain))
    .sort((left, right) => left.localeCompare(right))
    .join("\n")
  return createHash("sha256").update(canonical, "utf8").digest("hex")
}

function clusterSnapshot(report: ClusterInvestigationReport) {
  const archetype = assessClusterArchetypes(report)
  const forensic = buildForensicGraphProjection(report)
  const sortedMembers = [...report.members].sort((left, right) => {
    const leftKey = chainAddressKey(left.walletAddress, left.chain)
    const rightKey = chainAddressKey(right.walletAddress, right.chain)
    return leftKey.localeCompare(rightKey)
  })

  return {
    clusterLabel: report.cluster.clusterLabel,
    walletCount: report.cluster.walletCount,
    memberRecordCount: report.members.length,
    membershipFingerprintAlgorithm: "sha256" as const,
    membershipFingerprint: membershipFingerprint(report),
    memberSampleTruncated: sortedMembers.length > MAX_ANALYST_PROPOSAL_SNAPSHOT_MEMBERS,
    memberSample: sortedMembers.slice(0, MAX_ANALYST_PROPOSAL_SNAPSHOT_MEMBERS).map((member) => ({
      walletAddress: member.walletAddress,
      chain: member.chain,
      riskScore: member.riskScore,
      riskLevel: member.riskLevel,
      status: member.status,
      recommendedAction: member.recommendedAction,
      graphComponentId: member.graphComponentId,
      evidenceConfidence: member.evidenceConfidence,
      decisionEvidenceFamilies: [...member.decisionEvidenceFamilies],
      decisionEvidenceCodes: [...member.decisionEvidenceCodes],
    })),
    storedClusterState: {
      averageRiskScore: report.cluster.averageRiskScore,
      behaviorSimilarityScore: report.cluster.behaviorSimilarityScore,
      suggestedAction: report.cluster.suggestedAction,
      sharedFundingSource: report.cluster.sharedFundingSource,
      storedReasons: [...report.cluster.storedReasons],
    },
    grouping: {
      qualifiesByStoredRule: report.grouping.qualifiesByStoredRule,
      observedWallets: report.grouping.observedWallets,
      observedIndependentFamilies: report.grouping.observedIndependentFamilies,
      families: report.grouping.families.map((family) => ({ ...family })),
      caveats: [...report.grouping.caveats],
    },
    provenance: {
      fundingRelationshipCount: report.provenance.funding.relationshipCount,
      fundingRiskBearingCount: report.provenance.funding.riskBearingCount,
      fundingNeutralizedCount: report.provenance.funding.neutralizedCount,
      fundingRelationshipKeys: report.provenance.funding.relationships.map((relationship) => relationship.relationshipKey),
      graphComponentIds: [...report.provenance.graph.componentIds],
      graphEdgeCount: report.provenance.graph.edgeCount,
      graphRiskBearingEdgeCount: report.provenance.graph.riskBearingEdgeCount,
      graphNeutralEdgeCount: report.provenance.graph.neutralEdgeCount,
      graphEdgeKeys: report.provenance.graph.edges.map((edge) => edge.edgeKey),
    },
    inferredArchetype: {
      schemaVersion: archetype.schemaVersion,
      primaryId: archetype.primary.id,
      primaryLabel: archetype.primary.label,
      confidence: archetype.primary.confidence,
      score: archetype.primary.score,
    },
    forensicProjection: {
      schemaVersion: forensic.schemaVersion,
      lanes: forensic.lanes.map((lane) => ({
        filter: lane.filter,
        itemCount: lane.itemCount,
        riskBearingCount: lane.riskBearingCount,
        neutralizedCount: lane.neutralizedCount,
      })),
    },
    timeline: {
      totalCandidates: report.timeline.totalCandidates,
      exportedItems: report.timeline.items.length,
      truncated: report.timeline.truncated,
      itemIds: report.timeline.items.map((item) => item.id),
    },
  }
}

export function buildClusterAnalystProposalEvidenceSnapshot(input: {
  report: ClusterInvestigationReport
  proposal: NormalizedClusterAnalystProposal
  mergeTargetReport?: ClusterInvestigationReport | null
}) {
  return {
    schemaVersion: CLUSTER_ANALYST_PROPOSAL_SNAPSHOT_SCHEMA_VERSION,
    proposalSchemaVersion: CLUSTER_ANALYST_PROPOSAL_SCHEMA_VERSION,
    analysisId: input.report.analysisId,
    project: {
      id: input.report.project.id,
      name: input.report.project.name,
      campaignType: input.report.project.campaignType,
      chain: input.report.project.chain,
    },
    proposal: {
      proposalType: input.proposal.proposalType,
      payload: input.proposal.payload,
      notes: input.proposal.notes,
    },
    sourceCluster: clusterSnapshot(input.report),
    mergeTargetCluster: input.mergeTargetReport ? clusterSnapshot(input.mergeTargetReport) : null,
    boundaries: clusterAnalystProposalBoundaries(),
  }
}
