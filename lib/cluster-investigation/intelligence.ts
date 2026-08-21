import { chainAddressKey } from "@/lib/address-normalization"
import type {
  ClusterGroupingFamily,
  ClusterInvestigationReport,
} from "@/lib/cluster-investigation/builder"
import type { AnalysisDetail, DecisionEvidenceFamily } from "@/types"

export const CLUSTER_SUPPORT_INTELLIGENCE_SCHEMA_VERSION = "tri-proof-cluster-support-intelligence-v1" as const

export type ClusterSupportConfidenceBand = "low" | "medium" | "high"

export type ClusterFamilySupport = {
  family: ClusterGroupingFamily
  label: string
  memberRiskEvidenceFamily: DecisionEvidenceFamily | null
  supportedMembers: number
  memberCount: number
  memberCoverage: number | null
}

export type ClusterSupportFactor = {
  code:
    | "STORED_INDEPENDENT_FAMILIES"
    | "STORED_GROUPING_THRESHOLD"
    | "MEMBER_RISK_EVIDENCE_COVERAGE"
    | "CANONICAL_RISK_BEARING_FUNDING"
  points: number
  explanation: string
}

export type ClusterSupportIntelligence = {
  schemaVersion: typeof CLUSTER_SUPPORT_INTELLIGENCE_SCHEMA_VERSION
  clusterLabel: string
  score: number
  confidence: ClusterSupportConfidenceBand
  qualifiesByStoredRule: boolean
  observedIndependentFamilies: number
  familySupport: ClusterFamilySupport[]
  factors: ClusterSupportFactor[]
  context: {
    riskBearingFundingRelationships: number
    neutralizedFundingRelationships: number
    riskBearingGraphEdges: number
    graphEdgesScoredIndependently: false
  }
  limitations: string[]
  boundaries: string[]
}

const decisionFamilyByGroupingFamily: Record<ClusterGroupingFamily, DecisionEvidenceFamily | null> = {
  funding: "funding",
  temporal: "timing",
  behavior: "behavior",
  referral: "referral",
  campaign_event: "campaign_coordination",
  participant: null,
}

function boundedRatio(numerator: number, denominator: number) {
  if (denominator <= 0) return null
  return Math.max(0, Math.min(1, numerator / denominator))
}

function confidenceBand(score: number, qualifiesByStoredRule: boolean): ClusterSupportConfidenceBand {
  if (!qualifiesByStoredRule) return "low"
  if (score >= 75) return "high"
  if (score >= 50) return "medium"
  return "low"
}

function riskEvidenceFamiliesForWallet(analysis: AnalysisDetail | undefined, chain: string, walletAddress: string) {
  if (!analysis) return new Set<DecisionEvidenceFamily>()
  const key = chainAddressKey(walletAddress, chain)
  const wallet = analysis.wallets.find(
    (candidate) => chainAddressKey(candidate.walletAddress, candidate.chain) === key,
  )
  if (!wallet?.decisionEvidence) return new Set<DecisionEvidenceFamily>()

  return new Set(
    wallet.decisionEvidence.evidence
      .filter((item) => item.effect === "risk_signal" || item.effect === "corroborating_signal")
      .map((item) => item.family),
  )
}

export function assessClusterSupport(
  report: ClusterInvestigationReport,
  analysis?: AnalysisDetail,
): ClusterSupportIntelligence {
  const memberCount = report.members.length
  const familySupport = report.grouping.families.map((family) => {
    const decisionFamily = decisionFamilyByGroupingFamily[family.family]
    const supportedMembers = decisionFamily
      ? report.members.filter((member) =>
          riskEvidenceFamiliesForWallet(analysis, member.chain, member.walletAddress).has(decisionFamily),
        ).length
      : 0

    return {
      family: family.family,
      label: family.label,
      memberRiskEvidenceFamily: decisionFamily,
      supportedMembers,
      memberCount,
      memberCoverage: decisionFamily && analysis ? boundedRatio(supportedMembers, memberCount) : null,
    }
  })

  const factors: ClusterSupportFactor[] = []
  const familyPoints = Math.min(45, report.grouping.observedIndependentFamilies * 15)
  if (familyPoints > 0) {
    factors.push({
      code: "STORED_INDEPENDENT_FAMILIES",
      points: familyPoints,
      explanation: `${report.grouping.observedIndependentFamilies} independent stored grouping family/families are preserved from the original deterministic cluster basis.`,
    })
  }

  if (report.grouping.qualifiesByStoredRule) {
    factors.push({
      code: "STORED_GROUPING_THRESHOLD",
      points: 20,
      explanation: `The stored cluster meets the preserved ${report.grouping.minimumWallets}+ wallet and ${report.grouping.minimumIndependentFamilies}+ independent-family grouping threshold.`,
    })
  }

  const comparableCoverage = familySupport
    .map((item) => item.memberCoverage)
    .filter((value): value is number => value !== null)
  const averageCoverage = comparableCoverage.length
    ? comparableCoverage.reduce((sum, value) => sum + value, 0) / comparableCoverage.length
    : 0
  const coveragePoints = Math.round(averageCoverage * 25)
  if (coveragePoints > 0) {
    factors.push({
      code: "MEMBER_RISK_EVIDENCE_COVERAGE",
      points: coveragePoints,
      explanation: `${Math.round(averageCoverage * 100)}% average member coverage is visible for stored grouping families that map to wallet-level risk/corroborating Decision Evidence.`,
    })
  }

  const hasStoredFundingFamily = report.grouping.families.some((item) => item.family === "funding")
  const riskBearingFundingRelationships = report.provenance.funding.riskBearingCount
  if (hasStoredFundingFamily && riskBearingFundingRelationships > 0) {
    const fundingPoints = Math.min(10, 4 + Math.min(3, riskBearingFundingRelationships) * 2)
    factors.push({
      code: "CANONICAL_RISK_BEARING_FUNDING",
      points: fundingPoints,
      explanation: `${riskBearingFundingRelationships} canonical funding relationship(s) are stored as risk-bearing and support the already-stored funding grouping family without creating a new independent family.`,
    })
  }

  const rawScore = factors.reduce((sum, factor) => sum + factor.points, 0)
  const score = report.grouping.qualifiesByStoredRule
    ? Math.min(100, rawScore)
    : Math.min(49, rawScore)

  const limitations: string[] = []
  if (!analysis) {
    limitations.push(
      "Wallet-level risk/corroborating Decision Evidence was not supplied to this assessment, so member evidence coverage contributes zero points.",
    )
  } else {
    const unsupportedFamilies = familySupport.filter(
      (item) => item.memberRiskEvidenceFamily && item.supportedMembers === 0,
    )
    if (unsupportedFamilies.length) {
      limitations.push(
        `The serialized wallet-level risk/corroborating Decision Evidence does not independently mirror these stored grouping families: ${unsupportedFamilies.map((item) => item.label).join(", ")}. This is treated as an evidence-coverage limitation, not evidence against the stored cluster.`,
      )
    }
  }
  if (familySupport.some((item) => item.memberRiskEvidenceFamily === null)) {
    limitations.push(
      "Participant-fingerprint grouping has no dedicated wallet Decision Evidence family in the current schema, so it receives no member-coverage score contribution.",
    )
  }
  if (report.provenance.funding.neutralizedCount > 0) {
    limitations.push(
      `${report.provenance.funding.neutralizedCount} canonical funding relationship(s) are neutralized infrastructure/trusted context and contribute zero support points.`,
    )
  }
  if (report.provenance.graph.riskBearingEdgeCount > 0) {
    limitations.push(
      "Risk-bearing graph edges are reported as supporting context but are not scored as an additional independent family because graph edges can project the same underlying funding or referral evidence.",
    )
  }

  return {
    schemaVersion: CLUSTER_SUPPORT_INTELLIGENCE_SCHEMA_VERSION,
    clusterLabel: report.cluster.clusterLabel,
    score,
    confidence: confidenceBand(score, report.grouping.qualifiesByStoredRule),
    qualifiesByStoredRule: report.grouping.qualifiesByStoredRule,
    observedIndependentFamilies: report.grouping.observedIndependentFamilies,
    familySupport,
    factors,
    context: {
      riskBearingFundingRelationships,
      neutralizedFundingRelationships: report.provenance.funding.neutralizedCount,
      riskBearingGraphEdges: report.provenance.graph.riskBearingEdgeCount,
      graphEdgesScoredIndependently: false,
    },
    limitations,
    boundaries: [
      "Cluster support confidence explains the strength and coverage of evidence supporting an already-stored cluster; it is not a wallet risk score or probability of Sybil control.",
      "The assessment does not recompute cluster membership, wallet status, wallet risk score, campaign policy, or reviewer decisions.",
      "Independent-family count comes only from the stored deterministic grouping basis. Supplemental funding and graph projections cannot manufacture an additional independent family.",
      "Neutralized exchange, bridge, protocol, service, or trusted-distributor context never increases support confidence.",
    ],
  }
}
