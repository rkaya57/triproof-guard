import type { ScamGuardSignal } from "@/lib/scamguard/engine"

export type V2EvidenceFamily = "threat_intelligence" | "evm_criminal_intelligence" | "evm_rugpull_intelligence" | "evm_mew_darklist_intelligence" | "evm_goplus_intelligence" | "contract_integrity" | "identity" | "brand_impersonation" | "authority_surface" | "market_health" | "distribution" | "transaction_impact" | "internal_reputation"
export type V2EvidenceSourceGroup = "phishing.database" | "evm-real-cats" | "evm-rug-pull-dataset" | "evm-mew-darklist" | "goplus-address-security" | "evm-rpc-contract" | "tokens.xyz" | "local-brand-registry" | "solana-rpc" | "v1-transaction-decoder" | "triproof-adjudication"

export type V2CorroborationAssessment = {
  mode: "observe_only"
  evidenceScore: number
  proposedRiskLevel: "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"
  confidence: "LOW" | "MEDIUM" | "HIGH"
  independentFamilies: V2EvidenceFamily[]
  independentSources: V2EvidenceSourceGroup[]
  observedSources?: V2EvidenceSourceGroup[]
  familyScores: Partial<Record<V2EvidenceFamily, number>>
  corroborations: string[]
  activationGate: "insufficient" | "single_strong_source" | "corroborated"
  decisionChanged: false
}

type WeightedSignal = { family: V2EvidenceFamily; weight: number }

const familyCaps: Record<V2EvidenceFamily, number> = {
  threat_intelligence: 46,
  evm_criminal_intelligence: 36,
  evm_rugpull_intelligence: 42,
  evm_mew_darklist_intelligence: 38,
  evm_goplus_intelligence: 42,
  contract_integrity: 14,
  identity: 40,
  brand_impersonation: 32,
  authority_surface: 16,
  market_health: 14,
  distribution: 10,
  transaction_impact: 24,
  internal_reputation: 28,
}

const sourceForFamily: Record<V2EvidenceFamily, V2EvidenceSourceGroup> = {
  threat_intelligence: "phishing.database",
  evm_criminal_intelligence: "evm-real-cats",
  evm_rugpull_intelligence: "evm-rug-pull-dataset",
  evm_mew_darklist_intelligence: "evm-mew-darklist",
  evm_goplus_intelligence: "goplus-address-security",
  contract_integrity: "evm-rpc-contract",
  identity: "tokens.xyz",
  market_health: "tokens.xyz",
  brand_impersonation: "local-brand-registry",
  authority_surface: "solana-rpc",
  distribution: "solana-rpc",
  transaction_impact: "v1-transaction-decoder",
  internal_reputation: "triproof-adjudication",
}

function weightedSignal(signal: ScamGuardSignal): WeightedSignal | null {
  const code = signal.code ?? ""
  if (code === "V2_ACTIVE_PHISHING_FEED_MATCH") return { family: "threat_intelligence", weight: 46 }
  if (code === "V2_EVM_REAL_CATS_MATCH") return { family: "evm_criminal_intelligence", weight: 36 }
  if (code === "V2_EVM_RUG_PULL_MATCH") return { family: "evm_rugpull_intelligence", weight: 42 }
  if (code === "V2_EVM_MEW_DARKLIST_MATCH") return { family: "evm_mew_darklist_intelligence", weight: 38 }
  if (code === "V2_EVM_GOPLUS_MALICIOUS_ADDRESS") return { family: "evm_goplus_intelligence", weight: 42 }
  if (code === "V2_EVM_UNVERIFIED_CONTRACT") return { family: "contract_integrity", weight: 10 }
  if (code === "V2_EVM_PROXY_CONTRACT") return { family: "contract_integrity", weight: 4 }
  if (code === "V2_CANONICAL_IDENTITY_MISMATCH") return { family: "identity", weight: 40 }
  if (code === "V2_BRAND_HOMOGLYPH" || code === "V2_BRAND_TYPOSQUAT") return { family: "brand_impersonation", weight: 30 }
  if (code === "V2_BRAND_EMBEDDED_BRAND") return { family: "brand_impersonation", weight: 18 }
  if (code.startsWith("V2_TOKEN2022_")) return { family: "authority_surface", weight: signal.severity === "medium" ? 8 : 4 }
  if (code === "V2_HIGH_LARGEST_TOKEN_ACCOUNT_CONCENTRATION") return { family: "distribution", weight: 5 }
  if (code === "V2_HIGH_TOP10_TOKEN_ACCOUNT_CONCENTRATION") return { family: "distribution", weight: 5 }
  if (code === "V2_TX_UNLIMITED_APPROVAL") return { family: "transaction_impact", weight: 16 }
  if (code === "V2_TX_AUTHORITY_CONTROL") return { family: "transaction_impact", weight: 14 }
  if (code === "V2_TX_DELEGATE_RIGHTS" || code === "V2_TX_TYPED_AUTHORIZATION") return { family: "transaction_impact", weight: 10 }
  if (code === "V2_TX_ACCOUNT_CLOSURE") return { family: "transaction_impact", weight: 8 }
  if (code === "V2_INTERNAL_CONFIRMED_RISK") return { family: "internal_reputation", weight: 28 }
  if (code === "V2_VERY_LOW_TOKEN_LIQUIDITY" || code === "V2_VERY_LOW_HOLDER_COUNT") return { family: "market_health", weight: 6 }
  if (code === "V2_LOW_TOKEN_LIQUIDITY" || code === "V2_UNUSUAL_VOLUME_TO_LIQUIDITY" || code === "V2_WEAK_MARKET_HEALTH_SCORE") return { family: "market_health", weight: 3 }
  return null
}

function riskLevel(score: number, independentFamilyCount: number, activationEligibleSourceCount: number): V2CorroborationAssessment["proposedRiskLevel"] {
  if (score >= 80 && independentFamilyCount >= 3 && activationEligibleSourceCount >= 3) return "CRITICAL"
  if (score >= 55 && independentFamilyCount >= 2 && activationEligibleSourceCount >= 2) return "HIGH_RISK"
  if (score >= 25) return "CAUTION"
  return "SAFE"
}

export function assessV2Corroboration(signals: ScamGuardSignal[], options?: { activationEligibleSources?: V2EvidenceSourceGroup[] }): V2CorroborationAssessment {
  const familyScores: Partial<Record<V2EvidenceFamily, number>> = {}
  for (const signal of signals) {
    const weighted = weightedSignal(signal)
    if (!weighted) continue
    familyScores[weighted.family] = Math.min(familyCaps[weighted.family], (familyScores[weighted.family] ?? 0) + weighted.weight)
  }

  const families = (Object.keys(familyScores) as V2EvidenceFamily[]).filter((family) => (familyScores[family] ?? 0) > 0)
  const observedSources = Array.from(new Set(families.map((family) => sourceForFamily[family])))
  const eligibleSet = options?.activationEligibleSources ? new Set(options.activationEligibleSources) : new Set(observedSources)
  const sources = observedSources.filter((source) => eligibleSet.has(source))
  const corroborations: string[] = []
  let bonus = 0

  const has = (family: V2EvidenceFamily) => families.includes(family)
  const sourceEligible = (family: V2EvidenceFamily) => eligibleSet.has(sourceForFamily[family])
  const pairEligible = (left: V2EvidenceFamily, right: V2EvidenceFamily) => sourceEligible(left) && sourceEligible(right)

  if (has("threat_intelligence") && has("brand_impersonation") && pairEligible("threat_intelligence", "brand_impersonation")) {
    bonus += 20
    corroborations.push("Independent phishing-feed and local brand-impersonation evidence agree on the same scan context.")
  }

  const evmThreatFamilies = ["evm_criminal_intelligence", "evm_rugpull_intelligence", "evm_mew_darklist_intelligence", "evm_goplus_intelligence"] as const
  let evmThreatPairCorroborated = false
  for (let leftIndex = 0; leftIndex < evmThreatFamilies.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < evmThreatFamilies.length; rightIndex += 1) {
      const left = evmThreatFamilies[leftIndex]
      const right = evmThreatFamilies[rightIndex]
      if (has(left) && has(right) && pairEligible(left, right)) evmThreatPairCorroborated = true
    }
  }
  if (evmThreatPairCorroborated) {
    bonus += 12
    corroborations.push("Two independently controlled EVM threat-intelligence source groups identify the same address.")
  }

  for (const threatFamily of evmThreatFamilies) {
    if (has(threatFamily) && has("contract_integrity") && pairEligible(threatFamily, "contract_integrity")) {
      bonus += 10
      corroborations.push("EVM threat intelligence converges with independently queried contract-integrity evidence.")
      break
    }
  }
  if (has("identity") && has("authority_surface") && pairEligible("identity", "authority_surface")) {
    bonus += 8
    corroborations.push("Canonical identity mismatch is independently corroborated by Solana authority capabilities.")
  }
  if (has("identity") && has("distribution") && pairEligible("identity", "distribution")) {
    bonus += 4
    corroborations.push("Canonical identity mismatch coexists with independently queried Solana account-concentration evidence.")
  }
  if (has("threat_intelligence") && has("transaction_impact") && pairEligible("threat_intelligence", "transaction_impact")) {
    bonus += 12
    corroborations.push("Independent threat intelligence converges with a high-impact signing capability.")
  }
  if (has("brand_impersonation") && has("transaction_impact") && pairEligible("brand_impersonation", "transaction_impact")) {
    bonus += 8
    corroborations.push("Local brand-impersonation evidence converges with a high-impact signing capability.")
  }
  if (has("internal_reputation") && has("threat_intelligence") && pairEligible("internal_reputation", "threat_intelligence")) {
    bonus += 10
    corroborations.push("Independent external threat intelligence corroborates prior human-confirmed Tri-Proof risk adjudication.")
  }
  if (has("internal_reputation") && has("transaction_impact") && pairEligible("internal_reputation", "transaction_impact")) {
    bonus += 8
    corroborations.push("Prior human-confirmed Tri-Proof risk adjudication converges with a high-impact signing capability.")
  }
  if (has("brand_impersonation") && has("threat_intelligence") && has("identity") && sourceEligible("brand_impersonation") && sourceEligible("threat_intelligence") && sourceEligible("identity")) {
    bonus += 8
    corroborations.push("Three independently controlled impersonation/threat source groups converge.")
  }

  const baseScore = families.reduce((sum, family) => sum + (familyScores[family] ?? 0), 0)
  const evidenceScore = Math.min(100, baseScore + bonus)
  const strongFamily = families.some((family) => (familyScores[family] ?? 0) >= 38 && sourceEligible(family))
  const activationGate: V2CorroborationAssessment["activationGate"] = families.length >= 2 && sources.length >= 2 && evidenceScore >= 55
    ? "corroborated"
    : strongFamily ? "single_strong_source" : "insufficient"
  const confidence: V2CorroborationAssessment["confidence"] = activationGate === "corroborated" ? "HIGH" : activationGate === "single_strong_source" ? "MEDIUM" : "LOW"

  return {
    mode: "observe_only",
    evidenceScore,
    proposedRiskLevel: riskLevel(evidenceScore, families.length, sources.length),
    confidence,
    independentFamilies: families,
    independentSources: sources,
    observedSources,
    familyScores,
    corroborations,
    activationGate,
    decisionChanged: false,
  }
}
