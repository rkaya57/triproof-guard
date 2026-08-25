import { apiError, getApiUser } from "@/lib/api/auth"
import {
  buildRunDecisionDiff,
  decodeRunDecisionDiffCursor,
  parseRunDecisionDiffPageSize,
} from "@/lib/campaigns/run-decision-diff"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

const MAX_DECISIONS_PER_COMPARED_RUN = 50_000

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; analysisId: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const { id, analysisId } = await context.params
  const url = new URL(request.url)
  const compareTo = url.searchParams.get("compareTo")?.trim() ?? ""
  if (!compareTo) return apiError("compareTo analysisId is required", 400)
  if (compareTo === analysisId) return apiError("compareTo must reference a different analysis run", 400)

  const pageSize = parseRunDecisionDiffPageSize(url.searchParams.get("limit"))
  if (pageSize === null) return apiError("limit must be a positive integer", 400)

  const cursor = decodeRunDecisionDiffCursor(url.searchParams.get("cursor"))
  if (!cursor.ok) return apiError(cursor.error, 400)

  try {
    const campaign = await db.campaign.findFirst({
      where: { legacyProjectId: id, ownerUserId: auth.user.id },
      select: { id: true, name: true },
    })
    if (!campaign) return apiError("Campaign not found", 404)

    const runs = await db.campaignAnalysisRun.findMany({
      where: {
        campaignId: campaign.id,
        legacyAnalysisId: { in: [analysisId, compareTo] },
      },
      select: {
        id: true,
        legacyAnalysisId: true,
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

    const fromRun = runs.find((run) => run.legacyAnalysisId === analysisId) ?? null
    const toRun = runs.find((run) => run.legacyAnalysisId === compareTo) ?? null
    if (!fromRun || !toRun) return apiError("One or both campaign analysis runs were not found", 404)

    const [fromCount, toCount] = await Promise.all([
      db.campaignDecision.count({ where: { analysisRunId: fromRun.id } }),
      db.campaignDecision.count({ where: { analysisRunId: toRun.id } }),
    ])

    if (fromCount > MAX_DECISIONS_PER_COMPARED_RUN || toCount > MAX_DECISIONS_PER_COMPARED_RUN) {
      return apiError(
        `Run decision diff supports up to ${MAX_DECISIONS_PER_COMPARED_RUN} persisted decisions per run`,
        413,
      )
    }

    const decisionSelect = {
      id: true,
      walletAddress: true,
      chain: true,
      state: true,
      riskScore: true,
      confidence: true,
      clusterId: true,
      modelVersion: true,
      policyVersion: true,
    } as const

    const [fromRows, toRows] = await Promise.all([
      db.campaignDecision.findMany({
        where: { analysisRunId: fromRun.id },
        orderBy: { id: "asc" },
        select: decisionSelect,
      }),
      db.campaignDecision.findMany({
        where: { analysisRunId: toRun.id },
        orderBy: { id: "asc" },
        select: decisionSelect,
      }),
    ])

    return Response.json(
      buildRunDecisionDiff({
        campaignId: id,
        campaignName: campaign.name,
        fromAnalysisId: analysisId,
        toAnalysisId: compareTo,
        fromRun,
        toRun,
        fromRows,
        toRows,
        pageSize,
        offset: cursor.offset,
      }),
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Tri-Proof-Decision-Boundary": "read-only-no-recompute",
        },
      },
    )
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    console.error("Run decision diff API failed", error)
    return apiError("Run decision diff could not be loaded", 500)
  }
}
