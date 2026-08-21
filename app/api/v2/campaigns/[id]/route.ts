import { apiError, getApiUser } from "@/lib/api/auth"
import {
  CampaignOperationError,
  changeCampaignLifecycle,
} from "@/lib/campaigns/operations-server"
import { riskPolicyFromNotes } from "@/lib/campaigns/persistence"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error
  const { id } = await context.params

  try {
    const project = await db.project.findFirst({
      where: { id, userId: auth.user.id },
      select: {
        id: true,
        name: true,
        campaignType: true,
        chain: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        analyses: {
          select: {
            id: true,
            status: true,
            totalWallets: true,
            approvedCount: true,
            manualReviewCount: true,
            rejectedCount: true,
            averageRiskScore: true,
            suspiciousClustersCount: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        },
      },
    })
    if (!project) return apiError("Campaign not found", 404)

    const campaign = await db.campaign.findUnique({
      where: { legacyProjectId: project.id },
      select: {
        networks: true,
        lifecycle: true,
        startsAt: true,
        endsAt: true,
        rewardPoolUsd: true,
        metadata: true,
        policies: {
          orderBy: { version: "desc" },
          take: 10,
          select: {
            id: true,
            name: true,
            version: true,
            preset: true,
            isActive: true,
            policyHash: true,
            createdAt: true,
          },
        },
      },
    })
    const activePolicy = campaign?.policies.find((policy) => policy.isActive) ?? null

    return Response.json({
      id: project.id,
      object: "campaign",
      apiVersion: "v2",
      name: project.name,
      campaignType: project.campaignType,
      chain: project.chain,
      networks: campaign?.networks ?? [],
      lifecycle: campaign?.lifecycle ?? "active",
      riskPolicy: activePolicy?.preset ?? riskPolicyFromNotes(project.notes),
      policyVersion: activePolicy?.version ?? null,
      startsAt: campaign?.startsAt?.toISOString() ?? null,
      endsAt: campaign?.endsAt?.toISOString() ?? null,
      rewardPoolUsd: campaign?.rewardPoolUsd ? Number(campaign.rewardPoolUsd) : null,
      metadata: campaign?.metadata ?? null,
      analyses: project.analyses.map((analysis) => ({
        id: analysis.id,
        object: "analysis_run",
        status: String(analysis.status),
        totalWallets: analysis.totalWallets,
        decisions: {
          allow: analysis.approvedCount,
          review: analysis.manualReviewCount,
          exclude: analysis.rejectedCount,
        },
        averageRiskScore: analysis.averageRiskScore,
        suspiciousClusters: analysis.suspiciousClustersCount,
        createdAt: analysis.createdAt.toISOString(),
        completedAt: analysis.completedAt?.toISOString() ?? null,
        url: `/api/v2/campaigns/${project.id}/analyses/${analysis.id}`,
      })),
      policyHistory: (campaign?.policies ?? []).map((policy) => ({
        id: policy.id,
        name: policy.name,
        version: policy.version,
        preset: policy.preset,
        isActive: policy.isActive,
        policyHash: policy.policyHash,
        createdAt: policy.createdAt.toISOString(),
      })),
      links: {
        self: `/api/v2/campaigns/${project.id}`,
        analyses: `/api/v2/campaigns/${project.id}/analyses`,
        policy: `/api/v2/campaigns/${project.id}/policy`,
        decisions: `/api/v2/campaigns/${project.id}/decisions`,
        dashboard: `/dashboard/campaigns/${project.id}`,
      },
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    throw error
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error
  const { id } = await context.params

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  if (!("lifecycle" in body)) {
    return apiError(
      "Campaign Operations v1 PATCH currently requires lifecycle. Use the dedicated policy endpoint for policy changes.",
      400,
      { code: "LIFECYCLE_REQUIRED" },
    )
  }

  try {
    const result = await db.$transaction((tx) => changeCampaignLifecycle(tx, {
      campaignId: id,
      userId: auth.user.id,
      actor: { id: auth.user.id, name: auth.user.name },
      lifecycle: body.lifecycle,
      source: request.headers.get("authorization") ? "api-v2" : "dashboard-v2",
    }))

    return Response.json({
      id: result.campaignId,
      object: "campaign_lifecycle_change",
      apiVersion: "v2",
      previousLifecycle: result.previousLifecycle,
      lifecycle: result.lifecycle,
      boundaries: result.boundaries,
      links: {
        campaign: `/api/v2/campaigns/${result.campaignId}`,
        analyses: `/api/v2/campaigns/${result.campaignId}/analyses`,
      },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (error instanceof CampaignOperationError) {
      return apiError(error.message, error.status, { code: error.code })
    }
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    throw error
  }
}
