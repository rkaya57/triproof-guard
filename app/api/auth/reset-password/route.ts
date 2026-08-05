import { NextResponse } from "next/server"

import { hashPassword } from "@/lib/auth/password"
import {
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  enforceAuthRateLimit,
  hashOpaqueToken,
  recordAuthSecurityEvent,
} from "@/lib/auth/security"
import {
  consumeAuthToken,
  findAuthUserById,
  updatePasswordAndRevokeSessions,
} from "@/lib/auth/store"
import { resetPasswordSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the password fields.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { ipHash } = authRateKeys(request)
    await enforceAuthRateLimit(`auth:reset:ip:${ipHash}`, 8, 60 * 60)
    const token = await consumeAuthToken({
      tokenHash: hashOpaqueToken(parsed.data.token),
      type: "PASSWORD_RESET",
      maxAttempts: 5,
    })
    if (!token?.userId) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired." },
        { status: 400 }
      )
    }

    const user = await findAuthUserById(token.userId)
    if (!user) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired." },
        { status: 400 }
      )
    }
    await updatePasswordAndRevokeSessions(user.id, await hashPassword(parsed.data.password))
    await recordAuthSecurityEvent({
      request,
      type: "PASSWORD_RESET_COMPLETED",
      success: true,
      userId: user.id,
      identifier: user.email,
    })
    return NextResponse.json({ ok: true, next: "/login?reset=success" })
  } catch (error) {
    const normalized = authErrorResponse(error)
    return NextResponse.json(normalized.body, {
      status: normalized.status,
      headers: normalized.headers,
    })
  }
}
