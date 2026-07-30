import assert from "node:assert/strict"
import test from "node:test"

import { SubscriptionLimitError } from "@/lib/billing/subscription"
import { subscriptionPlans } from "@/lib/billing/plans"
import { createScanAccess } from "@/lib/scamguard/scan-access"

const user = {
  id: "e2e-user",
  name: "E2E User",
  email: "e2e@example.test",
  createdAt: new Date(),
}

function dependencies(overrides: Partial<Parameters<typeof createScanAccess>[0]> = {}) {
  return {
    getCurrentUser: async () => user,
    getSubscriptionEntitlement: async () => ({
      plan: subscriptionPlans.free,
      expiresAt: null,
      status: "ACTIVE" as const,
      isAdmin: false,
    }),
    consumeDailyScan: async () => ({
      plan: subscriptionPlans.free,
      expiresAt: null,
      status: "ACTIVE" as const,
      isAdmin: false,
      usage: { scanCount: 1 },
    }),
    loginPathFor: (path: string) => `/login?next=${encodeURIComponent(path)}`,
    ...overrides,
  } as Parameters<typeof createScanAccess>[0]
}

test("ScamGuard requires a signed-in user before consuming a scan", async () => {
  const access = createScanAccess(dependencies({ getCurrentUser: async () => null }))
  const result = await access(false)

  assert.equal(result.user, null)
  assert.equal(result.deepScan, false)
  assert.ok(result.error)
  assert.equal(result.error.status, 401)
  assert.deepEqual(await result.error.json(), {
    error: "Sign in to use ScamGuard and receive your daily scan allowance.",
    code: "AUTH_REQUIRED",
    loginUrl: "/login?next=%2Fscamguard",
  })
})

test("ScamGuard only requests deep analysis when the plan permits it", async () => {
  let consumedDeepScan: boolean | null = null
  const access = createScanAccess(dependencies({
    getSubscriptionEntitlement: async () => ({
      plan: subscriptionPlans.builder,
      expiresAt: new Date(),
      status: "ACTIVE",
      isAdmin: false,
    }),
    consumeDailyScan: async (_user, deepRequested) => {
      consumedDeepScan = deepRequested
      return {
        plan: subscriptionPlans.builder,
        expiresAt: new Date(),
        status: "ACTIVE",
        isAdmin: false,
        usage: { scanCount: 7 },
      }
    },
  }))

  const result = await access(true)
  assert.equal(consumedDeepScan, true)
  assert.equal(result.deepScan, true)
  assert.equal(result.scanCount, 7)
  assert.equal(result.error, null)
})

test("ScamGuard returns an explicit daily-limit response instead of silently scanning", async () => {
  const access = createScanAccess(dependencies({
    consumeDailyScan: async () => {
      throw new SubscriptionLimitError("Daily cap reached", "DAILY_SCAN_LIMIT")
    },
  }))
  const result = await access(false)

  assert.ok(result.error)
  assert.equal(result.error.status, 429)
  assert.deepEqual(await result.error.json(), { error: "Daily cap reached", code: "DAILY_SCAN_LIMIT" })
})

test("ScamGuard refuses plan-gated deep analysis before a scan runs", async () => {
  const access = createScanAccess(dependencies({
    consumeDailyScan: async () => {
      throw new SubscriptionLimitError("Upgrade required", "PLAN_REQUIRED")
    },
  }))
  const result = await access(true)

  assert.ok(result.error)
  assert.equal(result.error.status, 403)
  assert.deepEqual(await result.error.json(), { error: "Upgrade required", code: "PLAN_REQUIRED" })
})
