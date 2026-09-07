import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import { enforceHumanityRateLimits, humanityRateLimitResponse } from "@/lib/humanity/v2/abuse-defense"
import { closeHumanitySessionAsFailed, expireHumanitySession } from "@/lib/humanity/v2/session-lifecycle"

export const runtime = "nodejs"

const requestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(120).optional(),
})

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Humanity V2.5 cancellation request", issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const secret = getHumanityNullifierSecret()
    const limited = await enforceHumanityRateLimits({
      request,
      action: "CANCEL",
      principal: admin.id,
      secret,
      sessionId: parsed.data.sessionId,
    })
    if (limited) return humanityRateLimitResponse(limited)

    const session = await db.humanityChallengeSession.findUnique({
      where: { id: parsed.data.sessionId },
      select: { id: true, status: true, expiresAt: true },
    })
    if (!session) return NextResponse.json({ error: "Humanity session not found" }, { status: 404 })

    if (session.status === "COMPLETED") {
      return NextResponse.json({
        error: "Completed Humanity sessions cannot be cancelled",
        reasonCodes: ["HUMANITY_SESSION_ALREADY_COMPLETED"],
      }, { status: 409, headers: { "Cache-Control": "no-store" } })
    }

    if (session.status === "EXPIRED") {
      return NextResponse.json({
        ok: true,
        alreadyClosed: true,
        sessionId: session.id,
        sessionStatus: session.status,
        lifecycleStatus: "EXPIRED",
        abuseDefenseVersion: "2.5",
      }, { headers: { "Cache-Control": "no-store" } })
    }

    if (session.status === "FAILED") {
      return NextResponse.json({
        ok: true,
        alreadyClosed: true,
        sessionId: session.id,
        sessionStatus: session.status,
        lifecycleStatus: "FAILED",
        abuseDefenseVersion: "2.5",
      }, { headers: { "Cache-Control": "no-store" } })
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await expireHumanitySession(session.id)
      return NextResponse.json({
        ok: true,
        alreadyClosed: true,
        sessionId: session.id,
        sessionStatus: "EXPIRED",
        lifecycleStatus: "EXPIRED",
        abuseDefenseVersion: "2.5",
      }, { headers: { "Cache-Control": "no-store" } })
    }

    const closed = await closeHumanitySessionAsFailed({
      sessionId: session.id,
      event: "CANCELLED_BY_CLIENT",
      detail: parsed.data.reason?.slice(0, 120) ?? null,
    })
    if (!closed) {
      return NextResponse.json({
        error: "Humanity session changed while cancellation was being processed",
        reasonCodes: ["HUMANITY_SESSION_CONCURRENT_STATE_CHANGE"],
      }, { status: 409, headers: { "Cache-Control": "no-store" } })
    }

    return NextResponse.json({
      ok: true,
      alreadyClosed: false,
      sessionId: session.id,
      sessionStatus: "FAILED",
      lifecycleStatus: "CANCELLED",
      attemptConsumed: true,
      abuseDefenseVersion: "2.5",
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Humanity V2.5 cancellation failed", error)
    return NextResponse.json({ error: "Could not cancel Humanity V2.5 session" }, { status: 500 })
  }
}
