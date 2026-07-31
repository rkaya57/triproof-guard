import assert from "node:assert/strict"
import test from "node:test"

import { prepareAnalysisBillingGate } from "@/lib/billing/credits"

test("admins bypass analysis credits and subscription quotas", async () => {
  let databaseAccessed = false
  const tx = {
    $executeRaw: async () => {
      databaseAccessed = true
    },
    analysis: {
      aggregate: async () => {
        databaseAccessed = true
        return { _sum: { totalWallets: 0 } }
      },
    },
    creditLedger: {
      aggregate: async () => {
        databaseAccessed = true
        return { _sum: { amount: 0 } }
      },
    },
    subscription: {
      findUnique: async () => {
        databaseAccessed = true
        return { plan: "BUILDER", status: "ACTIVE", expiresAt: null }
      },
    },
  } as never

  const gate = await prepareAnalysisBillingGate(tx, {
    userId: "admin-user",
    walletCount: 50_000,
    freeTrialWalletLimit: 100,
    isAdmin: true,
  })

  assert.equal(gate.source, "admin_unlimited")
  assert.equal(gate.creditsToDeduct, 0)
  assert.equal(gate.walletCount, 50_000)
  assert.equal(databaseAccessed, false)
})
