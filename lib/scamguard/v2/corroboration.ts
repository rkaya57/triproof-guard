import type { ScamGuardSignal } from "@/lib/scamguard/engine"

export type V2EvidenceFamily = "threat_intelligence" | "identity" | "brand_impersonation" | "authority_surface" | "market_health"

export type V2CorroborationAssessment = {
  mode: "observe_only"
  evidenceScore: number
  proposedRiskLevel: "SAFE" | "CAUTION" | "HIGH_RISK" | "CRITICAL"
  confidence: "LOW" | "MEDIUM" | "HIGH"
  independentFamilies: V2EvidenceFamily[]
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
}

function weightedSignal(signal: ScamGuardSignal): WeightedSignal | null {
  const code = signal.code ?? ""
  if (code === "V2_ACTIVE_PHISHING_FEED_MATCH") return { family: "threat_intelligence", weight: 46 }
  if (code === "V2_CANONICAL_IDENTITY_MISMATCH") return { family: "identity", weight: 40 }
  if (code === "V2_BRAND_HOMOGLYPH" || code === "V2_BRAND_TYPOSQUAT") return { family: "brand_impersonation", weight: 30 }
  if (code === "V2_BRAND_EMBEDDED_BRAND") return { family: "brand_impersonation", weight: 18 }
  if (code.startsWith("V2_TOKEN2022_")) return { family: "authority_surface", weight: signal.severity === "medium" ? 8 : 4 }
  if (code === "V2_VERY_LOW_TOKEN_LIQUIDITY" || code === "V2_VERY_LOW_HOLDER_COUNT") return { family: "market_health", weight: 6 }
  if (code === "V2_LOW_TOKEN_LIQUIDITY" || code === "V2_UNUSUAL_VOLUME_TO_LIQUIDITY" || code === "V2_WEAK_MARKET_HEALTH_SCORE") {
    return { family: "market_health", weight: 3 }
  }
  return null
}

function riskLevel(score: number): V2CorroborationAssessment["proposedRiskLevel"] {
  if (score >= 80) return "CRITICAL"
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
  const corroborations: string[] = []
  let bonus = 0

  const has = (family: V2EvidenceFamily) => families.includes(family)
  if (has("threat_intelligence") && has("brand_impersonation")) {
    bonus += 20
    corroborations.push("Independent phishing-feed and brand-impersonation evidence agree on the same scan context.")
  }
  if (has("identity") && has("market_health")) {
    bonus += 10
    corroborations.push("Canonical identity mismatch is corroborated by abnormal or weak market-health evidence.")
  }
  if (has("identity") && has("authority_surface")) {
    bonus += 8
    corroborations.push("Canonical identity mismatch coexists with elevated token authority capabilities.")
  }
  if (has("brand_impersonation") && has("threat_intelligence") && has("identity")) {
    bonus += 8
    corroborations.push("Three independent impersonation/threat evidence families converge.")
  }

  const baseScore = families.reduce((sum, family) => sum + (familyScores[family] ?? 0), 0)
  const evidenceScore = Math.min(100, baseScore + bonus)
  const strongFamily = families.some((family) => (familyScores[family] ?? 0) >= 38)
  const activationGate: V2CorroborationAssessment["activationGate"] = families.length >= 2 && evidenceScore >= 55
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
    proposedRiskLevel: riskLevel(evidenceScore),
    confidence,
    independentFamilies: families,
    familyScores,
    corroborations,
    activationGate,
    decisionChanged: false,
  }
}
