import { createHmac } from "node:crypto"

import { db } from "@/lib/db/prisma"

export type HumanityAbuseAction =
  | "CHALLENGE_START"
  | "CHAIN_START"
  | "CHAIN_STEP"
  | "SUBMIT"
  | "SIGN"
  | "CANCEL"

export type HumanityRateLimitRule = {
  dimension: "principal" | "network" | "wallet" | "session" | "verification"
  subject: string
  limit: number
  windowMs: number
}

export type HumanityRateLimitResult = {
  allowed: boolean
  action: HumanityAbuseAction
  dimension: HumanityRateLimitRule["dimension"]
  limit: number
  count: number
  retryAfterSec: number
  windowEndsAt: Date
}

const MINUTE = 60_000

const ACTION_POLICIES: Record<HumanityAbuseAction, Omit<HumanityRateLimitRule, "subject">[]> = {
  CHALLENGE_START: [
    { dimension: "principal", limit: 30, windowMs: 10 * MINUTE },
    { dimension: "network", limit: 60, windowMs: 10 * MINUTE },
    { dimension: "wallet", limit: 10, windowMs: 60 * MINUTE },
  ],
  CHAIN_START: [
    { dimension: "principal", limit: 60, windowMs: 10 * MINUTE },
    { dimension: "network", limit: 120, windowMs: 10 * MINUTE },
    { dimension: "session", limit: 2, windowMs: 10 * MINUTE },
  ],
  CHAIN_STEP: [
    { dimension: "principal", limit: 240, windowMs: 10 * MINUTE },
    { dimension: "network", limit: 480, windowMs: 10 * MINUTE },
    { dimension: "session", limit: 8, windowMs: 10 * MINUTE },
  ],
  SUBMIT: [
    { dimension: "principal", limit: 60, windowMs: 10 * MINUTE },
    { dimension: "network", limit: 120, windowMs: 10 * MINUTE },
    { dimension: "session", limit: 3, windowMs: 10 * MINUTE },
  ],
  SIGN: [
    { dimension: "principal", limit: 60, windowMs: 10 * MINUTE },
    { dimension: "network", limit: 120, windowMs: 10 * MINUTE },
    { dimension: "verification", limit: 6, windowMs: 10 * MINUTE },
  ],
  CANCEL: [
    { dimension: "principal", limit: 60, windowMs: 10 * MINUTE },
    { dimension: "network", limit: 120, windowMs: 10 * MINUTE },
    { dimension: "session", limit: 3, windowMs: 10 * MINUTE },
  ],
}

function normalizeSubject(value: string) {
  return value.trim().toLowerCase() || "unknown"
}

export function deriveHumanityNetworkSubject(request: Request, secret: string) {
  const raw =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"

  return createHmac("sha256", secret)
    .update(`triproof-humanity-v2.5:network:${raw}`)
    .digest("hex")
}

export function buildHumanityAbuseBucketKey({
  action,
  dimension,
  subject,
  secret,
}: {
  action: HumanityAbuseAction
  dimension: HumanityRateLimitRule["dimension"]
  subject: string
  secret: string
}) {
  const digest = createHmac("sha256", secret)
    .update(`triproof-humanity-v2.5:${action}:${dimension}:${normalizeSubject(subject)}`)
    .digest("hex")
  return `humanity:v2.5:${action.toLowerCase()}:${dimension}:${digest}`
}

export function fixedWindowFor(nowMs: number, windowMs: number) {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error("Invalid Humanity abuse-defense clock")
  if (!Number.isFinite(windowMs) || windowMs < 1_000) throw new Error("Invalid Humanity abuse-defense window")
  const startMs = Math.floor(nowMs / windowMs) * windowMs
  return {
    startMs,
    endMs: startMs + windowMs,
    retryAfterSec: Math.max(1, Math.ceil((startMs + windowMs - nowMs) / 1_000)),
  }
}

export function getHumanityRateLimitRules({
  action,
  principal,
  network,
  wallet,
  sessionId,
  verificationId,
}: {
  action: HumanityAbuseAction
  principal: string
  network: string
  wallet?: string | null
  sessionId?: string | null
  verificationId?: string | null
}) {
  const subjects: Record<HumanityRateLimitRule["dimension"], string | null | undefined> = {
    principal,
    network,
    wallet,
    session: sessionId,
    verification: verificationId,
  }

  return ACTION_POLICIES[action]
    .map((policy) => ({ ...policy, subject: subjects[policy.dimension] }))
    .filter((rule): rule is HumanityRateLimitRule => typeof rule.subject === "string" && rule.subject.length > 0)
}

export async function consumeHumanityRateLimit({
  action,
  rule,
  secret,
  nowMs = Date.now(),
}: {
  action: HumanityAbuseAction
  rule: HumanityRateLimitRule
  secret: string
  nowMs?: number
}): Promise<HumanityRateLimitResult> {
  const window = fixedWindowFor(nowMs, rule.windowMs)
  const bucketKey = buildHumanityAbuseBucketKey({ action, dimension: rule.dimension, subject: rule.subject, secret })
  const windowStart = new Date(window.startMs)
  const expiresAt = new Date(window.endMs + rule.windowMs)

  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "HumanityAbuseBucket" (
      "bucketKey", "windowStart", "count", "expiresAt", "createdAt", "updatedAt"
    ) VALUES (
      ${bucketKey}, ${windowStart}, 1, ${expiresAt}, NOW(), NOW()
    )
    ON CONFLICT ("bucketKey", "windowStart")
    DO UPDATE SET
      "count" = "HumanityAbuseBucket"."count" + 1,
      "expiresAt" = EXCLUDED."expiresAt",
      "updatedAt" = NOW()
    RETURNING "count"
  `
  const count = Number(rows[0]?.count ?? 1)

  return {
    allowed: count <= rule.limit,
    action,
    dimension: rule.dimension,
    limit: rule.limit,
    count,
    retryAfterSec: window.retryAfterSec,
    windowEndsAt: new Date(window.endMs),
  }
}

export async function enforceHumanityRateLimits({
  request,
  action,
  principal,
  secret,
  wallet,
  sessionId,
  verificationId,
}: {
  request: Request
  action: HumanityAbuseAction
  principal: string
  secret: string
  wallet?: string | null
  sessionId?: string | null
  verificationId?: string | null
}) {
  const network = deriveHumanityNetworkSubject(request, secret)
  const rules = getHumanityRateLimitRules({ action, principal, network, wallet, sessionId, verificationId })

  for (const rule of rules) {
    const result = await consumeHumanityRateLimit({ action, rule, secret })
    if (!result.allowed) return result
  }
  return null
}

export function humanityRateLimitResponse(result: HumanityRateLimitResult) {
  return Response.json(
    {
      error: "Humanity request rate limited",
      reasonCodes: ["HUMANITY_RATE_LIMITED", `RATE_LIMIT_DIMENSION:${result.dimension.toUpperCase()}`],
      retryAfterSec: result.retryAfterSec,
      limit: result.limit,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec),
        "Cache-Control": "no-store",
      },
    }
  )
}

export async function pruneHumanityAbuseBuckets() {
  await db.$executeRaw`DELETE FROM "HumanityAbuseBucket" WHERE "expiresAt" < NOW()`
}
