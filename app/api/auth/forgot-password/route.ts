import { NextResponse } from "next/server"

import { issuePasswordReset } from "@/lib/auth/flows"
import {
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  enforceAuthRateLimit,
  recordAuthSecurityEvent,
  verifyTurnstileToken,
} from "@/lib/auth/security"
import { findAuthUserByEmail } from "@/lib/auth/store"
import { forgotPasswordSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

const genericMessage = "If an account exists for this email, a password reset link has been sent."

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })

    const { ipHash, emailHash } = authRateKeys(request, parsed.data.email)
    const allowance = await enforceAuthRateLimit(`auth:forgot:ip:${ipHash}`, 5, 60 * 60)
    await enforceAuthRateLimit(`auth:forgot:email:${emailHash}`, 3, 60 * 60)
    await verifyTurnstileToken({
      token: parsed.data.turnstileToken,
      request,
      required: allowance.count > 2,
    })

    const user = await findAuthUserByEmail(parsed.data.email)
    if (user) {
      const delivery = await issuePasswordReset(user)
      await recordAuthSecurityEvent({
        request,
        type: "PASSWORD_RESET_REQUESTED",
        success: delivery.delivered,
        userId: user.id,
        identifier: user.email,
      })
    } else {
      await recordAuthSecurityEvent({
        request,
        type: "PASSWORD_RESET_REQUESTED_UNKNOWN",
        success: true,
        identifier: parsed.data.email,
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
