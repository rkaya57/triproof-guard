import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { createSolPaymentQuote } from "@/lib/billing/sol-price-quote"

export const runtime = "nodejs"

const plans = {
  starter: { amountUsdc: 29 },
  growth: { amountUsdc: 99 },
  pro: { amountUsdc: 249 },
} as const

type PlanId = keyof typeof plans

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { plan?: string }
  const planId = body.plan as PlanId
  const plan = plans[planId]

  if (!plan) return NextResponse.json({ error: "Invalid plan." }, { status: 400 })

  try {
    const quote = await createSolPaymentQuote({
      userId: user.id,
      plan: planId,
      amountUsdc: plan.amountUsdc,
    })

    return NextResponse.json({
      ok: true,
      currency: "SOL",
      amountSol: quote.amountSol,
      solUsdPrice: quote.solUsdPrice,
      expiresAt: quote.expiresAt,
      quote: quote.token,
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
