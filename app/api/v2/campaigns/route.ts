import { NextResponse } from "next/server"

import { apiError, getApiUser } from "@/lib/api/auth"
import { normalizeCampaignCreateInput } from "@/lib/campaigns/intake"
import { createSelfServiceCampaign } from "@/lib/campaigns/self-service"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function GET(request: Request) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  try {
    const projects = await db.project.findMany({
      where: { userId: auth.user.id },
      select: {
        id: true,
        name: true,
        campaignType: true,
        chain: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { analyses: true } },
        analyses: {
          select: {
            id: true,
            status: true,
            totalWallets: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    })
    const campaignRows = await db.campaign.findMany({
      where: { legacyProjectId: { in: projects.map((project) => project.id) } },
      select: {
        legacyProjectId: true,
        lifecycle: true,
        networks: true,
        startsAt: true,
        endsAt: true,
        rewardPoolUsd: true,
        policies: {
          where: { isActive: true },
          orderBy: { version: "desc" },
          take: 1,
          select: { preset: true, version: true },
        },
      },
    })
    const campaignsByProject = new Map(
      campaignRows.map((campaign) => [campaign.legacyProjectId, campaign]),
    )

    return noStore({
      object: "list",
      apiVersion: "v2",
      campaigns: projects.map((project) => {
        const campaign = campaignsByProject.get(project.id)
        const latest = project.analyses[0]
        return {
          id: project.id,
          object: "campaign",
          name: project.name,
          campaignType: project.campaignType,
          chain: project.chain,
          networks: campaign?.networks ?? [],
          lifecycle: campaign?.lifecycle ?? "active",
          riskPolicy: campaign?.policies[0]?.preset ?? null,
          policyVersion: campaign?.policies[0]?.version ?? null,
          rewardPoolUsd: campaign?.rewardPoolUsd ? Number(campaign.rewardPoolUsd) : null,
          startsAt: campaign?.startsAt?.toISOString() ?? null,
          endsAt: campaign?.endsAt?.toISOString() ?? null,
          analysisRunCount: project._count.analyses,
          latestAnalysis: latest
            ? {
                id: latest.id,
                status: String(latest.status),
                totalWallets: latest.totalWallets,
                createdAt: latest.createdAt.toISOString(),
                completedAt: latest.completedAt?.toISOString() ?? null,
              }
            : null,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
          url: `/api/v2/campaigns/${project.id}`,
        }
      }),
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    throw error
  }
}

export async function POST(request: Request) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return apiError("Invalid JSON body", 400)
  }

  const normalized = normalizeCampaignCreateInput(body)
  if (!normalized.value) {
    return apiError(normalized.error, 400, { code: normalized.code })
  }

  try {
    const created = await db.$transaction((tx) => createSelfServiceCampaign(tx, {
      userId: auth.user.id,
      campaign: normalized.value!,
    }))

    return noStore({
      id: created.campaign.id,
      object: "campaign",
      apiVersion: "v2",
      name: created.campaign.name,
      campaignType: created.campaign.campaignType,
      chain: created.campaign.legacyChain,
      networks: created.campaign.networks,
      lifecycle: created.campaign.lifecycle,
      riskPolicy: created.policy.preset,
      policyVersion: created.policy.version,
      startsAt: created.campaign.startsAt?.toISOString() ?? null,
      endsAt: created.campaign.endsAt?.toISOString() ?? null,
      rewardPoolUsd: created.campaign.rewardPoolUsd ? Number(created.campaign.rewardPoolUsd) : null,
      analysisRunCount: 0,
      links: {
        self: `/api/v2/campaigns/${created.campaign.id}`,
        analyses: `/api/v2/campaigns/${created.campaign.id}/analyses`,
        decisions: `/api/v2/campaigns/${created.campaign.id}/decisions`,
        dashboard: `/dashboard/campaigns/${created.campaign.id}`,
      },
    }, 201)
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    throw error
  }
}
