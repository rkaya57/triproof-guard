import { Prisma } from "@prisma/client"
import { z } from "zod"

import { db } from "@/lib/db/prisma"
import { getHumanGuardProofSecret } from "@/lib/env/validation"
import {
  HUMAN_GUARD_CHALLENGE_TYPES,
  type HumanGuardChallengeType,
  type HumanGuardTelemetry,
  verifyHumanGuardSubmission,
} from "@/lib/humanguard/core"
import {
  humanGuardCorsHeaders,
  humanGuardPreflight,
  humanGuardPublicJson,
  requireAllowedHumanGuardOrigin,
} from "@/lib/humanguard/http"
import { createHumanGuardTokenId, signHumanGuardProof } from "@/lib/humanguard/proof"
import { enforceHumanGuardRateLimit } from "@/lib/humanguard/rate-limit"

export const runtime = "nodejs"

const telemetrySchema = z.object({
  durationMs: z.number().finite().nonnegative().max(60_000).optional(),
  pointerMoves: z.number().int().nonnegative().max(10_000).optional(),
  clicks: z.number().int().nonnegative().max(100).optional(),
  corrections: z.number().int().nonnegative().max(2_000).optional(),
  scrubMoves: z.number().int().nonnegative().max(10_000).optional(),
}).default({})

const requestSchema = z.object({
  siteKey: z.string().trim().startsWith("tp_site_").max(120),
  sessionId: z.string().trim().min(1).max(200),
  nonce: z.string().trim().min(32).max(128),
  result: z.record(z.string(), z.unknown()),
  telemetry: telemetrySchema,
})

function isChallengeType(value: string): value is HumanGuardChallengeType {
  return HUMAN_GUARD_CHALLENGE_TYPES.includes(value as HumanGuardChallengeType)
}

export function OPTIONS(request: Request) {
  return humanGuardPreflight(request)
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return humanGuardPublicJson(
      { error: "Invalid HumanGuard completion request", issues: parsed.error.issues },
      400,
      request.headers.get("origin")
    )
  }

  const session = await db.humanGuardChallengeSession.findUnique({
    where: { id: parsed.data.sessionId },
    include: { site: true, proof: true },
  })
  if (!session || session.site.siteKey !== parsed.data.siteKey || !session.site.enabled) {
    return humanGuardPublicJson({ error: "HumanGuard challenge not found" }, 404, request.headers.get("origin"))
  }

  const originResult = requireAllowedHumanGuardOrigin(request, session.site.allowedOrigins)
  if (!originResult.ok) {
    return humanGuardPublicJson({ error: originResult.error }, 403, originResult.origin)
  }
  const origin = originResult.origin

  if (session.origin !== origin) {
    return humanGuardPublicJson({ error: "HumanGuard challenge origin mismatch" }, 403, origin)
  }
  if (session.nonce !== parsed.data.nonce) {
    return humanGuardPublicJson({ error: "HumanGuard challenge nonce mismatch" }, 403, origin)
  }
  if (session.status !== "PENDING" || session.proof) {
    return humanGuardPublicJson({ error: "HumanGuard challenge is already closed" }, 409, origin)
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.humanGuardChallengeSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } })
    return humanGuardPublicJson({ error: "HumanGuard challenge expired" }, 410, origin)
  }
  if (!isChallengeType(session.challengeType)) {
    return humanGuardPublicJson({ error: "Stored HumanGuard challenge type is invalid" }, 500, origin)
  }

  const secret = getHumanGuardProofSecret()
  const limited = await enforceHumanGuardRateLimit({
    request,
    siteId: session.siteId,
    action: "SUBMIT",
    secret,
    sessionId: session.id,
  })
  if (limited) {
    return Response.json(
      {
        error: "HumanGuard request rate limited",
        reasonCodes: ["HUMANGUARD_RATE_LIMITED", `RATE_LIMIT_DIMENSION:${limited.dimension.toUpperCase()}`],
        retryAfterSec: limited.retryAfterSec,
      },
      {
        status: 429,
        headers: {
          ...humanGuardCorsHeaders(origin),
          "Retry-After": String(limited.retryAfterSec),
        },
      }
    )
  }

  const result = parsed.data.result
  const telemetry = parsed.data.telemetry as HumanGuardTelemetry
  const serverElapsedMs = Date.now() - session.createdAt.getTime()
  const clientElapsedMs = typeof result.elapsedMs === "number" ? result.elapsedMs : telemetry.durationMs

  if (
    (session.challengeType === "PACKET_INTERCEPT" || session.challengeType === "RESONANCE_CORE") &&
    typeof clientElapsedMs === "number" &&
    Math.abs(serverElapsedMs - clientElapsedMs) > 1_800
  ) {
    await db.humanGuardChallengeSession.update({
      where: { id: session.id },
      data: {
        status: "FAILED",
        telemetry: telemetry as Prisma.InputJsonValue,
        resultEvidence: { reasonCodes: ["HUMANGUARD_CLOCK_MISMATCH"], serverElapsedMs, clientElapsedMs },
      },
    })
    return humanGuardPublicJson({
      success: false,
      reasonCodes: ["HUMANGUARD_CLOCK_MISMATCH"],
    }, 400, origin)
  }

  const verification = verifyHumanGuardSubmission({
    type: session.challengeType,
    expectedAnswer: session.expectedAnswer as Record<string, unknown>,
    result,
    telemetry,
  })

  if (!verification.ok) {
    await db.humanGuardChallengeSession.update({
      where: { id: session.id },
      data: {
        status: "FAILED",
        humanScore: verification.humanScore,
        telemetry: telemetry as Prisma.InputJsonValue,
        resultEvidence: verification.evidence as Prisma.InputJsonValue,
      },
    })
    return humanGuardPublicJson({
      success: false,
      humanScore: verification.humanScore,
      reasonCodes: verification.reasonCodes,
    }, 400, origin)
  }

  const tokenId = createHumanGuardTokenId()
  const proofExpiresAt = new Date(Date.now() + 5 * 60 * 1000)
  const token = await signHumanGuardProof({
    tokenId,
    siteId: session.siteId,
    sessionId: session.id,
    action: session.action,
    origin: session.origin,
    walletAddress: session.walletAddress,
    walletChain: session.walletChain,
    challengeType: session.challengeType,
    humanScore: verification.humanScore,
    expiresAt: proofExpiresAt,
  }, secret)

  await db.$transaction([
    db.humanGuardChallengeSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        humanScore: verification.humanScore,
        telemetry: telemetry as Prisma.InputJsonValue,
        resultEvidence: verification.evidence as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    }),
    db.humanGuardProof.create({
      data: {
        siteId: session.siteId,
        sessionId: session.id,
        tokenId,
        action: session.action,
        origin: session.origin,
        walletAddress: session.walletAddress,
        walletChain: session.walletChain,
        challengeType: session.challengeType,
        humanScore: verification.humanScore,
        expiresAt: proofExpiresAt,
      },
    }),
  ])

  return humanGuardPublicJson({
    success: true,
    object: "humanguard_proof",
    token,
    humanScore: verification.humanScore,
    challengeType: session.challengeType,
    action: session.action,
    expiresAt: proofExpiresAt.toISOString(),
  }, 201, origin)
}
