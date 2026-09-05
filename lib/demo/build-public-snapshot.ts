import { createHash } from "node:crypto"

import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { analyzeWallets, SYBIL_ENGINE_VERSION, SYBIL_RULESET_VERSION } from "@/lib/risk-engine"
import { PUBLIC_DEMO_AS_OF, PUBLIC_DEMO_VERSION, publicDemoInputs } from "@/lib/demo/public-fixture"
import type { PublicDemoDecision, PublicDemoSnapshot } from "@/lib/demo/public-types"

export function buildPublicDemoSnapshot(): PublicDemoSnapshot {
  const inputs = publicDemoInputs()
  const result = analyzeWallets(inputs, null, "balanced")
  const wallets = result.wallets.map((wallet, index) => {
    const coverageOnly = wallet.reasons.some((reason) => reason.includes("no malicious-risk score was assigned because the decision is based on data coverage"))
    const eligibilityOnly = wallet.reasons.some((reason) => reason.includes("no malicious-risk score was assigned because the decision is an eligibility exclusion"))
    const decision: PublicDemoDecision = coverageOnly ? "insufficient_data"
      : wallet.status === "approved" ? "approved"
        : wallet.status === "rejected" ? "not_eligible" : "review"
    return {
      address: wallet.walletAddress,
      label: `Wallet ${String(index + 1).padStart(2, "0")}`,
      decision,
      storedStatus: wallet.status,
      riskScore: coverageOnly || eligibilityOnly ? null : wallet.riskScore,
      riskLabel: coverageOnly ? "Not assessed" : eligibilityOnly ? "Not applicable" : `${wallet.riskScore} / 100`,
      explanation: wallet.statusExplanation,
      clusterId: wallet.clusterId,
      funder: wallet.fundingSource,
      firstFundingAt: wallet.firstFundingAt ?? null,
      evidence: buildExplainableDecision(wallet).evidence,
    }
  })
  return {
    version: PUBLIC_DEMO_VERSION,
    provenance: {
      kind: "synthetic_demonstration",
      asOf: PUBLIC_DEMO_AS_OF,
      inputSha256: createHash("sha256").update(JSON.stringify(inputs)).digest("hex"),
      engineVersion: SYBIL_ENGINE_VERSION,
      rulesetVersion: SYBIL_RULESET_VERSION,
      policy: "balanced",
      notice: "Illustrative addresses and observations, processed by the Tri-Proof engine. No live chain lookup, customer results, or accuracy claim.",
    },
    summary: {
      totalWallets: wallets.length,
      clusters: result.clusters.length,
      approved: wallets.filter((wallet) => wallet.decision === "approved").length,
      review: wallets.filter((wallet) => wallet.decision === "review").length,
      insufficient_data: wallets.filter((wallet) => wallet.decision === "insufficient_data").length,
      not_eligible: wallets.filter((wallet) => wallet.decision === "not_eligible").length,
    },
    wallets,
    inputs,
    analysis: {
      id: "public-demo",
      status: "completed",
      totalWallets: result.totalWallets,
      approvedCount: result.approvedCount,
      manualReviewCount: result.manualReviewCount,
      rejectedCount: result.rejectedCount,
      averageRiskScore: result.averageRiskScore,
      suspiciousClustersCount: result.clusters.length,
      csvFileName: "illustrative-campaign-inputs.csv",
      createdAt: PUBLIC_DEMO_AS_OF,
      completedAt: PUBLIC_DEMO_AS_OF,
      riskPolicy: "balanced",
      project: { id: "public-demo", name: "Illustrative Solana campaign", chain: "Solana", campaignType: "Airdrop", notes: "Synthetic demo only. No measured customer outcomes." },
      wallets: result.wallets,
      clusters: result.clusters,
      graph: result.graph,
    },
  }
}
