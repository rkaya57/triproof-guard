import { NextResponse } from "next/server"

import { configuredOAuthProviders } from "@/lib/auth/oauth"
import { isAuthEmailConfigured } from "@/lib/auth/email"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    oauth: configuredOAuthProviders(),
    emailVerification: isAuthEmailConfigured(),
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    wallet: ["EVM", "SOLANA"],
  })
}
