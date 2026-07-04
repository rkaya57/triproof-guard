import type { AnalysisDetail, RiskPolicy, WalletRiskResult } from "@/types"

type PolicyRule = {
  label: string
  value: string
  detail: string
}

const policyRules: Record<RiskPolicy, PolicyRule[]> = {
  conservative: [
    { label: "Auto approve", value: "0-35", detail: "Only clean wallets without cluster or shared funding signals." },
    { label: "Gray Zone", value: "36-74", detail: "Ambiguous wallets stay in the team review queue." },
    { label: "Auto reject", value: "75+", detail: "Severe risk or missing evidence is not approved automatically." },
  ],
  balanced: [
    { label: "Auto approve", value: "0-35", detail: "Clean wallets with enough on-chain evidence." },
    { label: "Gray Zone", value: "36-59", detail: "Weak contextual signals require a human decision." },
    { label: "Auto reject", value: "60+", detail: "High-risk cluster, funding or behavior evidence is excluded." },
  ],
  strict: [
    { label: "Auto approve", value: "0-25", detail: "Only the strongest clean profiles pass automatically." },
    { label: "Gray Zone", value: "26-49", detail: "Most ambiguous wallets are held for reviewer action." },
    { label: "Auto reject", value: "50+", detail: "Aggressive campaign protection for high-value drops." },
  ],
}

const reasonCodeMap: Array<[RegExp, string]> = [
  [/known .*exchange|known .*service|known .*protocol|known public/i, "KNOWN_ENTITY"],
  [/shared funding source|funding cluster/i, "SHARED_FUNDING"],
  [/suspicious cluster|behavior cluster|temporal cohort/i, "CLUSTER_LINKED"],
  [/younger than|brand-new|wallet age/i, "NEW_OR_LOW_AGE"],
  [/low transaction|limited transaction|no reliable|no on-chain/i, "LOW_HISTORY"],
  [/campaign-only|campaign-action|activity concentration/i, "CAMPAIGN_ONLY_ACTIVITY"],
  [/bot-script|bot script/i, "BOT_PATTERN"],
  [/policy override|policy signal|allowlist/i, "POLICY_OVERRIDE"],
  [/program|contract|non-user|account intelligence/i, "NON_USER_ACCOUNT"],
  [/diversity|counterparties|interaction/i, "LOW_DIVERSITY"],
]

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function normalizeReasonCode(reason: string) {
  const match = reasonCodeMap.find(([pattern]) => pattern.test(reason))
  if (match) return match[1]
  return reason
    .replace(/^V\d+\.\d+\s*/i, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32)
    .toUpperCase() || "RISK_SIGNAL"
}

export function getWalletReasonCodes(wallet: Pick<WalletRiskResult, "reasons" | "status" | "clusterId" | "entityLabel">) {
  const codes = new Set(wallet.reasons.map(normalizeReasonCode))
  if (wallet.clusterId) codes.add("CLUSTER_LINKED")
  if (wallet.entityLabel) codes.add("KNOWN_ENTITY")
  if (wallet.status === "approved") codes.add("PASSED_POLICY")
  if (wallet.status === "manual_review") codes.add("REQUIRES_REVIEW")
  if (wallet.status === "rejected") codes.add("REWARD_EXCLUDED")
  return Array.from(codes).slice(0, 6)
}

export function getCampaignPolicy(analysis: Pick<AnalysisDetail, "riskPolicy" | "project">) {
  const policy = analysis.riskPolicy ?? "balanced"
  return {
    policy,
    label: `${policy[0].toUpperCase()}${policy.slice(1)} campaign policy`,
    scope: `${analysis.project.campaignType} / ${analysis.project.chain}`,
    rules: policyRules[policy],
  }
}

export function getDecisionIntelligence(analysis: AnalysisDetail) {
  const cleanWallets = analysis.wallets.filter((wallet) => wallet.status === "approved")
  const reviewWallets = analysis.wallets.filter((wallet) => wallet.status === "manual_review")
  const rejectedWallets = analysis.wallets.filter((wallet) => wallet.status === "rejected")
  const clusteredWallets = analysis.wallets.filter((wallet) => wallet.clusterId).length
  const topReasonCodes = new Map<string, number>()

  analysis.wallets.forEach((wallet) => {
    getWalletReasonCodes(wallet).forEach((code) => {
      topReasonCodes.set(code, (topReasonCodes.get(code) ?? 0) + 1)
    })
  })

  const proofSeed = [
    analysis.id,
    analysis.project.id,
    analysis.totalWallets,
    analysis.approvedCount,
    analysis.manualReviewCount,
    analysis.rejectedCount,
    analysis.averageRiskScore,
    analysis.completedAt ?? analysis.createdAt,
  ].join(":")

  return {
    cleanWallets,
    reviewWallets,
    rejectedWallets,
    clusteredWallets,
    cleanRate: analysis.totalWallets ? Math.round((cleanWallets.length / analysis.totalWallets) * 100) : 0,
    reviewRate: analysis.totalWallets ? Math.round((reviewWallets.length / analysis.totalWallets) * 100) : 0,
    rejectRate: analysis.totalWallets ? Math.round((rejectedWallets.length / analysis.totalWallets) * 100) : 0,
    proofId: `tp-proof-${stableHash(proofSeed)}`,
    topReasonCodes: Array.from(topReasonCodes.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count })),
  }
}
