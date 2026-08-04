import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import {
  airdropSchemaMissingResponse,
  ensureAirdropTasks,
  isAirdropSchemaMissing,
} from "@/lib/airdrop/tasks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)

  try {
    await ensureAirdropTasks(db)

    const [submissions, totals, totalCount] = await Promise.all([
      db.airdropSubmission.findMany({
        include: {
          task: true,
          user: { select: { id: true, name: true, email: true } },
          profile: true,
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 250,
      }),
      db.airdropSubmission.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      db.airdropSubmission.count(),
    ])

    return json({
      totalCount,
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
      return json(airdropSchemaMissingResponse(), 503)
    }

    console.error("Airdrop submissions load failed", error)
    return json({ error: "Could not load airdrop submissions." }, 500)
  }
}
