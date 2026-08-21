import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import type { EnrichedWalletData, WalletEnrichmentResult } from "@/lib/onchain/enrichment-types"
import { normalizedFundingEventsFromEnrichments } from "@/lib/onchain/events/from-enrichment"
import { extractFundingObservations } from "@/lib/onchain/events/normalize"
import { persistNormalizedOnchainEvents } from "@/lib/onchain/events/persistence"
import {
  buildFundingRelationshipContext,
  type FundingIntelEntry,
} from "@/lib/onchain/funding/intel-context"
import { replaceCampaignFundingRelationships } from "@/lib/onchain/funding/persistence"
import { deriveFundingRelationships } from "@/lib/onchain/funding/relationships"

type BatchEnrichmentRow = {
  enrichmentResults: unknown | null
}

type SerializedResultEntry = {
  address?: unknown
  result?: unknown
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isWalletEnrichmentResult(value: unknown): value is WalletEnrichmentResult {
  if (!value || typeof value !== "object") return false
  const result = value as Partial<WalletEnrichmentResult>
  return Boolean(
    result.data &&
    typeof result.data === "object" &&
    typeof result.provider === "string" &&
    typeof result.status === "string"
  )
}

export function enrichmentDataFromSerializedBatchResults(value: unknown): EnrichedWalletData[] {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed)) return []

  return parsed
    .map((entry) => entry as SerializedResultEntry)
    .map((entry) => entry.result)
    .filter(isWalletEnrichmentResult)
    .filter((result) => result.status === "completed")
    .map((result) => result.data)
}

export async function syncNormalizedFundingEvents(analysisId: string) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const run = await tx.campaignAnalysisRun.findUnique({
      where: { id: analysisId },
      select: { id: true, campaignId: true },
    })
    if (!run) {
      return {
        attempted: 0,
        written: 0,
        relationshipsAttempted: 0,
        relationshipsWritten: 0,
        skipped: "campaign_analysis_run_missing" as const,
      }
    }

    const batches = await tx.$queryRaw<BatchEnrichmentRow[]>`
      SELECT "enrichmentResults"
      FROM "AnalysisBatch"
      WHERE "analysisId" = ${analysisId}
        AND "status" = 'completed'
      ORDER BY "batchIndex" ASC
    `

    const enrichedWallets = batches.flatMap((batch) =>
      enrichmentDataFromSerializedBatchResults(batch.enrichmentResults)
    )
    const events = normalizedFundingEventsFromEnrichments(enrichedWallets)
    const persistedEvents = await persistNormalizedOnchainEvents(run.id, events, tx)

    const fundingObservations = extractFundingObservations(events)
    const fundingIntel = fundingObservations.length > 0
      ? await tx.scamGuardIntelEntry.findMany({
          where: {
            active: true,
            kind: { in: ["WALLET", "EVM_ADDRESS", "SOLANA_ADDRESS"] },
            verdict: { in: ["TRUSTED", "KNOWN_BAD"] },
          },
          select: {
            normalized: true,
            chain: true,
            verdict: true,
            label: true,
          },
        })
      : []
    const graphContext = buildFundingRelationshipContext(
      fundingObservations,
      fundingIntel.map((entry) => ({
        normalized: entry.normalized,
        chain: entry.chain,
        verdict: String(entry.verdict),
        label: entry.label,
      })) as FundingIntelEntry[],
    )

    // Relationship risk semantics remain evidence-first: registry-known
    // infrastructure is neutralized, TRUSTED campaign intelligence suppresses
    // funding fan-out, and KNOWN_BAD intelligence can make otherwise ambiguous
    // direct or lineage evidence risk-bearing.
    const relationships = deriveFundingRelationships(events, graphContext)
    const persistedRelationships = await replaceCampaignFundingRelationships(
      run.campaignId,
      run.id,
      relationships,
      tx,
    )

    return {
      ...persistedEvents,
      relationshipsAttempted: persistedRelationships.attempted,
      relationshipsWritten: persistedRelationships.written,
      skipped: null,
      enrichedWallets: enrichedWallets.length,
    }
  })
}
