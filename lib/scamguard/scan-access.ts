import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { consumeDailyScan, getSubscriptionEntitlement, SubscriptionLimitError } from "@/lib/billing/subscription"
import { loginPathFor } from "@/lib/auth/redirects"

export async function scanAccess(deepRequested: boolean) {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      deepScan: false,
      error: NextResponse.json(
        {
          error: "Sign in to use ScamGuard and receive your daily scan allowance.",
          code: "AUTH_REQUIRED",
          loginUrl: loginPathFor("/scamguard"),
        },
        { status: 401 }
      ),
    }
  }
  try {
    const entitlement = await getSubscriptionEntitlement(user)
    const consumed = await consumeDailyScan(user, deepRequested && entitlement.plan.deepUrlScamDna)
    return {
      user,
      deepScan: deepRequested && entitlement.plan.deepUrlScamDna,
      plan: consumed.plan,
      scanCount: "usage" in consumed ? consumed.usage.scanCount : 0,
      error: null,
    }
  } catch (error) {
    if (error instanceof SubscriptionLimitError) {
      return { user, deepScan: false, error: NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "DAILY_SCAN_LIMIT" ? 429 : 403 }) }
    }
    throw error
  }
}
