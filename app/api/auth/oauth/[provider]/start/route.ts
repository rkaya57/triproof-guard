import { NextResponse } from "next/server"

import { beginOAuth, parseOAuthProvider } from "@/lib/auth/oauth"
import { safePostAuthPath } from "@/lib/auth/redirects"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await params
  const provider = parseOAuthProvider(rawProvider)
  if (!provider) return NextResponse.json({ error: "Unsupported OAuth provider." }, { status: 404 })

  const url = new URL(request.url)
  const intent = url.searchParams.get("intent") === "register" ? "register" : "login"
  const termsAccepted = url.searchParams.get("terms") === "true"
  try {
    const authorizationUrl = await beginOAuth({
      provider,
      intent,
      termsAccepted,
      redirectTo: safePostAuthPath(url.searchParams.get("next")),
    })
    return NextResponse.redirect(authorizationUrl)
  } catch (error) {
    const target = new URL(intent === "register" ? "/register" : "/login", url.origin)
    target.searchParams.set("oauth_error", error instanceof Error ? error.message : "OAuth could not be started.")
    return NextResponse.redirect(target)
  }
}
