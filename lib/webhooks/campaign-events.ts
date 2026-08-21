import { createHash, randomUUID } from "node:crypto"

export const CAMPAIGN_WEBHOOK_SCHEMA_VERSION = "tri-proof-campaign-webhook-v1"

export const CAMPAIGN_WEBHOOK_EVENTS = [
  "analysis.completed",
  "analysis.review_required",
  "decision_package.ready",
  "campaign.policy_changed",
  "campaign.lifecycle_changed",
] as const

export type CampaignWebhookEventType = (typeof CAMPAIGN_WEBHOOK_EVENTS)[number]

export const SUPPORTED_WEBHOOK_EVENTS = [
  ...CAMPAIGN_WEBHOOK_EVENTS,
  "policy.blocked",
  "policy.review",
] as const

export function isSupportedWebhookEvent(value: string): value is (typeof SUPPORTED_WEBHOOK_EVENTS)[number] {
  return (SUPPORTED_WEBHOOK_EVENTS as readonly string[]).includes(value)
}

export function webhookEventEnabled(eventTypes: unknown, event: string) {
  return !Array.isArray(eventTypes) || eventTypes.includes(event) || eventTypes.includes("*")
}

export function campaignWebhookEventId(event: CampaignWebhookEventType, scope: string) {
  return `evt_${createHash("sha256").update(`${CAMPAIGN_WEBHOOK_SCHEMA_VERSION}:${event}:${scope}`).digest("hex").slice(0, 32)}`
}

export function operationWebhookEventId(event: CampaignWebhookEventType) {
  return `evt_${randomUUID().replaceAll("-", "")}`
}

export function buildAnalysisWebhookEvents(input: {
  campaignId: string
  campaignName: string
  analysisId: string
  chain: string
  campaignType: string
  status: string
  totalWallets: number
  approved: number
  review: number
  excluded: number
  averageRiskScore: number
  suspiciousClusters: number
  createdAt: Date
  completedAt: Date | null
  origin: string
}) {
  const base = {
    schemaVersion: CAMPAIGN_WEBHOOK_SCHEMA_VERSION,
    apiVersion: "v2",
    campaignId: input.campaignId,
    projectId: input.campaignId,
    projectName: input.campaignName,
    analysisId: input.analysisId,
    chain: input.chain,
    campaignType: input.campaignType,
    status: input.status,
    totals: {
      totalWallets: input.totalWallets,
      approved: input.approved,
      grayZoneManualReview: input.review,
      rejectedNotEligible: input.excluded,
      averageRiskScore: input.averageRiskScore,
      suspiciousClusters: input.suspiciousClusters,
    },
    exports: {
      approved: `${input.origin}/api/analysis/${input.analysisId}/export?type=approved`,
      grayZone: `${input.origin}/api/analysis/${input.analysisId}/export?type=manual_review`,
      rejectedNotEligible: `${input.origin}/api/analysis/${input.analysisId}/export?type=rejected`,
      fullCsv: `${input.origin}/api/analysis/${input.analysisId}/export?type=full`,
      pdf: `${input.origin}/api/analysis/${input.analysisId}/export?type=pdf`,
    },
    links: {
      campaign: `${input.origin}/api/v2/campaigns/${input.campaignId}`,
      analysis: `${input.origin}/api/v2/campaigns/${input.campaignId}/analyses/${input.analysisId}`,
      decisions: `${input.origin}/api/v2/campaigns/${input.campaignId}/decisions`,
      dashboard: `${input.origin}/dashboard/campaigns/${input.campaignId}`,
    },
    createdAt: input.createdAt.toISOString(),
    completedAt: input.completedAt?.toISOString() ?? null,
  }

  const completed = {
    ...base,
    event: "analysis.completed" as const,
    eventId: campaignWebhookEventId("analysis.completed", input.analysisId),
  }
  const decisionPackage = {
    ...base,
    event: "decision_package.ready" as const,
    eventId: campaignWebhookEventId("decision_package.ready", input.analysisId),
    decisionPackage: {
      formatJson: `${input.origin}/api/v2/campaigns/${input.campaignId}/decisions?format=json`,
      formatCsv: `${input.origin}/api/v2/campaigns/${input.campaignId}/decisions?format=csv`,
      readOnly: true,
    },
  }
  const reviewRequired = input.review > 0
    ? {
        ...base,
        event: "analysis.review_required" as const,
        eventId: campaignWebhookEventId("analysis.review_required", input.analysisId),
        review: {
          walletCount: input.review,
          queue: `${input.origin}/dashboard/analysis/${input.analysisId}/review`,
        },
      }
    : null

  return { completed, reviewRequired, decisionPackage }
}

export function buildPolicyChangedWebhook(input: {
  campaignId: string
  previousPreset: string | null
  previousVersion: number | null
  preset: string
  version: number
  policyHash: string
  rationale: string
  actorId: string
  actorName: string
  source: string
  occurredAt?: Date
}) {
  return {
    schemaVersion: CAMPAIGN_WEBHOOK_SCHEMA_VERSION,
    apiVersion: "v2",
    event: "campaign.policy_changed" as const,
    eventId: operationWebhookEventId("campaign.policy_changed"),
    campaignId: input.campaignId,
    policy: {
      previousPreset: input.previousPreset,
      previousVersion: input.previousVersion,
      preset: input.preset,
      version: input.version,
      policyHash: input.policyHash,
      rationale: input.rationale,
      appliesToFutureRuns: true,
      recomputedStoredDecisions: false,
    },
    actor: { id: input.actorId, name: input.actorName },
    source: input.source,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
  }
}

export function buildLifecycleChangedWebhook(input: {
  campaignId: string
  from: string
  to: string
  actorId: string
  actorName: string
  source: string
  occurredAt?: Date
}) {
  return {
    schemaVersion: CAMPAIGN_WEBHOOK_SCHEMA_VERSION,
    apiVersion: "v2",
    event: "campaign.lifecycle_changed" as const,
    eventId: operationWebhookEventId("campaign.lifecycle_changed"),
    campaignId: input.campaignId,
    lifecycle: { from: input.from, to: input.to },
    actor: { id: input.actorId, name: input.actorName },
    source: input.source,
    boundaries: {
      changedWalletDecisions: false,
      changedPolicy: false,
      startedAnalysisRun: false,
    },
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
  }
}
