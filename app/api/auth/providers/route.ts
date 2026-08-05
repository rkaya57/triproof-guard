import { NextResponse } from "next/server"

import { isAuthEmailConfigured } from "@/lib/auth/email"
import { configuredOAuthProviders } from "@/lib/auth/oauth"
import {
  configuredTurnstileSiteKey,
  isEmailVerificationRequired,
  turnstileConfiguration,
} from "@/lib/auth/security"

export const runtime = "nodejs"

export async function GET() {
  const turnstile = turnstileConfiguration()
  return NextResponse.json({
    oauth: configuredOAuthProviders(),
    emailDelivery: isAuthEmailConfigured(),
    emailVerificationRequired: isEmailVerificationRequired(),
    turnstileSiteKey: configuredTurnstileSiteKey(),
    turnstileConfigurationValid: !turnstile.invalid,
    wallet: ["EVM", "SOLANA"],
  })
}
