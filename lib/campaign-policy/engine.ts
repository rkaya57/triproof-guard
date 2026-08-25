import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { riskMemoryIdentityKey } from "@/lib/risk-memory/builder"
import type { CrossCampaignRiskMemory, RiskMemoryMatch } from "@/lib/risk-memory/types"
import type {
  AnalysisDetail,
  DecisionEvidenceItem,
  ExplainableWalletDecision,
  RiskPolicy,
  SuggestedAction,
  WalletRiskResult,
  WalletStatus,
} from "@/types"
import {
  CAMPAIGN_POLICY_ENGINE_VERSION,
  type CampaignPolicyMatchedRule,
  type CampaignPolicyMemoryContext,
  type CampaignPolicyRecommendation,
  type CampaignPolicyReport,
  type CampaignPolicyThresholds,
} from "@/lib/campaign-policy/types"

const actionRank: Record<SuggestedAction, number> = {
  approve: 0,
  manual_review: 1,
  reject: 2,
}

const decisiveCodes = new Set([
  "KNOWN_BAD_FUNDER",
  "SELF_REFERRAL",
  "CIRCULAR_PATH",
  "BOT_PATTERN",
  "NON_USER_ACCOUNT",
])

const infrastructureRoles = new Set([
  "funder",
  "referrer",
  "service",
  "token",
  "contract",
  "program",
  "domain",
  "url",
])

const presetConfig: Record<RiskPolicy, CampaignPolicyThresholds> = {
  conservative: { corroboratedRejectScore: 75, corroboratedFamilyCount: 3 },
  balanced: { corroboratedRejectScore: 60, corroboratedFamilyCount: 2 },
  strict: { corroboratedRejectScore: 50, corroboratedFamilyCount: 2 },
}

export function campaignPolicyThresholdsForPreset(preset: RiskPolicy): CampaignPolicyThresholds {
  return { ...presetConfig[preset] }
}

export function normalizeCampaignPolicyThresholds(
  preset: RiskPolicy,
  thresholds?: Partial<CampaignPolicyThresholds> | null,
): CampaignPolicyThresholds {
  const defaults = presetConfig[preset]
  const score = Number(thresholds?.corroboratedRejectScore)
  const familyCount = Number(thresholds?.corroboratedFamilyCount)

  return {
    corroboratedRejectScore: Number.isFinite(score)
      ? Math.min(100, Math.max(0, Math.round(score)))
      : defaults.corroboratedRejectScore,
    corroboratedFamilyCount: Number.isFinite(familyCount)
      ? Math.min(8, Math.max(1, Math.round(familyCount)))
      : defaults.corroboratedFamilyCount,
  }
}

function statusAction(status: WalletStatus): SuggestedAction {
  if (status === "approved") return "approve"
  if (status === "rejected") return "reject"
  return "manual_review"
}

function memoryContext(match: RiskMemoryMatch | null): CampaignPolicyMemoryContext | null {
  if (!match) return null
  return {
    campaignCount: match.campaignCount,
    priorCampaignCount: match.priorCampaignCount,
    roles: match.roles,
    crossRole: match.crossRole,
    highestRiskScore: match.highestRiskScore,
    priorRejectedCount: match.priorRejectedCount,
    priorManualReviewCount: match.priorManualReviewCount,
    telegramEvidenceCount: match.telegramEvidenceCount,
  }
}

function evidenceCodes(items: DecisionEvidenceItem[]) {
  return Array.from(new Set(items.map((item) => item.code)))
}

function evidenceFamilies(items: DecisionEvidenceItem[]) {
  return Array.from(new Set(items.map((item) => item.family)))
}

function rule(input: CampaignPolicyMatchedRule) {
  return input
}

function highestAction(base: SuggestedAction, rules: CampaignPolicyMatchedRule[]) {
  return rules.reduce<SuggestedAction>(
    (current, item) => (actionRank[item.action] > actionRank[current] ? item.action : current),
    base
  )
}

function explanationFor(action: SuggestedAction, rules: CampaignPolicyMatchedRule[]) {
  const decisive = rules.filter((item) => item.severity === "critical" || item.severity === "high")
  const source = decisive[0] ?? rules[0]
  if (action === "reject") {
    return source
      ? `Policy recommends exclusion because ${source.rationale}`
      : "Policy preserves the existing exclusion decision."
  }
  if (action === "manual_review") {
    return source
      ? `Policy requires human review because ${source.rationale}`
      : "Policy preserves the existing Gray Zone decision."
  }
  return source
    ? `Policy keeps the wallet eligible while recording that ${source.rationale}`
    : "Policy preserves the current approved decision."
}

function recommendationConfidence(
  action: SuggestedAction,
  decision: ExplainableWalletDecision,
  rules: CampaignPolicyMatchedRule[]
) {
  if (rules.some((item) => item.code === "HUMAN_DECISION_PRECEDENCE")) return "high" as const
  if (
    action === "reject" &&
    (rules.some((item) => item.code === "ELIGIBILITY_EXCLUSION") ||
      rules.some((item) => item.code === "DECISIVE_CURRENT_SIGNAL") ||
      decision.independentRiskFamilyCount >= 2)
  ) {
    return "high" as const
  }
  if (action === "manual_review") return "medium" as const
  return decision.evidenceConfidence
}

export function evaluateCampaignPolicy(input: {
  wallet: WalletRiskResult
  preset: RiskPolicy
  memoryMatch?: RiskMemoryMatch | null
  thresholds?: Partial<CampaignPolicyThresholds> | null
}): CampaignPolicyRecommendation {
  const decision = input.wallet.decisionEvidence ?? buildExplainableDecision(input.wallet)
  const memory = input.memoryMatch ?? null
  const currentAction = statusAction(input.wallet.status)
  const safeguards = [
    "Cross-campaign recurrence is contextual evidence and is never an automatic rejection.",
    "Missing or incomplete data can require review but cannot create an automatic rejection.",
    "A stored human review decision takes precedence over automated policy suggestions.",
  ]

  if (decision.humanReview) {
    const recommendedAction = statusAction(decision.humanReview.finalStatus)
    const matchedRules = [
      rule({
        code: "HUMAN_DECISION_PRECEDENCE",
        title: "Stored human decision",
        action: recommendedAction,
        severity: recommendedAction === "reject" ? "critical" : "info",
        rationale: `a campaign reviewer recorded a final ${decision.humanReview.finalStatus.replace("_", " ")} decision.`,
        evidenceCodes: ["TEAM_REVIEW_DECISION"],
        evidenceFamilies: ["manual_review"],
      }),
    ]
    return {
      walletAddress: input.wallet.walletAddress,
      chain: input.wallet.chain,
      currentDecision: input.wallet.status,
      finalHumanDecision: decision.humanReview.finalStatus,
      recommendedAction,
      changesAutomatedDecision: recommendedAction !== currentAction,
      requiresHumanReview: recommendedAction === "manual_review",
      confidence: "high",
      matchedRules,
      safeguards,
      explanation: explanationFor(recommendedAction, matchedRules),
      riskMemory: memoryContext(memory),
    }
  }

  const matchedRules: CampaignPolicyMatchedRule[] = [
    rule({
      code: "CURRENT_DECISION_BASELINE",
      title: "Current decision baseline",
      action: currentAction,
      severity: "info",
      rationale: `the existing analysis decision is ${input.wallet.status.replace("_", " ")}.`,
      evidenceCodes: [],
      evidenceFamilies: [],
    }),
  ]

  const eligibilityEvidence = decision.evidence.filter(
    (item) => item.effect === "eligibility_exclusion"
  )
  if (eligibilityEvidence.length > 0) {
    matchedRules.push(
      rule({
        code: "ELIGIBILITY_EXCLUSION",
        title: "Campaign eligibility exclusion",
        action: "reject",
        severity: "critical",
        rationale: "the account is supported as a non-participant entity or account type rather than a normal campaign user.",
        evidenceCodes: evidenceCodes(eligibilityEvidence),
        evidenceFamilies: evidenceFamilies(eligibilityEvidence),
      })
    )
  }

  const decisiveEvidence = decision.evidence.filter((item) => decisiveCodes.has(item.code))
  if (decisiveEvidence.length > 0 && eligibilityEvidence.length === 0) {
    const reject = decision.evidenceConfidence === "high" || input.preset === "strict"
    matchedRules.push(
      rule({
        code: "DECISIVE_CURRENT_SIGNAL",
        title: "Decisive current-campaign evidence",
        action: reject ? "reject" : "manual_review",
        severity: reject ? "critical" : "high",
        rationale: reject
          ? "a decisive current-campaign signal is supported with sufficient confidence."
          : "a decisive signal exists but its current confidence still requires a reviewer.",
        evidenceCodes: evidenceCodes(decisiveEvidence),
        evidenceFamilies: evidenceFamilies(decisiveEvidence),
      })
    )
  }

  const coverageEvidence = decision.evidence.filter(
    (item) => item.effect === "coverage_limitation"
  )
  if (coverageEvidence.length > 0 || decision.limitations.length > 0) {
    matchedRules.push(
      rule({
        code: "DATA_COVERAGE_REVIEW",
        title: "Incomplete evidence coverage",
        action: "manual_review",
        severity: "caution",
        rationale: "provider or account-history limitations prevent a fully automated decision.",
        evidenceCodes: evidenceCodes(coverageEvidence),
        evidenceFamilies: evidenceFamilies(coverageEvidence),
      })
    )
  }

  if (memory?.priorRejectedCount) {
    matchedRules.push(
      rule({
        code: "PRIOR_REJECTION_REVIEW",
        title: "Prior rejected campaign occurrence",
        action: "manual_review",
        severity: "high",
        rationale: `the exact identity has ${memory.priorRejectedCount} prior rejected occurrence(s), which requires context review but is not sufficient for automatic exclusion.`,
        evidenceCodes: [],
        evidenceFamilies: [],
      })
    )
  }

  const participantAndInfrastructure = Boolean(
    memory?.roles.includes("participant") &&
      memory.roles.some((role) => infrastructureRoles.has(role))
  )
  if (memory?.crossRole && participantAndInfrastructure) {
    matchedRules.push(
      rule({
        code: "CROSS_ROLE_INFRASTRUCTURE_REVIEW",
        title: "Cross-role campaign identity",
        action: "manual_review",
        severity: "high",
        rationale: `the exact identity changes role across campaigns (${memory.roles.join(", ")}).`,
        evidenceCodes: [],
        evidenceFamilies: [],
      })
    )
  }

  const config = normalizeCampaignPolicyThresholds(input.preset, input.thresholds)
  const corroborated = Boolean(
    memory &&
      input.wallet.riskScore >= config.corroboratedRejectScore &&
      decision.independentRiskFamilyCount >= config.corroboratedFamilyCount &&
      (memory.priorRejectedCount > 0 || memory.crossRole || memory.telegramEvidenceCount > 0)
  )

  if (corroborated) {
    const telegram = (memory?.telegramEvidenceCount ?? 0) > 0
    matchedRules.push(
      rule({
        code: telegram
          ? "TELEGRAM_ONCHAIN_CORROBORATION"
          : "CROSS_CAMPAIGN_CORROBORATION",
        title: telegram
          ? "Telegram-to-onchain corroboration"
          : "Cross-campaign corroboration",
        action: "reject",
        severity: "critical",
        rationale: telegram
          ? `Telegram evidence and exact cross-campaign identity history corroborate ${decision.independentRiskFamilyCount} independent current risk families at score ${input.wallet.riskScore}.`
          : `Exact cross-campaign history corroborates ${decision.independentRiskFamilyCount} independent current risk families at score ${input.wallet.riskScore}.`,
        evidenceCodes: evidenceCodes(
          decision.evidence.filter(
            (item) => item.effect === "risk_signal" || item.effect === "corroborating_signal"
          )
        ),
        evidenceFamilies: decision.evidenceFamilies,
      })
    )
  } else if (decision.independentRiskFamilyCount >= 2) {
    matchedRules.push(
      rule({
        code: "MULTI_FAMILY_CORROBORATION",
        title: "Multiple current risk families",
        action: "manual_review",
        severity: "high",
        rationale: `${decision.independentRiskFamilyCount} independent current-campaign risk families overlap, but the cross-campaign threshold for automatic exclusion is not met.`,
        evidenceCodes: evidenceCodes(
          decision.evidence.filter(
            (item) => item.effect === "risk_signal" || item.effect === "corroborating_signal"
          )
        ),
        evidenceFamilies: decision.evidenceFamilies,
      })
    )
  }

  if (
    memory &&
    memory.campaignCount >= 2 &&
    memory.priorRejectedCount === 0 &&
    !memory.crossRole &&
    memory.telegramEvidenceCount === 0
  ) {
    matchedRules.push(
      rule({
        code: "RECURRENCE_CONTEXT_ONLY",
        title: "Context-only recurrence",
        action: "approve",
        severity: "info",
        rationale: `the exact identity appears in ${memory.campaignCount} campaigns without prior rejection, cross-role infrastructure use or Telegram corroboration.`,
        evidenceCodes: [],
        evidenceFamilies: [],
      })
    )
  }

  const recommendedAction = highestAction(currentAction, matchedRules)
  return {
    walletAddress: input.wallet.walletAddress,
    chain: input.wallet.chain,
    currentDecision: input.wallet.status,
    finalHumanDecision: null,
    recommendedAction,
    changesAutomatedDecision: actionRank[recommendedAction] > actionRank[currentAction],
    requiresHumanReview: recommendedAction === "manual_review",
    confidence: recommendationConfidence(recommendedAction, decision, matchedRules),
    matchedRules,
    safeguards,
    explanation: explanationFor(recommendedAction, matchedRules),
    riskMemory: memoryContext(memory),
  }
}

export function buildCampaignPolicyReport(input: {
  analysis: AnalysisDetail
  memory: CrossCampaignRiskMemory | null
  preset?: RiskPolicy
  thresholds?: Partial<CampaignPolicyThresholds> | null
}): CampaignPolicyReport {
  const preset = input.preset ?? input.analysis.riskPolicy ?? "balanced"
  const thresholds = normalizeCampaignPolicyThresholds(preset, input.thresholds)
  const memoryByIdentity = new Map(
    (input.memory?.matches ?? []).map((match) => [match.key, match])
  )
  const recommendations = input.analysis.wallets.map((wallet) => {
    const key = riskMemoryIdentityKey({
      identityKind: "onchain_identity",
      value: wallet.walletAddress,
      chain: wallet.chain,
    })
    return evaluateCampaignPolicy({
      wallet,
      preset,
      memoryMatch: memoryByIdentity.get(key) ?? null,
      thresholds,
    })
  })

  const partial = Boolean(
    input.memory &&
      (input.memory.coverage.graphNodesTruncated ||
        input.memory.coverage.walletAnalysesTruncated ||
        input.memory.coverage.telegramEventsTruncated)
  )

  return {
    schemaVersion: CAMPAIGN_POLICY_ENGINE_VERSION,
    campaignId: input.analysis.project.id,
    campaignName: input.analysis.project.name,
    analysisId: input.analysis.id,
    preset,
    thresholds,
    generatedAt: new Date().toISOString(),
    summary: {
      approveRecommendations: recommendations.filter((item) => item.recommendedAction === "approve").length,
      reviewRecommendations: recommendations.filter((item) => item.recommendedAction === "manual_review").length,
      rejectRecommendations: recommendations.filter((item) => item.recommendedAction === "reject").length,
      escalatedFromApproved: recommendations.filter(
        (item) => item.currentDecision === "approved" && item.changesAutomatedDecision
      ).length,
      escalatedFromReview: recommendations.filter(
        (item) => item.currentDecision === "manual_review" && item.recommendedAction === "reject"
      ).length,
      humanDecisionsPreserved: recommendations.filter((item) => item.finalHumanDecision !== null).length,
      crossCampaignCorroborated: recommendations.filter((item) =>
        item.matchedRules.some((matched) => matched.code === "CROSS_CAMPAIGN_CORROBORATION")
      ).length,
      telegramCorroborated: recommendations.filter((item) =>
        item.matchedRules.some((matched) => matched.code === "TELEGRAM_ONCHAIN_CORROBORATION")
      ).length,
      dataCoverageReviews: recommendations.filter((item) =>
        item.matchedRules.some((matched) => matched.code === "DATA_COVERAGE_REVIEW")
      ).length,
    },
    coverage: {
      walletsEvaluated: recommendations.length,
      riskMemoryAvailable: Boolean(input.memory),
      riskMemoryPartial: partial,
      campaignsConsidered: input.memory?.coverage.campaignsConsidered ?? 1,
      analysesConsidered: input.memory?.coverage.analysesConsidered ?? 1,
    },
    recommendations,
  }
}
