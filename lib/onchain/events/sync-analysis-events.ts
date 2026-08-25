import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import type { EnrichedWalletData, WalletEnrichmentResult } from "@/lib/onchain/enrichment-types"
import { normalizedFundingEventsFromEnrichments } from "@/lib/onchain/events/from-enrichment"
import { persistNormalizedOnchainEvents } from "@/lib/onchain/events/persistence"

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
      select: { id: true },
    })
    if (!run) {
      return { attempted: 0, written: 0, skipped: "campaign_analysis_run_missing" as const }
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
    const persisted = await persistNormalizedOnchainEvents(run.id, events, tx)

    return {
      ...persisted,
      skipped: null,
      enrichedWallets: enrichedWallets.length,
    }
  })
}
