import type {
  AnalysisResult,
  EnrichmentMeta,
  ParsedWallet,
  RiskPolicy,
} from "@/types"
import type { WalletGraphContext } from "@/lib/graph-intelligence"
import {
  analyzeWallets as analyzeWalletsStandard,
  normalizeRiskPolicy,
  riskPolicyFromNotes,
  riskPolicyThresholdSnapshot,
  RISK_POLICY_VERSION,
  SYBIL_ENGINE_VERSION,
  SYBIL_RULESET_VERSION,
  type CrossCampaignContext,
  type CrossCampaignWalletSignal,
} from "../risk-engine"
import { analyzeWalletsScalable } from "@/lib/risk-engine/scalable"
import { normalizeAnalysisSemantics } from "@/lib/risk-engine/semantic-safety"

export {
  normalizeRiskPolicy,
  riskPolicyFromNotes,
  riskPolicyThresholdSnapshot,
  RISK_POLICY_VERSION,
  SYBIL_ENGINE_VERSION,
  SYBIL_RULESET_VERSION,
}
export type { CrossCampaignContext, CrossCampaignWalletSignal }

function scalableThreshold() {
  const parsed = Number.parseInt(
    process.env.SYBIL_SCALABLE_ENGINE_THRESHOLD ?? "10000",
    10
  )
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : 10_000
}

export function analyzeWallets(
  wallets: ParsedWallet[],
  enrichment: EnrichmentMeta | null = null,
  riskPolicy: RiskPolicy = "balanced",
  graphContext: WalletGraphContext | null = null,
  crossCampaignContext: CrossCampaignContext | null = null
): AnalysisResult {
  const normalizedPolicy = normalizeRiskPolicy(riskPolicy)
  if (wallets.length >= scalableThreshold()) {
    return normalizeAnalysisSemantics(
      analyzeWalletsScalable(
        wallets,
        enrichment,
        normalizedPolicy,
        graphContext,
        crossCampaignContext
      )
    )
  }

  return analyzeWalletsStandard(
    wallets,
    enrichment,
    normalizedPolicy,
    graphContext,
    crossCampaignContext
  )
}
