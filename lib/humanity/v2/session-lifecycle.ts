import { randomUUID } from "node:crypto"

import { db } from "@/lib/db/prisma"

export type HumanityLifecycleEvent =
  | "CANCELLED_BY_CLIENT"
  | "SERVER_CHAIN_TIMING_FAILURE"
  | "SERVER_CHAIN_REPLAY_OR_FORK"
  | "CHAIN_PROCESSING_ERROR"
  | "LIVENESS_FAIL"
  | "SESSION_EXPIRED"

export async function recordHumanityLifecycleEvent({
  sessionId,
  event,
  detail,
}: {
  sessionId: string
  event: HumanityLifecycleEvent
  detail?: string | null
}) {
  await db.$executeRaw`
    INSERT INTO "HumanitySessionLifecycleEvent" (
      "id", "sessionId", "event", "detail", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${sessionId}, ${event}, ${detail ?? null}, NOW()
    )
  `
}

export async function closeHumanitySessionAsFailed({
  sessionId,
  event,
  detail,
}: {
  sessionId: string
  event: HumanityLifecycleEvent
  detail?: string | null
}) {
  const updated = await db.humanityChallengeSession.updateMany({
    where: { id: sessionId, status: "PENDING" },
    data: { status: "FAILED" },
  })
  if (updated.count === 1) {
    await recordHumanityLifecycleEvent({ sessionId, event, detail })
    return true
  }
  return false
}

export async function expireHumanitySession(sessionId: string, now = new Date()) {
  const updated = await db.humanityChallengeSession.updateMany({
    where: { id: sessionId, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  })
  if (updated.count === 1) {
    await recordHumanityLifecycleEvent({ sessionId, event: "SESSION_EXPIRED" })
    return true
  }
  return false
}

export async function pruneExpiredHumanitySessions(now = new Date()) {
  const expired = await db.humanityChallengeSession.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true },
    take: 250,
  })
  if (!expired.length) return 0

  let closed = 0
  for (const session of expired) {
    if (await expireHumanitySession(session.id, now)) closed += 1
  }
  return closed
}
