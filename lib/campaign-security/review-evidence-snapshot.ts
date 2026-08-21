import type { Prisma } from "@prisma/client"

import { chainAddressKey, normalizeChainAddress } from "@/lib/address-normalization"
import {
  decisionEvidenceForFundingRelationship,
  type FundingDecisionRelationshipInput,
} from "@/lib/campaign-security/funding-provenance-evidence"

export const REVIEW_EVIDENCE_SNAPSHOT_SCHEMA_VERSION =
  "tri-proof-review-evidence-snapshot-v1" as const

const REVIEW_NEUTRAL_SUPPRESSION_REASONS = [
  "trusted_funding_source",
  "neutral_infrastructure_funder",
  "trusted_funding_source_fanout",
  "neutral_infrastructure_fanout",
  "trusted_funding_source_lineage",
  "neutral_infrastructure_lineage",
] as const

export type ReviewWalletContext = {
  walletAddress: string
  chain: string
  status: string
  riskScore: number
  riskLevel: string
  recommendedAction: string
}

export type ReviewCanonicalFundingEvidence = {
  code: string
  effect: string
  title: string
  description: string
  relationshipKey: string
  relationshipKind: FundingDecisionRelationshipInput["kind"]
  relationshipConfidence: number
  cohortSize: number
  hopCount: number
  evidenceEventKeys: string[]
  observedAt: string | null
}

export type ReviewEvidenceSnapshot = {
  schemaVersion: typeof REVIEW_EVIDENCE_SNAPSHOT_SCHEMA_VERSION
  capturedAt: string
  supplementalOnly: true
  decisionContext: {
    status: string
    riskScore: number
    riskLevel: string
    recommendedAction: string
  }
  canonicalFundingEvidence: ReviewCanonicalFundingEvidence[]
  boundary: {
    reviewerActionIsHumanOverride: true
    decisionStateRecomputedFromSnapshot: false
    riskScoreRecomputedFromSnapshot: false
    policyReevaluatedFromSnapshot: false
  }
}

function isoTimestamp(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function relationshipEvidence(
  relationship: FundingDecisionRelationshipInput,
): ReviewCanonicalFundingEvidence | null {
  const evidence = decisionEvidenceForFundingRelationship(relationship)
  if (!evidence) return null

  return {
    code: evidence.code,
    effect: evidence.effect,
    title: evidence.title,
    description: evidence.description,
    relationshipKey: relationship.relationshipKey,
    relationshipKind: relationship.kind,
    relationshipConfidence: relationship.confidence,
    cohortSize: relationship.cohortSize,
    hopCount: relationship.hopCount,
    evidenceEventKeys: [...relationship.evidenceEventKeys],
    observedAt: isoTimestamp(relationship.observedAt),
  }
}

function relationshipWalletKeys(relationship: FundingDecisionRelationshipInput) {
  const keys = [chainAddressKey(relationship.sourceAddress, relationship.chain)]
  if (relationship.kind !== "FUNDED_BY") {
    keys.push(chainAddressKey(relationship.targetAddress, relationship.chain))
  }
  return Array.from(new Set(keys))
}

export function canonicalReviewFundingEvidenceByWallet(
  relationships: readonly FundingDecisionRelationshipInput[],
) {
  const byWallet = new Map<string, ReviewCanonicalFundingEvidence[]>()
  const seen = new Map<string, Set<string>>()

  relationships.forEach((relationship) => {
    const evidence = relationshipEvidence(relationship)
    if (!evidence) return

    relationshipWalletKeys(relationship).forEach((walletKey) => {
      const current = byWallet.get(walletKey) ?? []
      const currentSeen = seen.get(walletKey) ?? new Set<string>()
      const evidenceKey = `${evidence.code}:${evidence.relationshipKey}`
      if (!currentSeen.has(evidenceKey)) {
        current.push(evidence)
        currentSeen.add(evidenceKey)
      }
      byWallet.set(walletKey, current)
      seen.set(walletKey, currentSeen)
    })
  })

  return byWallet
}

export function buildReviewEvidenceSnapshot(
  wallet: ReviewWalletContext,
  evidence: readonly ReviewCanonicalFundingEvidence[],
  capturedAt = new Date(),
): ReviewEvidenceSnapshot {
  return {
    schemaVersion: REVIEW_EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
    capturedAt: capturedAt.toISOString(),
    supplementalOnly: true,
    decisionContext: {
      status: wallet.status,
      riskScore: wallet.riskScore,
      riskLevel: wallet.riskLevel,
      recommendedAction: wallet.recommendedAction,
    },
    canonicalFundingEvidence: [...evidence],
    boundary: {
      reviewerActionIsHumanOverride: true,
      decisionStateRecomputedFromSnapshot: false,
      riskScoreRecomputedFromSnapshot: false,
      policyReevaluatedFromSnapshot: false,
    },
  }
}

function candidateAddresses(wallets: readonly ReviewWalletContext[]) {
  const values = new Set<string>()
  wallets.forEach((wallet) => {
    values.add(wallet.walletAddress.trim())
    values.add(normalizeChainAddress(wallet.walletAddress, wallet.chain))
  })
  return Array.from(values).filter(Boolean)
}

export async function loadReviewEvidenceSnapshots(
  analysisId: string,
  wallets: readonly ReviewWalletContext[],
  tx: Prisma.TransactionClient,
) {
  const addresses = candidateAddresses(wallets)
  const capturedAt = new Date()
  const snapshots = new Map<string, ReviewEvidenceSnapshot>()

  if (wallets.length === 0) return snapshots

  const relationships = addresses.length
    ? await tx.campaignFundingRelationship.findMany({
        where: {
          analysisRunId: analysisId,
          AND: [
            {
              OR: [
                { riskBearing: true },
                { suppressionReason: { in: [...REVIEW_NEUTRAL_SUPPRESSION_REASONS] } },
              ],
            },
            {
              OR: [
                { sourceAddress: { in: addresses } },
                { targetAddress: { in: addresses } },
              ],
            },
          ],
        },
        select: {
          relationshipKey: true,
          kind: true,
          chain: true,
          sourceAddress: true,
          targetAddress: true,
          viaAddress: true,
          hopCount: true,
          cohortSize: true,
          confidence: true,
          riskBearing: true,
          suppressionReason: true,
          evidenceEventKeys: true,
          observedAt: true,
          metadata: true,
        },
        orderBy: [
          { riskBearing: "desc" },
          { cohortSize: "desc" },
          { confidence: "desc" },
          { relationshipKey: "asc" },
        ],
      })
    : []

  const byWallet = canonicalReviewFundingEvidenceByWallet(relationships)
  wallets.forEach((wallet) => {
    const key = chainAddressKey(wallet.walletAddress, wallet.chain)
    snapshots.set(
      key,
      buildReviewEvidenceSnapshot(wallet, byWallet.get(key) ?? [], capturedAt),
    )
  })

  return snapshots
}
