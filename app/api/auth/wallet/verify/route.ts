import { NextResponse } from "next/server"

import {
  attachSessionCookie,
  getCurrentUser,
} from "@/lib/auth/session"
import {
  assertTrustedAuthOrigin,
  authErrorResponse,
  authRateKeys,
  enforceAuthRateLimit,
  recordAuthSecurityEvent,
} from "@/lib/auth/security"
import {
  findAuthUserById,
  findUserByAuthWallet,
} from "@/lib/auth/store"
import { verifyWalletChallenge } from "@/lib/auth/wallet"
import { linkWalletWithoutReassignment } from "@/lib/auth/wallet-account"
import { walletVerifySchema } from "@/lib/validators/wallet"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    assertTrustedAuthOrigin(request)
    const parsed = walletVerifySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Invalid wallet signature request." }, { status: 400 })

    const { ipHash } = authRateKeys(request)
    await enforceAuthRateLimit(`auth:wallet-verify:ip:${ipHash}`, 20, 10 * 60)
    const verified = await verifyWalletChallenge(parsed.data)

    if (verified.purpose === "LINK") {
      const currentUser = await getCurrentUser()
      if (!currentUser || verified.userId !== currentUser.id) {
        return NextResponse.json({ error: "The wallet-link session is no longer valid." }, { status: 401 })
      }
      await linkWalletWithoutReassignment({
        userId: currentUser.id,
        chain: verified.chain,
        address: verified.address,
      })
      await recordAuthSecurityEvent({
        request,
        type: "WALLET_LINKED",
        success: true,
        userId: currentUser.id,
        identifier: currentUser.email,
        metadata: { chain: verified.chain, address: verified.address },
      })
      return NextResponse.json({ ok: true, linked: true })
    }

    const userId = await findUserByAuthWallet(verified.chain, verified.address)
    const user = userId ? await findAuthUserById(userId) : null
    if (!user) {
      await recordAuthSecurityEvent({
        request,
        type: "WALLET_LOGIN_UNKNOWN",
        success: false,
        metadata: { chain: verified.chain },
      })
      return NextResponse.json(
        { error: "This wallet is not linked to a Tri-Proof account." },
        { status: 404 }
      )
    }

    const next = user.onboardingCompletedAt
      ? verified.redirectTo
      : `/onboarding?next=${encodeURIComponent(verified.redirectTo)}`
    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email },
      next,
    })
    await attachSessionCookie(response, user.id, {
      request,
      remember: parsed.data.remember,
    })
    await recordAuthSecurityEvent({
      request,
      type: "WALLET_LOGIN_SUCCEEDED",
      success: true,
      userId: user.id,
      identifier: user.email,
      metadata: { chain: verified.chain, address: verified.address },
    })
    return response
  } catch (error) {
    const normalized = authErrorResponse(error)
    return NextResponse.json(normalized.body, { status: normalized.status, headers: normalized.headers })
  }
}
