import { createHash, randomBytes } from "node:crypto"

import type { Prisma } from "@prisma/client"

import { isAdminEmail } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { subscriptionPlanFromDb, subscriptionPlans, type SubscriptionPlanId } from "@/lib/billing/plans"

const monthlyDurationMs = 30 * 24 * 60 * 60 * 1000
const e2eDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:1/tri_proof_guard?schema=public"

function e2eFreeScanStatus() {
  if (process.env.E2E_TEST_MODE !== "1" || process.env.DATABASE_URL !== e2eDatabaseUrl) return null
  return {
    plan: subscriptionPlans.free,
    expiresAt: null,
    status: "ACTIVE" as const,
    isAdmin: false,
    scanCount: 0,
    dailyScanLimit: subscriptionPlans.free.dailyScanLimit,
  }
}

export class SubscriptionLimitError extends Error {
  constructor(
    message: string,
    readonly code: "PLAN_REQUIRED" | "DAILY_SCAN_LIMIT" | "API_QUOTA_REACHED" | "WEBHOOK_PLAN_REQUIRED" | "GROUP_PLAN_REQUIRED"
  ) {
    super(message)
  }
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function activeSubscriptionPlan(subscription: { plan: string; status: string; expiresAt: Date | null } | null) {
  if (!subscription || subscription.status !== "ACTIVE") return subscriptionPlans.free
  if (subscription.expiresAt && subscription.expiresAt.getTime() <= Date.now()) return subscriptionPlans.free
  return subscriptionPlanFromDb(subscription.plan)
}

export async function getSubscriptionEntitlement(user: { id: string; email?: string | null }) {
  if (user.email && isAdminEmail(user.email)) {
    return { plan: subscriptionPlans.api_growth, expiresAt: null, status: "ACTIVE" as const, isAdmin: true }
  }

  const subscription = await db.subscription.findUnique({
    where: { userId: user.id },
    select: { plan: true, status: true, expiresAt: true },
  })
  const plan = activeSubscriptionPlan(subscription)
  return { plan, expiresAt: plan.id === "free" ? null : subscription?.expiresAt ?? null, status: subscription?.status ?? "ACTIVE", isAdmin: false }
}

export async function consumeDailyScan(user: { id: string; email?: string | null }, deepRequested: boolean) {
  const entitlement = await getSubscriptionEntitlement(user)
  const plan = entitlement.plan
  if (deepRequested && !plan.deepUrlScamDna) {
    throw new SubscriptionLimitError("Deep URL Sandbox and Scam DNA analysis require Builder or a higher plan.", "PLAN_REQUIRED")
  }
  if (entitlement.isAdmin) return entitlement

  const periodStart = startOfUtcDay()
  const usage = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.subscriptionUsage.upsert({
      where: { userId_period_periodStart: { userId: user.id, period: "daily", periodStart } },
      create: { userId: user.id, period: "daily", periodStart },
      update: {},
    })
    if (existing.scanCount >= plan.dailyScanLimit) {
      throw new SubscriptionLimitError(`Your ${plan.name} plan has reached its daily scan limit. Try again tomorrow or upgrade your plan.`, "DAILY_SCAN_LIMIT")
    }
    return tx.subscriptionUsage.update({
      where: { id: existing.id },
      data: { scanCount: { increment: 1 }, deepScanCount: deepRequested ? { increment: 1 } : undefined },
    })
  })
  return { ...entitlement, usage }
}

export async function getDailyScanStatus(user: { id: string; email?: string | null }) {
  const e2eStatus = e2eFreeScanStatus()
  if (e2eStatus) return e2eStatus

  const entitlement = await getSubscriptionEntitlement(user)
  if (entitlement.isAdmin) {
    return { ...entitlement, scanCount: 0, dailyScanLimit: null as number | null }
  }

  const usage = await db.subscriptionUsage.findUnique({
    where: {
      userId_period_periodStart: {
        userId: user.id,
        period: "daily",
        periodStart: startOfUtcDay(),
      },
    },
    select: { scanCount: true },
  })

  return { ...entitlement, scanCount: usage?.scanCount ?? 0, dailyScanLimit: entitlement.plan.dailyScanLimit }
}

export async function consumeApiRequest(user: { id: string; email?: string | null }) {
  const entitlement = await getSubscriptionEntitlement(user)
  const plan = entitlement.plan
  if (!entitlement.isAdmin && plan.monthlyApiRequestLimit <= 0) {
    throw new SubscriptionLimitError("API access requires an API Starter or API Growth plan.", "PLAN_REQUIRED")
  }
  if (entitlement.isAdmin) return entitlement
  const periodStart = startOfUtcMonth()
  const usage = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.subscriptionUsage.upsert({
      where: { userId_period_periodStart: { userId: user.id, period: "monthly_api", periodStart } },
      create: { userId: user.id, period: "monthly_api", periodStart },
      update: {},
    })
    if (existing.apiRequestCount >= plan.monthlyApiRequestLimit) {
      throw new SubscriptionLimitError(`Your ${plan.name} API quota is exhausted for this month.`, "API_QUOTA_REACHED")
    }
    return tx.subscriptionUsage.update({ where: { id: existing.id }, data: { apiRequestCount: { increment: 1 } } })
  })
  return { ...entitlement, usage }
}

export async function assertWebhookAccess(user: { id: string; email?: string | null }) {
  const entitlement = await getSubscriptionEntitlement(user)
  if (!entitlement.isAdmin && !entitlement.plan.webhookAccess) {
    throw new SubscriptionLimitError("Webhooks require an API Growth plan.", "WEBHOOK_PLAN_REQUIRED")
  }
  return entitlement
}

export async function activateSubscriptionPayment({
  userId,
  paymentTransactionId,
  planId,
}: {
  userId: string
  paymentTransactionId: string
  planId: Exclude<SubscriptionPlanId, "free">
}) {
  const plan = subscriptionPlans[planId]
  const existingForPayment = await db.subscription.findUnique({ where: { paymentTransactionId } })
  if (existingForPayment) return existingForPayment
  const now = new Date()
  const current = await db.subscription.findUnique({ where: { userId }, select: { expiresAt: true } })
  const startsAt = current?.expiresAt && current.expiresAt > now ? current.expiresAt : now
  const expiresAt = new Date(startsAt.getTime() + monthlyDurationMs)
  return db.subscription.upsert({
    where: { userId },
    create: { userId, paymentTransactionId, plan: plan.dbPlan, status: "ACTIVE", startsAt: now, expiresAt },
    update: { paymentTransactionId, plan: plan.dbPlan, status: "ACTIVE", startsAt: now, expiresAt, canceledAt: null },
  })
}

export function createApiKeyMaterial() {
  const secret = randomBytes(24).toString("base64url")
  const token = `tp_live_${secret}`
  return {
    token,
    keyHash: createHash("sha256").update(token).digest("hex"),
    prefix: token.slice(0, 12),
    lastFour: token.slice(-4),
  }
}

export function hashApiKey(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function createTelegramConnectCode() {
  return `TPG-${randomBytes(6).toString("hex").toUpperCase()}`
}

export function hashTelegramConnectCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex")
}
