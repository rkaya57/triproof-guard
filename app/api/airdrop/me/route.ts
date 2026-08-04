import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import {
  DAILY_THREAT_REPORT_POINTS,
  airdropSchemaMissingResponse,
  ensureAirdropTasks,
  isAirdropSchemaMissing,
} from "@/lib/airdrop/tasks"
import { utcRewardDate } from "@/lib/airdrop/threat-rewards"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return json({ error: "Unauthorized" }, 401)

  try {
    await ensureAirdropTasks(db)
    const today = utcRewardDate(new Date())
    const startOfToday = new Date(`${today}T00:00:00.000Z`)

    const [profile, tasks, submissions, leaderboard, dailyThreatReward, pendingThreatReport] = await Promise.all([
      db.airdropProfile.findUnique({ where: { userId: user.id } }),
      db.airdropTask.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      db.airdropSubmission.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
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
      db.airdropThreatReportReward.findFirst({
        where: { reporterId: user.id, rewardDate: today },
        select: { points: true, creditedAt: true },
      }),
      db.communityThreatReport.findFirst({
        where: { reporterId: user.id, status: "PENDING", createdAt: { gte: startOfToday } },
        select: { id: true },
      }),
    ])

    const submissionsByTaskId = new Map(
      submissions.map((submission) => [submission.taskId, submission])
    )
    const approved = submissions.filter((submission) => submission.status === "APPROVED")
    const pending = submissions.filter((submission) => submission.status === "PENDING")
    const rejected = submissions.filter((submission) => submission.status === "REJECTED")

    return json({
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
      dailyThreatPool: {
        status: dailyThreatReward
          ? dailyThreatReward.creditedAt ? "CREDITED" : "AWAITING_PROFILE"
          : pendingThreatReport ? "PENDING_REVIEW" : "READY",
        points: dailyThreatReward?.points ?? DAILY_THREAT_REPORT_POINTS,
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
          targetUrl: task.targetUrl,
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
      return json(airdropSchemaMissingResponse(), 503)
    }

    console.error("Airdrop account load failed", error)
    return json({ error: "Could not load airdrop tasks." }, 500)
  }
}
