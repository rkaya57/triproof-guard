import assert from "node:assert/strict"
import test from "node:test"

import { getSubscriptionPlan, subscriptionPlanFromDb, subscriptionPlans } from "@/lib/billing/plans"

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
