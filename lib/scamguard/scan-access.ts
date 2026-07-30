import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { consumeDailyScan, getSubscriptionEntitlement, SubscriptionLimitError } from "@/lib/billing/subscription"

export async function scanAccess(deepRequested: boolean) {
  const user = await getCurrentUser()
  if (!user) {
    return { user: null, deepScan: false, error: null }
  }
  try {
    const entitlement = await getSubscriptionEntitlement(user)
    await consumeDailyScan(user, deepRequested && entitlement.plan.deepUrlScamDna)
    return { user, deepScan: deepRequested && entitlement.plan.deepUrlScamDna, error: null }
  } catch (error) {
    if (error instanceof SubscriptionLimitError) {
      return { user, deepScan: false, error: NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "DAILY_SCAN_LIMIT" ? 429 : 403 }) }
    }
    throw error
  }
}
