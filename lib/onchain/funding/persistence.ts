import { createHash } from "node:crypto"

import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import type { FundingRelationship } from "@/lib/onchain/funding/relationships"

const RELATIONSHIP_WRITE_BATCH_SIZE = 500

type FundingRelationshipPersistenceClient = Pick<
  Prisma.TransactionClient,
  "campaignFundingRelationship"
>

function persistenceId(analysisRunId: string, relationshipKey: string) {
  return `cfr_${createHash("sha256")
    .update(`${analysisRunId}:${relationshipKey}`)
    .digest("hex")
    .slice(0, 28)}`
}

function jsonSafe(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item) ?? null)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined && typeof nested !== "function" && typeof nested !== "symbol")
        .map(([key, nested]) => [key, jsonSafe(nested)]),
    )
  }
  return null
}

export function buildPersistedFundingRelationshipRows(
  campaignId: string,
  analysisRunId: string,
  relationships: readonly FundingRelationship[],
): Prisma.CampaignFundingRelationshipCreateManyInput[] {
  return relationships.map((relationship) => ({
    id: persistenceId(analysisRunId, relationship.relationshipKey),
    campaignId,
    analysisRunId,
    relationshipKey: relationship.relationshipKey,
    kind: relationship.kind,
    chain: relationship.chain,
    sourceAddress: relationship.sourceAddress,
    targetAddress: relationship.targetAddress,
    viaAddress: relationship.viaAddress,
    hopCount: Math.max(1, Math.min(5, relationship.hopCount)),
    cohortSize: Math.max(1, relationship.cohortSize),
    confidence: Math.max(0, Math.min(100, relationship.confidence)),
    riskBearing: relationship.riskBearing,
    suppressionReason: relationship.suppressionReason,
    evidenceEventKeys: Array.from(new Set(relationship.evidenceEventKeys)).sort(),
    observedAt: relationship.observedAt ? new Date(relationship.observedAt) : null,
    metadata: jsonSafe(relationship.metadata) as Prisma.InputJsonValue,
  }))
}

export async function replaceCampaignFundingRelationships(
  campaignId: string,
  analysisRunId: string,
  relationships: readonly FundingRelationship[],
  client: FundingRelationshipPersistenceClient = db,
) {
  await client.campaignFundingRelationship.deleteMany({
    where: { analysisRunId },
  })

  if (relationships.length === 0) {
    return { attempted: 0, written: 0, deletedStale: true }
  }

  const rows = buildPersistedFundingRelationshipRows(
    campaignId,
    analysisRunId,
    relationships,
  )
  let written = 0

  for (let index = 0; index < rows.length; index += RELATIONSHIP_WRITE_BATCH_SIZE) {
    const result = await client.campaignFundingRelationship.createMany({
      data: rows.slice(index, index + RELATIONSHIP_WRITE_BATCH_SIZE),
      skipDuplicates: true,
    })
    written += result.count
  }

  return { attempted: rows.length, written, deletedStale: true }
}
