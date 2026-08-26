import assert from "node:assert/strict"
import test from "node:test"

import { buildV2ContextTelemetry } from "./context-telemetry"

test("context telemetry records only bounded metadata", () => {
  const record = buildV2ContextTelemetry({
    entityAttribution: {
      attributionConfidence: "medium",
      independentProviderCount: 2,
    },
    entityHintStatus: "infrastructure_review_hint",
    reviewedCommunityThreats: {
      publishedReports: 3,
      promotedReports: 1,
    },
  })

  assert.equal(record.entityAttributionPresent, true)
  assert.equal(record.entityAttributionConfidence, "medium")
  assert.equal(record.entityIndependentProviders, 2)
  assert.equal(record.infrastructureReviewHintShown, true)
  assert.equal(record.reviewedCommunityReportBucket, "2_5")
  assert.equal(record.promotedCommunityContextPresent, true)
  assert.equal(record.containsEntityLabel, false)
  assert.equal(record.containsRawTarget, false)
  assert.equal(record.containsCommunityReportContent, false)
})

test("community report counts are bucketed instead of retained exactly", () => {
  assert.equal(buildV2ContextTelemetry({ reviewedCommunityThreats: { publishedReports: 0, promotedReports: 0 } }).reviewedCommunityReportBucket, "0")
  assert.equal(buildV2ContextTelemetry({ reviewedCommunityThreats: { publishedReports: 1, promotedReports: 0 } }).reviewedCommunityReportBucket, "1")
  assert.equal(buildV2ContextTelemetry({ reviewedCommunityThreats: { publishedReports: 5, promotedReports: 0 } }).reviewedCommunityReportBucket, "2_5")
  assert.equal(buildV2ContextTelemetry({ reviewedCommunityThreats: { publishedReports: 40, promotedReports: 2 } }).reviewedCommunityReportBucket, "6_plus")
})
