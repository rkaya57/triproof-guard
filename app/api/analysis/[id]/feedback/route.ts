import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import type { FeedbackLabel } from "@/types"

export const runtime = "nodejs"

const labels: FeedbackLabel[] = [
  "correct_decision",
  "false_positive",
  "false_negative",
  "confirmed_risk",
  "trusted_user",
  "needs_more_data",
]

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params

  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      select: {
        id: true,
        wallets: {
          where: { status: "manual_review" },
          select: { walletAddress: true },
        },
      },
    })
    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

    const [reviews, events] = await Promise.all([
      db.teamReview.findMany({
        where: { analysisId: id },
        include: { reviewer: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      db.feedbackEvent.findMany({
        where: { analysisId: id },
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
    ])

    const counts = Object.fromEntries(
      labels.map((label) => [label, events.filter((event) => event.label === label).length])
    )

    const reviewedWalletAddresses = new Set(reviews.map((review) => review.walletAddress))
    const pendingReview = analysis.wallets.filter(
      (wallet) => !reviewedWalletAddresses.has(wallet.walletAddress)
    ).length

    return NextResponse.json({
      analysisId: id,
      teamReview: {
        reviewedWallets: reviews.length,
        pendingReview,
        approvedByTeam: reviews.filter((review) => review.finalStatus === "approved").length,
        grayZoneByTeam: reviews.filter((review) => review.finalStatus === "manual_review").length,
        rejectedByTeam: reviews.filter((review) => review.finalStatus === "rejected").length,
      },
      feedback: {
        totalFeedback: events.length,
        counts,
        latest: events.slice(0, 25).map((event) => ({
          walletAddress: event.walletAddress,
          label: event.label,
          originalStatus: event.originalStatus,
          finalStatus: event.finalStatus,
          riskScore: event.riskScore,
          riskLevel: event.riskLevel,
          notes: event.notes,
          createdAt: event.createdAt,
        })),
      },
      latestReviews: reviews.slice(0, 25).map((review) => ({
        walletAddress: review.walletAddress,
        finalStatus: review.finalStatus,
        feedbackLabel: review.feedbackLabel,
        notes: review.notes,
        reviewer: review.reviewer.name,
        updatedAt: review.updatedAt,
      })),
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for feedback summary" }, { status: 503 })
    }
    throw error
  }
}
