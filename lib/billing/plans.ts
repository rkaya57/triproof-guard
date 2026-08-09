export const subscriptionPlans = {
  free: {
    id: "free",
    dbPlan: "FREE",
    name: "Free",
    amountUsdc: 0,
    monthly: false,
    dailyScanLimit: 10,
    dailyAnalysisWalletLimit: 0,
    deepUrlScamDna: false,
    telegramGroupLimit: 0,
    telegramAdminLimit: 0,
    monthlyApiRequestLimit: 0,
    webhookAccess: false,
  },
  builder: {
    id: "builder",
    dbPlan: "BUILDER",
    name: "Builder",
    amountUsdc: 12,
    monthly: true,
    dailyScanLimit: 100,
    dailyAnalysisWalletLimit: 0,
    deepUrlScamDna: true,
    telegramGroupLimit: 0,
    telegramAdminLimit: 0,
    monthlyApiRequestLimit: 0,
    webhookAccess: false,
  },
  community: {
    id: "community",
    dbPlan: "COMMUNITY",
    name: "Community",
    amountUsdc: 39,
    monthly: true,
    dailyScanLimit: 250,
    dailyAnalysisWalletLimit: 0,
    deepUrlScamDna: true,
    telegramGroupLimit: 1,
    telegramAdminLimit: 3,
    monthlyApiRequestLimit: 0,
    webhookAccess: false,
  },
  api_starter: {
    id: "api_starter",
    dbPlan: "API_STARTER",
    name: "API Starter",
    amountUsdc: 29,
    monthly: true,
    dailyScanLimit: 100,
    dailyAnalysisWalletLimit: 0,
    deepUrlScamDna: true,
    telegramGroupLimit: 0,
    telegramAdminLimit: 0,
    monthlyApiRequestLimit: 5_000,
    webhookAccess: false,
  },
  api_growth: {
    id: "api_growth",
    dbPlan: "API_GROWTH",
    name: "API Growth",
    amountUsdc: 79,
    monthly: true,
    dailyScanLimit: 500,
    dailyAnalysisWalletLimit: 0,
    deepUrlScamDna: true,
    telegramGroupLimit: 1,
    telegramAdminLimit: 3,
    monthlyApiRequestLimit: 25_000,
    webhookAccess: true,
  },
} as const

// Only plans that are intentionally available without a selected-pilot approval
// may be purchased from the public checkout. API plans remain pilot-only.
export const selfServeSubscriptionPlanIds = ["builder", "community"] as const
export type SelfServeSubscriptionPlanId = (typeof selfServeSubscriptionPlanIds)[number]

export function isSelfServeSubscriptionPlan(value: unknown): value is SelfServeSubscriptionPlanId {
  return value === "builder" || value === "community"
}

// One credit pays for one wallet row in a Sybil campaign analysis. These packs
// are intentionally separate from access subscriptions: they never renew and
// stay in the user's credit ledger until they are used.
export const analysisCreditPacks = {
  sybil_starter: {
    id: "sybil_starter",
    name: "Sybil Starter",
    amountUsdc: 29,
    walletCredits: 1_000,
  },
  sybil_growth: {
    id: "sybil_growth",
    name: "Sybil Growth",
    amountUsdc: 99,
    walletCredits: 10_000,
  },
  sybil_pro: {
    id: "sybil_pro",
    name: "Sybil Pro",
    amountUsdc: 249,
    walletCredits: 50_000,
  },
} as const

export type SubscriptionPlanId = keyof typeof subscriptionPlans
export type SubscriptionDbPlan = (typeof subscriptionPlans)[SubscriptionPlanId]["dbPlan"]
export type AnalysisCreditPackId = keyof typeof analysisCreditPacks

const plansByDbValue = Object.values(subscriptionPlans).reduce<Record<string, (typeof subscriptionPlans)[SubscriptionPlanId]>>(
  (all, plan) => ({ ...all, [plan.dbPlan]: plan }),
  {}
)

export function getSubscriptionPlan(value: unknown) {
  if (typeof value !== "string" || !(value in subscriptionPlans)) return null
  return subscriptionPlans[value as SubscriptionPlanId]
}

export function getAnalysisCreditPack(value: unknown) {
  if (typeof value !== "string" || !(value in analysisCreditPacks)) return null
  return analysisCreditPacks[value as AnalysisCreditPackId]
}

export function subscriptionPlanFromDb(value: string | null | undefined) {
  return plansByDbValue[value ?? ""] ?? subscriptionPlans.free
}

export function analysisCreditPackForWalletCount(walletCount: number) {
  const requested = Number.isFinite(walletCount) ? Math.max(0, Math.ceil(walletCount)) : 0
  if (requested <= analysisCreditPacks.sybil_starter.walletCredits) return analysisCreditPacks.sybil_starter
  if (requested <= analysisCreditPacks.sybil_growth.walletCredits) return analysisCreditPacks.sybil_growth
  return analysisCreditPacks.sybil_pro
}

export const billingPlans = subscriptionPlans
export type BillingPlanId = SubscriptionPlanId
export const getBillingPlan = getSubscriptionPlan

// Legacy helper retained for callers outside checkout. Campaign analyses are not
// bundled into subscriptions; they use the one-time Sybil credit packs above.
export function planForWalletCount() {
  return "builder" as const
}
