import { Prisma } from "@prisma/client"

import { DAILY_THREAT_REPORT_POINTS } from "@/lib/airdrop/tasks"
import { db } from "@/lib/db/prisma"

export function utcRewardDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

export type ThreatRewardOutcome = "CREDITED" | "PENDING_PROFILE" | "ALREADY_REWARDED"

export async function awardVerifiedThreatReport(input: { reportId: string; reporterId: string; reportedAt: Date }) {
  const rewardDate = utcRewardDate(input.reportedAt)

  return db.$transaction(async (tx) => {
    try {
      await tx.airdropThreatReportReward.create({
        data: {
          reportId: input.reportId,
          reporterId: input.reporterId,
          rewardDate,
          points: DAILY_THREAT_REPORT_POINTS,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { outcome: "ALREADY_REWARDED" as const, points: 0, rewardDate }
      }
      throw error
    }

    const profile = await tx.airdropProfile.findUnique({ where: { userId: input.reporterId }, select: { id: true } })
    if (!profile) return { outcome: "PENDING_PROFILE" as const, points: DAILY_THREAT_REPORT_POINTS, rewardDate }

    const creditedAt = new Date()
    await Promise.all([
      tx.airdropProfile.update({ where: { id: profile.id }, data: { totalPoints: { increment: DAILY_THREAT_REPORT_POINTS } } }),
      tx.airdropThreatReportReward.update({ where: { reportId: input.reportId }, data: { creditedAt } }),
    ])

    return { outcome: "CREDITED" as const, points: DAILY_THREAT_REPORT_POINTS, rewardDate }
  })
}

export async function creditPendingThreatRewards(userId: string, profileId: string) {
  return db.$transaction(async (tx) => {
    const pending = await tx.airdropThreatReportReward.findMany({
      where: { reporterId: userId, creditedAt: null },
      select: { id: true, points: true },
    })
    const points = pending.reduce((total, reward) => total + reward.points, 0)
    if (!pending.length) return 0

    const creditedAt = new Date()
    await Promise.all([
      tx.airdropProfile.update({ where: { id: profileId }, data: { totalPoints: { increment: points } } }),
      tx.airdropThreatReportReward.updateMany({ where: { id: { in: pending.map((reward) => reward.id) } }, data: { creditedAt } }),
    ])
    return points
  })
}
