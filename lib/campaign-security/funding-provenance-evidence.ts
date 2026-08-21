import { chainAddressKey } from "@/lib/address-normalization"
import type {
  AnalysisDetail,
  DecisionEvidenceItem,
  WalletRiskResult,
} from "@/types"

export type FundingDecisionRelationshipInput = {
  relationshipKey: string
  kind: "FUNDED_BY" | "SAME_FUNDER" | "SAME_FUNDING_LINEAGE"
  chain: string
  sourceAddress: string
  targetAddress: string
  viaAddress: string | null
  hopCount: number
  cohortSize: number
  confidence: number
  riskBearing: boolean
  suppressionReason: string | null
  evidenceEventKeys: string[]
  observedAt: Date | string | null
  metadata: unknown
}

const neutralSuppressionReasons = new Set([
  "trusted_funding_source",
  "neutral_infrastructure_funder",
  "trusted_funding_source_fanout",
  "neutral_infrastructure_fanout",
  "trusted_funding_source_lineage",
  "neutral_infrastructure_lineage",
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function shortAddress(address: string | null) {
  if (!address) return "unknown address"
  if (address.length <= 18) return address
  return `${address.slice(0, 9)}…${address.slice(-7)}`
}

function percentage(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "unknown"
}

function hours(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Number(number.toFixed(1))}h` : "unknown"
}

function supplementalBoundary() {
  return "This is supplemental canonical provenance; the stored decision, risk score, and policy result were not recomputed from this relationship."
}

function neutralEvidence(
  relationship: FundingDecisionRelationshipInput,
): DecisionEvidenceItem | null {
  if (!relationship.suppressionReason || !neutralSuppressionReasons.has(relationship.suppressionReason)) {
    return null
  }

  const trusted = relationship.suppressionReason.startsWith("trusted_")
  const via = relationship.viaAddress ??
    (relationship.kind === "FUNDED_BY" ? relationship.targetAddress : null)
  const relationshipLabel =
    relationship.kind === "FUNDED_BY"
      ? "direct funding"
      : relationship.kind === "SAME_FUNDER"
        ? "shared-funder"
        : "multi-hop funding-lineage"

  return {
    code: trusted
      ? "CANONICAL_TRUSTED_FUNDING_SUPPRESSED"
      : "CANONICAL_INFRASTRUCTURE_FUNDING_SUPPRESSED",
    family: "funding",
    effect: "neutralizing_context",
    title: trusted ? "Trusted funding source suppressed" : "Infrastructure funding suppressed",
    description: `Canonical ${relationshipLabel} evidence points through ${shortAddress(via)}, but the source is recognized as ${trusted ? "trusted campaign funding" : "exchange/bridge/protocol/service infrastructure"} and is explicitly prevented from becoming Sybil risk by itself. ${supplementalBoundary()}`,
    source: "graph",
  }
}

function riskEvidence(
  relationship: FundingDecisionRelationshipInput,
): DecisionEvidenceItem | null {
  if (!relationship.riskBearing) return null

  const metadata = record(relationship.metadata)
  const knownBad = metadata.knownBadFundingSource === true

  if (relationship.kind === "FUNDED_BY") {
    if (!knownBad) return null
    return {
      code: "CANONICAL_KNOWN_BAD_FUNDER",
      family: "funding",
      effect: "risk_signal",
      title: "Canonical known-bad funding provenance",
      description: `Provider-backed first-funding provenance links this wallet to known-bad source ${shortAddress(relationship.targetAddress)} with ${relationship.confidence}% relationship confidence. ${supplementalBoundary()}`,
      source: "graph",
    }
  }

  if (relationship.kind === "SAME_FUNDER") {
    if (knownBad) {
      return {
        code: "CANONICAL_KNOWN_BAD_SHARED_FUNDER",
        family: "funding",
        effect: "risk_signal",
        title: "Known-bad shared funding origin",
        description: `This wallet is part of a ${relationship.cohortSize}-wallet cohort sharing known-bad funding source ${shortAddress(relationship.viaAddress)} with ${relationship.confidence}% relationship confidence. ${supplementalBoundary()}`,
        source: "graph",
      }
    }

    if (metadata.burstFunding === true) {
      return {
        code: "CANONICAL_BURST_FUNDING_COHORT",
        family: "funding",
        effect: "corroborating_signal",
        title: "Canonical burst-funding cohort",
        description: `This wallet is part of a ${relationship.cohortSize}-wallet cohort sharing ${shortAddress(relationship.viaAddress)} as a funding origin. Funding timestamps cover ${percentage(metadata.fundingTimestampCoverage)} of the cohort within an observed ${hours(metadata.fundingSpreadHours)} spread, satisfying the existing burst-funding corroboration rule. ${supplementalBoundary()}`,
        source: "graph",
      }
    }

    return null
  }

  if (!knownBad) return null
  return {
    code: "CANONICAL_KNOWN_BAD_FUNDING_LINEAGE",
    family: "funding",
    effect: "risk_signal",
    title: "Known-bad funding lineage",
    description: `Canonical funding provenance links this wallet to a ${relationship.cohortSize}-wallet cohort sharing known-bad ancestor ${shortAddress(relationship.viaAddress)} within ${relationship.hopCount} funding hop${relationship.hopCount === 1 ? "" : "s"}, at ${relationship.confidence}% relationship confidence. ${supplementalBoundary()}`,
    source: "graph",
  }
}

export function decisionEvidenceForFundingRelationship(
  relationship: FundingDecisionRelationshipInput,
): DecisionEvidenceItem | null {
  return neutralEvidence(relationship) ?? riskEvidence(relationship)
}

function relationshipWalletKeys(relationship: FundingDecisionRelationshipInput) {
  const keys = [chainAddressKey(relationship.sourceAddress, relationship.chain)]
  if (relationship.kind !== "FUNDED_BY") {
    keys.push(chainAddressKey(relationship.targetAddress, relationship.chain))
  }
  return Array.from(new Set(keys))
}

function relationshipPriority(left: FundingDecisionRelationshipInput, right: FundingDecisionRelationshipInput) {
  if (left.riskBearing !== right.riskBearing) return left.riskBearing ? -1 : 1
  if (left.cohortSize !== right.cohortSize) return right.cohortSize - left.cohortSize
  if (left.confidence !== right.confidence) return right.confidence - left.confidence
  return left.hopCount - right.hopCount
}

export function fundingDecisionEvidenceByWallet(
  relationships: readonly FundingDecisionRelationshipInput[],
) {
  const byWallet = new Map<string, DecisionEvidenceItem[]>()

  ;[...relationships]
    .sort(relationshipPriority)
    .forEach((relationship) => {
      const evidence = decisionEvidenceForFundingRelationship(relationship)
      if (!evidence) return

      relationshipWalletKeys(relationship).forEach((walletKey) => {
        const current = byWallet.get(walletKey) ?? []
        const duplicate = current.some(
          (item) =>
            item.code === evidence.code &&
            item.family === evidence.family &&
            item.effect === evidence.effect,
        )
        if (!duplicate) byWallet.set(walletKey, [...current, evidence])
      })
    })

  return byWallet
}

function mergeSupplementalEvidence(
  wallet: WalletRiskResult,
  supplemental: readonly DecisionEvidenceItem[],
): WalletRiskResult {
  if (!wallet.decisionEvidence || supplemental.length === 0) return wallet

  const existing = wallet.decisionEvidence.evidence
  const seen = new Set(existing.map((item) => `${item.code}:${item.family}:${item.effect}`))
  const additions = supplemental.filter((item) => {
    const key = `${item.code}:${item.family}:${item.effect}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (additions.length === 0) return wallet

  return {
    ...wallet,
    decisionEvidence: {
      ...wallet.decisionEvidence,
      // Supplemental canonical provenance is intentionally appended after the
      // engine decision is built. It must not change evidenceConfidence or the
      // independent risk-family count used to explain the stored decision.
      evidenceFamilies: Array.from(
        new Set([
          ...wallet.decisionEvidence.evidenceFamilies,
          ...additions.map((item) => item.family),
        ]),
      ),
      evidence: [...existing, ...additions],
    },
  }
}

export function attachFundingProvenanceDecisionEvidence(
  analysis: AnalysisDetail,
  relationships: readonly FundingDecisionRelationshipInput[],
): AnalysisDetail {
  if (relationships.length === 0) return analysis
  const byWallet = fundingDecisionEvidenceByWallet(relationships)

  return {
    ...analysis,
    wallets: analysis.wallets.map((wallet) =>
      mergeSupplementalEvidence(
        wallet,
        byWallet.get(chainAddressKey(wallet.walletAddress, wallet.chain)) ?? [],
      ),
    ),
  }
}
