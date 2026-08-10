import type { ScamGuardScanInput, ScamGuardScanResult, ScamGuardSignal } from "@/lib/scamguard/engine"
import { scanScamGuard } from "@/lib/scamguard/engine"
import { inspectPhishingDatabase, type PhishingDatabaseEvidence } from "@/lib/scamguard/providers/phishing-database"
import { inspectSolanaDistributionRpc, type SolanaDistributionRpcEvidence } from "@/lib/scamguard/providers/solana-distribution-rpc"
import { inspectToken2022Rpc, type Token2022RpcEvidence } from "@/lib/scamguard/providers/token-2022-rpc"
import {
  inspectTokensXyzAsset,
  resolveTokensXyzReference,
  type TokensXyzEvidence,
  type TokensXyzReferenceEvidence,
} from "@/lib/scamguard/providers/tokens-xyz"
import { detectBrandImpersonation, type BrandImpersonationFinding } from "@/lib/scamguard/v2/brand-impersonation"
import { compareCanonicalIdentity, type CanonicalIdentityComparison } from "@/lib/scamguard/v2/canonical-identity"
import { assessV2Corroboration, type V2CorroborationAssessment } from "@/lib/scamguard/v2/corroboration"
import { buildV2TransactionImpact, type V2TransactionImpact } from "@/lib/scamguard/v2/transaction-impact"
import { transactionImpactSignals } from "@/lib/scamguard/v2/transaction-impact-signals"

export type V2EvidenceSource = "tokens.xyz" | "phishing.database" | "solana-rpc" | "local-brand-registry" | "v1-transaction-decoder"
export type ScamGuardV2Input = ScamGuardScanInput & { claimedAsset?: string }

export type V2EvidenceProvenance = {
  source: V2EvidenceSource
  status: "available" | "unavailable" | "disabled" | "not_applicable"
  confidence: "low" | "medium" | "high"
  purpose: "market_health" | "canonical_identity" | "threat_intelligence" | "authority_surface" | "distribution" | "brand_impersonation" | "transaction_impact"
  note: string
}

export type ScamGuardV2Observation = {
  mode: "observe_only"
  base: ScamGuardScanResult
  proposedSignals: ScamGuardSignal[]
  proposedAssessment: V2CorroborationAssessment
  evidence: {
    tokensXyz?: TokensXyzEvidence
    claimedTokensXyz?: TokensXyzReferenceEvidence
    canonicalIdentity?: CanonicalIdentityComparison
    phishingDatabase?: PhishingDatabaseEvidence
    token2022?: Token2022RpcEvidence
    solanaDistribution?: SolanaDistributionRpcEvidence
    brandImpersonation?: BrandImpersonationFinding[]
    transactionImpact?: V2TransactionImpact
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

function distributionSignals(evidence: SolanaDistributionRpcEvidence): ScamGuardSignal[] {
  if (evidence.status !== "available") return []
  const signals: ScamGuardSignal[] = []
  if (finite(evidence.largestAccountPercent) && evidence.largestAccountPercent >= 50) {
    signals.push({
      code: "V2_HIGH_LARGEST_TOKEN_ACCOUNT_CONCENTRATION",
      severity: "low",
      title: "High concentration in the largest token account",
      detail: `The largest token account holds approximately ${evidence.largestAccountPercent.toFixed(2)}% of supply. Token accounts can represent exchanges, vaults, or liquidity infrastructure, so this is distribution context rather than proof of holder control or maliciousness.`,
    })
  }
  if (finite(evidence.top10AccountPercent) && evidence.top10AccountPercent >= 80) {
    signals.push({
      code: "V2_HIGH_TOP10_TOKEN_ACCOUNT_CONCENTRATION",
      severity: "low",
      title: "High concentration across the ten largest token accounts",
      detail: `The ten largest token accounts hold approximately ${evidence.top10AccountPercent.toFixed(2)}% of supply. This is an account-concentration signal, not a unique-holder measurement, and requires independent corroboration.`,
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

function brandSignals(findings: BrandImpersonationFinding[]): ScamGuardSignal[] {
  return findings.map((finding) => ({
    code: `V2_BRAND_${finding.matchType.toUpperCase()}`,
    severity: finding.confidence === "high" ? "medium" : "low",
    title: finding.matchType === "homoglyph"
      ? "Unicode brand impersonation pattern"
      : finding.matchType === "typosquat"
        ? "Brand typosquatting pattern"
        : "Brand name combined with lure wording",
    detail: `${finding.observedHost} resembles ${finding.brand} but is outside the registered official domains (${finding.officialDomains.join(", ")}). This is local impersonation evidence and requires corroboration for blocking.`,
  }))
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
  const distributionPromise = isSolanaToken
    ? inspectSolanaDistributionRpc(input.value)
    : Promise.resolve<SolanaDistributionRpcEvidence | undefined>(undefined)
  const domainValue = input.type === "url" ? input.value : input.sourceUrl
  const domain = domainValue ? hostFromUrl(domainValue) : null
  const phishingPromise = domain
    ? inspectPhishingDatabase(domain)
    : Promise.resolve<PhishingDatabaseEvidence | undefined>(undefined)
  const brandImpersonation = domainValue ? detectBrandImpersonation(domainValue) : []

  const [base, tokensXyz, claimedTokensXyz, phishingDatabase, token2022, solanaDistribution] = await Promise.all([
    basePromise,
    tokenPromise,
    claimedTokenPromise,
    phishingPromise,
    token2022Promise,
    distributionPromise,
  ])
  const canonicalIdentity = claimedTokensXyz ? compareCanonicalIdentity(tokensXyz, claimedTokensXyz) : undefined
  const transactionImpact = input.type === "transaction" ? buildV2TransactionImpact(base) : undefined
  const proposedSignals = [
    ...(tokensXyz ? tokensSignals(tokensXyz) : []),
    ...(canonicalIdentity?.signal ? [canonicalIdentity.signal] : []),
    ...(phishingDatabase ? phishingSignals(phishingDatabase) : []),
    ...(token2022 ? token2022Signals(token2022) : []),
    ...(solanaDistribution ? distributionSignals(solanaDistribution) : []),
    ...brandSignals(brandImpersonation),
    ...(transactionImpact ? transactionImpactSignals(transactionImpact) : []),
  ]
  const proposedAssessment = assessV2Corroboration(proposedSignals)

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
  if (solanaDistribution) {
    provenance.push({
      source: "solana-rpc",
      status: solanaDistribution.status,
      confidence: solanaDistribution.status === "available" ? "high" : "low",
      purpose: "distribution",
      note: "Largest-account concentration is computed directly from Solana token-account balances. It is not a unique-holder metric and cannot independently imply malicious control.",
    })
  }
  if (domainValue) {
    provenance.push({
      source: "local-brand-registry",
      status: "available",
      confidence: brandImpersonation.some((finding) => finding.confidence === "high") ? "high" : "medium",
      purpose: "brand_impersonation",
      note: brandImpersonation.length
        ? "The observed hostname resembles a protected Web3 brand outside its registered official domains."
        : "No protected-brand homoglyph, typosquat, or lure-domain pattern was observed.",
    })
  }
  if (transactionImpact) {
    provenance.push({
      source: "v1-transaction-decoder",
      status: transactionImpact.status,
      confidence: transactionImpact.confidence === "decoded" ? "high" : transactionImpact.confidence === "partial" ? "medium" : "low",
      purpose: "transaction_impact",
      note: "V2 transaction-impact evidence is normalized from the existing decoded V1 signing analysis; raw signing payloads are not retained by this layer and impact alone cannot trigger HIGH or CRITICAL risk.",
    })
  }

  return {
    mode: "observe_only",
    base,
    proposedSignals,
    proposedAssessment,
    evidence: { tokensXyz, claimedTokensXyz, canonicalIdentity, phishingDatabase, token2022, solanaDistribution, brandImpersonation, transactionImpact },
    provenance,
    summary: {
      providerCount: provenance.length,
      availableProviders: provenance.filter((entry) => entry.status === "available").length,
      proposedSignalCount: proposedSignals.length,
      decisionChanged: false,
    },
  }
}
