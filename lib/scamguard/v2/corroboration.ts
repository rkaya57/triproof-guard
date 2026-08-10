import type { ScamGuardSignal } from "@/lib/scamguard/engine"

export type V2EvidenceFamily = "threat_intelligence" | "identity" | "brand_impersonation" | "authority_surface" | "market_health" | "transaction_impact"
export type V2EvidenceSourceGroup = "phishing.database" | "tokens.xyz" | "local-brand-registry" | "solana-rpc" | "v1-transaction-decoder"

export type V2CorroborationAssessment = {
  mode: "observe_only"
  evidenceScore: number
  proposedRiskLevel: "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"
  confidence: "LOW" | "MEDIUM" | "HIGH"
  independentFamilies: V2EvidenceFamily[]
  independentSources: V2EvidenceSourceGroup[]
  familyScores: Partial<Record<V2EvidenceFamily, number>>
  corroborations: string[]
  activationGate: "insufficient" | "single_strong_source" | "corroborated"
  decisionChanged: false
}

type WeightedSignal = {
  family: V2EvidenceFamily
  weight: number
}

const familyCaps: Record<V2EvidenceFamily, number> = {
  threat_intelligence: 46,
  identity: 40,
  brand_impersonation: 32,
  authority_surface: 16,
  market_health: 14,
  transaction_impact: 24,
}

const sourceForFamily: Record<V2EvidenceFamily, V2EvidenceSourceGroup> = {
  threat_intelligence: "phishing.database",
  identity: "tokens.xyz",
  market_health: "tokens.xyz",
  brand_impersonation: "local-brand-registry",
  authority_surface: "solana-rpc",
  transaction_impact: "v1-transaction-decoder",
}

function weightedSignal(signal: ScamGuardSignal): WeightedSignal | null {
  const code = signal.code ?? ""
  if (code === "V2_ACTIVE_PHISHING_FEED_MATCH") return { family: "threat_intelligence", weight: 46 }
  if (code === "V2_CANONICAL_IDENTITY_MISMATCH") return { family: "identity", weight: 40 }
  if (code === "V2_BRAND_HOMOGLYPH" || code === "V2_BRAND_TYPOSQUAT") return { family: "brand_impersonation", weight: 30 }
  if (code === "V2_BRAND_EMBEDDED_BRAND") return { family: "brand_impersonation", weight: 18 }
  if (code.startsWith("V2_TOKEN2022_")) return { family: "authority_surface", weight: signal.severity === "medium" ? 8 : 4 }
  if (code === "V2_TX_UNLIMITED_APPROVAL") return { family: "transaction_impact", weight: 16 }
  if (code === "V2_TX_AUTHORITY_CONTROL") return { family: "transaction_impact", weight: 14 }
  if (code === "V2_TX_DELEGATE_RIGHTS" || code === "V2_TX_TYPED_AUTHORIZATION") return { family: "transaction_impact", weight: 10 }
  if (code === "V2_TX_ACCOUNT_CLOSURE") return { family: "transaction_impact", weight: 8 }
  if (code === "V2_VERY_LOW_TOKEN_LIQUIDITY" || code === "V2_VERY_LOW_HOLDER_COUNT") return { family: "market_health", weight: 6 }
  if (code === "V2_LOW_TOKEN_LIQUIDITY" || code === "V2_UNUSUAL_VOLUME_TO_LIQUIDITY" || code === "V2_WEAK_MARKET_HEALTH_SCORE") {
    return { family: "market_health", weight: 3 }
  }
  return null
}

function riskLevel(
  score: number,
  independentFamilyCount: number,
  independentSourceCount: number,
): V2CorroborationAssessment["proposedRiskLevel"] {
  // CRITICAL requires convergence across at least three evidence families AND
  // three independently controlled source groups. A single provider cannot
  // manufacture source diversity by emitting multiple evidence families.
  if (score >= 80 && independentFamilyCount >= 3 && independentSourceCount >= 3) return "CRITICAL"
  if (score >= 55) return "HIGH_RISK"
  if (score >= 25) return "CAUTION"
  return "SAFE"
}

export function assessV2Corroboration(signals: ScamGuardSignal[]): V2CorroborationAssessment {
  const familyScores: Partial<Record<V2EvidenceFamily, number>> = {}
  for (const signal of signals) {
    const weighted = weightedSignal(signal)
    if (!weighted) continue
    const next = (familyScores[weighted.family] ?? 0) + weighted.weight
    familyScores[weighted.family] = Math.min(familyCaps[weighted.family], next)
  }

  const families = (Object.keys(familyScores) as V2EvidenceFamily[]).filter((family) => (familyScores[family] ?? 0) > 0)
  const sources = Array.from(new Set(families.map((family) => sourceForFamily[family])))
  const corroborations: string[] = []
  let bonus = 0

  const has = (family: V2EvidenceFamily) => families.includes(family)
  if (has("threat_intelligence") && has("brand_impersonation")) {
    bonus += 20
    corroborations.push("Independent phishing-feed and local brand-impersonation evidence agree on the same scan context.")
  }
  // identity + market_health intentionally receive no corroboration bonus because
  // both originate from Tokens.xyz and therefore are not independent sources.
  if (has("identity") && has("authority_surface")) {
    bonus += 8
    corroborations.push("Canonical identity mismatch is independently corroborated by Solana authority capabilities.")
  }
  if (has("threat_intelligence") && has("transaction_impact")) {
    bonus += 12
    corroborations.push("Independent threat intelligence converges with a high-impact signing capability.")
  }
  if (has("brand_impersonation") && has("transaction_impact")) {
    bonus += 8
    corroborations.push("Local brand-impersonation evidence converges with a high-impact signing capability.")
  }
  if (has("brand_impersonation") && has("threat_intelligence") && has("identity")) {
    bonus += 8
    corroborations.push("Three independently controlled impersonation/threat source groups converge.")
  }

  const baseScore = families.reduce((sum, family) => sum + (familyScores[family] ?? 0), 0)
  const evidenceScore = Math.min(100, baseScore + bonus)
  const strongFamily = families.some((family) => (familyScores[family] ?? 0) >= 38)
  const activationGate: V2CorroborationAssessment["activationGate"] = families.length >= 2 && sources.length >= 2 && evidenceScore >= 55
    ? "corroborated"
    : strongFamily
      ? "single_strong_source"
      : "insufficient"
  const confidence: V2CorroborationAssessment["confidence"] = activationGate === "corroborated"
    ? "HIGH"
    : activationGate === "single_strong_source"
      ? "MEDIUM"
      : "LOW"

  return {
    mode: "observe_only",
    evidenceScore,
    proposedRiskLevel: riskLevel(evidenceScore, families.length, sources.length),
    confidence,
    independentFamilies: families,
    independentSources: sources,
    familyScores,
    corroborations,
    activationGate,
    decisionChanged: false,
  }
}
