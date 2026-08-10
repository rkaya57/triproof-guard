import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import { inspectGoPlusAddressSecurity, type GoPlusAddressSecurityEvidence } from "@/lib/scamguard/providers/goplus-address-security"
import { assessV2Corroboration } from "@/lib/scamguard/v2/corroboration"
import {
  observeScamGuardV2,
  type ScamGuardV2Input,
  type ScamGuardV2Observation,
  type ScamGuardV2ObserveOptions,
} from "@/lib/scamguard/v2/evidence-fusion"
import { activationEligibleSources, assessProviderQuality } from "@/lib/scamguard/v2/provider-quality"

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/

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

function goplusSignal(evidence: GoPlusAddressSecurityEvidence | undefined): ScamGuardSignal[] {
  if (evidence?.status !== "available" || !evidence.matched) return []
  const behavior = evidence.maliciousBehaviors.slice(0, 4).join(", ")
  return [{
    code: "V2_EVM_GOPLUS_MALICIOUS_ADDRESS",
    severity: "high",
    title: "GoPlus reports explicit malicious address behavior",
    detail: `GoPlus address security reports explicit malicious behavior${behavior ? `: ${behavior}` : ""}. This remains external evidence and requires an independent source group before HIGH_RISK activation.`,
  }]
}

function normalizedCandidate(value?: string) {
  const candidate = value?.trim().toLowerCase() ?? ""
  return evmAddressPattern.test(candidate) ? candidate : null
}

function goplusCandidates(input: ScamGuardV2Input, observation: ScamGuardV2Observation) {
  if (observation.base.metadata.chain !== "evm") return []
  const values: Array<string | undefined> = []
  if (input.type === "wallet" || input.type === "token") values.push(input.value)
  if (input.type === "transaction") {
    values.push(
      observation.base.metadata.decodedIntent?.spender,
      observation.base.metadata.decodedIntent?.contractTarget,
      observation.base.metadata.decodedIntent?.recipient,
    )
  }
  return Array.from(new Set(values.map(normalizedCandidate).filter((value): value is string => Boolean(value)))).slice(0, 2)
}

async function inspectGoPlusCandidates(input: ScamGuardV2Input, observation: ScamGuardV2Observation) {
  const candidates = goplusCandidates(input, observation)
  if (!candidates.length) return undefined
  const results = await Promise.all(candidates.map((address) => inspectGoPlusAddressSecurity(address, "1")))
  return results.find((item) => item.status === "available" && item.matched)
    ?? results.find((item) => item.status === "available")
    ?? results[0]
}

/**
 * Calibration-only adapter that adds independently controlled MEW and GoPlus
 * EVM threat evidence. The underlying V2 observation remains observe-only and
 * production decisions are unchanged.
 */
export async function observeCalibratedScamGuardV2(
  input: ScamGuardV2Input,
  options: ScamGuardV2ObserveOptions = {},
): Promise<ScamGuardV2Observation> {
  const observation = await observeScamGuardV2(input, options)
  const corpus = observation.evidence.evmThreatCorpus
  const extras = [] as ReturnType<typeof assessProviderQuality>[]
  const extraSignals: ScamGuardSignal[] = []

  if (corpus) {
    extras.push(assessProviderQuality({
      source: "evm-mew-darklist",
      available: corpus.availableSources.includes("mew-darklist"),
      checkedAt: corpus.checkedAt,
    }))
    extraSignals.push(...mewSignal(observation))
  }

  const goPlus = await inspectGoPlusCandidates(input, observation)
  if (goPlus) {
    extras.push(assessProviderQuality({
      source: "goplus-address-security",
      available: goPlus.status === "available",
      checkedAt: goPlus.checkedAt,
    }))
    extraSignals.push(...goplusSignal(goPlus))
  }

  if (!extras.length && !extraSignals.length) return observation

  const extraSources = new Set(extras.map((item) => item.source))
  const providerQuality = [
    ...observation.providerQuality.filter((item) => !extraSources.has(item.source)),
    ...extras,
  ]
  const proposedSignals = [...observation.proposedSignals, ...extraSignals]
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
      providerCount: observation.summary.providerCount + extras.length,
      availableProviders: observation.summary.availableProviders + extras.filter((item) => item.status === "eligible").length,
      activationEligibleSources: eligibleSources.length,
      proposedSignalCount: proposedSignals.length,
      decisionChanged: false,
    },
  }
}
