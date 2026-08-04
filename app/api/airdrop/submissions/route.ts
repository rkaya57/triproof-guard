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
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
}

function duplicateSubmissionResponse(message = "This task already has a submission pending review.") {
  return json({ error: message, code: "AIRDROP_SUBMISSION_LOCKED" }, 409)
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return json({ error: "Unauthorized" }, 401)

  const body = (await request.json().catch(() => null)) as {
    taskSlug?: string
    evidenceUrl?: string
    evidenceImageData?: string
    feedbackText?: string
  } | null

  const taskSlug = body?.taskSlug?.trim()
  if (!taskSlug) return json({ error: "taskSlug is required" }, 400)

  await ensureAirdropTasks(db)

  const [profile, task] = await Promise.all([
    db.airdropProfile.findUnique({ where: { userId: user.id } }),
    db.airdropTask.findUnique({ where: { slug: taskSlug } }),
  ])

  if (!profile) {
    return json({ error: "Create your airdrop registration profile before submitting tasks." }, 400)
  }
  if (!task || !task.active) return json({ error: "Task not found" }, 404)

  const evidenceUrl = body?.evidenceUrl?.trim() || null
  const evidenceImageData = body?.evidenceImageData?.trim() || null
  const feedbackText = body?.feedbackText?.trim() || null

  if (task.type === "X_QUOTE" && (!evidenceUrl || !isXUrl(evidenceUrl))) {
    return json({ error: "Submit a valid X quote URL." }, 400)
  }

  if (task.proofRequired && !isValidEvidenceImage(evidenceImageData)) {
    return json({ error: "Upload a screenshot proof image under 1.75 MB." }, 400)
  }

  if (evidenceImageData && !isValidEvidenceImage(evidenceImageData)) {
    return json({ error: "Screenshot proof must be an image under 1.75 MB." }, 400)
  }

  const current = await db.airdropSubmission.findUnique({
    where: { userId_taskId: { userId: user.id, taskId: task.id } },
  })

  if (task.type === "HUMANITY_GATE_FEEDBACK") {
    if (!current?.humanityTestResult) {
      return json({ error: "Run the one-time ScamGuard test before sending feedback." }, 400)
    }
    if (!feedbackText || feedbackText.length < 20) {
      return json({ error: "Write at least 20 characters of ScamGuard feedback." }, 400)
    }
    if (current.feedbackText) {
      return duplicateSubmissionResponse("ScamGuard feedback can only be submitted once.")
    }
  }

  const completingScamGuardFeedback =
    task.type === "HUMANITY_GATE_FEEDBACK" &&
    current?.status === "PENDING" &&
    Boolean(current.humanityTestResult) &&
    !current.feedbackText

  if (isSubmissionLocked(current?.status) && !completingScamGuardFeedback) {
    if (current?.status === "APPROVED") {
      return duplicateSubmissionResponse("This task is already approved and cannot earn points again.")
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

    return json({
      submission: {
        id: submission.id,
        taskId: submission.taskId,
        taskSlug: task.slug,
        status: submission.status,
        evidenceUrl: submission.evidenceUrl,
        feedbackText: submission.feedbackText,
        humanityTestResult: submission.humanityTestResult,
        pointsAwarded: submission.pointsAwarded,
        adminNotes: submission.adminNotes,
        reviewedAt: submission.reviewedAt?.toISOString() ?? null,
        createdAt: submission.createdAt.toISOString(),
      },
    }, 201)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return duplicateSubmissionResponse()
    }
    throw error
  }
}
