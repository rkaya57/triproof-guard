import { NextResponse } from "next/server"

import { isAuthEmailConfigured } from "@/lib/auth/email"
import { issueEmailVerification } from "@/lib/auth/flows"
import {
  AuthRequestError,
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  enforceAuthRateLimit,
  recordAuthSecurityEvent,
  verifyTurnstileToken,
} from "@/lib/auth/security"
import { findAuthUserByEmail } from "@/lib/auth/store"
import { resendVerificationSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

const genericMessage = "If this address has an unverified account, a new verification email has been sent."

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    if (!isAuthEmailConfigured()) {
      throw new AuthRequestError(
        "Verification email is temporarily unavailable. Please contact support.",
        503
      )
    }

    const parsed = resendVerificationSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })

    const { ipHash, emailHash } = authRateKeys(request, parsed.data.email)
    const allowance = await enforceAuthRateLimit(`auth:verify-resend:ip:${ipHash}`, 5, 60 * 60)
    await enforceAuthRateLimit(`auth:verify-resend:email:${emailHash}`, 3, 60 * 60)
    await verifyTurnstileToken({
      token: parsed.data.turnstileToken,
      request,
      required: allowance.count > 2,
    })

    const user = await findAuthUserByEmail(parsed.data.email)
    if (user && !user.emailVerifiedAt) {
      const delivery = await issueEmailVerification(user)
      if (!delivery.delivered) {
        throw new AuthRequestError(
          "Verification email is temporarily unavailable. Please contact support.",
          503
        )
      }
      await recordAuthSecurityEvent({
        request,
        type: "EMAIL_VERIFICATION_RESENT",
        success: true,
        userId: user.id,
        identifier: user.email,
      })
    }
    return NextResponse.json({ ok: true, message: genericMessage })
  } catch (error) {
    const normalized = authErrorResponse(error)
    return NextResponse.json(normalized.body, {
      status: normalized.status,
      headers: normalized.headers,
    })
  }
}
