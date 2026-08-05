import { NextResponse } from "next/server"

import {
  clearSessionCookie,
  getCurrentSession,
  requireCurrentUser,
} from "@/lib/auth/session"
import { assertTrustedAuthOrigin, recordAuthSecurityEvent } from "@/lib/auth/security"
import { revokeAuthSession } from "@/lib/auth/store"

export const runtime = "nodejs"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertTrustedAuthOrigin(request)
  const [user, current, resolved] = await Promise.all([
    requireCurrentUser(),
    getCurrentSession(),
    params,
  ])
  await revokeAuthSession(resolved.id, user.id)
  await recordAuthSecurityEvent({
    request,
    type: "SESSION_REVOKED",
    success: true,
    userId: user.id,
    identifier: user.email,
    metadata: { sessionId: resolved.id, current: current?.sessionId === resolved.id },
  })

  const response = NextResponse.json({ ok: true, currentRevoked: current?.sessionId === resolved.id })
  if (current?.sessionId === resolved.id) clearSessionCookie(response)
  return response
}
