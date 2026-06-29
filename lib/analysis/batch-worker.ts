import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { analyzeWallets } from "@/lib/risk-engine"
import { enrichWallets } from "@/lib/onchain/enrich-wallet"
import { mergeEnrichment } from "@/lib/onchain/merge"
import type { AnalysisMode, EnrichmentMeta, ParsedWallet } from "@/types"
import type { EnrichmentSummary, WalletEnrichmentResult } from "@/lib/onchain/enrichment-types"

const MAX_BATCH_RETRIES = 3

type BatchRow = {
  id: string
  analysisId: string
  batchIndex: number
  status: string
  walletData: unknown
  enrichmentResults: unknown | null
  enrichmentSummary: unknown | null
  retryCount: number
}

function toDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  const safeSize = Math.max(1, size)
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize))
  }
  return chunks
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

function resultEntries(results: Map<string, WalletEnrichmentResult>) {
  return Array.from(results.entries()).map(([address, result]) => ({ address, result }))
}

function resultMap(entries: unknown) {
  const map = new Map<string, WalletEnrichmentResult>()
  const parsed = parseJson<Array<{ address: string; result: WalletEnrichmentResult }>>(entries, [])
  parsed.forEach((entry) => {
    if (entry?.address && entry?.result) map.set(entry.address, entry.result)
  })
  return map
}

function mergeSummary(mode: AnalysisMode, summaries: EnrichmentSummary[]): EnrichmentMeta | null {
  if (!summaries.length) return null
  const warnings = new Set<string>()
  const providers = new Set<string>()
  let enrichedCount = 0
  let failedCount = 0
  let skippedCount = 0
  let cacheHits = 0
  let usedMockFallback = false

  summaries.forEach((summary) => {
    enrichedCount += summary.enrichedCount ?? 0
    failedCount += summary.failedCount ?? 0
    skippedCount += summary.skippedCount ?? 0
    cacheHits += summary.cacheHits ?? 0
    usedMockFallback = usedMockFallback || Boolean(summary.usedMockFallback)
    if (summary.provider) providers.add(summary.provider)
    ;(summary.warnings ?? []).forEach((warning) => warnings.add(String(warning)))
  })

  return {
    mode,
    provider: Array.from(providers).join(",") || "unknown",
    enrichedCount,
    failedCount,
    skippedCount,
    cacheHits,
    usedMockFallback,
    warnings: Array.from(warnings),
  }
}

export async function createAnalysisBatches(analysisId: string, wallets: ParsedWallet[], batchSize: number) {
  const chunks = chunkArray(wallets, batchSize)

  for (let index = 0; index < chunks.length; index += 1) {
    await db.$executeRaw`
      INSERT INTO "AnalysisBatch" (
        "id", "analysisId", "batchIndex", "status", "walletData", "createdAt", "updatedAt"
      ) VALUES (
        ${crypto.randomUUID()}, ${analysisId}, ${index}, 'pending', ${JSON.stringify(chunks[index])}::jsonb, NOW(), NOW()
      )
    `
  }

  return chunks.length
}

async function claimNextBatch() {
  const rows = await db.$queryRaw<BatchRow[]>`
    SELECT b.*
    FROM "AnalysisBatch" b
    JOIN "Analysis" a ON a."id" = b."analysisId"
    WHERE b."status" = 'pending'
      AND a."status" IN ('pending', 'processing', 'enriching')
    ORDER BY b."createdAt" ASC, b."batchIndex" ASC
    LIMIT 1
  `
  const batch = rows[0]
  if (!batch) return null

  const claimed = await db.$executeRaw`
    UPDATE "AnalysisBatch"
    SET "status" = 'processing', "startedAt" = NOW(), "updatedAt" = NOW(), "errorMessage" = NULL
    WHERE "id" = ${batch.id} AND "status" = 'pending'
  `
  return claimed === 1 ? batch : null
}

async function openBatchCount(analysisId: string) {
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "AnalysisBatch"
    WHERE "analysisId" = ${analysisId} AND "status" IN ('pending', 'processing')
  `
  return rows[0]?.count ?? 0
}

async function batchesForAnalysis(analysisId: string) {
  return db.$queryRaw<BatchRow[]>`
    SELECT * FROM "AnalysisBatch"
    WHERE "analysisId" = ${analysisId}
    ORDER BY "batchIndex" ASC
  `
}

export async function finalizeAnalysisIfReady(analysisId: string) {
  if ((await openBatchCount(analysisId)) > 0) return false

  const analysis = await db.analysis.findUnique({ where: { id: analysisId }, include: { project: true } })
  if (!analysis || analysis.status === "completed") return false

  const batches = await batchesForAnalysis(analysisId)
  const originalWallets: ParsedWallet[] = []
  const enrichmentResults = new Map<string, WalletEnrichmentResult>()
  const summaries: EnrichmentSummary[] = []

  batches.forEach((batch) => {
    originalWallets.push(...parseJson<ParsedWallet[]>(batch.walletData, []))
    resultMap(batch.enrichmentResults).forEach((result, address) => enrichmentResults.set(address, result))
    const summary = parseJson<EnrichmentSummary | null>(batch.enrichmentSummary, null)
    if (summary) summaries.push(summary)
  })

  const mode = (analysis.analysisMode ?? "onchain") as AnalysisMode
  const enrichmentMeta = mergeSummary(mode, summaries)
  const walletsForAnalysis = enrichmentResults.size
    ? mergeEnrichment(originalWallets, enrichmentResults, mode)
    : originalWallets
  const result = analyzeWallets(walletsForAnalysis, enrichmentMeta)

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.analysis.update({ where: { id: analysisId }, data: { status: "analyzing" } })

    await tx.walletAnalysis.createMany({
      data: result.wallets.map((wallet) => ({
        analysisId,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        entityLabel: wallet.entityLabel,
        entityType: wallet.entityType,
        entityRiskReason: wallet.entityRiskReason,
        riskScore: wallet.riskScore,
        riskLevel: wallet.riskLevel,
        status: wallet.status,
        recommendedAction: wallet.recommendedAction,
        statusExplanation: wallet.statusExplanation,
        fundingSource: wallet.fundingSource,
        txCount: wallet.txCount,
        walletAgeDays: wallet.walletAgeDays,
        totalVolume: wallet.totalVolume,
        contractsCount: wallet.contractsCount,
        campaignActionsCount: wallet.campaignActionsCount,
        clusterId: wallet.clusterId,
        reasons: wallet.reasons,
        firstSeen: toDate(wallet.firstSeen),
        lastSeen: toDate(wallet.lastSeen),
        nativeBalance: wallet.nativeBalance ?? null,
        tokenCount: wallet.tokenCount ?? null,
        uniqueCounterparties: wallet.uniqueCounterparties ?? null,
        lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
        isContract: wallet.isContract ?? null,
        enrichmentProvider: wallet.enrichmentProvider ?? null,
        enrichmentStatus: wallet.enrichmentStatus ?? null,
      })),
    })

    if (enrichmentMeta) {
      await tx.walletEnrichment.createMany({
        data: result.wallets.map((wallet) => ({
          analysisId,
          walletAddress: wallet.walletAddress,
          chain: wallet.chain,
          provider: wallet.enrichmentProvider ?? enrichmentMeta.provider,
          txCount: wallet.txCount,
          walletAgeDays: wallet.walletAgeDays,
          firstSeen: toDate(wallet.firstSeen),
          lastSeen: toDate(wallet.lastSeen),
          totalVolume: wallet.totalVolume,
          nativeBalance: wallet.nativeBalance ?? null,
          tokenCount: wallet.tokenCount ?? null,
          contractsCount: wallet.contractsCount,
          campaignActionsCount: wallet.campaignActionsCount,
          uniqueCounterparties: wallet.uniqueCounterparties ?? null,
          fundingSource: wallet.fundingSource,
          isContract: wallet.isContract ?? null,
          knownEntityLabel: wallet.entityLabel,
          knownEntityType: wallet.entityType,
          enrichmentStatus: wallet.enrichmentStatus ?? "completed",
        })),
      })
    }

    if (result.clusters.length) {
      await tx.cluster.createMany({
        data: result.clusters.map((cluster) => ({
          analysisId,
          clusterLabel: cluster.clusterLabel,
          walletCount: cluster.walletCount,
          averageRiskScore: cluster.averageRiskScore,
          sharedFundingSource: cluster.sharedFundingSource,
          behaviorSimilarityScore: cluster.behaviorSimilarityScore,
          suggestedAction: cluster.suggestedAction,
          reasons: cluster.reasons,
        })),
      })
    }

    await tx.analysis.update({
      where: { id: analysisId },
      data: {
        status: "completed",
        totalWallets: result.totalWallets,
        approvedCount: result.approvedCount,
        manualReviewCount: result.manualReviewCount,
        rejectedCount: result.rejectedCount,
        averageRiskScore: result.averageRiskScore,
        suspiciousClustersCount: result.clusters.length,
        enrichmentStatus: enrichmentMeta ? "completed" : null,
        enrichmentProvider: enrichmentMeta?.provider ?? null,
        enrichedWalletCount: enrichmentMeta?.enrichedCount ?? 0,
        failedEnrichmentCount: enrichmentMeta?.failedCount ?? 0,
        cacheHitCount: enrichmentMeta?.cacheHits ?? 0,
        usedMockFallback: enrichmentMeta?.usedMockFallback ?? false,
        enrichmentWarnings: enrichmentMeta?.warnings ?? [],
        enrichedAt: enrichmentMeta ? new Date() : null,
        completedAt: new Date(),
      },
    })
  })

  return true
}

export async function processNextAnalysisBatch() {
  const batch = await claimNextBatch()
  if (!batch) return { processed: false, status: "idle", message: "No pending analysis batch." }

  const analysis = await db.analysis.findUnique({ where: { id: batch.analysisId }, include: { project: true } })
  if (!analysis) return { processed: true, status: "failed", message: "Analysis not found." }

  const wallets = parseJson<ParsedWallet[]>(batch.walletData, [])
  const mode = (analysis.analysisMode ?? "onchain") as AnalysisMode

  try {
    await db.analysis.update({ where: { id: analysis.id }, data: { status: "enriching", enrichmentStatus: "processing" } })
    const { results, summary } = await enrichWallets({
      addresses: wallets.map((wallet) => wallet.walletAddress),
      chain: analysis.project.chain,
      mode,
    })

    await db.$executeRaw`
      UPDATE "AnalysisBatch"
      SET "status" = 'completed',
          "processedCount" = ${wallets.length},
          "failedCount" = ${summary.failedCount},
          "enrichmentResults" = ${JSON.stringify(resultEntries(results))}::jsonb,
          "enrichmentSummary" = ${JSON.stringify(summary)}::jsonb,
          "completedAt" = NOW(),
          "updatedAt" = NOW(),
          "errorMessage" = NULL
      WHERE "id" = ${batch.id}
    `

    const completed = await finalizeAnalysisIfReady(batch.analysisId)
    return { processed: true, status: completed ? "completed" : "processed", analysisId: batch.analysisId, batchId: batch.id, message: completed ? "Analysis completed." : "Batch processed." }
  } catch (error) {
    const nextRetryCount = (batch.retryCount ?? 0) + 1
    const retrying = nextRetryCount < MAX_BATCH_RETRIES
    const message = error instanceof Error ? error.message : "Unknown batch error"

    await db.$executeRaw`
      UPDATE "AnalysisBatch"
      SET "status" = ${retrying ? "pending" : "failed"},
          "retryCount" = ${nextRetryCount},
          "errorMessage" = ${message},
          "updatedAt" = NOW()
      WHERE "id" = ${batch.id}
    `

    if (!retrying) await finalizeAnalysisIfReady(batch.analysisId)
    return { processed: true, status: retrying ? "retrying" : "failed", analysisId: batch.analysisId, batchId: batch.id, message }
  }
}
