import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"

import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import { dispatchAnalysisWorker } from "@/lib/analysis/worker-dispatch"
import { parseApiWalletRows } from "@/lib/api/analysis-wallet-input"
import { db } from "@/lib/db/prisma"
import { collectActiveSolanaWallets } from "@/lib/onchain/providers/helius-active-wallets"

export const runtime = "nodejs"
export const maxDuration = 300

const CONFIRMATION =
  "0cd8f2b334de468ca8fdb7e810cd06e79ab7a2567be74cb8a56acb35d60c46f9"
const PROJECT_NAME = "__TRIPROOF_50K_REAL_VALIDATION_V1__"
const TARGET_WALLETS = 50_000
const BATCH_SIZE = 250

function authorized(request: Request) {
  if (process.env.VERCEL_ENV !== "production") return false
  const url = new URL(request.url)
  return url.searchParams.get("confirm") === CONFIRMATION
}

async function existingValidation() {
  return db.analysis.findFirst({
    where: {
      project: { name: PROJECT_NAME },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          notes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

function responseForExisting(
  analysis: NonNullable<Awaited<ReturnType<typeof existingValidation>>>
) {
  return NextResponse.json({
    validation: "existing",
    analysisId: analysis.id,
    status: analysis.status,
    totalWallets: analysis.totalWallets,
    approved: analysis.approvedCount,
    grayZone: analysis.manualReviewCount,
    rejectedOrIneligible: analysis.rejectedCount,
    enrichmentStatus: analysis.enrichmentStatus,
    enrichmentProvider: analysis.enrichmentProvider,
    enrichedWallets: analysis.enrichedWalletCount,
    failedEnrichments: analysis.failedEnrichmentCount,
    createdAt: analysis.createdAt,
    completedAt: analysis.completedAt,
  })
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const existing = await existingValidation()
  if (existing) return responseForExisting(existing)

  const reserved = await db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('triproof-50k-real-validation-v1')
        )
      `

      const duplicate = await tx.analysis.findFirst({
        where: { project: { name: PROJECT_NAME } },
        orderBy: { createdAt: "desc" },
      })
      if (duplicate) return { duplicate }

      const owner = await tx.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
      if (!owner) {
        throw new Error(
          "A workspace user is required before starting the production validation."
        )
      }

      const project = await tx.project.create({
        data: {
          userId: owner.id,
          name: PROJECT_NAME,
          campaignType: "Airdrop",
          chain: "Solana",
          notes: [
            "Internal production validation using 50,000 unique active Solana signers collected from recent public program transactions.",
            "TRIPROOF_RISK_POLICY=balanced",
            "TRIPROOF_CAPACITY_PROFILE=high_volume_screening",
            `TRIPROOF_ANALYSIS_BATCH_SIZE=${BATCH_SIZE}`,
            "TRIPROOF_INTERNAL_VALIDATION=true",
          ].join("\n"),
        },
      })

      const analysis = await tx.analysis.create({
        data: {
          projectId: project.id,
          status: "pending",
          totalWallets: 0,
          csvFileName: "internal-helius-active-wallet-collection.json",
          analysisMode: "onchain",
          enrichmentStatus: "pending",
          enrichmentWarnings: [
            "Active-wallet collection reserved; Helius collection has not completed yet.",
          ],
        },
      })

      return { analysis, project, duplicate: null }
    },
    { maxWait: 30_000, timeout: 60_000 }
  )

  if (reserved.duplicate) {
    const duplicate = await existingValidation()
    return duplicate
      ? responseForExisting(duplicate)
      : NextResponse.json({ error: "Validation reservation conflict" }, { status: 409 })
  }

  const analysisId = reserved.analysis.id
  const projectId = reserved.project.id

  try {
    const collection = await collectActiveSolanaWallets({
      targetCount: TARGET_WALLETS,
    })
    const parsed = parseApiWalletRows(collection.addresses, "Solana")
    if (parsed.wallets.length !== TARGET_WALLETS) {
      throw new Error(
        `Expected ${TARGET_WALLETS.toLocaleString()} valid unique wallets, received ${parsed.wallets.length.toLocaleString()}.`
      )
    }

    await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.project.update({
          where: { id: projectId },
          data: {
            notes: [
              reserved.project.notes,
              `TRIPROOF_COLLECTION_PAGES=${collection.pages}`,
              `TRIPROOF_COLLECTION_TRANSACTIONS=${collection.transactions}`,
              `TRIPROOF_COLLECTION_REQUESTS=${collection.requests}`,
              `TRIPROOF_COLLECTION_RATE_LIMITS=${collection.rateLimits}`,
              `TRIPROOF_COLLECTION_ELAPSED_MS=${collection.elapsedMs}`,
              `TRIPROOF_COLLECTION_SOURCES=${JSON.stringify(collection.programs)}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        })

        await tx.analysis.update({
          where: { id: analysisId },
          data: {
            status: "processing",
            totalWallets: TARGET_WALLETS,
            enrichmentStatus: "pending",
            enrichmentWarnings: [
              `Collected ${TARGET_WALLETS.toLocaleString()} unique active Solana wallets from real public transactions.`,
              `Collection used ${collection.requests.toLocaleString()} Helius request(s) across ${collection.pages.toLocaleString()} page(s).`,
              `Collection elapsed ${collection.elapsedMs.toLocaleString()} ms with ${collection.rateLimits.toLocaleString()} recovered rate-limit response(s).`,
            ],
          },
        })

        await createAnalysisBatches(
          analysisId,
          parsed.wallets,
          BATCH_SIZE,
          tx
        )
      },
      { maxWait: 30_000, timeout: 180_000 }
    )

    dispatchAnalysisWorker({
      analysisId,
      reason: "internal-50k-real-validation",
    })

    return NextResponse.json({
      validation: "started",
      analysisId,
      targetWallets: TARGET_WALLETS,
      batchSize: BATCH_SIZE,
      batchCount: TARGET_WALLETS / BATCH_SIZE,
      collection: {
        pages: collection.pages,
        transactions: collection.transactions,
        requests: collection.requests,
        rateLimits: collection.rateLimits,
        elapsedMs: collection.elapsedMs,
        sources: collection.programs,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.analysis.update({
      where: { id: analysisId },
      data: {
        status: "failed",
        enrichmentStatus: "failed",
        enrichmentWarnings: [
          "50,000-wallet production validation did not start.",
          message.slice(0, 1_500),
        ],
        completedAt: new Date(),
      },
    })

    return NextResponse.json(
      {
        validation: "failed_before_queue",
        analysisId,
        error: message,
      },
      { status: 503 }
    )
  }
}
