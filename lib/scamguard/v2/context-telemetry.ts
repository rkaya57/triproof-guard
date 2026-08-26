export type V2ContextTelemetryRecord = {
  schemaVersion: 1
  mode: "context_only"
  entityAttributionPresent: boolean
  entityAttributionConfidence: "none" | "low" | "medium" | "high"
  entityIndependentProviders: number
  infrastructureReviewHintShown: boolean
  reviewedCommunityContextPresent: boolean
  reviewedCommunityReportBucket: "0" | "1" | "2_5" | "6_plus"
  promotedCommunityContextPresent: boolean
  containsEntityLabel: false
  containsRawTarget: false
  containsCommunityReportContent: false
}

function reportBucket(value: number): V2ContextTelemetryRecord["reviewedCommunityReportBucket"] {
  const normalized = Math.max(0, Math.trunc(value))
  if (normalized === 0) return "0"
  if (normalized === 1) return "1"
  if (normalized <= 5) return "2_5"
  return "6_plus"
}

export function buildV2ContextTelemetry(input: {
  entityAttribution?: {
    attributionConfidence?: "none" | "low" | "medium" | "high"
    independentProviderCount?: number
  }
  entityHintStatus?: "none" | "infrastructure_review_hint"
  reviewedCommunityThreats?: {
    publishedReports?: number
    promotedReports?: number
  }
}): V2ContextTelemetryRecord {
  const entityAttributionPresent = Boolean(input.entityAttribution)
  const publishedReports = Math.max(0, Math.trunc(input.reviewedCommunityThreats?.publishedReports ?? 0))
  const promotedReports = Math.max(0, Math.trunc(input.reviewedCommunityThreats?.promotedReports ?? 0))

  return {
    schemaVersion: 1,
    mode: "context_only",
    entityAttributionPresent,
    entityAttributionConfidence: input.entityAttribution?.attributionConfidence ?? "none",
    entityIndependentProviders: Math.max(0, Math.trunc(input.entityAttribution?.independentProviderCount ?? 0)),
    infrastructureReviewHintShown: input.entityHintStatus === "infrastructure_review_hint",
    reviewedCommunityContextPresent: publishedReports > 0,
    reviewedCommunityReportBucket: reportBucket(publishedReports),
    promotedCommunityContextPresent: promotedReports > 0,
    containsEntityLabel: false,
    containsRawTarget: false,
    containsCommunityReportContent: false,
  }
}
