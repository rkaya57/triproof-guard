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
  const coverageOnly =
    COVERAGE_ONLY_CATEGORIES.has(category ?? "") ||
    (wallet.status === "manual_review" && wallet.enrichmentStatus === "failed") ||
    /insufficient reliable on-chain evidence|provider access .*unavailable|current account state is unresolved/i.test(
      wallet.statusExplanation
    )
  const eligibilityOnly = isNonUserEligibility(wallet, category)

  let normalizedRiskScore = wallet.riskScore
  let reason: string | null = null

  if (coverageOnly && !hardMaliciousEvidence) {
    normalizedRiskScore = 0
    reason = interpretationReason("coverage")
  } else if (eligibilityOnly && !hardMaliciousEvidence) {
    normalizedRiskScore = 0
    reason = interpretationReason("eligibility")
  }

  if (normalizedRiskScore === wallet.riskScore && !reason) return wallet

  const reasons = reason && !wallet.reasons.includes(reason)
    ? [...wallet.reasons, reason]
    : wallet.reasons

  return {
    ...wallet,
    riskScore: normalizedRiskScore,
    riskLevel: riskLevelFromScore(normalizedRiskScore),
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
