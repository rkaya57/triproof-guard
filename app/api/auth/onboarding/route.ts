import { NextResponse } from "next/server"

import { requireVerifiedCurrentUser } from "@/lib/auth/session"
import { assertTrustedAuthOrigin, authErrorResponse, recordAuthSecurityEvent } from "@/lib/auth/security"
import { completeUserOnboarding, getUserAccountProfile } from "@/lib/auth/store"
import { onboardingSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function GET() {
  try {
    const user = await requireVerifiedCurrentUser()
    const profile = await getUserAccountProfile(user.id)
    return NextResponse.json({ profile })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const user = await requireVerifiedCurrentUser()
    const parsed = onboardingSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the onboarding fields.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    await completeUserOnboarding({ userId: user.id, ...parsed.data })
    await recordAuthSecurityEvent({
      request,
      type: "ONBOARDING_COMPLETED",
      success: true,
      userId: user.id,
      identifier: user.email,
      metadata: {
        accountRole: parsed.data.accountRole,
        primaryUseCase: parsed.data.primaryUseCase,
      },
    })
    return NextResponse.json({ ok: true, next: "/dashboard" })
  } catch (error) {
    const normalized = authErrorResponse(error)
    return NextResponse.json(normalized.body, { status: normalized.status, headers: normalized.headers })
  }
}
