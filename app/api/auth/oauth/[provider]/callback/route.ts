import { NextResponse } from "next/server"

import { completeOAuth, parseOAuthProvider } from "@/lib/auth/oauth"
import { attachSessionCookie } from "@/lib/auth/session"
import { authAppUrl, recordAuthSecurityEvent } from "@/lib/auth/security"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await params
  const provider = parseOAuthProvider(rawProvider)
  const incoming = new URL(request.url)
  if (!provider) return NextResponse.redirect(new URL("/login?oauth_error=unsupported", authAppUrl()))

  const code = incoming.searchParams.get("code")
  const state = incoming.searchParams.get("state")
  const denied = incoming.searchParams.get("error")
  if (!code || !state || denied) {
    const target = new URL("/login", authAppUrl())
    target.searchParams.set("oauth_error", denied || "OAuth authorization was not completed.")
    return NextResponse.redirect(target)
  }

  try {
    const result = await completeOAuth({ provider, code, state })
    const response = NextResponse.redirect(new URL(result.redirectTo, authAppUrl()))
    await attachSessionCookie(response, result.user.id, { request, remember: true })
    await recordAuthSecurityEvent({
      request,
      type: "OAUTH_LOGIN_SUCCEEDED",
      success: true,
      userId: result.user.id,
      identifier: result.user.email,
      metadata: { provider },
    })
    return response
  } catch (error) {
    await recordAuthSecurityEvent({
      request,
      type: "OAUTH_LOGIN_FAILED",
      success: false,
      metadata: { provider, reason: error instanceof Error ? error.message.slice(0, 300) : "unknown" },
    })
    const target = new URL("/login", authAppUrl())
    target.searchParams.set("oauth_error", error instanceof Error ? error.message : "OAuth login failed.")
    return NextResponse.redirect(target)
  }
}
