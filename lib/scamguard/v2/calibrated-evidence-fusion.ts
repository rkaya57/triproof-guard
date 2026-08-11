import type { ScamGuardSignal } from "@/lib/scamguard/engine"
import {
  inspectEvmPublicThreatCorpus,
  type EvmPublicThreatCorpusEvidence,
} from "@/lib/scamguard/providers/evm-public-threat-corpus"
import { inspectMetaMaskPhishingConfig } from "@/lib/scamguard/providers/metamask-phishing-config"
import { inspectSourcifyContractVerification } from "@/lib/scamguard/providers/sourcify-contract-verification"
import { assessV2Corroboration } from "@/lib/scamguard/v2/corroboration"
import {
  observeScamGuardV2,
  type ScamGuardV2Input,
  type ScamGuardV2Observation,
  type ScamGuardV2ObserveOptions,
} from "@/lib/scamguard/v2/evidence-fusion"
import { activationEligibleSources, assessProviderQuality } from "@/lib/scamguard/v2/provider-quality"

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/

function mewSignal(evidence: EvmPublicThreatCorpusEvidence | undefined): ScamGuardSignal[] {
  if (evidence?.status !== "available" || !evidence.matchedSources.includes("mew-darklist")) return []
  return [{
    code: "V2_EVM_MEW_DARKLIST_MATCH",
    severity: "high",
    title: "Address matched MyEtherWallet Ethereum darklist",
    detail: "The address appears in MyEtherWallet's independently maintained Ethereum address darklist. Tri-Proof requires corroboration from a separate source group before HIGH_RISK activation.",
  }]
}

function transactionThreatSignals(evidence: EvmPublicThreatCorpusEvidence | undefined): ScamGuardSignal[] {
  if (evidence?.status !== "available" || !evidence.matched) return []
  const signals: ScamGuardSignal[] = []
  if (evidence.matchedSources.includes("real-cats")) signals.push({
    code: "V2_EVM_REAL_CATS_MATCH",
    severity: "high",
    title: "Transaction counterparty matched Real-CATS criminal Ethereum corpus",
    detail: "An EVM transaction counterparty appears in the independently maintained Real-CATS criminal-address corpus. Counterparty intelligence is additive and still requires corroboration before HIGH_RISK activation.",
  })
  if (evidence.matchedSources.includes("rug-pull-dataset")) signals.push({
    code: "V2_EVM_RUG_PULL_MATCH",
    severity: "high",
    title: "Transaction counterparty matched validated rug-pull corpus",
    detail: "An EVM transaction counterparty appears in a public validated rug-pull dataset. The match is independent threat intelligence and does not alter production V1 decisions during calibration.",
  })
  return signals
}

function sourcifyThreatCorroborationSignal(input: {
  status: "available" | "unavailable"
  isContract?: boolean
  verifiedBySourcify?: boolean
  address: string
} | undefined): ScamGuardSignal[] {
  if (!input || input.status !== "available" || input.isContract !== true || input.verifiedBySourcify !== false) return []
  return [{
    code: "V2_EVM_UNVERIFIED_CONTRACT",
    severity: "low",
    title: "Threat-matched contract lacks Sourcify verification record",
    detail: `${input.address} has contract bytecode according to Ethereum RPC, while Sourcify v2 has no verification record for the same address. This is weak contract-integrity context only and is risk-bearing here solely because an independent EVM threat corpus already matched the counterparty.`,
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

function rawEvmTransactionTarget(input: ScamGuardV2Input) {
  if (input.type !== "transaction" || input.chain !== "evm") return null
  try {
    const payload = JSON.parse(input.value) as {
      method?: string
      params?: Array<{
        to?: unknown
        calls?: Array<{ to?: unknown }>
      }>
    }
    const direct = payload.params?.[0]?.to
    if (typeof direct === "string" && evmAddressPattern.test(direct.trim())) return direct.trim().toLowerCase()
    const calls = payload.params?.[0]?.calls
    if (Array.isArray(calls)) {
      for (const call of calls) {
        if (typeof call?.to === "string" && evmAddressPattern.test(call.to.trim())) return call.to.trim().toLowerCase()
      }
    }
  } catch {
    return null
  }
  return null
}

function transactionCounterparty(observation: ScamGuardV2Observation, input: ScamGuardV2Input) {
  if (input.type !== "transaction" || input.chain !== "evm") return null
  const decoded = observation.base.metadata.decodedIntent
  const candidates = [
    decoded?.spender,
    decoded?.recipient,
    rawEvmTransactionTarget(input),
    decoded?.contractTarget,
    observation.base.metadata.contractIntelligence?.target,
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value && evmAddressPattern.test(value)) return value.toLowerCase()
  }
  return null
}

/**
 * Calibration-only adapter using credential-free, open-source intelligence.
 * MEW, Real-CATS and the rug-pull corpus remain independently maintained EVM
 * sources; MetaMask eth-phishing-detect adds an independent URL blacklist.
 * For EVM transactions, decoded counterparties are preferred; when the V1
 * decoder cannot identify one, the raw wallet-request `to` target is queried.
 * Threat-matched contract counterparties receive a second, independent weak
 * integrity check through RPC bytecode + Sourcify v2 verification lookup.
 * Production V1 decisions remain unchanged.
 */
export async function observeCalibratedScamGuardV2(
  input: ScamGuardV2Input,
  options: ScamGuardV2ObserveOptions = {},
): Promise<ScamGuardV2Observation> {
  const observation = await observeScamGuardV2(input, options)
  const counterparty = transactionCounterparty(observation, input)
  const transactionCorpus = counterparty
    ? await inspectEvmPublicThreatCorpus(counterparty)
    : undefined
  const corpus = observation.evidence.evmThreatCorpus ?? transactionCorpus
  const threatMatched = Boolean(transactionCorpus?.status === "available" && transactionCorpus.matched)
  const sourcify = counterparty && threatMatched
    ? await inspectSourcifyContractVerification(counterparty)
    : undefined
  const extras = [] as ReturnType<typeof assessProviderQuality>[]
  const extraSignals: ScamGuardSignal[] = []

  if (transactionCorpus) {
    extras.push(
      assessProviderQuality({
        source: "evm-real-cats",
        available: transactionCorpus.availableSources.includes("real-cats"),
        checkedAt: transactionCorpus.checkedAt,
      }),
      assessProviderQuality({
        source: "evm-rug-pull-dataset",
        available: transactionCorpus.availableSources.includes("rug-pull-dataset"),
        checkedAt: transactionCorpus.checkedAt,
      }),
    )
    extraSignals.push(...transactionThreatSignals(transactionCorpus))
  }

  if (sourcify) {
    extras.push(assessProviderQuality({
      source: "evm-rpc-contract",
      available: sourcify.status === "available",
      checkedAt: sourcify.checkedAt,
    }))
    extraSignals.push(...sourcifyThreatCorroborationSignal(sourcify))
  }

  if (corpus) {
    extras.push(assessProviderQuality({
      source: "evm-mew-darklist",
      available: corpus.availableSources.includes("mew-darklist"),
      checkedAt: corpus.checkedAt,
    }))
    extraSignals.push(...mewSignal(corpus))
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

  if (!extras.length && !extraSignals.length && !transactionCorpus) return observation

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
    evidence: {
      ...observation.evidence,
      evmThreatCorpus: corpus,
    },
    summary: {
      ...observation.summary,
      providerCount: providerQuality.length,
      availableProviders: providerQuality.filter((item) => item.status === "eligible").length,
      activationEligibleSources: eligibleSources.length,
      proposedSignalCount: proposedSignals.length,
      decisionChanged: false,
    },
  }
}
