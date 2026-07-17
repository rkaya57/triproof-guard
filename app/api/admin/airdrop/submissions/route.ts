import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import {
  airdropSchemaMissingResponse,
  ensureAirdropTasks,
  isAirdropSchemaMissing,
} from "@/lib/airdrop/tasks"

export const runtime = "nodejs"

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  try {
    await ensureAirdropTasks(db)

    const [submissions, totals] = await Promise.all([
      db.airdropSubmission.findMany({
        include: {
          task: true,
          user: { select: { id: true, name: true, email: true } },
          profile: true,
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      db.airdropSubmission.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ])

    return NextResponse.json({
      totals: totals.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count._all
        return acc
      }, {}),
      submissions: submissions.map((submission) => ({
        id: submission.id,
        status: submission.status,
        evidenceUrl: submission.evidenceUrl,
        evidenceImageData: submission.evidenceImageData,
        feedbackText: submission.feedbackText,
        humanityTestResult: submission.humanityTestResult,
        pointsAwarded: submission.pointsAwarded,
        adminNotes: submission.adminNotes,
        createdAt: submission.createdAt.toISOString(),
        reviewedAt: submission.reviewedAt?.toISOString() ?? null,
        task: {
          slug: submission.task.slug,
          title: submission.task.title,
          type: submission.task.type,
          points: submission.task.points,
        },
        user: submission.user,
        profile: {
          xHandle: submission.profile.xHandle,
          rewardWallet: submission.profile.rewardWallet,
          totalPoints: submission.profile.totalPoints,
          eligibilityStatus: submission.profile.eligibilityStatus,
        },
        reviewedBy: submission.reviewedBy,
      })),
    })
  } catch (error) {
    if (isAirdropSchemaMissing(error)) {
      return NextResponse.json(airdropSchemaMissingResponse(), { status: 503 })
    }

    console.error("Airdrop submissions load failed", error)
    return NextResponse.json({ error: "Could not load airdrop submissions." }, { status: 500 })
  }
}
