import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import {
  ensureAirdropTasks,
  isSubmissionLocked,
  isValidEvidenceImage,
  isXUrl,
} from "@/lib/airdrop/tasks"

export const runtime = "nodejs"

function duplicateSubmissionResponse() {
  return NextResponse.json(
    { error: "This task already has a submission pending review." },
    { status: 409 }
  )
}

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

  if (task.type === "X_QUOTE" && (!evidenceUrl || !isXUrl(evidenceUrl))) {
    return NextResponse.json({ error: "Submit a valid X quote URL." }, { status: 400 })
  }

  if (task.proofRequired && !isValidEvidenceImage(evidenceImageData)) {
    return NextResponse.json({ error: "Upload a screenshot proof image under 1.75 MB." }, { status: 400 })
  }

  if (evidenceImageData && !isValidEvidenceImage(evidenceImageData)) {
    return NextResponse.json({ error: "Screenshot proof must be an image under 1.75 MB." }, { status: 400 })
  }

  const current = await db.airdropSubmission.findUnique({
    where: { userId_taskId: { userId: user.id, taskId: task.id } },
  })

  if (task.type === "HUMANITY_GATE_FEEDBACK") {
    if (!current?.humanityTestResult) {
      return NextResponse.json({ error: "Run the one-time ScamGuard test before sending feedback." }, { status: 400 })
    }
    if (!feedbackText || feedbackText.length < 20) {
      return NextResponse.json({ error: "Write at least 20 characters of ScamGuard feedback." }, { status: 400 })
    }
    if (current.feedbackText) {
      return NextResponse.json({ error: "ScamGuard feedback can only be submitted once." }, { status: 409 })
    }
  }

  const completingScamGuardFeedback =
    task.type === "HUMANITY_GATE_FEEDBACK" &&
    current?.status === "PENDING" &&
    Boolean(current.humanityTestResult) &&
    !current.feedbackText

  if (isSubmissionLocked(current?.status) && !completingScamGuardFeedback) {
    if (current?.status === "APPROVED") {
      return NextResponse.json(
        { error: "This task is already approved and cannot earn points again." },
        { status: 409 }
      )
    }
    return duplicateSubmissionResponse()
  }

  const retryData = {
    evidenceUrl,
    evidenceImageData,
    feedbackText,
    status: "PENDING" as const,
    pointsAwarded: 0,
    adminNotes: null,
    reviewedById: null,
    reviewedAt: null,
  }

  try {
    let submission

    if (completingScamGuardFeedback && current) {
      const updated = await db.airdropSubmission.updateMany({
        where: {
          id: current.id,
          status: "PENDING",
          feedbackText: null,
        },
        data: retryData,
      })
      if (updated.count !== 1) return duplicateSubmissionResponse()
      submission = await db.airdropSubmission.findUniqueOrThrow({ where: { id: current.id } })
    } else if (current?.status === "REJECTED") {
      const updated = await db.airdropSubmission.updateMany({
        where: { id: current.id, status: "REJECTED" },
        data: retryData,
      })
      if (updated.count !== 1) return duplicateSubmissionResponse()
      submission = await db.airdropSubmission.findUniqueOrThrow({ where: { id: current.id } })
    } else {
      submission = await db.airdropSubmission.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          taskId: task.id,
          status: "PENDING",
          evidenceUrl,
          evidenceImageData,
          feedbackText,
        },
      })
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        status: submission.status,
        pointsAwarded: submission.pointsAwarded,
        createdAt: submission.createdAt.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return duplicateSubmissionResponse()
    }
    throw error
  }
}
