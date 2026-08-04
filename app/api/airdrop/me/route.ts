import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import {
  airdropSchemaMissingResponse,
  ensureAirdropTasks,
  isAirdropSchemaMissing,
} from "@/lib/airdrop/tasks"

export const runtime = "nodejs"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    await ensureAirdropTasks(db)

    const [profile, tasks, leaderboard] = await Promise.all([
      db.airdropProfile.findUnique({
        where: { userId: user.id },
        include: {
          submissions: {
            include: { task: true },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      db.airdropTask.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      db.airdropProfile.findMany({
        where: { totalPoints: { gt: 0 } },
        orderBy: [{ totalPoints: "desc" }, { updatedAt: "asc" }],
        take: 50,
        include: {
          user: { select: { id: true, name: true } },
          submissions: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      }),
    ])

    const submissionsByTaskId = new Map(
      (profile?.submissions ?? []).map((submission) => [submission.taskId, submission])
    )
    const approved = profile?.submissions.filter((submission) => submission.status === "APPROVED") ?? []
    const pending = profile?.submissions.filter((submission) => submission.status === "PENDING") ?? []
    const rejected = profile?.submissions.filter((submission) => submission.status === "REJECTED") ?? []

    return NextResponse.json({
      user,
      profile: profile
        ? {
            id: profile.id,
            xHandle: profile.xHandle,
            rewardWallet: profile.rewardWallet,
            totalPoints: profile.totalPoints,
            eligibilityStatus: profile.eligibilityStatus,
            createdAt: profile.createdAt.toISOString(),
          }
        : null,
      summary: {
        seasonPoints: profile?.totalPoints ?? 0,
        approvedCount: approved.length,
        pendingCount: pending.length,
        rejectedCount: rejected.length,
        registered: Boolean(profile),
      },
      leaderboard: leaderboard.map((entry, index) => ({
        rank: index + 1,
        name: entry.user.name,
        xHandle: entry.xHandle,
        totalPoints: entry.totalPoints,
        approvedCount: entry.submissions.length,
        isCurrentUser: entry.userId === user.id,
      })),
      tasks: tasks.map((task) => {
        const submission = submissionsByTaskId.get(task.id)
        return {
          id: task.id,
          slug: task.slug,
          title: task.title,
          description: task.description,
          type: task.type,
          points: task.points,
          proofRequired: task.proofRequired,
          submission: submission
            ? {
                id: submission.id,
                status: submission.status,
                evidenceUrl: submission.evidenceUrl,
                feedbackText: submission.feedbackText,
                humanityTestResult: submission.humanityTestResult,
                pointsAwarded: submission.pointsAwarded,
                adminNotes: submission.adminNotes,
                reviewedAt: submission.reviewedAt?.toISOString() ?? null,
                createdAt: submission.createdAt.toISOString(),
              }
            : null,
        }
      }),
    })
  } catch (error) {
    if (isAirdropSchemaMissing(error)) {
      return NextResponse.json(airdropSchemaMissingResponse(), { status: 503 })
    }

    console.error("Airdrop account load failed", error)
    return NextResponse.json({ error: "Could not load airdrop tasks." }, { status: 500 })
  }
}
