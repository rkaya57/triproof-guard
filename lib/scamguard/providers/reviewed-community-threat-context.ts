import type { ScamGuardIntelKind } from "@prisma/client"

import { db } from "@/lib/db/prisma"
import { normalizeIntelValue } from "@/lib/scamguard/intelligence"

export type ReviewedCommunityThreatContext = {
  status: "available" | "unavailable" | "disabled"
  source: "triproof-community-review"
  normalizedTarget: string
  publishedReports: number
  promotedReports: number
  categories: string[]
  latestPublishedAt?: string
  contextOnly: true
  activationEligible: false
  checkedAt: string
  error?: string
}

type PublishedReportRow = {
  category: string
  promotedIntelEntryId: string | null
  publishedAt: Date | null
  reviewerId: string | null
}

export function summarizeReviewedCommunityThreats(rows: PublishedReportRow[]) {
  const reviewed = rows.filter((row) => Boolean(row.reviewerId))
  const latest = reviewed
    .map((row) => row.publishedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return {
    publishedReports: reviewed.length,
    promotedReports: reviewed.filter((row) => Boolean(row.promotedIntelEntryId)).length,
    categories: Array.from(new Set(reviewed.map((row) => row.category))).slice(0, 10),
    latestPublishedAt: latest?.toISOString(),
  }
}

export async function inspectReviewedCommunityThreatContext(input: {
  kind: ScamGuardIntelKind
  target: string
  chain?: string | null
}): Promise<ReviewedCommunityThreatContext> {
  const normalizedTarget = normalizeIntelValue(input.kind, input.target)
  const checkedAt = new Date().toISOString()

  if (!normalizedTarget) {
    return {
      status: "unavailable",
      source: "triproof-community-review",
      normalizedTarget,
      publishedReports: 0,
      promotedReports: 0,
      categories: [],
      contextOnly: true,
      activationEligible: false,
      checkedAt,
      error: "Target is empty",
    }
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: "disabled",
      source: "triproof-community-review",
      normalizedTarget,
      publishedReports: 0,
      promotedReports: 0,
      categories: [],
      contextOnly: true,
      activationEligible: false,
      checkedAt,
    }
  }

  try {
    const rows = await db.communityThreatReport.findMany({
      where: {
        normalizedTarget,
        status: "PUBLISHED",
        reviewerId: { not: null },
        ...(input.chain ? { OR: [{ chain: input.chain }, { chain: null }] } : {}),
      },
      select: {
        category: true,
        promotedIntelEntryId: true,
        publishedAt: true,
        reviewerId: true,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    })

    return {
      status: "available",
      source: "triproof-community-review",
      normalizedTarget,
      ...summarizeReviewedCommunityThreats(rows),
      contextOnly: true,
      activationEligible: false,
      checkedAt,
    }
  } catch (error) {
    return {
      status: "unavailable",
      source: "triproof-community-review",
      normalizedTarget,
      publishedReports: 0,
      promotedReports: 0,
      categories: [],
      contextOnly: true,
      activationEligible: false,
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "Community threat context lookup failed",
    }
  }
}
