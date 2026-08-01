import type { Prisma } from "@prisma/client"

import { parseApiWalletRows } from "@/lib/api/analysis-wallet-input"
import { createAnalysisBatches } from "@/lib/analysis/batch-worker"
import { db } from "@/lib/db/prisma"
import { collectActiveSolanaWallets } from "@/lib/onchain/providers/helius-active-wallets"

const PROJECT_NAME = "__TRIPROOF_50K_REAL_VALIDATION_V1__"
const TARGET_WALLETS = 50_000
const BATCH_SIZE = 250
const LOCK_KEY = "triproof-50k-real-validation-v1"

export type Production50KValidationState = {
  state:
    | "disabled"
    | "not_production"
    | "already_queued"
    | "already_completed"
    | "collecting"
    | "queued"
    | "failed"
  analysisId: string | null
  totalWallets: number
  message: string
  collection?: {
    pages: number
    transactions: number
    requests: number
    rateLimits: number
    elapsedMs: number
    sources: Record<string, number>
  }
}

function disabled() {
  return process.env.TRIPROOF_DISABLE_50K_VALIDATION === "true"
}

function lastWarning(value: unknown) {
  if (!Array.isArray(value)) return null
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const warning = value[index]
    if (typeof warning === "string" && warning.trim()) return warning
  }
  return null
}

async function latestValidation() {
  return db.analysis.findFirst({
    where: { project: { name: PROJECT_NAME } },
    include: {
      project: {
        select: {
          id: true,
          notes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

function existingState(
  analysis: NonNullable<Awaited<ReturnType<typeof latestValidation>>>
): Production50KValidationState | null {
  if (analysis.status === "completed") {
    return {
      state: "already_completed",
      analysisId: analysis.id,
      totalWallets: analysis.totalWallets,
      message: "The one-time 50,000-wallet real-data validation is complete.",
    }
  }

  if (analysis.totalWallets === TARGET_WALLETS) {
    return {
      state: "already_queued",
      analysisId: analysis.id,
      totalWallets: analysis.totalWallets,
      message: `The one-time validation is already ${analysis.status}.`,
    }
  }

  if (analysis.status === "failed") {
    return {
      state: "failed",
      analysisId: analysis.id,
      totalWallets: analysis.totalWallets,
      message:
        lastWarning(analysis.enrichmentWarnings) ??
        "The previous collection attempt failed and requires an operator review.",
    }
  }

  return null
}

async function reserveValidation() {
  return db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS locked
      `
      if (!lock[0]?.locked) {
        return { reserved: false as const, analysis: null }
      }

      const existing = await tx.analysis.findFirst({
        where: { project: { name: PROJECT_NAME } },
        include: { project: true },
        orderBy: { createdAt: "desc" },
      })
      if (existing) {
        return { reserved: true as const, analysis: existing }
      }

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
            "Authorized production worker reserved the 50,000-wallet real-data validation.",
          ],
        },
        include: { project: true },
      })

      return { reserved: true as const, analysis }
    },
    { maxWait: 30_000, timeout: 60_000 }
  )
}

export async function ensureProduction50KValidationQueued(): Promise<Production50KValidationState> {
  if (process.env.VERCEL_ENV !== "production") {
    return {
      state: "not_production",
      analysisId: null,
      totalWallets: 0,
      message: "The real-data validation only runs in production.",
    }
  }

  if (disabled()) {
    return {
      state: "disabled",
      analysisId: null,
      totalWallets: 0,
      message: "The one-time validation is disabled by environment configuration.",
    }
  }

  const before = await latestValidation()
  if (before) {
    const state = existingState(before)
    if (state) return state
  }

  const reservation = await reserveValidation()
  if (!reservation.reserved) {
    return {
      state: "collecting",
      analysisId: before?.id ?? null,
      totalWallets: before?.totalWallets ?? 0,
      message: "Another authorized worker is collecting the validation dataset.",
    }
  }

  const analysis = reservation.analysis
  if (!analysis) {
    throw new Error("Validation reservation returned no analysis record.")
  }
  const postReservationState = existingState(analysis)
  if (postReservationState) return postReservationState

  // If an earlier serverless invocation was terminated while collecting, the
  // reservation remains at zero wallets. A later authorized cron safely
  // restarts collection from public data and reuses the same analysis record.
  try {
    await db.analysis.update({
      where: { id: analysis.id },
      data: {
        status: "pending",
        enrichmentStatus: "processing",
        enrichmentWarnings: [
          "Collecting 50,000 unique active Solana signers from real Helius transaction pages.",
        ],
      },
    })

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
        const locked = await tx.analysis.findUnique({
          where: { id: analysis.id },
          select: { totalWallets: true, status: true, projectId: true },
        })
        if (!locked) throw new Error("Validation analysis disappeared.")
        if (locked.totalWallets === TARGET_WALLETS) return

        await tx.project.update({
          where: { id: locked.projectId },
          data: {
            notes: [
              analysis.project.notes,
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

        await createAnalysisBatches(
          analysis.id,
          parsed.wallets,
          BATCH_SIZE,
          tx
        )

        await tx.analysis.update({
          where: { id: analysis.id },
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
      },
      { maxWait: 30_000, timeout: 180_000 }
    )

    return {
      state: "queued",
      analysisId: analysis.id,
      totalWallets: TARGET_WALLETS,
      message: "50,000 real active Solana wallets were collected and queued.",
      collection: {
        pages: collection.pages,
        transactions: collection.transactions,
        requests: collection.requests,
        rateLimits: collection.rateLimits,
        elapsedMs: collection.elapsedMs,
        sources: collection.programs,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const capabilityFailure =
      /required|cannot use|getTransactionsForAddress|paid Helius|HTTP 401|HTTP 403/i.test(
        message
      )

    await db.analysis.update({
      where: { id: analysis.id },
      data: {
        status: capabilityFailure ? "failed" : "pending",
        enrichmentStatus: capabilityFailure ? "failed" : "pending",
        enrichmentWarnings: [
          capabilityFailure
            ? "The provider capability check failed; operator action is required."
            : "The collection invocation ended before queue creation and will be retried by the next authorized worker run.",
          message.slice(0, 1_500),
        ],
        completedAt: capabilityFailure ? new Date() : null,
      },
    })

    return {
      state: capabilityFailure ? "failed" : "collecting",
      analysisId: analysis.id,
      totalWallets: 0,
      message,
    }
  }
}
