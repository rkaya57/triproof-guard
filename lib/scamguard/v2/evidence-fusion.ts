import type { ScamGuardScanInput, ScamGuardScanResult, ScamGuardSignal } from "@/lib/scamguard/engine"
import { scanScamGuard } from "@/lib/scamguard/engine"
import { inspectPhishingDatabase, type PhishingDatabaseEvidence } from "@/lib/scamguard/providers/phishing-database"
import { inspectTokensXyzAsset, type TokensXyzEvidence } from "@/lib/scamguard/providers/tokens-xyz"

export type V2EvidenceSource = "tokens.xyz" | "phishing.database"

export type V2EvidenceProvenance = {
  source: V2EvidenceSource
  status: "available" | "unavailable" | "disabled" | "not_applicable"
  confidence: "low" | "medium" | "high"
  purpose: "market_health" | "canonical_identity" | "threat_intelligence"
  note: string
}

export type ScamGuardV2Observation = {
  mode: "observe_only"
  base: ScamGuardScanResult
  proposedSignals: ScamGuardSignal[]
  evidence: {
    tokensXyz?: TokensXyzEvidence
    phishingDatabase?: PhishingDatabaseEvidence
  }
  provenance: V2EvidenceProvenance[]
  summary: {
    providerCount: number
    availableProviders: number
    proposedSignalCount: number
    decisionChanged: false
  }
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function tokensSignals(evidence: TokensXyzEvidence): ScamGuardSignal[] {
  if (evidence.status !== "available") return []
  const signals: ScamGuardSignal[] = []
  const market = evidence.market
  const risk = evidence.risk

  if (evidence.canonical?.assetId) {
    signals.push({
      code: "V2_CANONICAL_ASSET_RESOLVED",
      severity: "info",
      title: "Canonical Solana asset resolved",
      detail: `Tokens.xyz resolved this mint to ${evidence.canonical.assetId}${evidence.canonical.symbol ? ` (${evidence.canonical.symbol})` : ""}. Canonical identity is supporting evidence, not a safety guarantee.`,
    })
  }

  if (finite(market?.liquidity) && market.liquidity < 1_000) {
    signals.push({
      code: "V2_VERY_LOW_TOKEN_LIQUIDITY",
      severity: "medium",
      title: "Very low token liquidity",
      detail: `Observed market liquidity is approximately $${Math.round(market.liquidity).toLocaleString("en-US")}. Low liquidity increases execution and exit risk but does not by itself prove maliciousness.`,
    })
  } else if (finite(market?.liquidity) && market.liquidity < 10_000) {
    signals.push({
      code: "V2_LOW_TOKEN_LIQUIDITY",
      severity: "low",
      title: "Low token liquidity",
      detail: `Observed market liquidity is approximately $${Math.round(market.liquidity).toLocaleString("en-US")}. Treat this as market-health evidence only.`,
    })
  }

  if (finite(market?.holder) && market.holder < 20) {
    signals.push({
      code: "V2_VERY_LOW_HOLDER_COUNT",
      severity: "medium",
      title: "Very low holder count",
      detail: `Only ${Math.round(market.holder)} holders were reported by the market-intelligence provider. This can indicate an immature or inactive token, not necessarily a scam.`,
    })
  }

  if (finite(market?.volume24hUSD) && finite(market?.liquidity) && market.liquidity > 0 && market.volume24hUSD / market.liquidity > 7) {
    signals.push({
      code: "V2_UNUSUAL_VOLUME_TO_LIQUIDITY",
      severity: "low",
      title: "Unusual volume-to-liquidity ratio",
      detail: `24h volume is more than 7× observed liquidity. This is an anomaly signal that requires corroboration before any maliciousness conclusion.`,
    })
  }

  if (typeof risk?.score === "number" && risk.score < 40 && !risk.hasInsufficientData) {
    signals.push({
      code: "V2_WEAK_MARKET_HEALTH_SCORE",
      severity: "low",
      title: "Weak external market-health score",
      detail: `Tokens.xyz reported market-health score ${Math.round(risk.score)}${risk.grade ? ` / grade ${risk.grade}` : ""}. Tri-Proof treats this as supporting market evidence only.`,
    })
  }

  return signals
}

function phishingSignals(evidence: PhishingDatabaseEvidence): ScamGuardSignal[] {
  if (evidence.status !== "available" || !evidence.matched) return []
  return [{
    code: "V2_ACTIVE_PHISHING_FEED_MATCH",
    severity: "critical",
    title: "Active phishing feed match",
    detail: `${evidence.domain} appears in the active Phishing.Database feed. This is independent threat-intelligence evidence and should be corroborated with Tri-Proof domain and page signals before permanent blocking.`,
  }]
}

export async function observeScamGuardV2(input: ScamGuardScanInput): Promise<ScamGuardV2Observation> {
  const basePromise = scanScamGuard(input)
  const tokenPromise = input.type === "token" && (input.chain === "solana" || input.chain === undefined)
    ? inspectTokensXyzAsset(input.value)
    : Promise.resolve<TokensXyzEvidence | undefined>(undefined)
  const domain = input.type === "url" ? hostFromUrl(input.value) : input.sourceUrl ? hostFromUrl(input.sourceUrl) : null
  const phishingPromise = domain
    ? inspectPhishingDatabase(domain)
    : Promise.resolve<PhishingDatabaseEvidence | undefined>(undefined)

  const [base, tokensXyz, phishingDatabase] = await Promise.all([basePromise, tokenPromise, phishingPromise])
  const proposedSignals = [
    ...(tokensXyz ? tokensSignals(tokensXyz) : []),
    ...(phishingDatabase ? phishingSignals(phishingDatabase) : []),
  ]

  const provenance: V2EvidenceProvenance[] = []
  if (tokensXyz) {
    provenance.push({
      source: "tokens.xyz",
      status: tokensXyz.status,
      confidence: tokensXyz.status === "available" && Boolean(tokensXyz.canonical?.assetId) ? "high" : "low",
      purpose: "canonical_identity",
      note: "Canonical identity and market-health evidence are additive and cannot independently label a token malicious.",
    })
  }
  if (phishingDatabase) {
    provenance.push({
      source: "phishing.database",
      status: phishingDatabase.status,
      confidence: phishingDatabase.status === "available" && phishingDatabase.matched ? "high" : "medium",
      purpose: "threat_intelligence",
      note: "Active-feed matches are strong external evidence but remain subject to false-positive review and corroboration.",
    })
  }

  return {
    mode: "observe_only",
    base,
    proposedSignals,
    evidence: { tokensXyz, phishingDatabase },
    provenance,
    summary: {
      providerCount: provenance.length,
      availableProviders: provenance.filter((entry) => entry.status === "available").length,
      proposedSignalCount: proposedSignals.length,
      decisionChanged: false,
    },
  }
}
