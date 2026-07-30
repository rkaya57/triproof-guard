import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { getAnalysisCreditPack, getSubscriptionPlan } from "@/lib/billing/plans"
import { createSolPaymentQuote } from "@/lib/billing/sol-price-quote"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { plan?: string; pack?: string }
  const plan = getSubscriptionPlan(body.plan)
  const pack = getAnalysisCreditPack(body.pack)
  const item = plan ?? pack

  if (!item || plan?.id === "free") return NextResponse.json({ error: "Invalid checkout item." }, { status: 400 })

  try {
    const quote = await createSolPaymentQuote({
      userId: user.id,
      plan: item.id,
      amountUsdc: item.amountUsdc,
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
