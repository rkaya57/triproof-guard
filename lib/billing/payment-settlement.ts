import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { analysisCreditPacks, subscriptionPlans, type AnalysisCreditPackId, type SelfServeSubscriptionPlanId } from "@/lib/billing/plans"

function numericAmount(value: unknown) {
  return Number(value)
}

function sameAmount(left: unknown, right: number) {
  return Math.abs(numericAmount(left) - right) < 0.000001
}

async function lockKey(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

async function creditBalance(tx: Prisma.TransactionClient, userId: string) {
  const result = await tx.creditLedger.aggregate({ _sum: { amount: true }, where: { userId } })
  return result._sum.amount ?? 0
}

function assertExistingPaymentMatches(existing: {
  userId: string
  plan: string
  txHash: string
  reference: string | null
  amountUsdc: unknown
  walletCredits: number
}, expected: {
  userId: string
  itemId: string
  txHash: string
  reference: string
  amountUsdc: number
  walletCredits: number
}) {
  if (existing.userId !== expected.userId) {
    throw new Error("This Solana payment has already been claimed by another account.")
  }
  if (
    existing.plan !== expected.itemId ||
    existing.txHash !== expected.txHash ||
    existing.reference !== expected.reference ||
    existing.walletCredits !== expected.walletCredits ||
    !sameAmount(existing.amountUsdc, expected.amountUsdc)
  ) {
    throw new Error("This on-chain payment does not match the signed checkout intent.")
  }
}

export async function settleCreditPackPayment({
  userId,
  packId,
  txHash,
  reference,
  amountUsdc,
  confirmations,
  provider,
  rawData,
}: {
  userId: string
  packId: AnalysisCreditPackId
  txHash: string
  reference: string
  amountUsdc: number
  confirmations: number
  provider: "solana_usdc" | "solana_sol"
  rawData?: Prisma.InputJsonValue
}) {
  const pack = analysisCreditPacks[packId]

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockKey(tx, `billing:${userId}`)
    await lockKey(tx, `payment-reference:${reference}`)

    const byReference = await tx.paymentTransaction.findFirst({ where: { reference } })
    const byTxHash = await tx.paymentTransaction.findUnique({ where: { txHash } })

    if (byReference && byReference.txHash !== txHash) {
      throw new Error("This signed checkout intent has already been settled by another transaction.")
    }

    let payment = byTxHash
    if (payment) {
      assertExistingPaymentMatches(payment, {
        userId,
        itemId: pack.id,
        txHash,
        reference,
        amountUsdc,
        walletCredits: pack.walletCredits,
      })
    } else {
      payment = await tx.paymentTransaction.create({
        data: {
          userId,
          provider,
          network: "solana",
          plan: pack.id,
          txHash,
          reference,
          amountUsdc: amountUsdc.toFixed(6),
          walletCredits: pack.walletCredits,
          confirmations,
          status: "verified",
          rawData: rawData ?? {},
        },
      })
    }

    const idempotencyKey = `payment:${txHash}`
    const existingCredit = await tx.creditLedger.findUnique({ where: { idempotencyKey } })
    if (existingCredit) {
      if (existingCredit.userId !== userId || existingCredit.paymentTransactionId !== payment.id) {
        throw new Error("Payment credit ledger integrity check failed.")
      }
      return {
        payment,
        ledgerEntry: existingCredit,
        balance: await creditBalance(tx, userId),
        alreadyRecorded: true,
      }
    }

    const balanceBefore = await creditBalance(tx, userId)
    const ledgerEntry = await tx.creditLedger.create({
      data: {
        userId,
        paymentTransactionId: payment.id,
        kind: "payment_credit",
        amount: pack.walletCredits,
        balanceAfter: balanceBefore + pack.walletCredits,
        idempotencyKey,
        metadata: {
          source: `${provider}_payment`,
          plan: pack.id,
          txHash,
          reference,
          amountUsdc,
        },
      },
    })

    return {
      payment,
      ledgerEntry,
      balance: ledgerEntry.balanceAfter,
      alreadyRecorded: false,
    }
  })
}

export async function settleSubscriptionPayment({
  userId,
  planId,
  txHash,
  reference,
  amountUsdc,
  confirmations,
  provider,
  rawData,
}: {
  userId: string
  planId: SelfServeSubscriptionPlanId
  txHash: string
  reference: string
  amountUsdc: number
  confirmations: number
  provider: "solana_usdc" | "solana_sol"
  rawData?: Prisma.InputJsonValue
}) {
  const plan = subscriptionPlans[planId]

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockKey(tx, `subscription:${userId}`)
    await lockKey(tx, `payment-reference:${reference}`)

    const byReference = await tx.paymentTransaction.findFirst({ where: { reference } })
    const byTxHash = await tx.paymentTransaction.findUnique({ where: { txHash } })

    if (byReference && byReference.txHash !== txHash) {
      throw new Error("This signed checkout intent has already been settled by another transaction.")
    }

    let payment = byTxHash
    if (payment) {
      assertExistingPaymentMatches(payment, {
        userId,
        itemId: plan.id,
        txHash,
        reference,
        amountUsdc,
        walletCredits: 0,
      })
    } else {
      payment = await tx.paymentTransaction.create({
        data: {
          userId,
          provider,
          network: "solana",
          plan: plan.id,
          txHash,
          reference,
          amountUsdc: amountUsdc.toFixed(6),
          walletCredits: 0,
          confirmations,
          status: "verified",
          rawData: rawData ?? {},
        },
      })
    }

    const grantKey = `subscription:${payment.id}`
    const existingGrant = await tx.creditLedger.findUnique({ where: { idempotencyKey: grantKey } })
    if (existingGrant) {
      const existingSubscription = await tx.subscription.findUnique({ where: { userId } })
      if (!existingSubscription) {
        throw new Error("Subscription grant exists but the subscription record is missing.")
      }
      return { payment, subscription: existingSubscription, alreadyRecorded: true }
    }

    const now = new Date()
    const current = await tx.subscription.findUnique({ where: { userId }, select: { expiresAt: true } })
    const startsAt = current?.expiresAt && current.expiresAt > now ? current.expiresAt : now
    const expiresAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000)

    const subscription = await tx.subscription.upsert({
      where: { userId },
      create: {
        userId,
        paymentTransactionId: payment.id,
        plan: plan.dbPlan,
        status: "ACTIVE",
        startsAt: now,
        expiresAt,
      },
      update: {
        paymentTransactionId: payment.id,
        plan: plan.dbPlan,
        status: "ACTIVE",
        startsAt: now,
        expiresAt,
        canceledAt: null,
      },
    })

    const balance = await creditBalance(tx, userId)
    await tx.creditLedger.create({
      data: {
        userId,
        paymentTransactionId: payment.id,
        kind: "admin_adjustment",
        amount: 0,
        balanceAfter: balance,
        idempotencyKey: grantKey,
        metadata: {
          source: "subscription_grant",
          plan: plan.id,
          txHash,
          reference,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
        },
      },
    })

    return { payment, subscription, alreadyRecorded: false }
  })
}
