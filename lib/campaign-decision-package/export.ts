import type {
  CampaignDecisionPackage,
  CampaignDecisionPackageWallet,
} from "@/lib/campaign-decision-package"

function csvSafeValue(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized
}

function csvCell(value: string | number | boolean | null | undefined) {
  const raw = value === null || value === undefined ? "" : String(value)
  return `"${csvSafeValue(raw).replaceAll('"', '""')}"`
}

function row(wallet: CampaignDecisionPackageWallet) {
  return [
    wallet.walletAddress,
    wallet.chain,
    wallet.executionAction,
    wallet.storedStatus,
    wallet.policyAction,
    wallet.confidence,
    wallet.finalHumanDecision,
    wallet.changesStoredDecision,
    wallet.clusterId,
    wallet.clusterReviewDisposition,
    wallet.matchedRuleCodes.join("|"),
    wallet.explanation,
  ].map(csvCell).join(",")
}

export function buildCampaignDecisionPackageCsv(pkg: CampaignDecisionPackage) {
  const headers = [
    "wallet",
    "chain",
    "execution_action",
    "stored_status",
    "policy_action",
    "confidence",
    "final_human_decision",
    "changes_stored_decision",
    "cluster_id",
    "cluster_review_disposition",
    "matched_policy_rules",
    "explanation",
  ].map(csvCell).join(",")

  return [headers, ...pkg.wallets.map(row)].join("\n")
}

export function buildCampaignDecisionPackageJson(pkg: CampaignDecisionPackage) {
  return JSON.stringify({
    package: pkg,
    exportBoundaries: [
      "This export is read-only and does not apply campaign decisions.",
      "Execution actions are policy recommendations for the exact analysis run identified in the package.",
      "Stored human wallet decisions are preserved through campaign-policy precedence.",
      "Cluster reviewer dispositions are investigation context and do not rewrite wallet actions.",
      "Allow, Review, and Exclude are campaign-operational labels, not claims about wallet-owner identity or intent.",
    ],
  }, null, 2)
}

export function safeCampaignDecisionPackageFileStem(campaignName: string) {
  const normalized = campaignName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return normalized || "campaign"
}
