import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { getDevDashboard } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { combinedSecurityScore } from "@/lib/scamguard/engine"

export const runtime = "nodejs"

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let projectCount = 0
  let aggregate: {
    _sum: { totalWallets: number | null; rejectedCount: number | null }
    _avg: { averageRiskScore: number | null }
  }
  let analyses: Array<{
    id: string
    project: { name: string; campaignType: string; chain: string }
    status: string
    totalWallets: number
    averageRiskScore: number
    rejectedCount: number
    createdAt: Date
  }>

  try {
    ;[projectCount, aggregate, analyses] = await Promise.all([
      db.project.count({ where: { userId: user.id } }),
      db.analysis.aggregate({
        where: { project: { userId: user.id } },
        _sum: { totalWallets: true, rejectedCount: true },
        _avg: { averageRiskScore: true },
      }),
      db.analysis.findMany({
        where: { project: { userId: user.id } },
        include: { project: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ])
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(await getDevDashboard(user))
    }

    throw error
  }

  const totalWallets = aggregate._sum.totalWallets ?? 0
  const averageRiskScore = Number((aggregate._avg.averageRiskScore ?? 0).toFixed(1))
  const highRiskRate =
    totalWallets > 0 ? Math.round(((aggregate._sum.rejectedCount ?? 0) / totalWallets) * 100) : 0
  const sybilSafetyScore = Math.max(0, Math.round(100 - averageRiskScore))
  const scamGuardReadinessScore = totalWallets > 0 ? 88 : 76
  const unifiedSecurityScore = combinedSecurityScore({
    sybilRiskScore: averageRiskScore,
    scamRiskScore: 100 - scamGuardReadinessScore,
  })

  return NextResponse.json({
    user,
    stats: {
      projectCount,
      totalWallets,
      averageRiskScore,
      highRiskRate,
    },
    security: {
      sybilSafetyScore,
      scamGuardReadinessScore,
      unifiedSecurityScore,
      scamGuardStatus: "active",
    },
    recentAnalyses: analyses.map((analysis) => ({
      id: analysis.id,
      projectName: analysis.project.name,
      campaignType: analysis.project.campaignType,
      chain: analysis.project.chain,
      status: analysis.status,
      totalWallets: analysis.totalWallets,
      averageRiskScore: analysis.averageRiskScore,
      rejectedCount: analysis.rejectedCount,
      createdAt: analysis.createdAt.toISOString(),
    })),
  })
}
