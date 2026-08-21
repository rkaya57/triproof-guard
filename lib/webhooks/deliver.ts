import { dispatchAnalysisPostFinalize } from "@/lib/analysis/post-finalize-dispatch"
import { generateAndStoreAnalysisReportBrief } from "@/lib/ai/analysis-report-service"
import { runProductionAiSidecarForAnalysis } from "@/lib/ai/production-sidecar"
import { db } from "@/lib/db/prisma"
import { deliverCampaignWebhookEvent } from "@/lib/webhooks/campaign-delivery"
import { buildAnalysisWebhookEvents } from "@/lib/webhooks/campaign-events"

function siteOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || process.env.APP_URL?.replace(/\/$/, "") || "https://triproofprotocol.com"
}

/**
 * Called by the deterministic batch worker. This function intentionally does
 * not run Gemini inline. It registers a short post-response dispatch to a
 * dedicated 300-second worker so RPC/batch throughput and AI latency cannot
 * consume each other's function budget.
 */
export async function deliverAnalysisCompletedWebhook(analysisId: string) {
  dispatchAnalysisPostFinalize(analysisId)
  return { delivered: 0, skipped: false, scheduled: true }
}

/**
 * Runs only inside the authorized analysis-post-finalize worker. The Gemini
 * sidecar executes after the deterministic transaction commits. The customer-
 * facing AI report is then synthesized from the persisted, privacy-reduced
 * production audit records. Neither step is allowed to alter deterministic
 * risk scores. Campaign webhooks are snapshotted only afterwards.
 */
export async function deliverAnalysisCompletedWebhookNow(analysisId: string) {
  try {
    await runProductionAiSidecarForAnalysis(analysisId)
  } catch (error) {
    console.error("Production AI post-finalize sidecar failed", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    await generateAndStoreAnalysisReportBrief(analysisId)
  } catch (error) {
    // Report synthesis is optional decision support. It must never block the
    // deterministic report, exports, or completion webhook delivery.
    console.error("Production AI report synthesis failed", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    include: { project: true },
  })
  if (!analysis) return { delivered: 0, skipped: true }

  const events = buildAnalysisWebhookEvents({
    campaignId: analysis.projectId,
    campaignName: analysis.project.name,
    analysisId: analysis.id,
    chain: analysis.project.chain,
    campaignType: analysis.project.campaignType,
    status: analysis.status,
    totalWallets: analysis.totalWallets,
    approved: analysis.approvedCount,
    review: analysis.manualReviewCount,
    excluded: analysis.rejectedCount,
    averageRiskScore: analysis.averageRiskScore,
    suspiciousClusters: analysis.suspiciousClustersCount,
    createdAt: analysis.createdAt,
    completedAt: analysis.completedAt,
    origin: siteOrigin(),
  })

  const results = []
  results.push(await deliverCampaignWebhookEvent({
    userId: analysis.project.userId,
    analysisId: analysis.id,
    payload: events.completed,
  }))

  if (events.reviewRequired) {
    results.push(await deliverCampaignWebhookEvent({
      userId: analysis.project.userId,
      analysisId: analysis.id,
      payload: events.reviewRequired,
    }))
  }

  results.push(await deliverCampaignWebhookEvent({
    userId: analysis.project.userId,
    analysisId: analysis.id,
    payload: events.decisionPackage,
  }))

  return {
    delivered: results.reduce((total, result) => total + result.delivered, 0),
    duplicateEventsSkipped: results.reduce((total, result) => total + result.skipped, 0),
    emittedEvents: results.map((result) => result.event),
    skipped: false,
  }
}
