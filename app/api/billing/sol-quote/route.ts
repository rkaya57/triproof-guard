import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { createPaymentIntent } from "@/lib/billing/payment-intent"
import {
  getAnalysisCreditPack,
  getSubscriptionPlan,
  isSelfServeSubscriptionPlan,
} from "@/lib/billing/plans"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { plan?: string; pack?: string }
  const plan = getSubscriptionPlan(body.plan)
  const pack = getAnalysisCreditPack(body.pack)
  if ((plan && pack) || (!plan && !pack) || plan?.id === "free") {
    return NextResponse.json({ error: "Invalid checkout item." }, { status: 400 })
  }
  if (plan && !isSelfServeSubscriptionPlan(plan.id)) {
    return NextResponse.json(
      { error: "This plan is available only through a selected pilot." },
      { status: 403 }
    )
  }

  const item = plan ?? pack!
  try {
    const intent = await createPaymentIntent({
      userId: user.id,
      purchaseKind: plan ? "subscription" : "credits",
      itemId: item.id,
      currency: "SOL",
      amountUsdc: item.amountUsdc,
    })

    return NextResponse.json({
      ok: true,
      currency: "SOL",
      amountSol: intent.amountSol,
      solUsdPrice: intent.solUsdPrice,
      expiresAt: intent.expiresAt,
      reference: intent.reference,
      intent: intent.token,
      quote: intent.token,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Live SOL pricing is temporarily unavailable. Please use USDC or try again shortly.",
      },
      { status: 503 }
    )
  }
}
