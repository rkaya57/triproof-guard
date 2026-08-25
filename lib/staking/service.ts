import { db } from "@/lib/db/prisma"
import {
  formatTriUnits,
  getStakingPublicConfig,
  getStakingServerConfig,
  isPositiveTriUnits,
  SECONDS_PER_YEAR,
} from "@/lib/staking/config"
import { sendVaultTriTransfer, verifyStakeTransfer } from "@/lib/staking/devnet"

const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000

function accruedRewardUnits(position: { principalUnits: bigint; accruedRewardUnits: bigint; rewardCheckpointAt: Date }, now: Date, apyBps: number) {
  const elapsedSeconds = BigInt(Math.max(0, Math.floor((now.getTime() - position.rewardCheckpointAt.getTime()) / 1000)))
  return position.accruedRewardUnits + (position.principalUnits * BigInt(apyBps) * elapsedSeconds) / (10_000n * SECONDS_PER_YEAR)
}

function serializePosition(position: {
  id: string
  walletAddress: string
  tokenAccount: string
  principalUnits: bigint
  accruedRewardUnits: bigint
  rewardCheckpointAt: Date
  status: string
  unstakeRequestedAt: Date | null
  unstakeAvailableAt: Date | null
  withdrawnAt: Date | null
  createdAt: Date
}, now: Date, apyBps: number) {
  const rewards = position.status === "ACTIVE"
    ? accruedRewardUnits(position, now, apyBps)
    : position.accruedRewardUnits
  return {
    id: position.id,
    walletAddress: position.walletAddress,
    tokenAccount: position.tokenAccount,
    principalUnits: position.principalUnits.toString(),
    principal: formatTriUnits(position.principalUnits),
    accruedRewardUnits: rewards.toString(),
    accruedRewards: formatTriUnits(rewards),
    status: position.status,
    unstakeRequestedAt: position.unstakeRequestedAt?.toISOString() ?? null,
    unstakeAvailableAt: position.unstakeAvailableAt?.toISOString() ?? null,
    withdrawnAt: position.withdrawnAt?.toISOString() ?? null,
    createdAt: position.createdAt.toISOString(),
  }
}

async function createPayout(input: {
  userId: string
  positionId?: string
  kind: "FAUCET" | "REWARD" | "UNSTAKE"
  walletAddress: string
  tokenAccount: string
  amountUnits: bigint
}) {
  return db.stakingPayout.create({
    data: {
      userId: input.userId,
      positionId: input.positionId,
      kind: input.kind,
      recipientWallet: input.walletAddress,
      recipientTokenAccount: input.tokenAccount,
      amountUnits: input.amountUnits,
    },
  })
}

async function completePayout(payoutId: string, signature: string) {
  return db.stakingPayout.update({
    where: { id: payoutId },
    data: { status: "COMPLETED", txSignature: signature, completedAt: new Date() },
  })
}

async function failPayout(payoutId: string, error: unknown) {
  await db.stakingPayout.update({
    where: { id: payoutId },
    data: { status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) },
  }).catch(() => undefined)
}

export async function getStakingState(userId: string) {
  const config = getStakingServerConfig()
  const { faucetAmountUnits, ...publicConfig } = getStakingPublicConfig()
  const now = new Date()
  const [positions, latestFaucet] = await Promise.all([
    db.stakingPosition.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.stakingPayout.findFirst({
      where: { userId, kind: "FAUCET", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    }),
  ])
  const activePrincipal = positions
    .filter((position) => position.status === "ACTIVE")
    .reduce((total, position) => total + position.principalUnits, 0n)
  const totalRewards = positions.reduce(
    (total, position) => total + (position.status === "ACTIVE" ? accruedRewardUnits(position, now, config.apyBps) : position.accruedRewardUnits),
    0n
  )
  const faucetAvailableAt = latestFaucet
    ? new Date(latestFaucet.createdAt.getTime() + FAUCET_COOLDOWN_MS)
    : null

  return {
    config: {
      ...publicConfig,
      vaultTokenAccount: config.vaultTokenAccount,
      faucetAmount: formatTriUnits(faucetAmountUnits),
    },
    summary: {
      activePrincipal: formatTriUnits(activePrincipal),
      activePrincipalUnits: activePrincipal.toString(),
      accruedRewards: formatTriUnits(totalRewards),
      accruedRewardUnits: totalRewards.toString(),
      faucetAvailableAt: faucetAvailableAt?.toISOString() ?? null,
    },
    positions: positions.map((position) => serializePosition(position, now, config.apyBps)),
  }
}

export async function claimFaucet({ userId, walletAddress, tokenAccount }: { userId: string; walletAddress: string; tokenAccount: string }) {
  const config = getStakingServerConfig()
  const latest = await db.stakingPayout.findFirst({
    where: { userId, kind: "FAUCET", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  })
  if (latest && Date.now() < latest.createdAt.getTime() + FAUCET_COOLDOWN_MS) {
    throw new Error("The Devnet faucet can be claimed once every 24 hours.")
  }

  const payout = await createPayout({
    userId,
    kind: "FAUCET",
    walletAddress,
    tokenAccount,
    amountUnits: config.faucetAmountUnits,
  })
  try {
    const signature = await sendVaultTriTransfer({
      destinationTokenAccount: tokenAccount,
      walletAddress,
      amountUnits: config.faucetAmountUnits,
    })
    await completePayout(payout.id, signature)
    return { signature, amount: formatTriUnits(config.faucetAmountUnits) }
  } catch (error) {
    await failPayout(payout.id, error)
    throw error
  }
}

export async function recordStake({ userId, walletAddress, tokenAccount, signature, amountUnits }: {
  userId: string
  walletAddress: string
  tokenAccount: string
  signature: string
  amountUnits: string
}) {
  if (!isPositiveTriUnits(amountUnits)) throw new Error("Stake amount must be a positive TRI amount.")
  const amount = BigInt(amountUnits)
  await verifyStakeTransfer({ signature, walletAddress, amountUnits: amount })
  const existing = await db.stakingPosition.findUnique({ where: { stakeTxSignature: signature } })
  if (existing) {
    if (existing.userId !== userId) throw new Error("This Devnet transaction is already assigned to another account.")
    return existing
  }
  return db.stakingPosition.create({
    data: { userId, walletAddress, tokenAccount, stakeTxSignature: signature, principalUnits: amount },
  })
}

export async function claimPositionRewards({ userId, positionId }: { userId: string; positionId: string }) {
  const config = getStakingServerConfig()
  const position = await db.stakingPosition.findFirst({ where: { id: positionId, userId } })
  if (!position || position.status === "WITHDRAWN") throw new Error("Staking position was not found.")
  const now = new Date()
  const rewards = position.status === "ACTIVE"
    ? accruedRewardUnits(position, now, config.apyBps)
    : position.accruedRewardUnits
  if (rewards <= 0n) throw new Error("No claimable TRI rewards are available yet.")

  const payout = await createPayout({
    userId,
    positionId: position.id,
    kind: "REWARD",
    walletAddress: position.walletAddress,
    tokenAccount: position.tokenAccount,
    amountUnits: rewards,
  })
  try {
    const signature = await sendVaultTriTransfer({
      destinationTokenAccount: position.tokenAccount,
      walletAddress: position.walletAddress,
      amountUnits: rewards,
    })
    await db.$transaction(async (tx) => {
      await tx.stakingPayout.update({
        where: { id: payout.id },
        data: { status: "COMPLETED", txSignature: signature, completedAt: new Date() },
      })
      await tx.stakingPosition.update({
        where: { id: position.id },
        data: { accruedRewardUnits: 0n, rewardCheckpointAt: now },
      })
    })
    return { signature, amount: formatTriUnits(rewards) }
  } catch (error) {
    await failPayout(payout.id, error)
    throw error
  }
}

export async function requestUnstake({ userId, positionId }: { userId: string; positionId: string }) {
  const config = getStakingServerConfig()
  const position = await db.stakingPosition.findFirst({ where: { id: positionId, userId } })
  if (!position) throw new Error("Staking position was not found.")
  if (position.status !== "ACTIVE") throw new Error("This position already has an unstake request.")
  const now = new Date()
  const cooldownMs = config.cooldownDays * 24 * 60 * 60 * 1000
  return db.stakingPosition.update({
    where: { id: position.id },
    data: {
      accruedRewardUnits: accruedRewardUnits(position, now, config.apyBps),
      rewardCheckpointAt: now,
      status: "UNSTAKE_PENDING",
      unstakeRequestedAt: now,
      unstakeAvailableAt: new Date(now.getTime() + cooldownMs),
    },
  })
}

export async function withdrawPosition({ userId, positionId }: { userId: string; positionId: string }) {
  const position = await db.stakingPosition.findFirst({ where: { id: positionId, userId } })
  if (!position || position.status !== "UNSTAKE_PENDING") throw new Error("This position is not waiting for withdrawal.")
  if (!position.unstakeAvailableAt || position.unstakeAvailableAt > new Date()) {
    throw new Error("The 7-day unstake waiting period has not finished yet.")
  }

  const payout = await createPayout({
    userId,
    positionId: position.id,
    kind: "UNSTAKE",
    walletAddress: position.walletAddress,
    tokenAccount: position.tokenAccount,
    amountUnits: position.principalUnits,
  })
  try {
    const signature = await sendVaultTriTransfer({
      destinationTokenAccount: position.tokenAccount,
      walletAddress: position.walletAddress,
      amountUnits: position.principalUnits,
    })
    await db.$transaction(async (tx) => {
      await tx.stakingPayout.update({
        where: { id: payout.id },
        data: { status: "COMPLETED", txSignature: signature, completedAt: new Date() },
      })
      await tx.stakingPosition.update({
        where: { id: position.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() },
      })
    })
    return { signature, amount: formatTriUnits(position.principalUnits) }
  } catch (error) {
    await failPayout(payout.id, error)
    throw error
  }
}
