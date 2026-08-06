import { getWalletReasonCodes, normalizeReasonCode } from "@/lib/campaign-decision"
import type { TeamReviewState, WalletRiskResult, WalletStatus } from "@/types"

export const EXPLAINABLE_DECISION_SCHEMA_VERSION = "campaign-security-explanation-v1" as const

export type DecisionEvidenceFamily =
  | "funding"
  | "referral"
  | "timing"
  | "behavior"
  | "activity_quality"
  | "campaign_coordination"
  | "graph"
  | "known_entity"
  | "account_state"
  | "policy"
  | "data_coverage"
  | "manual_review"
  | "other"

export type DecisionEvidenceEffect =
  | "risk_signal"
  | "corroborating_signal"
  | "eligibility_exclusion"
  | "neutralizing_context"
  | "coverage_limitation"
  | "human_override"

export type DecisionEvidenceSource =
  | "risk_engine"
  | "graph"
  | "enrichment"
  | "policy"
  | "team_review"

export type DecisionEvidenceConfidence = "low" | "medium" | "high"

export type DecisionEvidenceItem = {
  code: string
  family: DecisionEvidenceFamily
  effect: DecisionEvidenceEffect
  title: string
  description: string
  source: DecisionEvidenceSource
}

export type ExplainableWalletDecision = {
  schemaVersion: typeof EXPLAINABLE_DECISION_SCHEMA_VERSION
  decision: WalletStatus
  recommendedAction: WalletRiskResult["recommendedAction"]
  evidenceConfidence: DecisionEvidenceConfidence
  evidenceFamilies: DecisionEvidenceFamily[]
  independentRiskFamilyCount: number
  evidence: DecisionEvidenceItem[]
  limitations: string[]
  requiresHumanReview: boolean
  humanReview: TeamReviewState | null
}

type EvidenceDescriptor = Omit<DecisionEvidenceItem, "description">

const decisiveCodes = new Set([
  "KNOWN_BAD_FUNDER",
  "SELF_REFERRAL",
  "CIRCULAR_PATH",
  "BOT_PATTERN",
  "NON_USER_ACCOUNT",
  "POLICY_OVERRIDE",
])

function descriptorForCode(
  code: string,
  reason: string,
  wallet: WalletRiskResult
): EvidenceDescriptor | null {
  if (code === "KNOWN_BAD_FUNDER") {
    return {
      code,
      family: "funding",
      effect: "risk_signal",
      title: "Known-bad funding source",
      source: "graph",
    }
  }

  if (code === "SERVICE_FUNDER_NEUTRALIZED") {
    return {
      code,
      family: "funding",
      effect: "neutralizing_context",
      title: "Recognized service funding",
      source: "graph",
    }
  }

  if (code === "SHARED_FUNDING") {
    return {
      code,
      family: "funding",
      effect: "corroborating_signal",
      title: "Shared funding relationship",
      source: "risk_engine",
    }
  }

  if (code === "REFERRAL_LINKED") {
    return {
      code,
      family: "referral",
      effect: "corroborating_signal",
      title: "Shared referral relationship",
      source: "risk_engine",
    }
  }

  if (code === "SELF_REFERRAL") {
    return {
      code,
      family: "referral",
      effect: "risk_signal",
      title: "Self-referral detected",
      source: "graph",
    }
  }

  if (code === "TIMING_COHORT") {
    return {
      code,
      family: "timing",
      effect: "corroborating_signal",
      title: "Coordinated timing cohort",
      source: "risk_engine",
    }
  }

  if (code === "CAMPAIGN_COORDINATION" || code === "PARTICIPANT_COHORT") {
    return {
      code,
      family: "campaign_coordination",
      effect: "corroborating_signal",
      title:
        code === "PARTICIPANT_COHORT"
          ? "Participant cohort overlap"
          : "Campaign activity coordination",
      source: "risk_engine",
    }
  }

  if (
    code === "BEHAVIOR_COHORT" ||
    code === "CAMPAIGN_ONLY_ACTIVITY" ||
    code === "LOW_DIVERSITY"
  ) {
    return {
      code,
      family: "behavior",
      effect: "corroborating_signal",
      title:
        code === "BEHAVIOR_COHORT"
          ? "Behavior cohort similarity"
          : code === "CAMPAIGN_ONLY_ACTIVITY"
            ? "Campaign-only activity pattern"
            : "Low activity diversity",
      source: "risk_engine",
    }
  }

  if (code === "BOT_PATTERN") {
    return {
      code,
      family: "behavior",
      effect: "risk_signal",
      title: "Automated behavior pattern",
      source: "risk_engine",
    }
  }

  if (code === "CORROBORATED_SYBIL" || code === "CLUSTER_LINKED") {
    return {
      code,
      family: "graph",
      effect: "corroborating_signal",
      title:
        code === "CORROBORATED_SYBIL"
          ? "Corroborated Sybil cohort"
          : "Suspicious cluster membership",
      source: "graph",
    }
  }

  if (code === "CIRCULAR_PATH") {
    return {
      code,
      family: "graph",
      effect: "risk_signal",
      title: "Circular wallet relationship",
      source: "graph",
    }
  }

  if (code === "NEW_OR_LOW_AGE") {
    return {
      code,
      family: "activity_quality",
      effect: "corroborating_signal",
      title: "New or low-age wallet",
      source: "risk_engine",
    }
  }

  if (code === "LOW_HISTORY") {
    const coverageLimited = /no reliable|provider|unavailable|unreadable|missing|closed/i.test(reason)
    return {
      code,
      family: coverageLimited ? "data_coverage" : "activity_quality",
      effect: coverageLimited ? "coverage_limitation" : "corroborating_signal",
      title: coverageLimited ? "Limited on-chain evidence" : "Limited transaction history",
      source: coverageLimited ? "enrichment" : "risk_engine",
    }
  }

  if (code === "KNOWN_ENTITY") {
    return {
      code,
      family: "known_entity",
      effect: "eligibility_exclusion",
      title: wallet.entityLabel
        ? `Known non-participant entity: ${wallet.entityLabel}`
        : "Known non-participant entity",
      source: "risk_engine",
    }
  }

  if (code === "NON_USER_ACCOUNT") {
    return {
      code,
      family: "account_state",
      effect: "eligibility_exclusion",
      title: "Non-user account type",
      source: "enrichment",
    }
  }

  if (code === "ACCOUNT_STATE") {
    const coverageLimited = /historical_unresolved|missing_or_closed|unreadable/i.test(reason)
    return {
      code,
      family: coverageLimited ? "data_coverage" : "account_state",
      effect: coverageLimited ? "coverage_limitation" : "neutralizing_context",
      title: coverageLimited ? "Incomplete account-state evidence" : "User wallet account state",
      source: "enrichment",
    }
  }

  if (code === "POLICY_OVERRIDE") {
    return {
      code,
      family: "policy",
      effect: "human_override",
      title: "Campaign policy override",
      source: "policy",
    }
  }

  if (code === "PASSED_POLICY") {
    return {
      code,
      family: "policy",
      effect: "neutralizing_context",
      title: "Campaign policy threshold passed",
      source: "policy",
    }
  }

  if (code === "REQUIRES_REVIEW") {
    return {
      code,
      family: "manual_review",
      effect: "coverage_limitation",
      title: "Human review required",
      source: "policy",
    }
  }

  if (code === "REWARD_EXCLUDED") {
    return {
      code,
      family: "policy",
      effect: "eligibility_exclusion",
      title: "Campaign eligibility threshold not met",
      source: "policy",
    }
  }

  if (code === "RISK_THRESHOLD_EXCEEDED") {
    return {
      code,
      family: "policy",
      effect: "corroborating_signal",
      title: "Risk threshold exceeded",
      source: "policy",
    }
  }

  return null
}

function evidenceForText(
  text: string,
  wallet: WalletRiskResult,
  allowFallback: boolean
): DecisionEvidenceItem | null {
  const code = normalizeReasonCode(text)
  const descriptor = descriptorForCode(code, text, wallet)
  if (descriptor) return { ...descriptor, description: text }
  if (!allowFallback) return null

  return {
    code,
    family: "other",
    effect: wallet.status === "approved" ? "neutralizing_context" : "risk_signal",
    title: "Additional decision evidence",
    description: text,
    source: "risk_engine",
  }
}

function syntheticDescription(code: string, wallet: WalletRiskResult) {
  if (code === "CLUSTER_LINKED") {
    return wallet.clusterId
      ? `Wallet is linked to suspicious cluster ${wallet.clusterId}.`
      : "Wallet is linked to a suspicious cluster."
  }
  if (code === "KNOWN_ENTITY") {
    return wallet.entityLabel
      ? `${wallet.entityLabel} is a known ${wallet.entityType} address and is not treated as a normal individual campaign participant.`
      : `Known ${wallet.entityType} address is not treated as a normal individual campaign participant.`
  }
  return wallet.statusExplanation
}

function teamReviewEvidence(review: TeamReviewState): DecisionEvidenceItem {
  return {
    code: "TEAM_REVIEW_DECISION",
    family: "manual_review",
    effect: "human_override",
    title: `Campaign team decision: ${review.finalStatus.replace("_", " ")}`,
    description:
      review.notes?.trim() ||
      `A campaign reviewer recorded a final ${review.finalStatus.replace("_", " ")} decision.`,
    source: "team_review",
  }
}

function uniqueEvidence(items: DecisionEvidenceItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.code}:${item.family}:${item.effect}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function collectLimitations(wallet: WalletRiskResult, evidence: DecisionEvidenceItem[]) {
  const limitations = new Set<string>()

  if (wallet.enrichmentStatus === "failed") {
    limitations.add("On-chain enrichment failed; retry provider-backed analysis before a final campaign decision.")
  } else if (wallet.enrichmentStatus === "skipped") {
    limitations.add("On-chain enrichment was skipped; the decision relies on campaign-supplied evidence.")
  } else if (wallet.enrichmentStatus === "pending" || wallet.enrichmentStatus === "processing") {
    limitations.add("On-chain enrichment is not complete yet.")
  }

  if (wallet.historyTruncated) {
    limitations.add("Provider history was sampled, so the earliest activity or funding event may be outside the observed window.")
  }

  evidence
    .filter((item) => item.effect === "coverage_limitation")
    .forEach((item) => limitations.add(item.description))

  if (wallet.status === "manual_review" && !wallet.teamReview) {
    limitations.add("The campaign team has not recorded a final human review decision.")
  }

  return Array.from(limitations)
}

function confidenceForDecision(
  wallet: WalletRiskResult,
  evidence: DecisionEvidenceItem[],
  limitations: string[]
): DecisionEvidenceConfidence {
  const riskFamilies = new Set(
    evidence
      .filter(
        (item) => item.effect === "risk_signal" || item.effect === "corroborating_signal"
      )
      .map((item) => item.family)
  )
  const hasEligibilityExclusion = evidence.some(
    (item) => item.effect === "eligibility_exclusion"
  )
  const hasDecisiveSignal = evidence.some((item) => decisiveCodes.has(item.code))

  if (wallet.teamReview) {
    return wallet.teamReview.finalStatus === "manual_review" ? "medium" : "high"
  }

  if (wallet.status === "rejected") {
    if (hasDecisiveSignal || hasEligibilityExclusion || riskFamilies.size >= 2) return "high"
    if (riskFamilies.size === 1) return "medium"
    return "low"
  }

  if (wallet.status === "manual_review") {
    if (riskFamilies.size >= 1 || hasEligibilityExclusion) return "medium"
    return "low"
  }

  const hasCompletedEvidence =
    wallet.enrichmentStatus === "completed" ||
    wallet.txCount !== null ||
    wallet.walletAgeDays !== null
  if (
    wallet.riskScore <= 30 &&
    hasCompletedEvidence &&
    riskFamilies.size === 0 &&
    !hasEligibilityExclusion &&
    limitations.length === 0
  ) {
    return "high"
  }
  return riskFamilies.size === 0 && !hasEligibilityExclusion ? "medium" : "low"
}

export function buildExplainableDecision(
  wallet: WalletRiskResult
): ExplainableWalletDecision {
  const evidence: DecisionEvidenceItem[] = []

  wallet.reasons.forEach((reason) => {
    const item = evidenceForText(reason, wallet, true)
    if (item) evidence.push(item)
  })

  getWalletReasonCodes(wallet).forEach((code) => {
    if (evidence.some((item) => item.code === code)) return
    const description = syntheticDescription(code, wallet)
    const descriptor = descriptorForCode(code, description, wallet)
    if (descriptor) evidence.push({ ...descriptor, description })
  })

  if (wallet.graphRiskScore && wallet.graphRiskScore > 0 && !evidence.some((item) => item.family === "graph")) {
    evidence.push({
      code: "GRAPH_RISK_CONTEXT",
      family: "graph",
      effect: wallet.graphRiskScore >= 55 ? "risk_signal" : "corroborating_signal",
      title: "Graph risk context",
      description: `Wallet graph component risk score: ${wallet.graphRiskScore}.`,
      source: "graph",
    })
  }

  if (wallet.teamReview) evidence.push(teamReviewEvidence(wallet.teamReview))

  const normalizedEvidence = uniqueEvidence(evidence)
  const limitations = collectLimitations(wallet, normalizedEvidence)
  const riskFamilies = new Set(
    normalizedEvidence
      .filter(
        (item) => item.effect === "risk_signal" || item.effect === "corroborating_signal"
      )
      .map((item) => item.family)
  )

  return {
    schemaVersion: EXPLAINABLE_DECISION_SCHEMA_VERSION,
    decision: wallet.status,
    recommendedAction: wallet.recommendedAction,
    evidenceConfidence: confidenceForDecision(wallet, normalizedEvidence, limitations),
    evidenceFamilies: Array.from(new Set(normalizedEvidence.map((item) => item.family))),
    independentRiskFamilyCount: riskFamilies.size,
    evidence: normalizedEvidence,
    limitations,
    requiresHumanReview: wallet.teamReview
      ? wallet.teamReview.finalStatus === "manual_review"
      : wallet.status === "manual_review",
    humanReview: wallet.teamReview ?? null,
  }
}
