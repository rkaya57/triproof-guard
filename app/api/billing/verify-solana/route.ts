import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { attachAccessPassCookie } from "@/lib/billing/access-pass"
import {
  verifySolanaUsdcTransfer,
  verifySolanaUsdcTransferByReference,
} from "@/lib/billing/solana-pay"

export const runtime = "nodejs"

const plans = {
  starter: { amountUsdc: 99, walletCredits: 1000 },
  growth: { amountUsdc: 249, walletCredits: 10000 },
  pro: { amountUsdc: 499, walletCredits: 50000 },
} as const

const solanaNetwork = {
  label: "Solana",
  treasury: process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS,
  usdcMint:
    process.env.SOLANA_USDC_MINT ??
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const

type PlanId = keyof typeof plans

export async function POST(request: Request) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    plan?: string
    txHash?: string
    reference?: string
  }

  const planId = body.plan as PlanId
  const plan = plans[planId]
  const txHash = String(body.txHash ?? "").trim()
  const reference = String(body.reference ?? "").trim()

  if (!plan) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 })
  }

  if (!solanaNetwork.treasury) {
    return NextResponse.json(
      { error: "Solana treasury wallet is not configured." },
      { status: 500 }
    )
  }

  if (!reference && !txHash) {
    return NextResponse.json(
      { error: "Solana payment reference or transaction signature is required." },
      { status: 400 }
    )
  }

  try {
    const verification = reference
      ? await verifySolanaUsdcTransferByReference({
          reference,
          network: solanaNetwork,
          expectedAmountUsdc: plan.amountUsdc,
        })
      : await verifySolanaUsdcTransfer({
          txHash,
          network: solanaNetwork,
          expectedAmountUsdc: plan.amountUsdc,
        })

    if (!verification.ok) {
      const isPending = "pending" in verification && verification.pending
      return NextResponse.json(
        { error: verification.error, pending: isPending },
        { status: isPending ? 202 : 400 }
      )
    }

    const response = NextResponse.json({
      ok: true,
      plan: planId,
      network: "solana",
      txHash: verification.txHash,
      reference: reference || null,
      amountUsdc: verification.receivedAmountUsdc,
      confirmations: verification.confirmations,
      walletCredits: plan.walletCredits,
      message: "Solana USDC payment verified. Analysis credits are active for this browser session.",
    })

    await attachAccessPassCookie(response, {
      userId: user.id,
      plan: planId,
      txHash: verification.txHash,
      network: "solana",
      walletCredits: plan.walletCredits,
      amountUsdc: verification.receivedAmountUsdc,
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed." },
      { status: 500 }
    )
  }
}
