import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"

import { db } from "@/lib/db/prisma"
import { finalizeAnalysisIfReady } from "@/lib/analysis/batch-worker"
import type {
  EnrichmentSummary,
  WalletEnrichmentResult,
} from "@/lib/onchain/enrichment-types"
import type { ParsedWallet } from "@/types"

const walletCount = Number.parseInt(process.env.FINALIZER_TEST_WALLETS ?? "50000", 10)
const batchSize = Number.parseInt(process.env.FINALIZER_TEST_BATCH_SIZE ?? "250", 10)

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

function wallet(index: number): ParsedWallet {
  return {
    walletAddress: address(index + 1),
    chain: "Base",
    txCount: 80 + (index % 40),
    walletAgeDays: 365 + (index % 900),
    fundingSource: address(1_000_000 + index),
    firstFundingAt: new Date(Date.UTC(2024, 0, 1 + (index % 300))).toISOString(),
    firstFundingAmount: 0.1 + (index % 10) / 100,
    historyTruncated: false,
    firstSeen: new Date(Date.UTC(2024, 0, 1 + (index % 300))).toISOString(),
    lastSeen: "2026-08-01T00:00:00.000Z",
    totalVolume: 500 + index,
    contractsCount: 10 + (index % 20),
    campaignActionsCount: 1,
    nativeBalance: 1,
    tokenCount: 6,
    uniqueCounterparties: 25 + (index % 50),
    lastActiveDaysAgo: index % 20,
    isContract: false,
    accountType: "system_user_wallet",
    ownerProgram: null,
    behaviorFingerprint: [`program-${index}`, `action-${index}`],
    campaignQualityScore: 90,
    campaignOnlyRatio: 0.04,
    behaviorDiversityScore: 88,
    botScriptScore: 4,
    policyAction: null,
    reputationLabel: null,
    policyReason: null,
    customerLabel: null,
    enrichmentProvider: "integration-fixture",
    enrichmentStatus: "completed",
  }
}

function enrichmentResult(input: ParsedWallet): WalletEnrichmentResult {
  return {
    data: {
      walletAddress: input.walletAddress,
      chain: input.chain,
      provider: "integration-fixture",
      txCount: input.txCount,
      walletAgeDays: input.walletAgeDays,
      firstSeen: input.firstSeen,
      lastSeen: input.lastSeen,
      totalVolume: input.totalVolume,
      nativeBalance: input.nativeBalance ?? null,
      tokenCount: input.tokenCount ?? null,
      contractsCount: input.contractsCount,
      campaignActionsCount: input.campaignActionsCount,
      uniqueCounterparties: input.uniqueCounterparties ?? null,
      fundingSource: input.fundingSource,
      firstFundingAt: input.firstFundingAt ?? null,
      firstFundingAmount: input.firstFundingAmount ?? null,
      historyTruncated: input.historyTruncated ?? null,
      isContract: input.isContract ?? null,
      knownEntityLabel: null,
      knownEntityType: null,
      accountType: input.accountType ?? null,
      ownerProgram: null,
      behaviorFingerprint: input.behaviorFingerprint ?? null,
      campaignQualityScore: input.campaignQualityScore ?? null,
      campaignOnlyRatio: input.campaignOnlyRatio ?? null,
      behaviorDiversityScore: input.behaviorDiversityScore ?? null,
      botScriptScore: input.botScriptScore ?? null,
      rawData: {
        fixture: true,
        enrichmentSchemaVersion: 3,
      },
    },
    status: "completed",
    provider: "integration-fixture",
    fromCache: false,
    errorMessage: null,
  }
}

async function ensureBatchTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AnalysisBatch" (
      "id" TEXT PRIMARY KEY,
      "analysisId" TEXT NOT NULL,
      "batchIndex" INTEGER NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "walletData" JSONB NOT NULL,
      "enrichmentResults" JSONB,
      "enrichmentSummary" JSONB,
      "processedCount" INTEGER NOT NULL DEFAULT 0,
      "failedCount" INTEGER NOT NULL DEFAULT 0,
      "retryCount" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT,
      "startedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "AnalysisBatch_analysisId_batchIndex_key"
      ON "AnalysisBatch"("analysisId", "batchIndex");
    CREATE INDEX IF NOT EXISTS "AnalysisBatch_analysisId_status_idx"
      ON "AnalysisBatch"("analysisId", "status");
  `)
}

async function cleanup(userId: string, analysisId: string) {
  await db.$executeRaw`DELETE FROM "AnalysisBatch" WHERE "analysisId" = ${analysisId}`
  await db.user.delete({ where: { id: userId } }).catch(() => undefined)
}

async function main() {
  assert.ok(walletCount >= 1_000 && walletCount <= 50_000)
  assert.ok(batchSize >= 25 && batchSize <= 1_000)
  await ensureBatchTable()

  const runId = crypto.randomUUID()
  const user = await db.user.create({
    data: {
      name: "50K Finalizer Integration",
      email: `finalizer-${runId}@triproof.invalid`,
      passwordHash: "integration-test-only",
    },
  })
  const project = await db.project.create({
    data: {
      userId: user.id,
      name: `__50K_FINALIZER_TEST__${runId}`,
      campaignType: "Airdrop",
      chain: "Base",
      notes: "TRIPROOF_RISK_POLICY=balanced",
    },
  })
  const analysis = await db.analysis.create({
    data: {
      projectId: project.id,
      status: "processing",
      totalWallets: walletCount,
      csvFileName: "50k-finalizer-integration.json",
      analysisMode: "onchain",
      enrichmentStatus: "processing",
    },
  })

  try {
    const prepareStartedAt = performance.now()
    let batchIndex = 0
    for (let start = 0; start < walletCount; start += batchSize) {
      const count = Math.min(batchSize, walletCount - start)
      const wallets = Array.from({ length: count }, (_, offset) =>
        wallet(start + offset)
      )
      const results = wallets.map((input) => ({
        address: input.walletAddress,
        result: enrichmentResult(input),
      }))
      const summary: EnrichmentSummary = {
        mode: "onchain",
        provider: "integration-fixture",
        enrichedCount: wallets.length,
        failedCount: 0,
        skippedCount: 0,
        cacheHits: 0,
        warnings: [],
        usedMockFallback: false,
      }

      await db.$executeRaw`
        INSERT INTO "AnalysisBatch" (
          "id", "analysisId", "batchIndex", "status", "walletData",
          "enrichmentResults", "enrichmentSummary", "processedCount",
          "failedCount", "retryCount", "completedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${crypto.randomUUID()}, ${analysis.id}, ${batchIndex}, 'completed',
          ${JSON.stringify(wallets)}::jsonb,
          ${JSON.stringify(results)}::jsonb,
          ${JSON.stringify(summary)}::jsonb,
          ${wallets.length}, 0, 0, NOW(), NOW(), NOW()
        )
      `
      batchIndex += 1
    }
    const preparationMs = performance.now() - prepareStartedAt

    const finalizeStartedAt = performance.now()
    const finalized = await finalizeAnalysisIfReady(analysis.id)
    const finalizeMs = performance.now() - finalizeStartedAt
    assert.equal(finalized, true)

    const [updated, walletRows, enrichmentRows, nodeRows, edgeRows] =
      await Promise.all([
        db.analysis.findUniqueOrThrow({ where: { id: analysis.id } }),
        db.walletAnalysis.count({ where: { analysisId: analysis.id } }),
        db.walletEnrichment.count({ where: { analysisId: analysis.id } }),
        db.walletGraphNode.count({ where: { analysisId: analysis.id } }),
        db.walletGraphEdge.count({ where: { analysisId: analysis.id } }),
      ])

    assert.equal(updated.status, "completed")
    assert.equal(updated.totalWallets, walletCount)
    assert.equal(walletRows, walletCount)
    assert.equal(enrichmentRows, walletCount)
    assert.equal(nodeRows, walletCount * 2)
    assert.equal(edgeRows, walletCount)

    console.log(
      JSON.stringify({
        walletCount,
        batchSize,
        batchCount: batchIndex,
        preparationMs: Number(preparationMs.toFixed(1)),
        finalizeMs: Number(finalizeMs.toFixed(1)),
        walletRows,
        enrichmentRows,
        nodeRows,
        edgeRows,
        approved: updated.approvedCount,
        manualReview: updated.manualReviewCount,
        rejected: updated.rejectedCount,
        averageRiskScore: updated.averageRiskScore,
      })
    )
  } finally {
    await cleanup(user.id, analysis.id)
    await db.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect().catch(() => undefined)
  process.exit(1)
})
