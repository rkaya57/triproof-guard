import { decisionCsvLabel } from "@/lib/decision-labels"
import type { WalletRiskResult, WalletStatus } from "@/types"

function escapeCsv(value: unknown) {
  const normalized = Array.isArray(value) ? value.join("; ") : String(value ?? "")
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }

  return normalized
}

function hasNoOnChainData(wallet: WalletRiskResult) {
  return (
    wallet.enrichmentStatus === "failed" ||
    wallet.accountType === "missing_or_closed_account" ||
    wallet.reasons.some((reason) => reason.includes("No On-chain Data"))
  )
}

export function walletsToCsv(wallets: WalletRiskResult[], full = false) {
  const baseHeaders = [
    "wallet_address",
    "decision_label",
    "entity_label",
    "entity_type",
    "risk_score",
    "risk_level",
    "status",
    "recommended_action",
    "cluster_id",
    "no_onchain_data",
    "risk_reasons",
    "status_explanation",
  ]
  const fullHeaders = [
    ...baseHeaders,
    "chain",
    "funding_source",
    "tx_count",
    "wallet_age_days",
    "total_volume",
    "contracts_count",
    "campaign_actions_count",
    "first_seen",
    "last_seen",
    "native_balance",
    "token_count",
    "unique_counterparties",
    "last_active_days_ago",
    "is_contract",
    "enrichment_provider",
    "enrichment_status",
    "campaign_quality_score",
    "campaign_only_ratio",
    "behavior_diversity_score",
    "bot_script_score",
    "policy_action",
    "reputation_label",
    "policy_reason",
    "entity_risk_reason",
  ]
  const headers = full ? fullHeaders : baseHeaders
  const rows = wallets.map((wallet) => {
    const baseValues = [
      wallet.walletAddress,
      decisionCsvLabel(wallet.status),
      wallet.entityLabel ?? "",
      wallet.entityType,
      wallet.riskScore,
      wallet.riskLevel,
      wallet.status,
      wallet.recommendedAction,
      wallet.clusterId ?? "",
      hasNoOnChainData(wallet) ? "true" : "false",
      wallet.reasons,
      wallet.statusExplanation,
    ]
    const fullValues = [
      ...baseValues,
      wallet.chain,
      wallet.fundingSource ?? "",
      wallet.txCount ?? "",
      wallet.walletAgeDays ?? "",
      wallet.totalVolume ?? "",
      wallet.contractsCount ?? "",
      wallet.campaignActionsCount ?? "",
      wallet.firstSeen ?? "",
      wallet.lastSeen ?? "",
      wallet.nativeBalance ?? "",
      wallet.tokenCount ?? "",
      wallet.uniqueCounterparties ?? "",
      wallet.lastActiveDaysAgo ?? "",
      wallet.isContract == null ? "" : wallet.isContract ? "true" : "false",
      wallet.enrichmentProvider ?? "",
      wallet.enrichmentStatus ?? "",
      wallet.campaignQualityScore ?? "",
      wallet.campaignOnlyRatio ?? "",
      wallet.behaviorDiversityScore ?? "",
      wallet.botScriptScore ?? "",
      wallet.policyAction ?? "",
      wallet.reputationLabel ?? "",
      wallet.policyReason ?? "",
      wallet.entityRiskReason ?? "",
    ]

    return (full ? fullValues : baseValues).map(escapeCsv).join(",")
  })

  return [headers.join(","), ...rows].join("\n")
}

export function filterWalletsByExportType(
  wallets: WalletRiskResult[],
  type: WalletStatus | "full"
) {
  if (type === "full") return wallets
  if (type === "approved") {
    return wallets.filter(
      (wallet) =>
        wallet.status === "approved" &&
        !wallet.clusterId &&
        !wallet.reasons.some(
          (reason) =>
            reason.startsWith("Shared funding source") ||
            reason.startsWith("Part of suspicious cluster")
        )
    )
  }
  return wallets.filter((wallet) => wallet.status === type)
}
