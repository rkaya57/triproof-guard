import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

const relationshipKinds = new Set([
  "FUNDED_BY",
  "SAME_FUNDER",
  "SAME_FUNDING_LINEAGE",
])

function pageLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "100", 10)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(1, Math.min(200, parsed))
}

function booleanFilter(value: string | null) {
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: campaignId } = await context.params
  const url = new URL(request.url)
  const requestedAnalysisId = url.searchParams.get("analysisId")?.trim() || null
  const requestedKind = url.searchParams.get("kind")?.trim().toUpperCase() || null
  const riskBearing = booleanFilter(url.searchParams.get("riskBearing"))
  const limit = pageLimit(url.searchParams.get("limit"))
  const cursor = url.searchParams.get("cursor")?.trim() || null

  if (requestedKind && !relationshipKinds.has(requestedKind)) {
    return NextResponse.json(
      {
        error: "Invalid relationship kind",
        allowedKinds: Array.from(relationshipKinds),
      },
      { status: 400 },
    )
  }

  try {
    const project = await db.project.findFirst({
      where: { id: campaignId, userId: user.id },
      select: {
        id: true,
        analyses: {
          orderBy: { createdAt: "desc" },
          take: requestedAnalysisId ? 25 : 1,
          select: { id: true },
        },
      },
    })
    if (!project) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    const analysisId = requestedAnalysisId ?? project.analyses[0]?.id ?? null
    if (!analysisId) {
      return NextResponse.json({
        campaignId,
        analysisId: null,
        relationships: [],
        nextCursor: null,
      })
    }

    if (
      requestedAnalysisId &&
      !project.analyses.some((analysis) => analysis.id === requestedAnalysisId)
    ) {
      const belongsToCampaign = await db.analysis.findFirst({
        where: {
          id: requestedAnalysisId,
          projectId: campaignId,
          project: { userId: user.id },
        },
        select: { id: true },
      })
      if (!belongsToCampaign) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
      }
    }

    const where = {
      analysisRunId: analysisId,
      ...(requestedKind ? { kind: requestedKind as "FUNDED_BY" | "SAME_FUNDER" | "SAME_FUNDING_LINEAGE" } : {}),
      ...(riskBearing !== undefined ? { riskBearing } : {}),
    }

    const rows = await db.campaignFundingRelationship.findMany({
      where,
      orderBy: [
        { riskBearing: "desc" },
        { cohortSize: "desc" },
        { confidence: "desc" },
        { id: "asc" },
      ],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        relationshipKey: true,
        kind: true,
        chain: true,
        sourceAddress: true,
        targetAddress: true,
        viaAddress: true,
        hopCount: true,
        cohortSize: true,
        confidence: true,
        riskBearing: true,
        suppressionReason: true,
        evidenceEventKeys: true,
        observedAt: true,
        metadata: true,
      },
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    return NextResponse.json({
      campaignId,
      analysisId,
      filters: {
        kind: requestedKind,
        riskBearing: riskBearing ?? null,
      },
      relationships: page.map((row) => ({
        ...row,
        kind: String(row.kind),
        observedAt: row.observedAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Funding relationships are temporarily unavailable" },
        { status: 503 },
      )
    }
    console.error("Campaign funding relationship load failed", {
      campaignId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: "Funding relationships could not be loaded" },
      { status: 500 },
    )
  }
}
