import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { subscriptionPlanFromDb } from "@/lib/billing/plans"

export type BillingGate =
  | {
      source: "free_trial"
      userId: string
      walletCount: number
      usedWallets: number
      remainingFreeWallets: number
      creditsToDeduct: 0
      balanceBefore: number
      balanceAfter: number
    }
  | {
      source: "paid_credits"
      userId: string
      walletCount: number
      usedWallets: number
      remainingFreeWallets: number
      creditsToDeduct: number
      balanceBefore: number
      balanceAfter: number
    }
  | {
      source: "subscription"
      userId: string
      walletCount: number
      usedWallets: number
      remainingFreeWallets: number
      creditsToDeduct: 0
      balanceBefore: number
      balanceAfter: number
      subscriptionPlan: string
      subscriptionPeriodStart: Date
      dailyWalletLimit: number
    }

export class BillingCreditError extends Error {
  readonly code = "PAYMENT_REQUIRED"
  readonly walletCount: number
  readonly availableCredits: number
  readonly remainingFreeWallets: number
  readonly requiredCredits: number

  constructor({
    walletCount,
    availableCredits,
    remainingFreeWallets,
    requiredCredits,
  }: {
    walletCount: number
    availableCredits: number
    remainingFreeWallets: number
    requiredCredits: number
  }) {
    super("Wallet credit limit reached.")
    this.walletCount = walletCount
    this.availableCredits = availableCredits
    this.remainingFreeWallets = remainingFreeWallets
    this.requiredCredits = requiredCredits
  }
}

export function isBillingCreditError(error: unknown): error is BillingCreditError {
  return error instanceof BillingCreditError
}

async function lockBillingAccount(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`billing:${userId}`}))
  `
}

async function creditBalance(tx: Prisma.TransactionClient, userId: string) {
  const result = await tx.creditLedger.aggregate({
    _sum: { amount: true },
    where: { userId },
  })
  return result._sum.amount ?? 0
}

async function usedWalletCount(tx: Prisma.TransactionClient, userId: string) {
  const result = await tx.analysis.aggregate({
    _sum: { totalWallets: true },
    where: { project: { userId } },
  })
  return result._sum.totalWallets ?? 0
}

export async function getWalletCreditBalance(userId: string) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockBillingAccount(tx, userId)
    return creditBalance(tx, userId)
  })
}

export async function recordVerifiedSolanaPayment({
  userId,
  plan,
  txHash,
  reference,
  amountUsdc,
  walletCredits,
  confirmations,
  network = "solana",
  rawData,
  provider = "solana_usdc",
}: {
  userId: string
  plan: string
  txHash: string
  reference?: string | null
  amountUsdc: number
  walletCredits: number
  confirmations: number
  network?: string
  rawData?: Prisma.InputJsonValue
  provider?: "solana_usdc" | "solana_sol"
}) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockBillingAccount(tx, userId)

    const existing = await tx.paymentTransaction.findUnique({
      where: { txHash },
      include: { creditLedgerEntries: true },
    })

    if (existing && existing.userId !== userId) {
      throw new Error("This Solana payment has already been claimed by another account.")
    }

    const balanceBefore = await creditBalance(tx, userId)

    if (existing) {
      const existingCredit = existing.creditLedgerEntries.find(
        (entry) => entry.idempotencyKey === `payment:${txHash}`
      )
      if (existingCredit) {
        return {
          payment: existing,
          ledgerEntry: existingCredit,
          balance: await creditBalance(tx, userId),
          alreadyRecorded: true,
        }
      }

      const ledgerEntry = await tx.creditLedger.create({
        data: {
          userId,
          paymentTransactionId: existing.id,
          kind: "payment_credit",
          amount: existing.walletCredits,
          balanceAfter: balanceBefore + existing.walletCredits,
          idempotencyKey: `payment:${txHash}`,
          metadata: {
            source: `${provider}_payment_repair`,
            plan: existing.plan,
            txHash,
          },
        },
      })

      return {
        payment: existing,
        ledgerEntry,
        balance: ledgerEntry.balanceAfter,
        alreadyRecorded: false,
      }
    }

    const payment = await tx.paymentTransaction.create({
      data: {
        userId,
        provider,
        network,
        plan,
        txHash,
        reference: reference || null,
        amountUsdc: amountUsdc.toFixed(6),
        walletCredits,
        confirmations,
        status: "verified",
        rawData: rawData ?? {
          reference: reference || null,
          confirmations,
        },
      },
    })

    const ledgerEntry = await tx.creditLedger.create({
      data: {
        userId,
        paymentTransactionId: payment.id,
        kind: "payment_credit",
        amount: walletCredits,
        balanceAfter: balanceBefore + walletCredits,
        idempotencyKey: `payment:${txHash}`,
        metadata: {
          source: `${provider}_payment`,
          plan,
          txHash,
          reference: reference || null,
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

export async function prepareAnalysisBillingGate(
  tx: Prisma.TransactionClient,
  {
    userId,
    walletCount,
    freeTrialWalletLimit,
  }: {
    userId: string
    walletCount: number
    freeTrialWalletLimit: number
  }
): Promise<BillingGate> {
  await lockBillingAccount(tx, userId)

  const usedWallets = await usedWalletCount(tx, userId)
  const remainingFreeWallets = Math.max(freeTrialWalletLimit - usedWallets, 0)
  const balanceBefore = await creditBalance(tx, userId)

  const subscription = await tx.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, expiresAt: true },
  })
  const subscriptionPlan = subscription && subscription.status === "ACTIVE" && (!subscription.expiresAt || subscription.expiresAt > new Date())
    ? subscriptionPlanFromDb(subscription.plan)
    : null
  if (subscriptionPlan && subscriptionPlan.dailyAnalysisWalletLimit > 0) {
    const now = new Date()
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const usage = await tx.subscriptionUsage.findUnique({
      where: { userId_period_periodStart: { userId, period: "daily_analysis", periodStart } },
      select: { analysisWalletCount: true },
    })
    const usedToday = usage?.analysisWalletCount ?? 0
    if (usedToday + walletCount > subscriptionPlan.dailyAnalysisWalletLimit) {
      throw new BillingCreditError({
        walletCount,
        availableCredits: Math.max(subscriptionPlan.dailyAnalysisWalletLimit - usedToday, 0),
        remainingFreeWallets,
        requiredCredits: walletCount,
      })
    }
    return {
      source: "subscription",
      userId,
      walletCount,
      usedWallets,
      remainingFreeWallets,
      creditsToDeduct: 0,
      balanceBefore,
      balanceAfter: balanceBefore,
      subscriptionPlan: subscriptionPlan.id,
      subscriptionPeriodStart: periodStart,
      dailyWalletLimit: subscriptionPlan.dailyAnalysisWalletLimit,
    }
  }

  if (walletCount <= remainingFreeWallets) {
    return {
      source: "free_trial",
      userId,
      walletCount,
      usedWallets,
      remainingFreeWallets,
      creditsToDeduct: 0,
      balanceBefore,
      balanceAfter: balanceBefore,
    }
  }

  if (balanceBefore < walletCount) {
    throw new BillingCreditError({
      walletCount,
      availableCredits: balanceBefore,
      remainingFreeWallets,
      requiredCredits: walletCount,
    })
  }

  return {
    source: "paid_credits",
    userId,
    walletCount,
    usedWallets,
    remainingFreeWallets,
    creditsToDeduct: walletCount,
    balanceBefore,
    balanceAfter: balanceBefore - walletCount,
  }
}

export async function commitAnalysisCreditDebit(
  tx: Prisma.TransactionClient,
  {
    gate,
    analysisId,
    metadata,
  }: {
    gate: BillingGate
    analysisId: string
    metadata?: Prisma.InputJsonValue
  }
) {
  if (gate.source === "subscription") {
    return tx.subscriptionUsage.upsert({
      where: { userId_period_periodStart: { userId: gate.userId, period: "daily_analysis", periodStart: gate.subscriptionPeriodStart } },
      create: { userId: gate.userId, period: "daily_analysis", periodStart: gate.subscriptionPeriodStart, analysisWalletCount: gate.walletCount },
      update: { analysisWalletCount: { increment: gate.walletCount } },
    })
  }
  if (gate.creditsToDeduct <= 0) return null

  const existing = await tx.creditLedger.findUnique({
    where: { idempotencyKey: `analysis:${analysisId}` },
  })
  if (existing) return existing

  return tx.creditLedger.create({
    data: {
      userId: gate.userId,
      analysisId,
      kind: "analysis_debit",
      amount: -gate.creditsToDeduct,
      balanceAfter: gate.balanceAfter,
      idempotencyKey: `analysis:${analysisId}`,
      metadata: metadata ?? {
        source: "analysis_creation",
        walletCount: gate.walletCount,
        usedWallets: gate.usedWallets,
        remainingFreeWallets: gate.remainingFreeWallets,
      },
    },
  })
}
