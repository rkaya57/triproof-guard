import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

type Params = {
  params: Promise<{ id: string }>
}

async function recomputeProfilePoints(tx: Prisma.TransactionClient, profileId: string) {
  const aggregate = await tx.airdropSubmission.aggregate({
    where: { profileId, status: "APPROVED" },
    _sum: { pointsAwarded: true },
  })
  const totalPoints = aggregate._sum.pointsAwarded ?? 0
  await tx.airdropProfile.update({
    where: { id: profileId },
    data: {
      totalPoints,
      eligibilityStatus: totalPoints > 0 ? "eligible" : "registered",
    },
  })
  return totalPoints
}

export async function PATCH(request: Request, { params }: Params) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as {
    action?: "approve" | "reject"
    adminNotes?: string
  } | null

  const action = body?.action
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 })
  }

  const result = await db.$transaction(async (tx) => {
    const submission = await tx.airdropSubmission.findUnique({
      where: { id },
      include: { task: true, profile: true },
    })

    if (!submission) return { error: "Submission not found", status: 404 as const }
    if (submission.status !== "PENDING") {
      return { error: "This submission has already been reviewed and cannot be changed.", status: 409 as const }
    }

    const nextStatus = action === "approve" ? "APPROVED" : "REJECTED"
    const pointsAwarded = action === "approve" ? submission.task.points : 0

    const updated = await tx.airdropSubmission.update({
      where: { id },
      data: {
        status: nextStatus,
        pointsAwarded,
        adminNotes: body?.adminNotes?.trim() || null,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
      include: { task: true, profile: true },
    })

    const totalPoints = await recomputeProfilePoints(tx, submission.profileId)

    return {
      submission: updated,
      totalPoints,
    }
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    submission: {
      id: result.submission.id,
      status: result.submission.status,
      pointsAwarded: result.submission.pointsAwarded,
      adminNotes: result.submission.adminNotes,
      reviewedAt: result.submission.reviewedAt?.toISOString() ?? null,
    },
    profile: {
      id: result.submission.profileId,
      totalPoints: result.totalPoints,
    },
  })
}
