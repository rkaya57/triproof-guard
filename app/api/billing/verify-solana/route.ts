import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { assertAccessPassSigningConfigured } from "@/lib/billing/access-pass"
import { getSubscriptionPlan } from "@/lib/billing/plans"
import { activateSubscriptionPayment } from "@/lib/billing/subscription"
import { db } from "@/lib/db/prisma"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import {
  verifySolanaNativeSolTransfer,
  verifySolanaUsdcTransfer,
  verifySolanaUsdcTransferByReference,
} from "@/lib/billing/solana-pay"
import { verifySolPaymentQuote } from "@/lib/billing/sol-price-quote"

export const runtime = "nodejs"

const solanaNetwork = {
  label: "Solana",
  treasury: process.env.TRIPROOF_TREASURY_SOLANA_ADDRESS,
  usdcMint:
    process.env.SOLANA_USDC_MINT ??
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Verification failed."
}

function isBillingSchemaError(error: unknown) {
  const message = errorMessage(error).toLowerCase()
  return (
    isDatabaseConnectionError(error) ||
    message.includes("paymenttransaction") ||
    message.includes("creditledger") ||
    message.includes("does not exist") ||
    message.includes("migration")
  )
}

export async function POST(request: Request) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    plan?: string
    txHash?: string
    reference?: string
    currency?: string
    quote?: string
  }

  const plan = getSubscriptionPlan(body.plan)
  const planId = plan?.id
  const txHash = String(body.txHash ?? "").trim()
  const reference = String(body.reference ?? "").trim()
  const currency = String(body.currency ?? "USDC").trim().toUpperCase()
  const quoteToken = String(body.quote ?? "").trim()

  if (!plan || !planId) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 })
  }
  if (plan.id === "free") {
    return NextResponse.json({ error: "Free plan does not require a payment." }, { status: 400 })
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

  if (currency !== "USDC" && currency !== "SOL") {
    return NextResponse.json({ error: "Unsupported payment currency." }, { status: 400 })
  }

  try {
    assertAccessPassSigningConfigured()

    const quote = currency === "SOL" ? await verifySolPaymentQuote(quoteToken) : null
    if (currency === "SOL" && (!quote || quote.userId !== user.id || quote.plan !== planId || quote.amountUsdc !== plan.amountUsdc)) {
      return NextResponse.json(
        { error: "Your SOL quote is invalid or expired. Request a new quote before paying." },
        { status: 400 }
      )
    }

    const verification =
      currency === "SOL"
        ? await verifySolanaNativeSolTransfer({
            txHash,
            network: solanaNetwork,
            expectedAmountSol: quote!.amountSol,
          })
        : reference
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

    const receivedAmountUsdc =
      currency === "USDC" && "receivedAmountUsdc" in verification
        ? verification.receivedAmountUsdc
        : null
    const receivedAmountSol =
      currency === "SOL" && "receivedAmountSol" in verification
        ? verification.receivedAmountSol
        : null

    const existing = await db.paymentTransaction.findUnique({ where: { txHash: verification.txHash } })
    if (existing && existing.userId !== user.id) {
      return NextResponse.json({ error: "This Solana payment has already been claimed by another account." }, { status: 409 })
    }
    const payment = existing ?? await db.paymentTransaction.create({
      data: {
        userId: user.id,
        provider: currency === "SOL" ? "solana_sol" : "solana_usdc",
        network: "solana",
        plan: planId,
        txHash: verification.txHash,
        reference: reference || null,
        amountUsdc: plan.amountUsdc.toFixed(6),
        walletCredits: 0,
        confirmations: verification.confirmations,
        status: "verified",
        rawData: {
          currency,
          reference: reference || null,
          requestedTxHash: txHash || null,
          verifiedTxHash: verification.txHash,
          expectedAmountUsdc: plan.amountUsdc,
          expectedAmountSol: currency === "SOL" ? quote!.amountSol : null,
          receivedAmountSol,
          receivedAmountUsdc,
          solUsdPrice: currency === "SOL" ? quote!.solUsdPrice : null,
          confirmations: verification.confirmations,
          accessModel: "30_day_subscription",
        },
      },
    })
    const subscription = await activateSubscriptionPayment({
      userId: user.id,
      paymentTransactionId: payment.id,
      planId: planId as "builder" | "community" | "api_starter" | "api_growth",
    })

    const response = NextResponse.json({
      ok: true,
      plan: planId,
      network: "solana",
      txHash: verification.txHash,
      reference: reference || null,
      amountUsdc: plan.amountUsdc,
      confirmations: verification.confirmations,
      expiresAt: subscription.expiresAt,
      alreadyRecorded: Boolean(existing),
      message: existing
        ? `Solana ${currency} payment was already verified. Your ${plan.name} access is active.`
        : `Solana ${currency} payment verified. ${plan.name} access is active for 30 days.`,
    })
    return response
  } catch (error) {
    if (isBillingSchemaError(error)) {
      return NextResponse.json(
        {
          error: "Billing database schema is not ready. Run Prisma migrations, then redeploy.",
          code: "MIGRATION_REQUIRED",
          details: errorMessage(error).slice(0, 500),
          migrationCommand: "npx prisma generate && npx prisma migrate deploy",
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}
