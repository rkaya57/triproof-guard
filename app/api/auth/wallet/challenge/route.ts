import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import {
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  enforceAuthRateLimit,
} from "@/lib/auth/security"
import { createWalletChallenge } from "@/lib/auth/wallet"
import { walletChallengeSchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const parsed = walletChallengeSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Invalid wallet request." }, { status: 400 })

    const { ipHash } = authRateKeys(request)
    await enforceAuthRateLimit(`auth:wallet-challenge:ip:${ipHash}`, 20, 10 * 60)
    const currentUser = await getCurrentUser()
    if (parsed.data.purpose === "LINK" && !currentUser) {
      return NextResponse.json({ error: "Sign in before linking a wallet." }, { status: 401 })
    }

    const challenge = await createWalletChallenge({
      ...parsed.data,
      userId: parsed.data.purpose === "LINK" ? currentUser?.id : null,
    })
    return NextResponse.json(challenge)
  } catch (error) {
    const normalized = authErrorResponse(error)
    return NextResponse.json(normalized.body, { status: normalized.status, headers: normalized.headers })
  }
}
