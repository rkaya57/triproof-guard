import { Prisma } from "@prisma/client"

import { normalizeChainAddress } from "@/lib/address-normalization"
import {
  decisionEvidenceForFundingRelationship,
  type FundingDecisionRelationshipInput,
} from "@/lib/campaign-security/funding-provenance-evidence"
import { db } from "@/lib/db/prisma"

export const CAMPAIGN_DECISION_EVIDENCE_SCHEMA_VERSION =
  "tri-proof-campaign-decision-evidence-v2" as const

const DECISION_EVIDENCE_WRITE_BATCH_SIZE = 500
const DECISION_NEUTRAL_SUPPRESSION_REASONS = [
  "trusted_funding_source",
  "neutral_infrastructure_funder",
  "trusted_funding_source_fanout",
  "neutral_infrastructure_fanout",
  "trusted_funding_source_lineage",
  "neutral_infrastructure_lineage",
] as const

type FundingEvidenceReference = {
  relationshipKey: string
  relationshipKind: FundingDecisionRelationshipInput["kind"]
  relationshipConfidence: number
  cohortSize: number
  hopCount: number
  evidenceEventKeys: string[]
  observedAt: string | null
}

export type PersistedFundingDecisionEvidence = ReturnType<
  typeof persistedFundingEvidenceEntry
>

export type FundingDecisionPersistenceRow = {
  chain: string
  walletAddress: string
  fundingProvenance: PersistedFundingDecisionEvidence[]
}

function isoTimestamp(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function persistedFundingEvidenceEntry(relationship: FundingDecisionRelationshipInput) {
  const evidence = decisionEvidenceForFundingRelationship(relationship)
  if (!evidence) return null

  const reference: FundingEvidenceReference = {
    relationshipKey: relationship.relationshipKey,
    relationshipKind: relationship.kind,
    relationshipConfidence: relationship.confidence,
    cohortSize: relationship.cohortSize,
    hopCount: relationship.hopCount,
    evidenceEventKeys: [...relationship.evidenceEventKeys],
    observedAt: isoTimestamp(relationship.observedAt),
  }

  return {
    ...evidence,
    reference,
    supplementalOnly: true as const,
  }
}

function walletTargets(relationship: FundingDecisionRelationshipInput) {
  const targets = [
    {
      chain: relationship.chain,
      walletAddress: relationship.sourceAddress,
    },
  ]
  if (relationship.kind !== "FUNDED_BY") {
    targets.push({
      chain: relationship.chain,
      walletAddress: relationship.targetAddress,
    })
  }
  return targets
}

function persistenceKey(chain: string, walletAddress: string) {
  const normalizedChain = chain.trim().toLowerCase()
  return `${normalizedChain}:${normalizeChainAddress(walletAddress, chain)}`
}

export function fundingDecisionPersistenceRows(
  relationships: readonly FundingDecisionRelationshipInput[],
): FundingDecisionPersistenceRow[] {
  const rows = new Map<string, FundingDecisionPersistenceRow>()
  const seenEvidence = new Map<string, Set<string>>()

  relationships.forEach((relationship) => {
    const entry = persistedFundingEvidenceEntry(relationship)
    if (!entry) return

    walletTargets(relationship).forEach((target) => {
      const key = persistenceKey(target.chain, target.walletAddress)
      const current = rows.get(key) ?? {
        chain: target.chain,
        walletAddress: target.walletAddress,
        fundingProvenance: [],
      }
      const seen = seenEvidence.get(key) ?? new Set<string>()
      const evidenceKey = `${entry.code}:${entry.reference.relationshipKey}`
      if (!seen.has(evidenceKey)) {
        current.fundingProvenance.push(entry)
        seen.add(evidenceKey)
      }
      rows.set(key, current)
      seenEvidence.set(key, seen)
    })
  })

  return Array.from(rows.values()).sort(
    (left, right) =>
      left.chain.localeCompare(right.chain) ||
      left.walletAddress.localeCompare(right.walletAddress),
  )
}

function jsonRows(rows: FundingDecisionPersistenceRow[]) {
  return JSON.stringify(
    rows.map((row) => ({
      chain: row.chain,
      walletAddress: row.walletAddress,
      fundingProvenance: row.fundingProvenance,
    })),
  )
}

async function resetSupplementalFundingEvidence(
  analysisId: string,
  tx: Prisma.TransactionClient,
) {
  return tx.$executeRaw`
    UPDATE "CampaignDecision"
    SET "evidence" = COALESCE("evidence"->'legacyEvidence', '[]'::jsonb),
        "updatedAt" = NOW()
    WHERE "analysisRunId" = ${analysisId}
      AND jsonb_typeof("evidence") = 'object'
      AND "evidence"->>'schemaVersion' = ${CAMPAIGN_DECISION_EVIDENCE_SCHEMA_VERSION}
  `
}

async function writeFundingDecisionEvidenceBatch(
  analysisId: string,
  rows: FundingDecisionPersistenceRow[],
  tx: Prisma.TransactionClient,
) {
  if (rows.length === 0) return 0
  const payload = jsonRows(rows)

  return tx.$executeRaw`
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(
        "chain" text,
        "walletAddress" text,
        "fundingProvenance" jsonb
      )
    )
    UPDATE "CampaignDecision" AS decision
    SET "evidence" = jsonb_build_object(
          'schemaVersion', ${CAMPAIGN_DECISION_EVIDENCE_SCHEMA_VERSION},
          'legacyEvidence', decision."evidence",
          'fundingProvenance', input."fundingProvenance",
          'boundary', jsonb_build_object(
            'supplementalOnly', true,
            'decisionStateRecomputed', false,
            'riskScoreRecomputed', false,
            'policyReevaluated', false,
            'matchedRulesModified', false
          )
        ),
        "updatedAt" = NOW()
    FROM input
    WHERE decision."analysisRunId" = ${analysisId}
      AND lower(decision."chain") = lower(input."chain")
      AND (
        CASE
          WHEN lower(decision."chain") = 'solana'
            THEN decision."walletAddress" = input."walletAddress"
          ELSE lower(decision."walletAddress") = lower(input."walletAddress")
        END
      )
  `
}

export async function syncCampaignDecisionFundingEvidence(analysisId: string) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const run = await tx.campaignAnalysisRun.findUnique({
      where: { id: analysisId },
      select: { id: true },
    })
    if (!run) {
      return {
        relationshipsRead: 0,
        decisionRowsPrepared: 0,
        decisionsUpdated: 0,
        skipped: "campaign_analysis_run_missing" as const,
      }
    }

    const relationships = await tx.campaignFundingRelationship.findMany({
      where: {
        analysisRunId: analysisId,
        OR: [
          { riskBearing: true },
          { suppressionReason: { in: [...DECISION_NEUTRAL_SUPPRESSION_REASONS] } },
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

    const rows = fundingDecisionPersistenceRows(relationships)
    await resetSupplementalFundingEvidence(analysisId, tx)

    let decisionsUpdated = 0
    for (let index = 0; index < rows.length; index += DECISION_EVIDENCE_WRITE_BATCH_SIZE) {
      decisionsUpdated += await writeFundingDecisionEvidenceBatch(
        analysisId,
        rows.slice(index, index + DECISION_EVIDENCE_WRITE_BATCH_SIZE),
        tx,
      )
    }

    return {
      relationshipsRead: relationships.length,
      decisionRowsPrepared: rows.length,
      decisionsUpdated,
      skipped: null,
    }
  })
}
