import { NextResponse } from "next/server"
import { z } from "zod"

import { hashPassword, verifyPassword } from "@/lib/auth/password"
import {
  attachSessionCookie,
  requireVerifiedCurrentUser,
} from "@/lib/auth/session"
import {
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  enforceAuthRateLimit,
  passwordPolicyIssues,
  recordAuthSecurityEvent,
} from "@/lib/auth/security"
import {
  findAuthUserById,
  updatePasswordAndRevokeSessions,
} from "@/lib/auth/store"

export const runtime = "nodejs"

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password: z.string().min(1).max(128),
    confirmPassword: z.string().min(1).max(128),
  })
  .superRefine((value, context) => {
    for (const issue of passwordPolicyIssues(value.password)) {
      context.addIssue({ code: "custom", path: ["password"], message: issue })
    }
    if (value.password !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match" })
    }
    if (value.currentPassword === value.password) {
      context.addIssue({ code: "custom", path: ["password"], message: "Choose a password you are not currently using" })
    }
  })

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const currentUser = await requireVerifiedCurrentUser()
    const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the password fields.", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { ipHash } = authRateKeys(request, currentUser.email)
    await enforceAuthRateLimit(`auth:change-password:ip:${ipHash}`, 8, 60 * 60)
    await enforceAuthRateLimit(`auth:change-password:user:${currentUser.id}`, 5, 60 * 60)

    const user = await findAuthUserById(currentUser.id)
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      await recordAuthSecurityEvent({
        request,
        type: "PASSWORD_CHANGE_FAILED",
        success: false,
        userId: currentUser.id,
        identifier: currentUser.email,
      })
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 })
    }

    await updatePasswordAndRevokeSessions(
      currentUser.id,
      await hashPassword(parsed.data.password)
    )
    const response = NextResponse.json({ ok: true })
    await attachSessionCookie(response, currentUser.id, { request, remember: false })
    await recordAuthSecurityEvent({
      request,
      type: "PASSWORD_CHANGED",
      success: true,
      userId: currentUser.id,
      identifier: currentUser.email,
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
