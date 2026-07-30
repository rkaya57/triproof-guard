export const billingPlans = {
  starter: { id: "starter", name: "Starter", amountUsdc: 29, walletCredits: 1_000 },
  growth: { id: "growth", name: "Growth", amountUsdc: 99, walletCredits: 10_000 },
  pro: { id: "pro", name: "Pro", amountUsdc: 249, walletCredits: 50_000 },
} as const

export type BillingPlanId = keyof typeof billingPlans

export function getBillingPlan(value: unknown) {
  if (typeof value !== "string" || !(value in billingPlans)) return null
  return billingPlans[value as BillingPlanId]
}

export function planForWalletCount(walletCount: number): BillingPlanId {
  if (walletCount <= billingPlans.starter.walletCredits) return "starter"
  if (walletCount <= billingPlans.growth.walletCredits) return "growth"
  return "pro"
}
