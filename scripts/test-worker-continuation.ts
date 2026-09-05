import assert from "node:assert/strict"
import { db } from "@/lib/db/prisma"
import { publicDemoSnapshot } from "@/lib/demo/public-snapshot"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import { recoverStaleAnalysisBatches } from "@/lib/analysis/batch-lease"
import { acquireAnalysisWorkerLock } from "@/lib/analysis/analysis-worker-lock"
import { getAnalysisQueueStatus, processAnalysisQueue } from "@/lib/analysis/queue-optimizer"
import type { WalletEnrichmentResult } from "@/lib/onchain/enrichment-types"

async function main() {
  const database = new URL(process.env.DATABASE_URL!)
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname), "Disposable local database required")
  assert.equal(process.env.E2E_TEST_MODE, "1")
  const origin = "http://127.0.0.1:3116"
  const secret = process.env.WORKER_SECRET
  assert.ok(secret)
  const user = await db.user.create({ data: {
    name: "Worker continuation QA", email: `worker-${crypto.randomUUID()}@example.invalid`, passwordHash: "test-only",
  } })
  const project = await db.project.create({ data: {
    userId: user.id, name: "Disposable worker fixture", chain: "Solana", campaignType: "Airdrop",
  } })
  const analysis = await db.analysis.create({ data: {
    projectId: project.id, status: "processing", analysisMode: "onchain", totalWallets: 5,
  } })
  const terminal = await db.analysis.create({ data: {
    projectId: project.id, status: "failed", analysisMode: "onchain", totalWallets: 1,
  } })
  try {
    const wallets = publicDemoSnapshot.inputs.slice(4, 9)
    await createAnalysisBatches(analysis.id, wallets, 1)
    await createAnalysisBatches(terminal.id, wallets.slice(0, 1), 1)
    // Seed completed provider checkpoints: the worker resumes without RPC calls.
    for (const [index, wallet] of wallets.entries()) {
      const result: WalletEnrichmentResult = {
        status: "completed", provider: "integration-fixture", fromCache: false, errorMessage: null,
        data: {
          ...wallet, provider: "integration-fixture", nativeBalance: wallet.nativeBalance ?? null,
          tokenCount: wallet.tokenCount ?? null, uniqueCounterparties: wallet.uniqueCounterparties ?? null,
          isContract: false, knownEntityLabel: null, knownEntityType: null,
        },
      }
      await db.$executeRaw`UPDATE "AnalysisBatch"
        SET "enrichmentResults" = ${JSON.stringify([{ address: wallet.walletAddress, result }])}::jsonb
        WHERE "analysisId" = ${analysis.id} AND "batchIndex" = ${index}`
    }
    const oldToken = "Worker lease: terminated-fixture"
    await db.$executeRaw`UPDATE "AnalysisBatch" SET "status" = 'processing',
      "errorMessage" = ${oldToken}, "updatedAt" = NOW() - INTERVAL '10 minutes'
      WHERE "analysisId" = ${analysis.id} AND "batchIndex" = 0`
    assert.deepEqual(await recoverStaleAnalysisBatches(analysis.id), { recovered: 1, failed: 0 })
    const staleWrite = await db.$executeRaw`UPDATE "AnalysisBatch" SET "processedCount" = 999
      WHERE "analysisId" = ${analysis.id} AND "batchIndex" = 0
        AND "status" = 'processing' AND "errorMessage" = ${oldToken}`
    assert.equal(staleWrite, 0, "Expired lease must not write")
    assert.equal((await getAnalysisQueueStatus({ activeOnly: true })).pending, 5)
    const lock = await acquireAnalysisWorkerLock(analysis.id)
    assert.equal(lock.acquired, true)
    try {
      const duplicate = await processAnalysisQueue({ analysisId: analysis.id })
      assert.equal(duplicate.workerLockAcquired, false)
      assert.equal(duplicate.processedBatches, 0)
    } finally { await lock.release() }

    assert.equal((await fetch(`${origin}/api/worker/analysis-queue?defer=true`, { method: "POST" })).status, 401)
    const response = await fetch(`${origin}/api/worker/analysis-queue?defer=true`, {
      method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000),
    })
    assert.equal(response.status, 202)
    const deadline = Date.now() + 90_000
    let status: string = "processing"
    while (Date.now() < deadline) {
      status = (await db.analysis.findUniqueOrThrow({ where: { id: analysis.id } })).status
      if (status === "completed" || status === "failed") break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    assert.equal(status, "completed", "Five one-wallet batches must finish across deferred invocations")
    assert.equal(await db.walletAnalysis.count({ where: { analysisId: analysis.id } }), 5)
    assert.equal((await getAnalysisQueueStatus({ activeOnly: true })).pending, 0)
    assert.equal((await getAnalysisQueueStatus({ analysisId: terminal.id })).pending, 1)
    console.log("PASS: authenticated 202 handoff, five batches, stale lease recovery, fencing, duplicate lock, terminal exclusion")
  } finally {
    await db.$executeRaw`DELETE FROM "AnalysisBatch" WHERE "analysisId" IN (${analysis.id}, ${terminal.id})`
    await db.user.delete({ where: { id: user.id } })
    await db.$disconnect()
  }
}

main().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1) })
