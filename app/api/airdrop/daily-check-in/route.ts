import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { assertTrustedAuthOrigin } from "@/lib/auth/security"
import {
  DAILY_CHECK_IN_POINTS,
  dailyCheckInTaskDefinition,
  nextUtcCheckInReset,
  type DailyCheckInStatus,
} from "@/lib/airdrop/daily-check-in"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders })
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

function serializeDailyCheckIn(input: {
  now: Date
  registered: boolean
  submission: null | {
    status: string
    pointsAwarded: number
    createdAt: Date
  }
}) {
  const status: DailyCheckInStatus = input.submission
    ? "CLAIMED"
    : input.registered
      ? "READY"
      : "REGISTRATION_REQUIRED"

  return {
    status,
    points: DAILY_CHECK_IN_POINTS,
    checkInDate: dailyCheckInTaskDefinition(input.now).slug.replace("daily-check-in-", ""),
    claimedAt: input.submission?.createdAt.toISOString() ?? null,
    pointsAwarded: input.submission?.pointsAwarded ?? 0,
    nextResetAt: nextUtcCheckInReset(input.now).toISOString(),
  }
}

async function ensureDailyTask(now: Date) {
  const task = dailyCheckInTaskDefinition(now)
  return db.airdropTask.upsert({
    where: { slug: task.slug },
    update: {
      title: task.title,
      description: task.description,
      targetUrl: task.targetUrl,
      points: task.points,
      proofRequired: task.proofRequired,
      active: false,
      sortOrder: task.sortOrder,
    },
    create: task,
  })
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return json({ error: "Unauthorized" }, 401)

  const now = new Date()

  try {
    const task = await ensureDailyTask(now)
    const [profile, submission] = await Promise.all([
      db.airdropProfile.findUnique({
        where: { userId: user.id },
        select: { id: true, totalPoints: true },
      }),
      db.airdropSubmission.findUnique({
        where: { userId_taskId: { userId: user.id, taskId: task.id } },
        select: { status: true, pointsAwarded: true, createdAt: true },
      }),
    ])

    return json({
      dailyCheckIn: serializeDailyCheckIn({
        now,
        registered: Boolean(profile),
        submission,
      }),
      totalPoints: profile?.totalPoints ?? 0,
    })
  } catch (error) {
    console.error("Daily airdrop check-in state failed", error)
    return json({ error: "Could not load the daily check-in." }, 500)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return json({ error: "Unauthorized" }, 401)

  try {
    assertTrustedAuthOrigin(request)
  } catch {
    return json({ error: "Cross-site check-in request rejected." }, 403)
  }

  const now = new Date()
  const taskDefinition = dailyCheckInTaskDefinition(now)

  try {
    const result = await db.$transaction(async (tx) => {
      const task = await tx.airdropTask.upsert({
        where: { slug: taskDefinition.slug },
        update: {
          title: taskDefinition.title,
          description: taskDefinition.description,
          targetUrl: taskDefinition.targetUrl,
          points: taskDefinition.points,
          proofRequired: taskDefinition.proofRequired,
          active: false,
          sortOrder: taskDefinition.sortOrder,
        },
        create: taskDefinition,
      })

      const profile = await tx.airdropProfile.findUnique({
        where: { userId: user.id },
        select: { id: true, totalPoints: true },
      })
      if (!profile) return { kind: "PROFILE_REQUIRED" as const }

      const existing = await tx.airdropSubmission.findUnique({
        where: { userId_taskId: { userId: user.id, taskId: task.id } },
        select: { status: true, pointsAwarded: true, createdAt: true },
      })
      if (existing) {
        return {
          kind: "ALREADY_CLAIMED" as const,
          submission: existing,
          totalPoints: profile.totalPoints,
        }
      }

      const creditedAt = new Date()
      const submission = await tx.airdropSubmission.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          taskId: task.id,
          status: "APPROVED",
          pointsAwarded: DAILY_CHECK_IN_POINTS,
          adminNotes: `Automatically credited daily check-in for ${taskDefinition.slug.replace("daily-check-in-", "")} UTC.`,
          reviewedAt: creditedAt,
        },
        select: { status: true, pointsAwarded: true, createdAt: true },
      })

      const updatedProfile = await tx.airdropProfile.update({
        where: { id: profile.id },
        data: { totalPoints: { increment: DAILY_CHECK_IN_POINTS } },
        select: { totalPoints: true },
      })

      return {
        kind: "CREDITED" as const,
        submission,
        totalPoints: updatedProfile.totalPoints,
      }
    })

    if (result.kind === "PROFILE_REQUIRED") {
      return json({
        error: "Create your contribution profile before claiming the daily check-in.",
        code: "AIRDROP_PROFILE_REQUIRED",
      }, 400)
    }

    return json({
      ok: true,
      alreadyClaimed: result.kind === "ALREADY_CLAIMED",
      dailyCheckIn: serializeDailyCheckIn({
        now,
        registered: true,
        submission: result.submission,
      }),
      totalPoints: result.totalPoints,
    }, result.kind === "CREDITED" ? 201 : 200)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const task = await db.airdropTask.findUnique({ where: { slug: taskDefinition.slug } })
      const [profile, submission] = await Promise.all([
        db.airdropProfile.findUnique({
          where: { userId: user.id },
          select: { totalPoints: true },
        }),
        task
          ? db.airdropSubmission.findUnique({
              where: { userId_taskId: { userId: user.id, taskId: task.id } },
              select: { status: true, pointsAwarded: true, createdAt: true },
            })
          : Promise.resolve(null),
      ])

      return json({
        ok: true,
        alreadyClaimed: true,
        dailyCheckIn: serializeDailyCheckIn({
          now,
          registered: Boolean(profile),
          submission,
        }),
        totalPoints: profile?.totalPoints ?? 0,
      })
    }

    console.error("Daily airdrop check-in failed", error)
    return json({ error: "Could not complete the daily check-in." }, 500)
  }
}
