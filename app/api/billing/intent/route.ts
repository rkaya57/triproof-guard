import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { createPaymentIntent, type PaymentCurrency } from "@/lib/billing/payment-intent"
import {
  getAnalysisCreditPack,
  getSubscriptionPlan,
  isSelfServeSubscriptionPlan,
} from "@/lib/billing/plans"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    plan?: string
    pack?: string
    currency?: string
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

  const currency = String(body.currency ?? "USDC").trim().toUpperCase()
  if (currency !== "USDC" && currency !== "SOL") {
    return NextResponse.json({ error: "Unsupported payment currency." }, { status: 400 })
  }

  const item = subscriptionPlan ?? creditPack!
  try {
    const intent = await createPaymentIntent({
      userId: user.id,
      purchaseKind: subscriptionPlan ? "subscription" : "credits",
      itemId: item.id,
      currency: currency as PaymentCurrency,
      amountUsdc: item.amountUsdc,
    })

    return NextResponse.json({
      ok: true,
      currency: intent.currency,
      amountUsdc: intent.amountUsdc,
      amountSol: intent.amountSol,
      solUsdPrice: intent.solUsdPrice,
      reference: intent.reference,
      expiresAt: intent.expiresAt,
      intent: intent.token,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment intent could not be prepared. Please try again shortly.",
      },
      { status: 503 }
    )
  }
}
