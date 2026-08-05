import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { sendAuthEmail, isAuthEmailConfigured } from "@/lib/auth/email"
import { hashPassword } from "@/lib/auth/password"
import { attachSessionCookie } from "@/lib/auth/session"
import {
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  createOpaqueToken,
  enforceAuthRateLimit,
  hashOpaqueToken,
  isEmailVerificationRequired,
  recordAuthSecurityEvent,
  verifyTurnstileToken,
} from "@/lib/auth/security"
import {
  createAuthToken,
  createAuthUser,
  findAuthUserByEmail,
  findUserIdByReferralCode,
  revokeActiveTokens,
} from "@/lib/auth/store"
import { registerSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const body = await request.json().catch(() => null)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Check the highlighted registration fields.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { ipHash, emailHash } = authRateKeys(request, parsed.data.email)
    const ipAllowance = await enforceAuthRateLimit(`auth:register:ip:${ipHash}`, 5, 60 * 60)
    await enforceAuthRateLimit(`auth:register:email:${emailHash}`, 3, 60 * 60)
    await verifyTurnstileToken({
      token: parsed.data.turnstileToken,
      request,
      required: ipAllowance.count > 2,
    })

    const existing = await findAuthUserByEmail(parsed.data.email)
    if (existing) {
      await recordAuthSecurityEvent({
        request,
        type: "REGISTER_EXISTING_EMAIL",
        success: false,
        userId: existing.id,
        identifier: parsed.data.email,
      })
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      )
    }

    const verificationRequired = isEmailVerificationRequired()
    const referredByUserId = await findUserIdByReferralCode(parsed.data.referralCode)
    const now = new Date()
    const user = await createAuthUser({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      termsAcceptedAt: now,
      privacyAcceptedAt: now,
      emailVerifiedAt: verificationRequired ? null : now,
      referredByUserId,
    })
    if (!user) throw new Error("Account creation failed.")

    if (verificationRequired) {
      await revokeActiveTokens(user.id, "EMAIL_VERIFY")
      const token = createOpaqueToken()
      const tokenId = await createAuthToken({
        userId: user.id,
        type: "EMAIL_VERIFY",
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        metadata: { email: user.email },
      })
      const delivery = await sendAuthEmail({
        kind: "verify-email",
        to: user.email,
        name: user.name,
        token,
        redirectTo: "/onboarding",
        idempotencyKey: `verify-${tokenId}`,
      })
      await recordAuthSecurityEvent({
        request,
        type: "REGISTER_CREATED_UNVERIFIED",
        success: delivery.delivered,
        userId: user.id,
        identifier: user.email,
        metadata: { emailDelivered: delivery.delivered },
      })
      return NextResponse.json(
        {
          verificationRequired: true,
          email: user.email,
          emailDelivered: delivery.delivered,
          emailConfigured: isAuthEmailConfigured(),
        },
        { status: 201 }
      )
    }

    const response = NextResponse.json(
      {
        user: { id: user.id, name: user.name, email: user.email },
        next: "/onboarding",
        verificationRequired: false,
      },
      { status: 201 }
    )
    await attachSessionCookie(response, user.id, { request, remember: false })
    await recordAuthSecurityEvent({
      request,
      type: "REGISTER_SUCCEEDED",
      success: true,
      userId: user.id,
      identifier: user.email,
      metadata: { verificationRequired: false },
    })
    return response
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      )
    }
    const normalized = authErrorResponse(error)
    return NextResponse.json(normalized.body, {
      status: normalized.status,
      headers: normalized.headers,
    })
  }
}
