import { runProductionAiSidecarForAnalysis } from "@/lib/ai/production-sidecar"
import { db } from "@/lib/db/prisma"
import { webhookHeaders } from "@/lib/webhooks/sign"

type AnalysisWebhookPayload = {
  event: string
  analysisId: string
  projectId: string
  projectName: string
  chain: string
  campaignType: string
  status: string
  totals: {
    totalWallets: number
    approved: number
    grayZoneManualReview: number
    rejectedNotEligible: number
    averageRiskScore: number
    suspiciousClusters: number
  }
  exports: {
    approved: string
    grayZone: string
    rejectedNotEligible: string
    fullCsv: string
    pdf: string
  }
  createdAt: string
  completedAt: string | null
}

function eventEnabled(eventTypes: unknown, event: string) {
  if (!Array.isArray(eventTypes)) return true
  return eventTypes.includes(event) || eventTypes.includes("*")
}

function siteOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || process.env.APP_URL?.replace(/\/$/, "") || "https://triproofprotocol.com"
}

export async function deliverAnalysisCompletedWebhook(analysisId: string) {
  // The sidecar runs after the deterministic analysis transaction has committed,
  // but before the externally visible completion webhook is snapshotted. Any
  // Gemini/audit failure leaves the deterministic decisions untouched.
  try {
    await runProductionAiSidecarForAnalysis(analysisId)
  } catch (error) {
    console.error("Production AI post-finalize sidecar failed", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    include: { project: true },
  })
  if (!analysis) return { delivered: 0, skipped: true }

  const endpoints = await db.webhookEndpoint.findMany({
    where: {
      userId: analysis.project.userId,
      isActive: true,
    },
  })

  const event = "analysis.completed"
  const origin = siteOrigin()
  const payload: AnalysisWebhookPayload = {
    event,
    analysisId: analysis.id,
    projectId: analysis.projectId,
    projectName: analysis.project.name,
    chain: analysis.project.chain,
    campaignType: analysis.project.campaignType,
    status: analysis.status,
    totals: {
      totalWallets: analysis.totalWallets,
      approved: analysis.approvedCount,
      grayZoneManualReview: analysis.manualReviewCount,
      rejectedNotEligible: analysis.rejectedCount,
      averageRiskScore: analysis.averageRiskScore,
      suspiciousClusters: analysis.suspiciousClustersCount,
    },
    exports: {
      approved: `${origin}/api/analysis/${analysis.id}/export?type=approved`,
      grayZone: `${origin}/api/analysis/${analysis.id}/export?type=manual_review`,
      rejectedNotEligible: `${origin}/api/analysis/${analysis.id}/export?type=rejected`,
      fullCsv: `${origin}/api/analysis/${analysis.id}/export?type=full`,
      pdf: `${origin}/api/analysis/${analysis.id}/export?type=pdf`,
    },
    createdAt: analysis.createdAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
  }

  let delivered = 0
  for (const endpoint of endpoints) {
    if (!eventEnabled(endpoint.eventTypes, event)) continue
    const payloadString = JSON.stringify(payload)
    const delivery = await db.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        analysisId: analysis.id,
        eventType: event,
        status: "pending",
        requestPayload: payload,
      },
    })

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: webhookHeaders(payloadString, endpoint.secret),
        body: payloadString,
      })
      const responseBody = (await response.text().catch(() => "")).slice(0, 4000)
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: response.ok ? "delivered" : "failed",
          statusCode: response.status,
          responseBody,
          attemptCount: 1,
          deliveredAt: response.ok ? new Date() : null,
          errorMessage: response.ok ? null : `HTTP ${response.status}`,
        },
      })
      if (response.ok) delivered += 1
    } catch (error) {
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          attemptCount: 1,
          errorMessage: error instanceof Error ? error.message : "Webhook delivery failed",
        },
      })
    }
  }

  return { delivered, skipped: false }
}
