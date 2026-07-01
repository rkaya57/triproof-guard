import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import type { FeedbackLabel, WalletStatus } from "@/types"

export const runtime = "nodejs"

const walletStatuses: WalletStatus[] = ["approved", "manual_review", "rejected"]
const feedbackLabels: FeedbackLabel[] = [
  "correct_decision",
  "false_positive",
  "false_negative",
  "confirmed_risk",
  "trusted_user",
  "needs_more_data",
]

function actionFromStatus(status: WalletStatus) {
  if (status === "approved") return "approve"
  if (status === "rejected") return "reject"
  return "manual_review"
}

function normalizeStatus(value: unknown): WalletStatus | null {
  return walletStatuses.includes(value as WalletStatus) ? (value as WalletStatus) : null
}

function normalizeFeedback(value: unknown): FeedbackLabel | null {
  return feedbackLabels.includes(value as FeedbackLabel) ? (value as FeedbackLabel) : null
}

async function updateAnalysisCounts(tx: Prisma.TransactionClient, analysisId: string) {
  const [approvedCount, manualReviewCount, rejectedCount] = await Promise.all([
    tx.walletAnalysis.count({ where: { analysisId, status: "approved" } }),
    tx.walletAnalysis.count({ where: { analysisId, status: "manual_review" } }),
    tx.walletAnalysis.count({ where: { analysisId, status: "rejected" } }),
  ])

  await tx.analysis.update({
    where: { id: analysisId },
    data: { approvedCount, manualReviewCount, rejectedCount },
  })

  return { approvedCount, manualReviewCount, rejectedCount }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    walletAddresses?: string[]
    finalStatus?: WalletStatus
    feedbackLabel?: FeedbackLabel
    notes?: string
    source?: string
  } | null

  const finalStatus = normalizeStatus(body?.finalStatus)
  if (!finalStatus) {
    return NextResponse.json({ error: "finalStatus must be approved, manual_review, or rejected" }, { status: 400 })
  }

  const addresses = Array.isArray(body?.walletAddresses)
    ? Array.from(new Set(body.walletAddresses.map((address) => String(address).trim()).filter(Boolean)))
    : []

  if (!addresses.length) {
    return NextResponse.json({ error: "walletAddresses is required" }, { status: 400 })
  }

  if (addresses.length > 1000) {
    return NextResponse.json({ error: "Bulk review limit is 1,000 wallets per request" }, { status: 413 })
  }

  const feedbackLabel = normalizeFeedback(body?.feedbackLabel)
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) : null
  const source = typeof body?.source === "string" ? body.source.trim().slice(0, 40) || "dashboard_bulk" : "dashboard_bulk"

  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      select: { id: true },
    })
    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

    const wallets = await db.walletAnalysis.findMany({
      where: { analysisId: id, walletAddress: { in: addresses } },
    })

    if (!wallets.length) {
      return NextResponse.json({ error: "No supplied wallets were found in this analysis" }, { status: 404 })
    }

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const wallet of wallets) {
        const previousStatus = wallet.status
        const statusExplanation = `Team bulk review override: final status set to ${finalStatus.replace("_", " ")}${feedbackLabel ? ` with feedback ${feedbackLabel.replace(/_/g, " ")}` : ""}. Original Tri-Proof status was ${previousStatus.replace("_", " ")}.`

        await tx.walletAnalysis.update({
          where: { id: wallet.id },
          data: {
            status: finalStatus,
            recommendedAction: actionFromStatus(finalStatus),
            statusExplanation,
          },
        })

        await tx.teamReview.upsert({
          where: { analysisId_walletAddress: { analysisId: id, walletAddress: wallet.walletAddress } },
          update: {
            walletAnalysisId: wallet.id,
            reviewerId: user.id,
            previousStatus,
            finalStatus,
            feedbackLabel,
            notes,
            source,
          },
          create: {
            analysisId: id,
            walletAnalysisId: wallet.id,
            walletAddress: wallet.walletAddress,
            reviewerId: user.id,
            previousStatus,
            finalStatus,
            feedbackLabel,
            notes,
            source,
          },
        })

        if (feedbackLabel) {
          await tx.feedbackEvent.create({
            data: {
              analysisId: id,
              walletAnalysisId: wallet.id,
              walletAddress: wallet.walletAddress,
              userId: user.id,
              label: feedbackLabel,
              originalStatus: previousStatus,
              finalStatus,
              riskScore: wallet.riskScore,
              riskLevel: wallet.riskLevel,
              reasonsSnapshot: wallet.reasons,
              notes,
              source,
            },
          })
        }
      }

      const counts = await updateAnalysisCounts(tx, id)
      return { counts }
    })

    return NextResponse.json({
      ok: true,
      reviewedWallets: wallets.length,
      finalStatus,
      feedbackLabel,
      counts: result.counts,
      missingWallets: addresses.filter((address) => !wallets.some((wallet) => wallet.walletAddress === address)),
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for bulk team review" }, { status: 503 })
    }
    throw error
  }
}
