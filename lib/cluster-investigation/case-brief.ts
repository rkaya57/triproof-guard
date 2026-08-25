import { chainAddressKey } from "@/lib/address-normalization"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  clusterReviewDispositionLabel,
  type ClusterReviewRecord,
} from "@/lib/cluster-investigation/review"
import type {
  CampaignPolicyRuleCode,
} from "@/lib/campaign-policy/types"
import type { RiskPolicy, SuggestedAction, WalletStatus } from "@/types"

export const INVESTIGATION_CASE_BRIEF_SCHEMA_VERSION = "tri-proof-investigation-case-brief-v1" as const
export const MAX_CASE_BRIEF_MEMBER_PREVIEW = 20

export type InvestigationCaseBrief = {
  schemaVersion: typeof INVESTIGATION_CASE_BRIEF_SCHEMA_VERSION
  analysisId: string
  clusterLabel: string
  project: ClusterInvestigationReport["project"]
  headline: string
  executiveSummary: string
  storedState: {
    walletCount: number
    averageRiskScore: number
    behaviorSimilarityScore: number
    suggestedAction: SuggestedAction
    groupingQualifiesByStoredRule: boolean
    groupingFamilies: string[]
    walletDecisionCounts: Record<WalletStatus, number>
  }
  reviewer: {
    latest: ClusterReviewRecord | null
    operationalUse: string
  }
  policy: {
    status: "available" | "analysis_mismatch" | "unavailable"
    reason: string | null
    preset: RiskPolicy | null
    thresholds: CampaignPolicyReport["thresholds"] | null
    recommendationCounts: Record<SuggestedAction, number>
    recommendationsChangingStoredDecision: number
    humanDecisionsPreserved: number
    matchedRuleCounts: Partial<Record<CampaignPolicyRuleCode, number>>
  }
  evidenceSummary: {
    fundingRelationships: number
    fundingRiskBearing: number
    fundingNeutralized: number
    graphComponents: number
    graphRiskBearingEdges: number
    timelineItems: number
    timelineCandidates: number
    timelineTruncated: boolean
  }
  memberPreview: Array<{
    walletAddress: string
    chain: string
    riskScore: number
    storedStatus: WalletStatus
    storedAction: SuggestedAction
    policyAction: SuggestedAction | null
    policyChangesStoredDecision: boolean | null
    evidenceConfidence: string | null
    teamReviewStatus: WalletStatus | null
  }>
  nextActions: string[]
  limitations: string[]
}

function emptyActionCounts(): Record<SuggestedAction, number> {
  return { approve: 0, manual_review: 0, reject: 0 }
}

function emptyStatusCounts(): Record<WalletStatus, number> {
  return { approved: 0, manual_review: 0, rejected: 0 }
}

function headlineForReview(review: ClusterReviewRecord | null) {
  if (!review) return "Cluster investigation awaiting reviewer disposition"
  if (review.disposition === "grouping_supported") {
    return "Stored grouping supported for investigation; wallet decisions remain separate"
  }
  if (review.disposition === "grouping_not_supported") {
    return "Reviewer does not support relying on the stored grouping"
  }
  if (review.disposition === "escalate") {
    return "Cluster escalated for deeper investigation without automatic wallet changes"
  }
  return "Cluster grouping remains unresolved pending additional evidence"
}

function operationalUseForReview(review: ClusterReviewRecord | null) {
  if (!review) {
    return "No cluster-level human disposition is recorded. Treat the grouping as unresolved investigation context and rely on wallet-level evidence and stored decisions."
  }
  if (review.disposition === "grouping_supported") {
    return "Use the stored grouping as corroborating investigation context only. Execute wallet outcomes from wallet-level stored/human/policy decisions, not from the cluster label alone."
  }
  if (review.disposition === "grouping_not_supported") {
    return "Do not use cluster membership as operational corroboration. Rely on wallet-level evidence and policy until the grouping is re-evaluated or the analysis is rerun."
  }
  if (review.disposition === "escalate") {
    return "Escalate the evidence review or collect deeper provenance. Escalation does not authorize automatic wallet rejection or cluster-membership changes."
  }
  return "Collect additional independent evidence before treating the grouping as corroboration. Preserve current wallet decisions while the grouping remains unresolved."
}

function decisionSummary(counts: Record<WalletStatus, number>) {
  return `${counts.approved} approved, ${counts.manual_review} in review, and ${counts.rejected} rejected/not eligible`
}

function policyForCluster(
  report: ClusterInvestigationReport,
  policyReport: CampaignPolicyReport | null,
) {
  const actionCounts = emptyActionCounts()
  const ruleCounts: Partial<Record<CampaignPolicyRuleCode, number>> = {}
  const recommendationByMember = new Map<string, CampaignPolicyReport["recommendations"][number]>()

  if (!policyReport) {
    return {
      status: "unavailable" as const,
      reason: "Campaign policy context is unavailable for this case brief.",
      preset: null,
      thresholds: null,
      recommendationCounts: actionCounts,
      recommendationsChangingStoredDecision: 0,
      humanDecisionsPreserved: 0,
      matchedRuleCounts: ruleCounts,
      recommendationByMember,
    }
  }

  if (policyReport.analysisId !== report.analysisId) {
    return {
      status: "analysis_mismatch" as const,
      reason: `Campaign policy currently evaluates analysis ${policyReport.analysisId}, while this cluster belongs to ${report.analysisId}. Policy recommendations are withheld to avoid mixing analysis runs.`,
      preset: policyReport.preset,
      thresholds: policyReport.thresholds,
      recommendationCounts: actionCounts,
      recommendationsChangingStoredDecision: 0,
      humanDecisionsPreserved: 0,
      matchedRuleCounts: ruleCounts,
      recommendationByMember,
    }
  }

  const memberKeys = new Set(
    report.members.map((member) => chainAddressKey(member.walletAddress, member.chain)),
  )
  let changed = 0
  let humanPreserved = 0

  for (const recommendation of policyReport.recommendations) {
    const key = chainAddressKey(recommendation.walletAddress, recommendation.chain)
    if (!memberKeys.has(key)) continue
    recommendationByMember.set(key, recommendation)
    actionCounts[recommendation.recommendedAction] += 1
    if (recommendation.changesAutomatedDecision) changed += 1
    if (recommendation.finalHumanDecision !== null) humanPreserved += 1
    for (const matchedRule of recommendation.matchedRules) {
      ruleCounts[matchedRule.code] = (ruleCounts[matchedRule.code] ?? 0) + 1
    }
  }

  return {
    status: "available" as const,
    reason: null,
    preset: policyReport.preset,
    thresholds: policyReport.thresholds,
    recommendationCounts: actionCounts,
    recommendationsChangingStoredDecision: changed,
    humanDecisionsPreserved: humanPreserved,
    matchedRuleCounts: ruleCounts,
    recommendationByMember,
  }
}

export function buildInvestigationCaseBrief(input: {
  report: ClusterInvestigationReport
  latestReview?: ClusterReviewRecord | null
  policyReport?: CampaignPolicyReport | null
}): InvestigationCaseBrief {
  const review = input.latestReview ?? null
  const walletDecisionCounts = emptyStatusCounts()
  for (const member of input.report.members) walletDecisionCounts[member.status] += 1

  const policy = policyForCluster(input.report, input.policyReport ?? null)
  const groupingFamilies = input.report.grouping.families.map((family) => family.label)
  const reviewLabel = review ? clusterReviewDispositionLabel(review.disposition) : "No cluster review recorded"
  const policySentence =
    policy.status === "available"
      ? `The matching campaign policy recommends ${policy.recommendationCounts.approve} approve, ${policy.recommendationCounts.manual_review} review, and ${policy.recommendationCounts.reject} reject outcomes for these members.`
      : policy.reason ?? "Campaign policy context is unavailable."

  const executiveSummary = `${input.report.cluster.clusterLabel} contains ${input.report.cluster.walletCount} stored member wallets. The stored grouping exposes ${input.report.grouping.observedIndependentFamilies} independent relationship families (${groupingFamilies.join(", ") || "family-level reasons unavailable"}). Stored wallet decisions are ${decisionSummary(walletDecisionCounts)}. Cluster reviewer status: ${reviewLabel}. ${policySentence}`

  const nextActions = [operationalUseForReview(review)]
  if (policy.status === "analysis_mismatch") {
    nextActions.push("Open the campaign policy for this exact analysis run or rerun the campaign analysis before using policy recommendations in the same decision package.")
  } else if (policy.status === "unavailable") {
    nextActions.push("Use stored wallet decisions and Decision Evidence until matching campaign policy context is available.")
  } else if (policy.recommendationCounts.manual_review > 0) {
    nextActions.push(`Resolve the ${policy.recommendationCounts.manual_review} policy review recommendation(s) with wallet-level evidence before final reward-list execution.`)
  }
  if (input.report.timeline.truncated) {
    nextActions.push("Inspect the full canonical provenance/event sources before closing the case because the on-screen timeline is truncated.")
  }

  const limitations = Array.from(new Set([
    ...input.report.grouping.caveats,
    "The case brief summarizes stored decisions and review context; it does not create a new wallet or cluster decision.",
    "Risk score differences and shared relationships are investigation signals, not proof of common control.",
    ...(policy.reason ? [policy.reason] : []),
    ...(input.report.timeline.truncated
      ? [`Timeline preview is truncated: ${input.report.timeline.items.length} of ${input.report.timeline.totalCandidates} candidates are included.`]
      : []),
  ]))

  return {
    schemaVersion: INVESTIGATION_CASE_BRIEF_SCHEMA_VERSION,
    analysisId: input.report.analysisId,
    clusterLabel: input.report.cluster.clusterLabel,
    project: input.report.project,
    headline: headlineForReview(review),
    executiveSummary,
    storedState: {
      walletCount: input.report.cluster.walletCount,
      averageRiskScore: input.report.cluster.averageRiskScore,
      behaviorSimilarityScore: input.report.cluster.behaviorSimilarityScore,
      suggestedAction: input.report.cluster.suggestedAction,
      groupingQualifiesByStoredRule: input.report.grouping.qualifiesByStoredRule,
      groupingFamilies,
      walletDecisionCounts,
    },
    reviewer: {
      latest: review,
      operationalUse: operationalUseForReview(review),
    },
    policy: {
      status: policy.status,
      reason: policy.reason,
      preset: policy.preset,
      thresholds: policy.thresholds,
      recommendationCounts: policy.recommendationCounts,
      recommendationsChangingStoredDecision: policy.recommendationsChangingStoredDecision,
      humanDecisionsPreserved: policy.humanDecisionsPreserved,
      matchedRuleCounts: policy.matchedRuleCounts,
    },
    evidenceSummary: {
      fundingRelationships: input.report.provenance.funding.relationshipCount,
      fundingRiskBearing: input.report.provenance.funding.riskBearingCount,
      fundingNeutralized: input.report.provenance.funding.neutralizedCount,
      graphComponents: input.report.provenance.graph.componentIds.length,
      graphRiskBearingEdges: input.report.provenance.graph.riskBearingEdgeCount,
      timelineItems: input.report.timeline.items.length,
      timelineCandidates: input.report.timeline.totalCandidates,
      timelineTruncated: input.report.timeline.truncated,
    },
    memberPreview: input.report.members.slice(0, MAX_CASE_BRIEF_MEMBER_PREVIEW).map((member) => {
      const recommendation = policy.recommendationByMember.get(
        chainAddressKey(member.walletAddress, member.chain),
      )
      return {
        walletAddress: member.walletAddress,
        chain: member.chain,
        riskScore: member.riskScore,
        storedStatus: member.status,
        storedAction: member.recommendedAction,
        policyAction: recommendation?.recommendedAction ?? null,
        policyChangesStoredDecision: recommendation?.changesAutomatedDecision ?? null,
        evidenceConfidence: member.evidenceConfidence,
        teamReviewStatus: member.teamReview?.finalStatus ?? null,
      }
    }),
    nextActions,
    limitations,
  }
}

function md(value: string) {
  return value.replaceAll("\r", " ").trim()
}

export function buildInvestigationCaseBriefMarkdown(brief: InvestigationCaseBrief) {
  const lines = [
    `# Investigation Case Brief — ${md(brief.clusterLabel)}`,
    "",
    `**Project:** ${md(brief.project.name)}`,
    `**Analysis:** ${md(brief.analysisId)}`,
    `**Headline:** ${md(brief.headline)}`,
    "",
    "## Executive summary",
    md(brief.executiveSummary),
    "",
    "## Stored state",
    `- Members: ${brief.storedState.walletCount}`,
    `- Average risk score: ${brief.storedState.averageRiskScore}`,
    `- Behavior similarity: ${brief.storedState.behaviorSimilarityScore}%`,
    `- Stored cluster action: ${brief.storedState.suggestedAction}`,
    `- Grouping families: ${brief.storedState.groupingFamilies.join(", ") || "not exposed"}`,
    `- Wallet decisions: ${brief.storedState.walletDecisionCounts.approved} approved / ${brief.storedState.walletDecisionCounts.manual_review} review / ${brief.storedState.walletDecisionCounts.rejected} rejected`,
    "",
    "## Human cluster review",
    brief.reviewer.latest
      ? `- Disposition: ${clusterReviewDispositionLabel(brief.reviewer.latest.disposition)}`
      : "- Disposition: Not recorded",
    brief.reviewer.latest ? `- Reviewer: ${md(brief.reviewer.latest.reviewerName)}` : "",
    brief.reviewer.latest?.notes
      ? `- Notes: ${md(brief.reviewer.latest.notes).replaceAll("\n", " ")}`
      : "",
    `- Operational use: ${md(brief.reviewer.operationalUse)}`,
    "",
    "## Campaign policy context",
    `- Status: ${brief.policy.status}`,
    brief.policy.preset ? `- Preset: ${brief.policy.preset}` : "",
    brief.policy.status === "available"
      ? `- Recommendations: ${brief.policy.recommendationCounts.approve} approve / ${brief.policy.recommendationCounts.manual_review} review / ${brief.policy.recommendationCounts.reject} reject`
      : `- Reason: ${md(brief.policy.reason ?? "Unavailable")}`,
    "",
    "## Evidence summary",
    `- Funding relationships: ${brief.evidenceSummary.fundingRelationships} (${brief.evidenceSummary.fundingRiskBearing} risk-bearing, ${brief.evidenceSummary.fundingNeutralized} neutralized)`,
    `- Graph components: ${brief.evidenceSummary.graphComponents}`,
    `- Risk-bearing graph edges: ${brief.evidenceSummary.graphRiskBearingEdges}`,
    `- Timeline: ${brief.evidenceSummary.timelineItems}/${brief.evidenceSummary.timelineCandidates}${brief.evidenceSummary.timelineTruncated ? " (truncated)" : ""}`,
    "",
    "## Next actions",
    ...brief.nextActions.map((item) => `- ${md(item)}`),
    "",
    "## Limitations",
    ...brief.limitations.map((item) => `- ${md(item)}`),
    "",
  ]
  return lines.filter((line, index, array) => line !== "" || array[index - 1] !== "").join("\n")
}
