import { NextResponse } from "next/server"

import { clearSessionCookie, requireCurrentUser } from "@/lib/auth/session"
import { assertTrustedAuthOrigin, recordAuthSecurityEvent } from "@/lib/auth/security"
import { revokeAllAuthSessions } from "@/lib/auth/store"

export const runtime = "nodejs"

export async function POST(request: Request) {
  assertTrustedAuthOrigin(request)
  const user = await requireCurrentUser()
  await revokeAllAuthSessions(user.id)
  await recordAuthSecurityEvent({
    request,
    type: "ALL_SESSIONS_REVOKED",
    success: true,
    userId: user.id,
    identifier: user.email,
  })
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
