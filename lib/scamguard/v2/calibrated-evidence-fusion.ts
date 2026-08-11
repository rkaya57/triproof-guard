import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import { inspectMetaMaskPhishingConfig } from "@/lib/scamguard/providers/metamask-phishing-config"
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

function metaMaskSignal(matched: boolean, domain: string): ScamGuardSignal[] {
  if (!matched) return []
  return [{
    code: "V2_METAMASK_PHISHING_BLACKLIST_MATCH",
    severity: "critical",
    title: "Domain matched MetaMask phishing blacklist",
    detail: `${domain} appears in the open-source MetaMask eth-phishing-detect blacklist. Tri-Proof treats this as independent threat intelligence and still requires corroboration before permanent blocking.`,
  }]
}

function domainCandidate(input: ScamGuardV2Input) {
  const value = input.type === "url" ? input.value : input.sourceUrl
  if (!value?.trim()) return null
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname } catch { return null }
}

/**
 * Calibration-only adapter using credential-free, open-source intelligence.
 * MEW, Real-CATS and the rug-pull corpus remain independently maintained EVM
 * sources; MetaMask eth-phishing-detect adds an independent URL blacklist.
 * Production V1 decisions remain unchanged.
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

  const domain = domainCandidate(input)
  if (domain) {
    const metaMask = await inspectMetaMaskPhishingConfig(domain)
    extras.push(assessProviderQuality({
      source: "metamask-eth-phishing-detect",
      available: metaMask.status === "available",
      checkedAt: metaMask.checkedAt,
    }))
    extraSignals.push(...metaMaskSignal(metaMask.status === "available" && metaMask.matched, metaMask.domain))
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
