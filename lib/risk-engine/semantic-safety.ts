import type {
  AnalysisResult,
  RiskLevel,
  WalletRiskResult,
} from "@/types"

const COVERAGE_ONLY_CATEGORIES = new Set([
  "provider_unavailable",
  "insufficient_data",
  "account_state_uncertain",
])

const HARD_MALICIOUS_EVIDENCE = [
  /known-bad (?:funding|source)/i,
  /self[- ]referral/i,
  /circular (?:funding|referral|wallet|transfer|path)/i,
  /corroborated sybil/i,
  /high-confidence (?:sybil|graph)/i,
  /same wallet is both .*funder and referrer/i,
  /share both a funding origin and referral source/i,
  /bot-script probability: very high/i,
]

const providerCompletedInsufficientReason =
  "V1.9 evidence sufficiency: provider enrichment completed, but returned no substantive wallet history. Provider completion alone cannot support automatic approval."

function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 30) return "low"
  if (score <= 60) return "medium"
  if (score <= 85) return "high"
  return "critical"
}

function decisionCategory(wallet: WalletRiskResult) {
  for (let index = wallet.reasons.length - 1; index >= 0; index -= 1) {
    const match = wallet.reasons[index]?.match(/^Decision category:\s*(.+)$/i)
    if (match?.[1]) return match[1].trim().toLowerCase()
  }
  return null
}

function isNonUserEligibility(wallet: WalletRiskResult, category: string | null) {
  if (category === "ineligible_non_user_account") return true
  if (wallet.status !== "rejected") return false

  const nonUserAccount = Boolean(
    wallet.accountType &&
      wallet.accountType !== "system_user_wallet" &&
      wallet.accountType !== "historical_unresolved_account"
  )

  return (
    nonUserAccount ||
    /not eligible:.*(?:service|exchange|contract|program|token|non-user)|not a normal end-user wallet/i.test(
      wallet.statusExplanation
    ) ||
    /non-user .*account detected|excluded from normal user reward lists/i.test(
      wallet.statusExplanation
    )
  )
}

function hasHardMaliciousEvidence(wallet: WalletRiskResult) {
  if ((wallet.graphRiskScore ?? 0) >= 70) return true
  return wallet.reasons.some((reason) =>
    HARD_MALICIOUS_EVIDENCE.some((pattern) => pattern.test(reason))
  )
}

function isPositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/**
 * Provider success is transport/data-access metadata, not evidence that an
 * address is an established organic participant. Auto-approval requires at
 * least one substantive wallet-history observation beyond a completed lookup.
 */
function hasSubstantiveWalletHistory(wallet: WalletRiskResult) {
  return (
    isPositiveNumber(wallet.txCount) ||
    Boolean(wallet.fundingSource?.trim()) ||
    Boolean(wallet.firstFundingAt) ||
    isPositiveNumber(wallet.firstFundingAmount) ||
    Boolean(wallet.firstSeen) ||
    Boolean(wallet.lastSeen) ||
    isPositiveNumber(wallet.totalVolume) ||
    isPositiveNumber(wallet.contractsCount) ||
    isPositiveNumber(wallet.campaignActionsCount) ||
    isPositiveNumber(wallet.nativeBalance) ||
    isPositiveNumber(wallet.tokenCount) ||
    isPositiveNumber(wallet.uniqueCounterparties) ||
    Boolean(wallet.behaviorFingerprint?.length)
  )
}

function isProviderCompletedInsufficientApproval(
  wallet: WalletRiskResult,
  hardMaliciousEvidence: boolean
) {
  const userLikeAccount =
    wallet.entityType === "user" &&
    !wallet.entityLabel &&
    (!wallet.accountType || wallet.accountType === "system_user_wallet")

  return (
    wallet.status === "approved" &&
    wallet.enrichmentStatus === "completed" &&
    userLikeAccount &&
    !hardMaliciousEvidence &&
    !hasSubstantiveWalletHistory(wallet)
  )
}

function interpretationReason(kind: "coverage" | "eligibility") {
  return kind === "coverage"
    ? "Risk score interpretation: no malicious-risk score was assigned because the decision is based on data coverage, not wallet misconduct."
    : "Risk score interpretation: no malicious-risk score was assigned because the decision is an eligibility exclusion for a non-user account."
}

export function normalizeWalletRiskSemantics(
  wallet: WalletRiskResult
): WalletRiskResult {
  const category = decisionCategory(wallet)
  const hardMaliciousEvidence = hasHardMaliciousEvidence(wallet)
  const providerCompletedInsufficientData =
    isProviderCompletedInsufficientApproval(wallet, hardMaliciousEvidence)
  const coverageOnly =
    providerCompletedInsufficientData ||
    COVERAGE_ONLY_CATEGORIES.has(category ?? "") ||
    (wallet.status === "manual_review" && wallet.enrichmentStatus === "failed") ||
    /insufficient reliable on-chain evidence|provider access .*unavailable|current account state is unresolved/i.test(
      wallet.statusExplanation
    )
  const eligibilityOnly = isNonUserEligibility(wallet, category)

  let normalizedRiskScore = wallet.riskScore
  let normalizedStatus = wallet.status
  let normalizedAction = wallet.recommendedAction
  let normalizedExplanation = wallet.statusExplanation
  const semanticReasons: string[] = []

  if (providerCompletedInsufficientData) {
    normalizedStatus = "manual_review"
    normalizedAction = "manual_review"
    normalizedExplanation =
      "Gray Zone: the provider completed enrichment, but returned insufficient substantive wallet history to support automatic approval. Retry enrichment or review eligibility manually."
    semanticReasons.push(providerCompletedInsufficientReason)
    semanticReasons.push("Decision category: insufficient_data")
  }

  if (coverageOnly && !hardMaliciousEvidence) {
    normalizedRiskScore = 0
    semanticReasons.push(interpretationReason("coverage"))
  } else if (eligibilityOnly && !hardMaliciousEvidence) {
    normalizedRiskScore = 0
    semanticReasons.push(interpretationReason("eligibility"))
  }

  const reasons = [...wallet.reasons]
  semanticReasons.forEach((reason) => {
    if (!reasons.includes(reason)) reasons.push(reason)
  })

  const unchanged =
    normalizedRiskScore === wallet.riskScore &&
    normalizedStatus === wallet.status &&
    normalizedAction === wallet.recommendedAction &&
    normalizedExplanation === wallet.statusExplanation &&
    reasons.length === wallet.reasons.length

  if (unchanged) return wallet

  return {
    ...wallet,
    riskScore: normalizedRiskScore,
    riskLevel: riskLevelFromScore(normalizedRiskScore),
    status: normalizedStatus,
    recommendedAction: normalizedAction,
    statusExplanation: normalizedExplanation,
    reasons,
  }
}

function recomputeClusters(
  result: AnalysisResult,
  wallets: WalletRiskResult[]
): AnalysisResult["clusters"] {
  const walletByAddress = new Map(
    wallets.map((wallet) => [wallet.walletAddress, wallet])
  )

  return result.clusters.map((cluster) => {
    const members = cluster.walletAddresses
      .map((address) => walletByAddress.get(address))
      .filter((wallet): wallet is WalletRiskResult => Boolean(wallet))

    if (!members.length) return cluster

    const averageRiskScore = Number(
      (
        members.reduce((sum, wallet) => sum + wallet.riskScore, 0) /
        members.length
      ).toFixed(1)
    )

    return {
      ...cluster,
      averageRiskScore,
    }
  })
}

export function normalizeAnalysisSemantics(result: AnalysisResult): AnalysisResult {
  const wallets = result.wallets.map(normalizeWalletRiskSemantics)
  const clusters = recomputeClusters(result, wallets)
  const totalWallets = wallets.length
  const averageRiskScore = totalWallets
    ? Number(
        (
          wallets.reduce((sum, wallet) => sum + wallet.riskScore, 0) /
          totalWallets
        ).toFixed(1)
      )
    : 0

  const riskDistribution: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }
  wallets.forEach((wallet) => {
    riskDistribution[wallet.riskLevel] += 1
  })

  return {
    ...result,
    wallets,
    clusters,
    totalWallets,
    approvedCount: wallets.filter((wallet) => wallet.status === "approved").length,
    manualReviewCount: wallets.filter((wallet) => wallet.status === "manual_review").length,
    rejectedCount: wallets.filter((wallet) => wallet.status === "rejected").length,
    averageRiskScore,
    riskDistribution,
  }
}
