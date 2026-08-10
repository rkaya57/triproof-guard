import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import { assessV2Corroboration } from "@/lib/scamguard/v2/corroboration"
import {
  observeScamGuardV2,
  type ScamGuardV2Input,
  type ScamGuardV2Observation,
  type ScamGuardV2ObserveOptions,
} from "@/lib/scamguard/v2/evidence-fusion"
import { activationEligibleSources, assessProviderQuality } from "@/lib/scamguard/v2/provider-quality"

function mewSignal(observation: ScamGuardV2Observation): ScamGuardSignal[] {
  const evidence = observation.evidence.evmThreatCorpus
  if (evidence?.status !== "available" || !evidence.matchedSources.includes("mew-darklist")) return []
  return [{
    code: "V2_EVM_MEW_DARKLIST_MATCH",
    severity: "high",
    title: "Address matched MyEtherWallet Ethereum darklist",
    detail: "The address appears in MyEtherWallet's independently maintained Ethereum address darklist. Tri-Proof requires corroboration from a separate source group before HIGH_RISK activation.",
  }]
}

/**
 * Calibration-only adapter that promotes the independently maintained MEW
 * darklist to its own activation source group. The underlying V2 observation
 * remains observe-only and production decisions are unchanged.
 */
export async function observeCalibratedScamGuardV2(
  input: ScamGuardV2Input,
  options: ScamGuardV2ObserveOptions = {},
): Promise<ScamGuardV2Observation> {
  const observation = await observeScamGuardV2(input, options)
  const corpus = observation.evidence.evmThreatCorpus
  if (!corpus) return observation

  const extraQuality = assessProviderQuality({
    source: "evm-mew-darklist",
    available: corpus.availableSources.includes("mew-darklist"),
    checkedAt: corpus.checkedAt,
  })
  const providerQuality = [
    ...observation.providerQuality.filter((item) => item.source !== "evm-mew-darklist"),
    extraQuality,
  ]
  const proposedSignals = [...observation.proposedSignals, ...mewSignal(observation)]
  const eligibleSources = activationEligibleSources(providerQuality)
  const proposedAssessment = assessV2Corroboration(proposedSignals, {
    activationEligibleSources: eligibleSources,
  })

  return {
    ...observation,
    proposedSignals,
    proposedAssessment,
    providerQuality,
    summary: {
      ...observation.summary,
      providerCount: observation.summary.providerCount + 1,
      availableProviders: observation.summary.availableProviders + (extraQuality.status === "eligible" ? 1 : 0),
      activationEligibleSources: eligibleSources.length,
      proposedSignalCount: proposedSignals.length,
      decisionChanged: false,
    },
  }
}
