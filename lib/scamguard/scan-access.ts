import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { consumeDailyScan, getSubscriptionEntitlement, SubscriptionLimitError } from "@/lib/billing/subscription"
import { loginPathFor } from "@/lib/auth/redirects"

type ScanAccessDependencies = {
  getCurrentUser: typeof getCurrentUser
  getSubscriptionEntitlement: typeof getSubscriptionEntitlement
  consumeDailyScan: typeof consumeDailyScan
  loginPathFor: typeof loginPathFor
}

const defaultDependencies: ScanAccessDependencies = {
  getCurrentUser,
  getSubscriptionEntitlement,
  consumeDailyScan,
  loginPathFor,
}

export function createScanAccess(dependencies: ScanAccessDependencies = defaultDependencies) {
  return async function scanAccess(deepRequested: boolean, authenticatedUser?: { id: string; email?: string | null }) {
    const user = authenticatedUser ?? await dependencies.getCurrentUser()
    if (!user) {
      return {
        user: null,
        deepScan: false,
        error: NextResponse.json(
          {
            error: "Sign in to use ScamGuard and receive your daily scan allowance.",
            code: "AUTH_REQUIRED",
            loginUrl: dependencies.loginPathFor("/scamguard"),
          },
          { status: 401 }
        ),
      }
    }
    try {
      const entitlement = await dependencies.getSubscriptionEntitlement(user)
      const consumed = await dependencies.consumeDailyScan(user, deepRequested && entitlement.plan.deepUrlScamDna)
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
}

export const scanAccess = createScanAccess()
