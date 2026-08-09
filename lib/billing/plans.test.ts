import assert from "node:assert/strict"
import test from "node:test"

import {
  analysisCreditPackForWalletCount,
  analysisCreditPacks,
  getAnalysisCreditPack,
  getSubscriptionPlan,
  isSelfServeSubscriptionPlan,
  subscriptionPlanFromDb,
  subscriptionPlans,
} from "@/lib/billing/plans"
import { getSubscriptionEntitlement } from "@/lib/billing/subscription"

test("subscription plans expose the public USDC access tiers", () => {
  assert.equal(subscriptionPlans.free.amountUsdc, 0)
  assert.equal(subscriptionPlans.builder.amountUsdc, 12)
  assert.equal(subscriptionPlans.community.amountUsdc, 39)
  assert.equal(subscriptionPlans.api_starter.amountUsdc, 29)
  assert.equal(subscriptionPlans.api_growth.amountUsdc, 79)
})

test("subscription plan lookups fail closed to free", () => {
  assert.equal(getSubscriptionPlan("api_growth")?.dbPlan, "API_GROWTH")
  assert.equal(getSubscriptionPlan("not-a-plan"), null)
  assert.equal(subscriptionPlanFromDb("missing").id, "free")
})

test("only Builder and Community are public self-serve subscriptions", () => {
  assert.equal(isSelfServeSubscriptionPlan("builder"), true)
  assert.equal(isSelfServeSubscriptionPlan("community"), true)
  assert.equal(isSelfServeSubscriptionPlan("api_starter"), false)
  assert.equal(isSelfServeSubscriptionPlan("api_growth"), false)
})

test("subscriptions do not bundle Sybil campaign wallet capacity", () => {
  assert.equal(subscriptionPlans.builder.dailyAnalysisWalletLimit, 0)
  assert.equal(subscriptionPlans.community.dailyAnalysisWalletLimit, 0)
  assert.equal(subscriptionPlans.api_starter.dailyAnalysisWalletLimit, 0)
  assert.equal(subscriptionPlans.api_growth.dailyAnalysisWalletLimit, 0)
})

test("known administrators receive the unrestricted entitlement without a subscription record", async () => {
  const entitlement = await getSubscriptionEntitlement({ id: "admin-test", email: "info@triproofprotocol.com" })
  assert.equal(entitlement.isAdmin, true)
  assert.equal(entitlement.status, "ACTIVE")
  assert.equal(entitlement.expiresAt, null)
})

test("Sybil wallet credit packs expose exact per-wallet capacity", () => {
  assert.equal(analysisCreditPacks.sybil_starter.amountUsdc, 29)
  assert.equal(analysisCreditPacks.sybil_starter.walletCredits, 1_000)
  assert.equal(analysisCreditPacks.sybil_growth.amountUsdc, 99)
  assert.equal(analysisCreditPacks.sybil_growth.walletCredits, 10_000)
  assert.equal(analysisCreditPacks.sybil_pro.amountUsdc, 249)
  assert.equal(analysisCreditPacks.sybil_pro.walletCredits, 50_000)
  assert.equal(getAnalysisCreditPack("sybil_growth")?.name, "Sybil Growth")
  assert.equal(getAnalysisCreditPack("missing"), null)
})

test("campaign checkout chooses a wallet-credit pack by requested capacity", () => {
  assert.equal(analysisCreditPackForWalletCount(100).id, "sybil_starter")
  assert.equal(analysisCreditPackForWalletCount(1_001).id, "sybil_growth")
  assert.equal(analysisCreditPackForWalletCount(10_001).id, "sybil_pro")
})
