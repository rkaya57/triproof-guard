import type { ScamGuardScanInput, ScamGuardScanResult, ScamGuardSignal } from "@/lib/scamguard/engine"
import { scanScamGuard } from "@/lib/scamguard/engine"
import { inspectPhishingDatabase, type PhishingDatabaseEvidence } from "@/lib/scamguard/providers/phishing-database"
import { inspectToken2022Rpc, type Token2022RpcEvidence } from "@/lib/scamguard/providers/token-2022-rpc"
import {
  inspectTokensXyzAsset,
  resolveTokensXyzReference,
  type TokensXyzEvidence,
  type TokensXyzReferenceEvidence,
} from "@/lib/scamguard/providers/tokens-xyz"
import { compareCanonicalIdentity, type CanonicalIdentityComparison } from "@/lib/scamguard/v2/canonical-identity"

export type V2EvidenceSource = "tokens.xyz" | "phishing.database" | "solana-rpc"
export type ScamGuardV2Input = ScamGuardScanInput & { claimedAsset?: string }

export type V2EvidenceProvenance = {
  source: V2EvidenceSource
  status: "available" | "unavailable" | "disabled" | "not_applicable"
  confidence: "low" | "medium" | "high"
  purpose: "market_health" | "canonical_identity" | "threat_intelligence" | "authority_surface"
  note: string
}

export type ScamGuardV2Observation = {
  mode: "observe_only"
  base: ScamGuardScanResult
  proposedSignals: ScamGuardSignal[]
  evidence: {
    tokensXyz?: TokensXyzEvidence
    claimedTokensXyz?: TokensXyzReferenceEvidence
    canonicalIdentity?: CanonicalIdentityComparison
    phishingDatabase?: PhishingDatabaseEvidence
    token2022?: Token2022RpcEvidence
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
      detail: "24h volume is more than 7× observed liquidity. This is an anomaly signal that requires corroboration before any maliciousness conclusion.",
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

function token2022Signals(evidence: Token2022RpcEvidence): ScamGuardSignal[] {
  if (evidence.status !== "available" || !evidence.isToken2022 || !evidence.inspection) return []
  return evidence.inspection.findings.flatMap((finding) => {
    if (finding.severity === "info") return []
    const severity: ScamGuardSignal["severity"] = finding.severity === "high" ? "medium" : "low"
    return [{
      code: `V2_TOKEN2022_${finding.extension.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`,
      severity,
      title: finding.title,
      detail: `${finding.detail} This is capability evidence only and does not independently imply maliciousness.`,
    }]
  })
}

export async function observeScamGuardV2(input: ScamGuardV2Input): Promise<ScamGuardV2Observation> {
  const basePromise = scanScamGuard(input)
  const isSolanaToken = input.type === "token" && (input.chain === "solana" || input.chain === undefined)
  const tokenPromise = isSolanaToken
    ? inspectTokensXyzAsset(input.value)
    : Promise.resolve<TokensXyzEvidence | undefined>(undefined)
  const claimedAsset = input.claimedAsset?.trim()
  const claimedTokenPromise = isSolanaToken && claimedAsset
    ? resolveTokensXyzReference(claimedAsset)
    : Promise.resolve<TokensXyzReferenceEvidence | undefined>(undefined)
  const token2022Promise = isSolanaToken
    ? inspectToken2022Rpc(input.value)
    : Promise.resolve<Token2022RpcEvidence | undefined>(undefined)
  const domain = input.type === "url" ? hostFromUrl(input.value) : input.sourceUrl ? hostFromUrl(input.sourceUrl) : null
  const phishingPromise = domain
    ? inspectPhishingDatabase(domain)
    : Promise.resolve<PhishingDatabaseEvidence | undefined>(undefined)

  const [base, tokensXyz, claimedTokensXyz, phishingDatabase, token2022] = await Promise.all([
    basePromise,
    tokenPromise,
    claimedTokenPromise,
    phishingPromise,
    token2022Promise,
  ])
  const canonicalIdentity = claimedTokensXyz ? compareCanonicalIdentity(tokensXyz, claimedTokensXyz) : undefined
  const proposedSignals = [
    ...(tokensXyz ? tokensSignals(tokensXyz) : []),
    ...(canonicalIdentity?.signal ? [canonicalIdentity.signal] : []),
    ...(phishingDatabase ? phishingSignals(phishingDatabase) : []),
    ...(token2022 ? token2022Signals(token2022) : []),
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
  if (claimedTokensXyz) {
    provenance.push({
      source: "tokens.xyz",
      status: claimedTokensXyz.status,
      confidence: canonicalIdentity?.status === "mismatch" || canonicalIdentity?.status === "match" ? "high" : "low",
      purpose: "canonical_identity",
      note: canonicalIdentity?.note ?? "Claimed token identity could not be compared.",
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
  if (token2022) {
    provenance.push({
      source: "solana-rpc",
      status: token2022.status,
      confidence: token2022.status === "available" ? "high" : "low",
      purpose: "authority_surface",
      note: token2022.isToken2022
        ? "Token-2022 extension capabilities were inspected through parsed Solana RPC account data; capabilities require corroboration before risk escalation."
        : "Solana RPC account ownership was checked; no Token-2022 extension surface was applicable.",
    })
  }

  return {
    mode: "observe_only",
    base,
    proposedSignals,
    evidence: { tokensXyz, claimedTokensXyz, canonicalIdentity, phishingDatabase, token2022 },
    provenance,
    summary: {
      providerCount: provenance.length,
      availableProviders: provenance.filter((entry) => entry.status === "available").length,
      proposedSignalCount: proposedSignals.length,
      decisionChanged: false,
    },
  }
}
