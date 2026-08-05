import { NextResponse } from "next/server"

import {
  clearSessionCookie,
  revokeCurrentSession,
} from "@/lib/auth/session"
import { assertTrustedAuthOrigin } from "@/lib/auth/security"

export const runtime = "nodejs"

export async function POST(request: Request) {
  assertTrustedAuthOrigin(request)
  await revokeCurrentSession()
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
