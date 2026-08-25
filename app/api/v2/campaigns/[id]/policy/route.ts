import { apiError, getApiUser } from "@/lib/api/auth"
import {
  activateCampaignPolicyVersion,
  CampaignOperationError,
} from "@/lib/campaigns/operations-server"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { deliverCampaignWebhookEvent } from "@/lib/webhooks/campaign-delivery"
import { buildPolicyChangedWebhook } from "@/lib/webhooks/campaign-events"

export const runtime = "nodejs"

export async function POST(
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

  try {
    const source = request.headers.get("authorization") ? "api-v2" : "dashboard-v2"
    const result = await db.$transaction((tx) => activateCampaignPolicyVersion(tx, {
      campaignId: id,
      userId: auth.user.id,
      actor: { id: auth.user.id, name: auth.user.name },
      preset: body.preset,
      rationale: body.rationale,
      source,
    }))

    try {
      await deliverCampaignWebhookEvent({
        userId: auth.user.id,
        payload: buildPolicyChangedWebhook({
          campaignId: result.campaignId,
          previousPreset: result.previousPolicy?.preset ?? null,
          previousVersion: result.previousPolicy?.version ?? null,
          preset: result.policy.preset,
          version: result.policy.version,
          policyHash: result.policy.policyHash,
          rationale: result.policy.rationale,
          actorId: auth.user.id,
          actorName: auth.user.name,
          source,
        }),
        dedupeAnalysisEvent: false,
      })
    } catch (error) {
      console.error("Campaign policy webhook delivery failed", {
        campaignId: result.campaignId,
        policyVersion: result.policy.version,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return Response.json({
      id: result.policy.id,
      object: "campaign_policy_version",
      apiVersion: "v2",
      campaignId: result.campaignId,
      previousPolicy: result.previousPolicy,
      policy: {
        id: result.policy.id,
        preset: result.policy.preset,
        version: result.policy.version,
        policyHash: result.policy.policyHash,
        rationale: result.policy.rationale,
        createdAt: result.policy.createdAt.toISOString(),
      },
      boundaries: result.boundaries,
      links: {
        campaign: `/api/v2/campaigns/${result.campaignId}`,
        policy: `/api/v2/campaigns/${result.campaignId}/policy`,
        analyses: `/api/v2/campaigns/${result.campaignId}/analyses`,
        simulator: `/dashboard/campaigns/${result.campaignId}/policy`,
      },
    }, {
      status: 201,
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
