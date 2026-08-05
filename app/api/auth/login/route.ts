import { NextResponse } from "next/server"

import { verifyPassword, hashPassword } from "@/lib/auth/password"
import {
  attachSessionCookie,
} from "@/lib/auth/session"
import {
  clearAuthRateLimit,
  enforceAuthRateLimit,
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  consumeAuthRateLimit,
  recordAuthSecurityEvent,
  verifyTurnstileToken,
  isEmailVerificationRequired,
} from "@/lib/auth/security"
import { findAuthUserByEmail } from "@/lib/auth/store"
import { authSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

const dummyPasswordHash = hashPassword("TriProof-Dummy-Password-Not-A-Real-Account-2026")

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const body = await request.json().catch(() => null)
    const parsed = authSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 400 })
    }

    const { ipHash, emailHash } = authRateKeys(request, parsed.data.email)
    const ipAllowance = await enforceAuthRateLimit(`auth:login:ip:${ipHash}`, 20, 10 * 60)
    await enforceAuthRateLimit(`auth:login:email:${emailHash}`, 10, 10 * 60)
    await verifyTurnstileToken({
      token: parsed.data.turnstileToken,
      request,
      required: ipAllowance.count > 7,
    })

    const user = await findAuthUserByEmail(parsed.data.email)
    const passwordMatches = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : await verifyPassword(parsed.data.password, await dummyPasswordHash)

    if (!user || !passwordMatches) {
      const failure = await consumeAuthRateLimit(`auth:login:failure:${emailHash}`, 5, 15 * 60)
      await recordAuthSecurityEvent({
        request,
        type: "LOGIN_FAILED",
        success: false,
        userId: user?.id,
        identifier: parsed.data.email,
        metadata: { failureCount: failure.count },
      })
      const status = failure.allowed ? 401 : 429
      const headers = failure.allowed ? undefined : { "Retry-After": String(failure.retryAfterSeconds) }
      return NextResponse.json(
        { error: failure.allowed ? "Invalid email or password" : "Too many failed attempts. Try again later." },
        { status, headers }
      )
    }

    if (isEmailVerificationRequired() && !user.emailVerifiedAt) {
      await recordAuthSecurityEvent({
        request,
        type: "LOGIN_EMAIL_UNVERIFIED",
        success: false,
        userId: user.id,
        identifier: user.email,
      })
      return NextResponse.json(
        { error: "Verify your email before signing in.", code: "EMAIL_NOT_VERIFIED", email: user.email },
        { status: 403 }
      )
    }

    await clearAuthRateLimit(`auth:login:failure:${emailHash}`)
    const next = user.onboardingCompletedAt ? null : "/onboarding"
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      next,
    })
    await attachSessionCookie(response, user.id, {
      request,
      remember: parsed.data.remember,
    })
    await recordAuthSecurityEvent({
      request,
      type: "LOGIN_SUCCEEDED",
      success: true,
      userId: user.id,
      identifier: user.email,
      metadata: { remembered: parsed.data.remember },
    })
    return response
  } catch (error) {
    const normalized = authErrorResponse(error)
    return NextResponse.json(normalized.body, {
      status: normalized.status,
      headers: normalized.headers,
    })
  }
}
