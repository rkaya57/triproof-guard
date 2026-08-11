import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { assertTrustedAuthOrigin } from "@/lib/auth/security"
import {
  SIGNAL_RUN_DURATION_MS,
  SIGNAL_RUN_MAX_ATTEMPTS,
  SIGNAL_RUN_MIN_CORRECT,
  type SignalDecision,
  createSignalRunSet,
  nextUtcSignalRunReset,
  parseSignalRunSet,
  previousUtcDates,
  publicChallenge,
  signalRunReward,
  utcSignalRunDate,
} from "@/lib/airdrop/signal-run"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const headers = { "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate" }
const MIN_COMPLETION_MS = 8_000

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers })
}

function serializeState(session: {
  challengeDate: string
  status: string
  attemptCount: number
  bestCorrectAnswers: number
  correctAnswers: number
  pointsAwarded: number
  streak: number
  completedAt: Date | null
}, now: Date) {
  return {
    status: session.status as "ACTIVE" | "COMPLETED" | "EXHAUSTED",
    challengeDate: session.challengeDate,
    attemptsUsed: session.attemptCount,
    attemptsRemaining: Math.max(0, SIGNAL_RUN_MAX_ATTEMPTS - session.attemptCount),
    bestCorrectAnswers: session.bestCorrectAnswers,
    correctAnswers: session.correctAnswers,
    pointsAwarded: session.pointsAwarded,
    streak: session.streak,
    completedAt: session.completedAt?.toISOString() ?? null,
    nextResetAt: nextUtcSignalRunReset(now).toISOString(),
  }
}

function parseAnswers(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Signal Run answers are required.")
  const seen = new Set<string>()
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Signal Run answer is invalid.")
    const record = item as { cardId?: unknown; decision?: unknown }
    const cardId = String(record.cardId ?? "")
    const decision = String(record.decision ?? "") as SignalDecision
    if (!cardId || (decision !== "SAFE" && decision !== "BLOCK") || seen.has(cardId)) {
      throw new Error("Signal Run answer is invalid.")
    }
    seen.add(cardId)
    return { cardId, decision }
  })
}

async function completedStreak(userId: string, challengeDate: string) {
  const priorDates = previousUtcDates(challengeDate, 7)
  const previous = await db.airdropSignalRunSession.findMany({
    where: { userId, challengeDate: { in: priorDates }, status: "COMPLETED" },
    select: { challengeDate: true },
  })
  const completed = new Set(previous.map((session) => session.challengeDate))
  let streak = 1
  for (const date of priorDates) {
    if (!completed.has(date)) break
    streak += 1
  }
  return streak
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return json({ error: "Unauthorized" }, 401)

  const now = new Date()
  const challengeDate = utcSignalRunDate(now)
  const [profile, session] = await Promise.all([
    db.airdropProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
    db.airdropSignalRunSession.findUnique({ where: { userId_challengeDate: { userId: user.id, challengeDate } } }),
  ])

  return json({
    registered: Boolean(profile),
    signalRun: session ? serializeState(session, now) : {
      status: "READY",
      challengeDate,
      attemptsUsed: 0,
      attemptsRemaining: SIGNAL_RUN_MAX_ATTEMPTS,
      bestCorrectAnswers: 0,
      correctAnswers: 0,
      pointsAwarded: 0,
      streak: 0,
      completedAt: null,
      nextResetAt: nextUtcSignalRunReset(now).toISOString(),
    },
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return json({ error: "Unauthorized" }, 401)
  try {
    assertTrustedAuthOrigin(request)
  } catch {
    return json({ error: "Cross-site Signal Run request rejected." }, 403)
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown; sessionId?: unknown; answers?: unknown } | null
  const action = String(body?.action ?? "")
  const now = new Date()
  const challengeDate = utcSignalRunDate(now)

  try {
    if (action === "start") {
      const profile = await db.airdropProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
      if (!profile) return json({ error: "Create your contribution profile before playing Signal Run." }, 400)

      let session = await db.airdropSignalRunSession.findUnique({ where: { userId_challengeDate: { userId: user.id, challengeDate } } })
      if (!session) {
        try {
          session = await db.airdropSignalRunSession.create({
            data: {
              userId: user.id,
              profileId: profile.id,
              challengeDate,
              challengeSet: createSignalRunSet(),
              expiresAt: new Date(now.getTime() + SIGNAL_RUN_DURATION_MS),
            },
          })
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error
          session = await db.airdropSignalRunSession.findUniqueOrThrow({ where: { userId_challengeDate: { userId: user.id, challengeDate } } })
        }
      }

      if (!session) throw new Error("Could not create Signal Run session.")

      if (session.status !== "ACTIVE") return json({ signalRun: serializeState(session, now) })

      if (session.expiresAt <= now) {
        session = await db.airdropSignalRunSession.update({
          where: { id: session.id },
          data: { startedAt: now, expiresAt: new Date(now.getTime() + SIGNAL_RUN_DURATION_MS) },
        })
      }

      const cards = parseSignalRunSet(session.challengeSet).map(publicChallenge)
      return json({
        signalRun: serializeState(session, now),
        session: { id: session.id, expiresAt: session.expiresAt.toISOString(), cards },
      }, 201)
    }

    if (action !== "complete") return json({ error: "Unknown Signal Run action." }, 400)
    const sessionId = String(body?.sessionId ?? "")
    if (!sessionId) return json({ error: "Signal Run session is required." }, 400)
    const answers = parseAnswers(body?.answers)
    const session = await db.airdropSignalRunSession.findFirst({ where: { id: sessionId, userId: user.id, challengeDate } })
    if (!session) return json({ error: "Signal Run session was not found." }, 404)
    if (session.status !== "ACTIVE") return json({ signalRun: serializeState(session, now) })
    if (session.expiresAt < now) return json({ error: "This Signal Run round expired. Start a fresh attempt." }, 409)
    if (now.getTime() - session.startedAt.getTime() < MIN_COMPLETION_MS) {
      return json({ error: "Complete the round at a normal pace before submitting it." }, 400)
    }

    const cards = parseSignalRunSet(session.challengeSet)
    const expected = new Map(cards.map((card) => [card.id, card.decision]))
    const correctAnswers = answers.reduce((total, answer) => total + Number(expected.get(answer.cardId) === answer.decision), 0)
    const passed = correctAnswers >= SIGNAL_RUN_MIN_CORRECT
    const nextAttempt = session.attemptCount + 1

    if (passed) {
      const streak = await completedStreak(user.id, challengeDate)
      const pointsAwarded = signalRunReward(correctAnswers, streak)
      const result = await db.$transaction(async (tx) => {
        const claimed = await tx.airdropSignalRunSession.updateMany({
          where: { id: session.id, status: "ACTIVE" },
          data: {
            status: "COMPLETED",
            attemptCount: nextAttempt,
            bestCorrectAnswers: Math.max(session.bestCorrectAnswers, correctAnswers),
            correctAnswers,
            pointsAwarded,
            streak,
            completedAt: now,
          },
        })
        if (claimed.count !== 1) return null
        const profile = await tx.airdropProfile.update({
          where: { id: session.profileId },
          data: { totalPoints: { increment: pointsAwarded } },
          select: { totalPoints: true },
        })
        return profile
      })
      if (!result) {
        const current = await db.airdropSignalRunSession.findUniqueOrThrow({ where: { id: session.id } })
        return json({ signalRun: serializeState(current, now), totalPoints: null })
      }
      const completed = await db.airdropSignalRunSession.findUniqueOrThrow({ where: { id: session.id } })
      return json({ signalRun: serializeState(completed, now), totalPoints: result.totalPoints, passed: true })
    }

    const exhausted = nextAttempt >= SIGNAL_RUN_MAX_ATTEMPTS
    const updated = await db.airdropSignalRunSession.update({
      where: { id: session.id },
      data: {
        attemptCount: nextAttempt,
        bestCorrectAnswers: Math.max(session.bestCorrectAnswers, correctAnswers),
        correctAnswers,
        status: exhausted ? "EXHAUSTED" : "ACTIVE",
        expiresAt: now,
      },
    })
    return json({ signalRun: serializeState(updated, now), passed: false })
  } catch (error) {
    console.error("Signal Run failed", error)
    return json({ error: error instanceof Error ? error.message : "Could not complete Signal Run." }, 500)
  }
}
