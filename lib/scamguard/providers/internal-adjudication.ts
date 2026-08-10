import { db } from "@/lib/db/prisma"

export type InternalAdjudicationVerdict = "confirmed_risk" | "trusted" | "disputed" | "insufficient"

export type InternalAdjudicationEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "triproof-adjudication"
  walletAddress: string
  verdict: InternalAdjudicationVerdict
  confirmedRiskReviewers: number
  trustedReviewers: number
  falsePositiveReviewers: number
  falseNegativeReviewers: number
  totalHumanReviewers: number
  latestHumanReviewAt?: string
  checkedAt: string
  error?: string
}

type HumanFeedbackRow = {
  label: string
  userId: string
  createdAt: Date
}

function normalizeWallet(value: string, chain?: string) {
  const trimmed = value.trim()
  return chain?.toLowerCase() === "evm" && /^0x[a-fA-F0-9]{40}$/.test(trimmed)
    ? trimmed.toLowerCase()
    : trimmed
}

export function classifyHumanAdjudications(rows: HumanFeedbackRow[]) {
  const riskReviewers = new Set<string>()
  const trustedReviewers = new Set<string>()
  const falsePositiveReviewers = new Set<string>()
  const falseNegativeReviewers = new Set<string>()
  const allReviewers = new Set<string>()
  let latestHumanReviewAt: Date | undefined

  for (const row of rows) {
    if (!row.userId) continue
    allReviewers.add(row.userId)
    if (!latestHumanReviewAt || row.createdAt > latestHumanReviewAt) latestHumanReviewAt = row.createdAt

    if (row.label === "confirmed_risk") riskReviewers.add(row.userId)
    if (row.label === "trusted_user") trustedReviewers.add(row.userId)
    if (row.label === "false_positive") falsePositiveReviewers.add(row.userId)
    if (row.label === "false_negative") falseNegativeReviewers.add(row.userId)
  }

  const confirmedRiskReviewers = riskReviewers.size
  const trustedReviewerCount = trustedReviewers.size
  const riskSupport = confirmedRiskReviewers + falseNegativeReviewers.size

  let verdict: InternalAdjudicationVerdict = "insufficient"
  if (riskSupport >= 2 && trustedReviewerCount === 0) verdict = "confirmed_risk"
  else if (trustedReviewerCount >= 2 && riskSupport === 0) verdict = "trusted"
  else if (riskSupport > 0 && trustedReviewerCount > 0) verdict = "disputed"

  return {
    verdict,
    confirmedRiskReviewers,
    trustedReviewers: trustedReviewerCount,
    falsePositiveReviewers: falsePositiveReviewers.size,
    falseNegativeReviewers: falseNegativeReviewers.size,
    totalHumanReviewers: allReviewers.size,
    latestHumanReviewAt: latestHumanReviewAt?.toISOString(),
  }
}

export async function inspectInternalAdjudication(walletAddress: string, chain?: string): Promise<InternalAdjudicationEvidence> {
  const normalized = normalizeWallet(walletAddress, chain)
  const checkedAt = new Date().toISOString()
  if (!normalized) {
    return {
      status: "unavailable",
      source: "triproof-adjudication",
      walletAddress: normalized,
      verdict: "insufficient",
      confirmedRiskReviewers: 0,
      trustedReviewers: 0,
      falsePositiveReviewers: 0,
      falseNegativeReviewers: 0,
      totalHumanReviewers: 0,
      checkedAt,
      error: "Wallet address is empty",
    }
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: "disabled",
      source: "triproof-adjudication",
      walletAddress: normalized,
      verdict: "insufficient",
      confirmedRiskReviewers: 0,
      trustedReviewers: 0,
      falsePositiveReviewers: 0,
      falseNegativeReviewers: 0,
      totalHumanReviewers: 0,
      checkedAt,
    }
  }

  try {
    const rows = await db.feedbackEvent.findMany({
      where: { walletAddress: normalized },
      select: { label: true, userId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    const classified = classifyHumanAdjudications(rows)
    return {
      status: "available",
      source: "triproof-adjudication",
      walletAddress: normalized,
      ...classified,
      checkedAt,
    }
  } catch (error) {
    return {
      status: "unavailable",
      source: "triproof-adjudication",
      walletAddress: normalized,
      verdict: "insufficient",
      confirmedRiskReviewers: 0,
      trustedReviewers: 0,
      falsePositiveReviewers: 0,
      falseNegativeReviewers: 0,
      totalHumanReviewers: 0,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "Internal adjudication lookup failed",
    }
  }
}
