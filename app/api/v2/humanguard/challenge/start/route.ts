import { randomBytes } from "node:crypto"

import { Prisma } from "@prisma/client"
import { z } from "zod"

import { db } from "@/lib/db/prisma"
import { getHumanGuardProofSecret } from "@/lib/env/validation"
import {
  chooseHumanGuardChallenge,
  computeHumanGuardBootstrapRisk,
  createHumanGuardChallenge,
  createHumanGuardSeed,
  normalizeHumanGuardWallet,
} from "@/lib/humanguard/core"
import {
  humanGuardCorsHeaders,
  humanGuardPreflight,
  humanGuardPublicJson,
  requireAllowedHumanGuardOrigin,
} from "@/lib/humanguard/http"
import { enforceHumanGuardRateLimit } from "@/lib/humanguard/rate-limit"
import { pruneHumanityAbuseBuckets } from "@/lib/humanity/v2/abuse-defense"

export const runtime = "nodejs"

const requestSchema = z.object({
  siteKey: z.string().trim().startsWith("tp_site_").max(120),
  action: z.string().trim().min(1).max(80),
  wallet: z.string().trim().min(3).max(200).optional(),
  walletChain: z.string().trim().min(1).max(32).optional(),
  client: z.object({
    language: z.string().trim().max(40).optional(),
    platform: z.string().trim().max(80).optional(),
    timezoneOffset: z.number().finite().min(-1_000).max(1_000).optional(),
    screenWidth: z.number().finite().positive().max(20_000).optional(),
    screenHeight: z.number().finite().positive().max(20_000).optional(),
    hardwareConcurrency: z.number().finite().positive().max(1_024).optional(),
    touchPoints: z.number().finite().nonnegative().max(100).optional(),
  }).optional(),
})

export function OPTIONS(request: Request) {
  return humanGuardPreflight(request)
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const origin = request.headers.get("origin")
    return humanGuardPublicJson({ error: "Invalid HumanGuard challenge request", issues: parsed.error.issues }, 400, origin)
  }

  const site = await db.humanGuardSite.findUnique({ where: { siteKey: parsed.data.siteKey } })
  if (!site || !site.enabled) {
    return humanGuardPublicJson({ error: "HumanGuard site not found or disabled" }, 404, request.headers.get("origin"))
  }

  const originResult = requireAllowedHumanGuardOrigin(request, site.allowedOrigins)
  if (!originResult.ok) {
    return humanGuardPublicJson({ error: originResult.error }, 403, originResult.origin)
  }
  const origin = originResult.origin

  const walletAddress = normalizeHumanGuardWallet(parsed.data.wallet)
  const walletChain = parsed.data.walletChain?.trim().toLowerCase() ?? null
  if (site.walletRequired && !walletAddress) {
    return humanGuardPublicJson({ error: "Wallet is required for this HumanGuard site" }, 400, origin)
  }

  const secret = getHumanGuardProofSecret()
  const limited = await enforceHumanGuardRateLimit({
    request,
    siteId: site.id,
    action: "CHALLENGE_START",
    secret,
    wallet: walletAddress,
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

  void pruneHumanityAbuseBuckets().catch(() => undefined)

  const clientSignalCount = parsed.data.client
    ? Object.values(parsed.data.client).filter((value) => value !== undefined && value !== null && value !== "").length
    : 0
  const riskScore = computeHumanGuardBootstrapRisk({
    userAgent: request.headers.get("user-agent"),
    acceptLanguage: request.headers.get("accept-language"),
    secChUa: request.headers.get("sec-ch-ua"),
    walletProvided: Boolean(walletAddress),
    clientSignalCount,
  })

  // V1 deliberately does not issue invisible/passive passes yet. Adaptive mode
  // changes challenge selection; passive bypass will only be enabled after the
  // signal model has production calibration data.
  const seed = createHumanGuardSeed()
  const challengeType = chooseHumanGuardChallenge(seed, riskScore)
  const generated = createHumanGuardChallenge(challengeType, seed)
  const nonce = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000)

  const session = await db.humanGuardChallengeSession.create({
    data: {
      siteId: site.id,
      nonce,
      origin,
      action: parsed.data.action,
      walletAddress,
      walletChain,
      challengeType,
      challengeSeed: generated.seed,
      publicConfig: generated.publicConfig as Prisma.InputJsonValue,
      expectedAnswer: generated.expectedAnswer as Prisma.InputJsonValue,
      riskScore,
      status: "PENDING",
      expiresAt,
    },
  })

  return humanGuardPublicJson({
    object: "humanguard_challenge",
    apiVersion: "v2",
    decision: "CHALLENGE_REQUIRED",
    sessionId: session.id,
    nonce,
    challenge: {
      type: challengeType,
      config: generated.publicConfig,
    },
    riskBand: riskScore >= 72 ? "high" : riskScore >= 50 ? "medium" : "low",
    mode: site.mode,
    expiresAt: expiresAt.toISOString(),
  }, 201, origin)
}
