import { NextResponse } from "next/server"

import { attachSessionCookie } from "@/lib/auth/session"
import {
  assertTrustedAuthOrigin,
  authErrorResponse,
  hashOpaqueToken,
  recordAuthSecurityEvent,
} from "@/lib/auth/security"
import {
  consumeAuthToken,
  markEmailVerified,
} from "@/lib/auth/store"
import { authTokenSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const parsed = authTokenSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "The verification link is invalid." }, { status: 400 })
    }

    const token = await consumeAuthToken({
      tokenHash: hashOpaqueToken(parsed.data.token),
      type: "EMAIL_VERIFY",
    })
    if (!token?.userId) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired." },
        { status: 400 }
      )
    }

    const user = await markEmailVerified(token.userId)
    if (!user) throw new Error("Verified account could not be loaded.")
    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email },
      next: user.onboardingCompletedAt ? "/dashboard" : "/onboarding",
    })
    await attachSessionCookie(response, user.id, {
      request,
      remember: parsed.data.remember,
    })
    await recordAuthSecurityEvent({
      request,
      type: "EMAIL_VERIFIED",
      success: true,
      userId: user.id,
      identifier: user.email,
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
