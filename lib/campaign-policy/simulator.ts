import { chainAddressKey } from "@/lib/address-normalization"
import {
  buildCampaignPolicyReport,
  campaignPolicyThresholdsForPreset,
  normalizeCampaignPolicyThresholds,
} from "@/lib/campaign-policy/engine"
import type {
  CampaignPolicyReport,
  CampaignPolicyThresholds,
} from "@/lib/campaign-policy/types"
import type { CrossCampaignRiskMemory } from "@/lib/risk-memory/types"
import type { AnalysisDetail, RiskPolicy, SuggestedAction } from "@/types"

export const CAMPAIGN_POLICY_SIMULATOR_VERSION = "tri-proof-policy-simulator-v1" as const
export const MAX_POLICY_SIMULATION_TRANSITIONS = 5_000

export type CampaignPolicySimulationScenarioInput = {
  preset?: RiskPolicy
  corroboratedRejectScore?: number | null
  corroboratedFamilyCount?: number | null
}

export type CampaignPolicySimulationTransition = {
  walletAddress: string
  chain: string
  currentDecision: string
  baselineAction: SuggestedAction
  scenarioAction: SuggestedAction
  direction: "escalated" | "deescalated"
  baselineRuleCodes: string[]
  scenarioRuleCodes: string[]
  addedRuleCodes: string[]
  removedRuleCodes: string[]
}

export type CampaignPolicySimulationRewardImpact = {
  rewardPoolUsd: number
  assumption: "equal_allocation_per_wallet"
  equalAllocationPerWalletUsd: number
  baselineEstimatedRejectedAllocationUsd: number
  scenarioEstimatedRejectedAllocationUsd: number
  deltaEstimatedRejectedAllocationUsd: number
  baselineEstimatedReviewAllocationUsd: number
  scenarioEstimatedReviewAllocationUsd: number
  deltaEstimatedReviewAllocationUsd: number
}

export type CampaignPolicySimulation = {
  schemaVersion: typeof CAMPAIGN_POLICY_SIMULATOR_VERSION
  campaignId: string
  campaignName: string
  analysisId: string
  generatedAt: string
  baseline: {
    preset: RiskPolicy
    thresholds: CampaignPolicyThresholds
    approveRecommendations: number
    reviewRecommendations: number
    rejectRecommendations: number
  }
  scenario: {
    preset: RiskPolicy
    thresholds: CampaignPolicyThresholds
    customized: boolean
    approveRecommendations: number
    reviewRecommendations: number
    rejectRecommendations: number
  }
  impact: {
    changedWallets: number
    escalatedWallets: number
    deescalatedWallets: number
    newlyRejected: number
    noLongerRejected: number
    newlyReview: number
    noLongerReview: number
    humanDecisionsPreserved: number
  }
  rewardImpact: CampaignPolicySimulationRewardImpact | null
  coverage: {
    walletsEvaluated: number
    transitionsReturned: number
    transitionsTruncated: boolean
    riskMemoryAvailable: boolean
    riskMemoryPartial: boolean
  }
  transitions: CampaignPolicySimulationTransition[]
  safeguards: string[]
}

const actionRank: Record<SuggestedAction, number> = {
  approve: 0,
  manual_review: 1,
  reject: 2,
}

function money(value: number) {
  return Number(value.toFixed(2))
}

function reportSummary(report: CampaignPolicyReport) {
  return {
    preset: report.preset,
    thresholds: report.thresholds,
    approveRecommendations: report.summary.approveRecommendations,
    reviewRecommendations: report.summary.reviewRecommendations,
    rejectRecommendations: report.summary.rejectRecommendations,
  }
}

function ruleCodes(report: CampaignPolicyReport["recommendations"][number]) {
  return Array.from(new Set(report.matchedRules.map((rule) => rule.code)))
}

function difference(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value))
}

function simulationRewardImpact(
  baseline: CampaignPolicyReport,
  scenario: CampaignPolicyReport,
  rewardPoolUsd: number | null | undefined,
): CampaignPolicySimulationRewardImpact | null {
  const pool = Number(rewardPoolUsd)
  const wallets = baseline.coverage.walletsEvaluated
  if (!Number.isFinite(pool) || pool < 0 || wallets <= 0) return null

  const perWallet = pool / wallets
  const baselineRejected = baseline.summary.rejectRecommendations * perWallet
  const scenarioRejected = scenario.summary.rejectRecommendations * perWallet
  const baselineReview = baseline.summary.reviewRecommendations * perWallet
  const scenarioReview = scenario.summary.reviewRecommendations * perWallet

  return {
    rewardPoolUsd: money(pool),
    assumption: "equal_allocation_per_wallet",
    equalAllocationPerWalletUsd: money(perWallet),
    baselineEstimatedRejectedAllocationUsd: money(baselineRejected),
    scenarioEstimatedRejectedAllocationUsd: money(scenarioRejected),
    deltaEstimatedRejectedAllocationUsd: money(scenarioRejected - baselineRejected),
    baselineEstimatedReviewAllocationUsd: money(baselineReview),
    scenarioEstimatedReviewAllocationUsd: money(scenarioReview),
    deltaEstimatedReviewAllocationUsd: money(scenarioReview - baselineReview),
  }
}

export function buildCampaignPolicySimulation(input: {
  analysis: AnalysisDetail
  memory: CrossCampaignRiskMemory | null
  rewardPoolUsd?: number | null
  scenario?: CampaignPolicySimulationScenarioInput
  maxTransitions?: number
}): CampaignPolicySimulation {
  const baselinePreset = input.analysis.riskPolicy ?? "balanced"
  const baselineThresholds = campaignPolicyThresholdsForPreset(baselinePreset)
  const scenarioPreset = input.scenario?.preset ?? baselinePreset
  const scenarioThresholds = normalizeCampaignPolicyThresholds(scenarioPreset, {
    corroboratedRejectScore: input.scenario?.corroboratedRejectScore ?? undefined,
    corroboratedFamilyCount: input.scenario?.corroboratedFamilyCount ?? undefined,
  })
  const presetThresholds = campaignPolicyThresholdsForPreset(scenarioPreset)
  const customized =
    scenarioThresholds.corroboratedRejectScore !== presetThresholds.corroboratedRejectScore ||
    scenarioThresholds.corroboratedFamilyCount !== presetThresholds.corroboratedFamilyCount

  const baseline = buildCampaignPolicyReport({
    analysis: input.analysis,
    memory: input.memory,
    preset: baselinePreset,
    thresholds: baselineThresholds,
  })
  const scenario = buildCampaignPolicyReport({
    analysis: input.analysis,
    memory: input.memory,
    preset: scenarioPreset,
    thresholds: scenarioThresholds,
  })

  const baselineByWallet = new Map(
    baseline.recommendations.map((item) => [chainAddressKey(item.walletAddress, item.chain), item]),
  )
  const transitions: CampaignPolicySimulationTransition[] = []

  scenario.recommendations.forEach((scenarioItem) => {
    const baselineItem = baselineByWallet.get(
      chainAddressKey(scenarioItem.walletAddress, scenarioItem.chain),
    )
    if (!baselineItem || baselineItem.recommendedAction === scenarioItem.recommendedAction) return

    const baselineCodes = ruleCodes(baselineItem)
    const scenarioCodes = ruleCodes(scenarioItem)
    transitions.push({
      walletAddress: scenarioItem.walletAddress,
      chain: scenarioItem.chain,
      currentDecision: scenarioItem.currentDecision,
      baselineAction: baselineItem.recommendedAction,
      scenarioAction: scenarioItem.recommendedAction,
      direction:
        actionRank[scenarioItem.recommendedAction] > actionRank[baselineItem.recommendedAction]
          ? "escalated"
          : "deescalated",
      baselineRuleCodes: baselineCodes,
      scenarioRuleCodes: scenarioCodes,
      addedRuleCodes: difference(scenarioCodes, baselineCodes),
      removedRuleCodes: difference(baselineCodes, scenarioCodes),
    })
  })

  transitions.sort((left, right) => {
    const leftDelta = Math.abs(actionRank[left.scenarioAction] - actionRank[left.baselineAction])
    const rightDelta = Math.abs(actionRank[right.scenarioAction] - actionRank[right.baselineAction])
    if (leftDelta !== rightDelta) return rightDelta - leftDelta
    if (left.direction !== right.direction) return left.direction === "escalated" ? -1 : 1
    return `${left.chain}:${left.walletAddress}`.localeCompare(`${right.chain}:${right.walletAddress}`)
  })

  const transitionLimit = Math.min(
    MAX_POLICY_SIMULATION_TRANSITIONS,
    Math.max(1, Math.round(input.maxTransitions ?? MAX_POLICY_SIMULATION_TRANSITIONS)),
  )
  const returnedTransitions = transitions.slice(0, transitionLimit)

  return {
    schemaVersion: CAMPAIGN_POLICY_SIMULATOR_VERSION,
    campaignId: input.analysis.project.id,
    campaignName: input.analysis.project.name,
    analysisId: input.analysis.id,
    generatedAt: new Date().toISOString(),
    baseline: reportSummary(baseline),
    scenario: {
      ...reportSummary(scenario),
      customized,
    },
    impact: {
      changedWallets: transitions.length,
      escalatedWallets: transitions.filter((item) => item.direction === "escalated").length,
      deescalatedWallets: transitions.filter((item) => item.direction === "deescalated").length,
      newlyRejected: transitions.filter(
        (item) => item.scenarioAction === "reject" && item.baselineAction !== "reject",
      ).length,
      noLongerRejected: transitions.filter(
        (item) => item.baselineAction === "reject" && item.scenarioAction !== "reject",
      ).length,
      newlyReview: transitions.filter(
        (item) => item.scenarioAction === "manual_review" && item.baselineAction !== "manual_review",
      ).length,
      noLongerReview: transitions.filter(
        (item) => item.baselineAction === "manual_review" && item.scenarioAction !== "manual_review",
      ).length,
      humanDecisionsPreserved: scenario.summary.humanDecisionsPreserved,
    },
    rewardImpact: simulationRewardImpact(baseline, scenario, input.rewardPoolUsd),
    coverage: {
      walletsEvaluated: baseline.coverage.walletsEvaluated,
      transitionsReturned: returnedTransitions.length,
      transitionsTruncated: returnedTransitions.length < transitions.length,
      riskMemoryAvailable: baseline.coverage.riskMemoryAvailable,
      riskMemoryPartial: baseline.coverage.riskMemoryPartial,
    },
    transitions: returnedTransitions,
    safeguards: [
      "Simulation is read-only and does not update campaign decisions, policies, reviewer overrides, or reward lists.",
      "Stored human decisions retain precedence in both baseline and scenario outputs.",
      "Missing data and recurrence-only evidence cannot become automatic rejection solely because thresholds changed.",
      "Reward impact is an estimate under an equal-allocation-per-wallet assumption; it is not a token-distribution forecast.",
    ],
  }
}
