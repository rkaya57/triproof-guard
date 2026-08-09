import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { getAnalysisCreditPack, getSubscriptionPlan, isSelfServeSubscriptionPlan } from "@/lib/billing/plans"
import { verifyPaymentIntent } from "@/lib/billing/payment-intent"
import { settleCreditPackPayment, settleSubscriptionPayment } from "@/lib/billing/payment-settlement"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import {
  verifySolanaNativeSolTransfer,
  verifySolanaUsdcTransfer,
} from "@/lib/billing/solana-pay"

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
    pack?: string
    txHash?: string
    currency?: string
    intent?: string
  }

  const subscriptionPlan = getSubscriptionPlan(body.plan)
  const creditPack = getAnalysisCreditPack(body.pack)
  if ((subscriptionPlan && creditPack) || (!subscriptionPlan && !creditPack)) {
    return NextResponse.json({ error: "Invalid checkout item." }, { status: 400 })
  }
  if (subscriptionPlan?.id === "free") {
    return NextResponse.json({ error: "Free plan does not require a payment." }, { status: 400 })
  }
  if (subscriptionPlan && !isSelfServeSubscriptionPlan(subscriptionPlan.id)) {
    return NextResponse.json(
      { error: "This plan is available only through a selected pilot." },
      { status: 403 }
    )
  }

  if (!solanaNetwork.treasury) {
    return NextResponse.json(
      { error: "Solana treasury wallet is not configured." },
      { status: 500 }
    )
  }

  const item = subscriptionPlan ?? creditPack!
  const txHash = String(body.txHash ?? "").trim()
  const currency = String(body.currency ?? "USDC").trim().toUpperCase()
  const intentToken = String(body.intent ?? "").trim()

  if (!txHash) {
    return NextResponse.json(
      { error: "Solana transaction signature is required." },
      { status: 400 }
    )
  }
  if (currency !== "USDC" && currency !== "SOL") {
    return NextResponse.json({ error: "Unsupported payment currency." }, { status: 400 })
  }
  if (!intentToken) {
    return NextResponse.json(
      { error: "A signed checkout intent is required. Reload checkout and try again." },
      { status: 400 }
    )
  }

  try {
    const intent = await verifyPaymentIntent(intentToken)
    const expectedKind = subscriptionPlan ? "subscription" : "credits"
    if (
      !intent ||
      intent.userId !== user.id ||
      intent.purchaseKind !== expectedKind ||
      intent.itemId !== item.id ||
      intent.currency !== currency ||
      intent.amountUsdc !== item.amountUsdc
    ) {
      return NextResponse.json(
        { error: "Your checkout intent is invalid, expired, or does not match this purchase." },
        { status: 400 }
      )
    }

    const verification =
      currency === "SOL"
        ? await verifySolanaNativeSolTransfer({
            txHash,
            network: solanaNetwork,
            expectedAmountSol: intent.amountSol!,
            requiredReference: intent.reference,
          })
        : await verifySolanaUsdcTransfer({
            txHash,
            network: solanaNetwork,
            expectedAmountUsdc: item.amountUsdc,
            requiredReference: intent.reference,
          })

    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.error },
        { status: 400 }
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
    const provider = currency === "SOL" ? "solana_sol" as const : "solana_usdc" as const
    const rawData = {
      currency,
      intentId: intent.intentId,
      reference: intent.reference,
      requestedTxHash: txHash,
      verifiedTxHash: verification.txHash,
      expectedAmountUsdc: item.amountUsdc,
      expectedAmountSol: currency === "SOL" ? intent.amountSol : null,
      receivedAmountSol,
      receivedAmountUsdc,
      solUsdPrice: currency === "SOL" ? intent.solUsdPrice : null,
      confirmations: verification.confirmations,
      checkoutIntentExpiresAt: intent.expiresAt,
    }

    if (creditPack) {
      const paymentResult = await settleCreditPackPayment({
        userId: user.id,
        packId: creditPack.id,
        txHash: verification.txHash,
        reference: intent.reference,
        amountUsdc: creditPack.amountUsdc,
        confirmations: verification.confirmations,
        provider,
        rawData: {
          ...rawData,
          accessModel: "persistent_sybil_wallet_credits",
        },
      })

      return NextResponse.json({
        ok: true,
        pack: creditPack.id,
        network: "solana",
        txHash: verification.txHash,
        reference: intent.reference,
        amountUsdc: creditPack.amountUsdc,
        walletCredits: creditPack.walletCredits,
        creditBalance: paymentResult.balance,
        confirmations: verification.confirmations,
        alreadyRecorded: paymentResult.alreadyRecorded,
        message: paymentResult.alreadyRecorded
          ? `Solana ${currency} payment was already verified. Your Sybil wallet credits are available.`
          : `Solana ${currency} payment verified. ${creditPack.walletCredits.toLocaleString()} Sybil wallet credits are now available.`,
      })
    }

    const selfServePlanId = subscriptionPlan?.id
    if (!selfServePlanId || !isSelfServeSubscriptionPlan(selfServePlanId)) {
      return NextResponse.json({ error: "Invalid self-serve subscription plan." }, { status: 400 })
    }

    const paymentResult = await settleSubscriptionPayment({
      userId: user.id,
      planId: selfServePlanId,
      txHash: verification.txHash,
      reference: intent.reference,
      amountUsdc: subscriptionPlan!.amountUsdc,
      confirmations: verification.confirmations,
      provider,
      rawData: {
        ...rawData,
        accessModel: "30_day_subscription",
      },
    })

    return NextResponse.json({
      ok: true,
      plan: subscriptionPlan!.id,
      network: "solana",
      txHash: verification.txHash,
      reference: intent.reference,
      amountUsdc: subscriptionPlan!.amountUsdc,
      confirmations: verification.confirmations,
      expiresAt: paymentResult.subscription.expiresAt,
      alreadyRecorded: paymentResult.alreadyRecorded,
      message: paymentResult.alreadyRecorded
        ? `Solana ${currency} payment was already verified. Your ${subscriptionPlan!.name} access is active.`
        : `Solana ${currency} payment verified. ${subscriptionPlan!.name} access is active for 30 days.`,
    })
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
