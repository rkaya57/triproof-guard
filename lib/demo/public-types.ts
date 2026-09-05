import type { AnalysisDetail, DecisionEvidenceItem, ParsedWallet, WalletStatus } from "@/types"

export type PublicDemoDecision = "approved" | "review" | "insufficient_data" | "not_eligible"
export type PublicDemoWallet = {
  address: string
  label: string
  decision: PublicDemoDecision
  storedStatus: WalletStatus
  riskScore: number | null
  riskLabel: string
  explanation: string
  clusterId: string | null
  funder: string | null
  firstFundingAt: string | null
  evidence: DecisionEvidenceItem[]
}

export type PublicDemoSnapshot = {
  version: string
  provenance: {
    kind: "synthetic_demonstration"
    asOf: string
    inputSha256: string
    engineVersion: string
    rulesetVersion: string
    policy: "balanced"
    notice: string
  }
  summary: Record<PublicDemoDecision, number> & { totalWallets: number; clusters: number }
  wallets: PublicDemoWallet[]
  inputs: ParsedWallet[]
  analysis: AnalysisDetail
}

export const publicDecisionLabels: Record<PublicDemoDecision, string> = {
  approved: "Approved",
  review: "Needs review",
  insufficient_data: "Insufficient data",
  not_eligible: "Not eligible",
}
