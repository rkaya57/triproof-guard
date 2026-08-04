import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import {
  ensureAirdropTasks,
  isLikelyUrl,
  isSubmissionLocked,
  isValidEvidenceImage,
} from "@/lib/airdrop/tasks"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    taskSlug?: string
    evidenceUrl?: string
    evidenceImageData?: string
    feedbackText?: string
  } | null

  const taskSlug = body?.taskSlug?.trim()
  if (!taskSlug) return NextResponse.json({ error: "taskSlug is required" }, { status: 400 })

  await ensureAirdropTasks(db)

  const [profile, task] = await Promise.all([
    db.airdropProfile.findUnique({ where: { userId: user.id } }),
    db.airdropTask.findUnique({ where: { slug: taskSlug } }),
  ])

  if (!profile) {
    return NextResponse.json({ error: "Create your airdrop registration profile before submitting tasks." }, { status: 400 })
  }
  if (!task || !task.active) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  const evidenceUrl = body?.evidenceUrl?.trim() || null
  const evidenceImageData = body?.evidenceImageData?.trim() || null
  const feedbackText = body?.feedbackText?.trim() || null

  if (task.type === "X_QUOTE") {
    if (!evidenceUrl || !isLikelyUrl(evidenceUrl) || !/x\.com|twitter\.com/i.test(evidenceUrl)) {
      return NextResponse.json({ error: "Submit a valid X quote URL." }, { status: 400 })
    }
  }

  if (task.proofRequired && !isValidEvidenceImage(evidenceImageData)) {
    return NextResponse.json({ error: "Upload a screenshot proof image under 1.75 MB." }, { status: 400 })
  }

  if (evidenceImageData && !isValidEvidenceImage(evidenceImageData)) {
    return NextResponse.json({ error: "Screenshot proof must be an image under 1.75 MB." }, { status: 400 })
  }

  if (task.type === "HUMANITY_GATE_FEEDBACK") {
    const existing = await db.airdropSubmission.findUnique({
      where: { userId_taskId: { userId: user.id, taskId: task.id } },
    })
    if (!existing?.humanityTestResult) {
      return NextResponse.json({ error: "Run the one-time ScamGuard test before sending feedback." }, { status: 400 })
    }
    if (!feedbackText || feedbackText.length < 20) {
      return NextResponse.json({ error: "Write at least 20 characters of ScamGuard feedback." }, { status: 400 })
    }
  }

  const current = await db.airdropSubmission.findUnique({
    where: { userId_taskId: { userId: user.id, taskId: task.id } },
  })

  if (isSubmissionLocked(current?.status)) {
    const error =
      current?.status === "APPROVED"
        ? "This task is already approved and cannot earn points again."
        : "This task already has a submission pending review."
    return NextResponse.json({ error }, { status: 409 })
  }

  if (task.type === "HUMANITY_GATE_FEEDBACK" && current?.feedbackText) {
    return NextResponse.json({ error: "ScamGuard feedback can only be submitted once." }, { status: 409 })
  }

  const submission = await db.airdropSubmission.upsert({
    where: { userId_taskId: { userId: user.id, taskId: task.id } },
    update: {
      evidenceUrl,
      evidenceImageData,
      feedbackText,
      status: "PENDING",
      pointsAwarded: 0,
      adminNotes: null,
      reviewedById: null,
      reviewedAt: null,
    },
    create: {
      userId: user.id,
      profileId: profile.id,
      taskId: task.id,
      status: "PENDING",
      evidenceUrl,
      evidenceImageData,
      feedbackText,
    },
  })

  return NextResponse.json({
    submission: {
      id: submission.id,
      status: submission.status,
      pointsAwarded: submission.pointsAwarded,
      createdAt: submission.createdAt.toISOString(),
    },
  })
}
