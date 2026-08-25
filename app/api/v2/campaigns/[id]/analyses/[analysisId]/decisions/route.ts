import { apiError, getApiUser } from "@/lib/api/auth"
import {
  buildRunDecisionPackage,
  decodeRunDecisionCursor,
  parseRunDecisionPageSize,
} from "@/lib/campaigns/run-decision-package"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; analysisId: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const { id, analysisId } = await context.params
  const url = new URL(request.url)
  const pageSize = parseRunDecisionPageSize(url.searchParams.get("limit"))
  if (pageSize === null) return apiError("limit must be a positive integer", 400)

  const cursor = decodeRunDecisionCursor(url.searchParams.get("cursor"))
  if (!cursor.ok) return apiError(cursor.error, 400)

  try {
    const campaign = await db.campaign.findFirst({
      where: { legacyProjectId: id, ownerUserId: auth.user.id },
      select: { id: true, name: true },
    })
    if (!campaign) return apiError("Campaign not found", 404)

    const run = await db.campaignAnalysisRun.findFirst({
      where: { campaignId: campaign.id, legacyAnalysisId: analysisId },
      select: {
        id: true,
        status: true,
        modelVersion: true,
        policyVersion: true,
        inputHash: true,
        totalWallets: true,
        completedAt: true,
        createdAt: true,
        policy: {
          select: { id: true, preset: true, version: true, policyHash: true },
        },
      },
    })
    if (!run) return apiError("Campaign analysis run not found", 404)

    const [rows, grouped] = await Promise.all([
      db.campaignDecision.findMany({
        where: {
          analysisRunId: run.id,
          ...(cursor.id ? { id: { gt: cursor.id } } : {}),
        },
        orderBy: { id: "asc" },
        take: pageSize + 1,
        select: {
          id: true,
          walletAddress: true,
          chain: true,
          state: true,
          riskScore: true,
          confidence: true,
          clusterId: true,
          evidence: true,
          matchedRules: true,
          explanation: true,
          modelVersion: true,
          policyVersion: true,
          createdAt: true,
        },
      }),
      db.campaignDecision.groupBy({
        by: ["state"],
        where: { analysisRunId: run.id },
        _count: { _all: true },
      }),
    ])

    const summary = { allow: 0, review: 0, exclude: 0, insufficient_data: 0 }
    for (const item of grouped) summary[item.state] = item._count._all

    return Response.json(
      buildRunDecisionPackage({
        campaignId: id,
        campaignName: campaign.name,
        analysisId,
        run,
        summary,
        rows,
        pageSize,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    console.error("Run-specific decision package API failed", error)
    return apiError("Run-specific decision package could not be loaded", 500)
  }
}
