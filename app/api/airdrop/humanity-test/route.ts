import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import { ensureAirdropTasks } from "@/lib/airdrop/tasks"

export const runtime = "nodejs"

function scoreFromUserId(userId: string) {
  const seed = [...userId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return 82 + (seed % 13)
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await ensureAirdropTasks(db)

  const [profile, task] = await Promise.all([
    db.airdropProfile.findUnique({ where: { userId: user.id } }),
    db.airdropTask.findUnique({ where: { slug: "humanity-gate-feedback" } }),
  ])

  if (!profile) {
    return NextResponse.json({ error: "Register for the airdrop season before testing Humanity Gate." }, { status: 400 })
  }

  if (!task) return NextResponse.json({ error: "Humanity Gate task is not configured." }, { status: 500 })

  const existing = await db.airdropSubmission.findUnique({
    where: { userId_taskId: { userId: user.id, taskId: task.id } },
  })

  if (existing?.humanityTestResult) {
    return NextResponse.json({ error: "Humanity Gate can only be tested once for this season." }, { status: 409 })
  }

  const score = scoreFromUserId(user.id)
  const result = {
    completedAt: new Date().toISOString(),
    decision: score >= 88 ? "APPROVED" : "MANUAL_REVIEW",
    humanSessionScore: score,
    reasonCodes: ["AIRDROP_ONE_TIME_TEST", "NO_RAW_VIDEO_STORED", "FEEDBACK_REQUIRED"],
  }

  const submission = await db.airdropSubmission.upsert({
    where: { userId_taskId: { userId: user.id, taskId: task.id } },
    update: {
      humanityTestResult: result,
      status: "PENDING",
      pointsAwarded: 0,
      adminNotes: null,
      reviewedAt: null,
      reviewedById: null,
    },
    create: {
      userId: user.id,
      profileId: profile.id,
      taskId: task.id,
      status: "PENDING",
      humanityTestResult: result,
    },
  })

  return NextResponse.json({ result, submissionId: submission.id }, { status: 201 })
}
