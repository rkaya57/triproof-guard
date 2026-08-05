import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { getSessionSigningSecret } from "@/lib/env/validation"

export type AuthRateLimitResult = {
  allowed: boolean
  count: number
  retryAfterSeconds: number
}

type RateLimitRow = { count: number; expiresAt: Date }

export class AuthRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = "AuthRequestError"
  }
}

export function requestClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown"
}

export function requestUserAgent(request: Request) {
  return request.headers.get("user-agent")?.slice(0, 500) || null
}

export function hashAuthValue(value: string) {
  return createHmac("sha256", getSessionSigningSecret()).update(value).digest("hex")
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url")
}

export function assertTrustedAuthOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return
  const requestOrigin = new URL(request.url).origin
  if (origin !== requestOrigin) {
    throw new AuthRequestError("Cross-site authentication request rejected.", 403)
  }
}

export async function consumeAuthRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<AuthRateLimitResult> {
  const rows = await db.$queryRaw<RateLimitRow[]>(
    Prisma.sql`
      INSERT INTO "AuthRateLimitBucket" (
        "key", "count", "windowStart", "expiresAt", "updatedAt"
      ) VALUES (
        ${key}, 1, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + (${windowSeconds} * INTERVAL '1 second'),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "AuthRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "AuthRateLimitBucket"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "AuthRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
          ELSE "AuthRateLimitBucket"."windowStart"
        END,
        "expiresAt" = CASE
          WHEN "AuthRateLimitBucket"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${windowSeconds} * INTERVAL '1 second')
          ELSE "AuthRateLimitBucket"."expiresAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "count", "expiresAt"
    `
  )
  const row = rows[0]
  if (!row) return { allowed: false, count: limit + 1, retryAfterSeconds: windowSeconds }
  return {
    allowed: row.count <= limit,
    count: row.count,
    retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)),
  }
}

export async function clearAuthRateLimit(key: string) {
  await db.$executeRaw(
    Prisma.sql`DELETE FROM "AuthRateLimitBucket" WHERE "key" = ${key}`
  )
}

export async function enforceAuthRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message = "Too many attempts. Please try again later."
) {
  const result = await consumeAuthRateLimit(key, limit, windowSeconds)
  if (!result.allowed) {
    throw new AuthRequestError(message, 429, result.retryAfterSeconds)
  }
  return result
}

export function authRateKeys(request: Request, email?: string | null) {
  const ipHash = hashAuthValue(requestClientIp(request))
  const emailHash = email ? hashAuthValue(email.trim().toLowerCase()) : null
  return { ipHash, emailHash }
}

export async function recordAuthSecurityEvent(input: {
  request: Request
  type: string
  success: boolean
  userId?: string | null
  identifier?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const ipHash = hashAuthValue(requestClientIp(input.request))
  const identifierHash = input.identifier ? hashAuthValue(input.identifier.trim().toLowerCase()) : null
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "AuthSecurityEvent" (
        "id", "userId", "type", "success", "ipHash", "identifierHash", "metadata", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${input.userId ?? null}, ${input.type}, ${input.success},
        ${ipHash}, ${identifierHash}, ${metadata}::jsonb, CURRENT_TIMESTAMP
      )
    `
  ).catch(() => undefined)
}

export function isEmailVerificationRequired() {
  const configured = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase()
  if (configured === "true") return true
  if (configured === "false") return false
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim())
}

export function authAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://triproofprotocol.com").replace(/\/$/, "")
}

export async function verifyTurnstileToken(input: {
  token?: string | null
  request: Request
  required: boolean
}) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) {
    if (input.required && process.env.NODE_ENV === "production") {
      throw new AuthRequestError("Security verification is temporarily unavailable.", 503)
    }
    return true
  }
  if (!input.token) {
    if (input.required) throw new AuthRequestError("Complete the security verification.", 400)
    return false
  }

  const body = new URLSearchParams({
    secret,
    response: input.token,
    remoteip: requestClientIp(input.request),
  })
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(8_000),
  })
  const result = (await response.json().catch(() => null)) as { success?: boolean } | null
  if (!result?.success && input.required) {
    throw new AuthRequestError("Security verification failed. Please try again.", 400)
  }
  return Boolean(result?.success)
}

const commonPasswords = new Set([
  "password",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "letmein123",
  "admin123",
  "triproof",
  "triproof123",
])

export function passwordPolicyIssues(password: string) {
  const issues: string[] = []
  if (password.length < 10) issues.push("Use at least 10 characters.")
  if (password.length > 128) issues.push("Password must be 128 characters or fewer.")
  if (!/[a-zA-Z]/.test(password)) issues.push("Include at least one letter.")
  if (!/\d/.test(password)) issues.push("Include at least one number.")
  if (commonPasswords.has(password.trim().toLowerCase())) issues.push("Choose a less common password.")
  return issues
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequestError) {
    const headers = error.retryAfterSeconds
      ? { "Retry-After": String(error.retryAfterSeconds) }
      : undefined
    return { status: error.status, body: { error: error.message }, headers }
  }
  return {
    status: 503,
    body: { error: "Authentication service is temporarily unavailable. Please try again shortly." },
    headers: undefined,
  }
}
